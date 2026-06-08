"""
app/services/grading_service.py

Business logic for grading student responses.

GRADING MODES:
    AUTO:
        MCQ, TRUE_FALSE, ORDERING, FILL_BLANK (exact match), MATCHING
        → graded immediately on submission; is_final=True set automatically.

    AI_ASSISTED:
        SHORT_ANSWER, COMPUTATIONAL, ESSAY, CASE_STUDY
        → AI suggests a score and rationale; lecturer must confirm.
        → Score field stays NULL until lecturer confirms.

    MANUAL:
        Any question the lecturer chooses to grade without AI.

RULES ENFORCED HERE:
    - score >= 0 and score <= max_score.
    - Only final (is_final=True) grades are used in result calculation.
    - Lecturer must always be the last actor on AI-suggested grades
      (is_final cannot be set by AI directly).
    - Grade audit trail: created_by_id / updated_by_id on every change.
    - GradingQueueItem lifecycle: PENDING → ASSIGNED → IN_PROGRESS → COMPLETED.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.core.config import settings
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.logger import get_logger
from app.db.enums import (GradingMode, GradingQueuePriority,
                          GradingQueueStatus, QuestionType)
from app.db.models.attempt import (GradingQueueItem, StudentResponse,
                                   SubmissionGrade)
from app.db.models.question import Question
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.grading_repo import GradingRepository
from app.db.repositories.question_repo import QuestionRepository
from app.db.repositories.submission_repo import SubmissionRepository
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger("mindexa.grading_service")

# AUTO-GRADABLE question types (can be fully graded by code)
AUTO_GRADABLE = {
    QuestionType.MCQ,
    QuestionType.TRUE_FALSE,
    QuestionType.ORDERING,
    QuestionType.MATCHING,
    QuestionType.FILL_BLANK,
}

# Requires human or AI review (open-ended)
OPEN_ENDED = {
    QuestionType.SHORT_ANSWER,
    QuestionType.ESSAY,
    QuestionType.COMPUTATIONAL,
    QuestionType.CASE_STUDY,
}


class GradingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.grading_repo = GradingRepository(db)
        self.submission_repo = SubmissionRepository(db)
        self.assessment_repo = AssessmentRepository(db)
        self.question_repo = QuestionRepository(db)

    # -----------------------------------------------------------------------
    # AUTO-GRADE MCQ / CLOSED QUESTIONS
    # -----------------------------------------------------------------------

    async def auto_grade_response(
        self,
        *,
        response: StudentResponse,
        question: Question,
        max_score: float,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        graded_by_id: uuid.UUID | None = None,
    ) -> SubmissionGrade:
        """
        Auto-grade a single response for a closed question type.

        Computes the score by comparing the student's answer against
        the stored correct answer(s) on the question options/blanks.

        Returns the created/updated SubmissionGrade with is_final=True.
        """
        if response.is_skipped:
            score = 0.0
            is_correct = False
        else:
            score, is_correct = await self._compute_auto_score(
                response=response,
                question=question,
                max_score=max_score,
            )

        # Check if a grade already exists (re-grading scenario)
        existing = await self.grading_repo.get_grade_by_response(response.id)
        if existing:
            await self.grading_repo.finalize_grade(
                grade_id=existing.id,
                score=score,
                updated_by_id=graded_by_id or uuid.UUID(int=0),
                grading_mode=GradingMode.AUTO,
            )
            return existing

        grade = await self.grading_repo.create_grade(
            response_id=response.id,
            attempt_id=response.attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            question_id=response.question_id,
            max_score=max_score,
            grading_mode=GradingMode.AUTO,
            created_by_id=graded_by_id,
            score=score,
            is_final=True,
        )
        return grade

    # -----------------------------------------------------------------------
    # QUEUE FOR MANUAL / AI-ASSISTED GRADING
    # -----------------------------------------------------------------------

    async def queue_manual_grading(
        self,
        *,
        response: StudentResponse,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        grading_mode: str = GradingMode.MANUAL,
        priority: str = GradingQueuePriority.NORMAL,
    ) -> GradingQueueItem:
        """
        Add an open-ended response to the manual grading queue.

        Creates a SubmissionGrade with score=NULL and is_final=False,
        then creates a GradingQueueItem in PENDING state.

        The grade row is created now so that update operations have a
        row to target; the queue item drives the workflow.
        """
        # Create the placeholder grade
        existing_grade = await self.grading_repo.get_grade_by_response(response.id)
        if not existing_grade:
            await self.grading_repo.create_grade(
                response_id=response.id,
                attempt_id=response.attempt_id,
                assessment_id=assessment_id,
                student_id=student_id,
                question_id=response.question_id,
                max_score=0.0,  # updated when the actual max is known
                grading_mode=grading_mode,
                is_final=False,
            )

        # Check for existing active queue item (avoid duplicates)
        existing_item = await self.grading_repo.get_active_queue_item_for_response(
            response.id
        )
        if existing_item:
            return existing_item

        item = await self.grading_repo.create_queue_item(
            response_id=response.id,
            attempt_id=response.attempt_id,
            assessment_id=assessment_id,
            question_id=response.question_id,
            student_id=student_id,
            grading_mode=grading_mode,
            priority=priority,
        )

        # Trigger AI grading job if applicable
        if grading_mode == GradingMode.SEMI: # AI_ASSISTED
            from app.workers.tasks import process_ai_grading_job
            process_ai_grading_job.delay(str(item.id))

        return item

    # -----------------------------------------------------------------------
    # PROCESS AI QUEUE ITEM (Called by worker)
    # -----------------------------------------------------------------------

    async def process_ai_queue_item(
        self,
        item_id: str | uuid.UUID,
    ) -> dict[str, Any]:
        """
        Orchestrate AI grading for a single queue item.

        FLOW:
            1. Fetch queue item
            2. Fetch student response
            3. Fetch question context (rubric, difficulty, model answers)
            4. Dispatch to AI Provider (Mocked)
            5. Store AI suggestion using apply_ai_grading()
            6. Return status

        Called by: Celery task `process_ai_grading_job`.
        """
        # 1. Fetch queue item
        item_uuid = uuid.UUID(str(item_id))
        item = await self.grading_repo.get_queue_item_by_id(item_uuid)
        if not item:
            raise NotFoundError(f"GradingQueueItem {item_id} not found.")
        await self.grading_repo.update_queue_item(
            item.id,
            status=GradingQueueStatus.IN_PROGRESS,
        )

        # 2. Fetch student response
        response = await self.submission_repo.get_response_by_id(item.response_id)
        if not response:
            raise NotFoundError(f"StudentResponse {item.response_id} not found.")

        # 3. Fetch question and rubric
        question = await self.question_repo.get_by_id_simple(response.question_id)
        if not question:
            raise NotFoundError(f"Question {response.question_id} not found.")

        rubric = await self.assessment_repo.get_rubric_for_question(response.question_id)
        rubric_content = "Generic academic standards"
        if rubric:
            # Format rubric for AI context
            rubric_content = "\n".join([
                f"- {c.name}: {c.description} ({c.weight} marks)"
                for c in rubric.criteria
            ])

        # 4. Call AI Review Agent
        from app.agents.review_agent import ReviewAgent
        from app.core.ai.gateway import AIGateway
        from app.core.ai.provider_factory import get_ai_provider

        provider = get_ai_provider()
        gateway = AIGateway(self.db, provider)
        agent = ReviewAgent(gateway)

        # Get student answer (assuming TEXT for now, handle others as needed)
        student_answer = response.answer_text or "No answer provided"

        try:
            ai_output = await agent.review_response(
                question_text=question.content,
                student_answer=student_answer,
                rubric_content=rubric_content,
                max_score=float(question.marks),
                question_type=question.question_type,
                attempt_id=item.attempt_id,
                response_id=response.id,
            )

            # 5. Apply suggestion
            await self.apply_ai_grading(
                response_id=response.id,
                ai_suggested_score=ai_output.suggested_score,
                ai_rationale=ai_output.rationale,
                ai_confidence=ai_output.confidence,
                max_score=float(question.marks),
                graded_by_ai_id=uuid.UUID(int=0),  # System AI ID
            )
        except Exception as exc:
            logger.error("AI grading failed for item %s: %s", item_id, str(exc))
            await self.grading_repo.update_queue_item(
                item.id,
                status=GradingQueueStatus.FAILED,
            )
            raise

        await self.grading_repo.update_queue_item(
            item.id,
            status=GradingQueueStatus.AI_SUGGESTED,
        )

        # 6. Notify Lecturer(s)
        # Find who to notify: assigned lecturer, or assessment supervisors
        from app.db.enums import NotificationType
        from app.db.models.assessment import AssessmentSupervisor
        from app.db.models.auth import User
        from app.db.repositories.assessment_repo import AssessmentRepository
        from app.workers.tasks import send_email_notification

        assessment_repo = AssessmentRepository(self.db)
        assessment = await assessment_repo.get_by_id_simple(item.assessment_id)

        # Get supervisors to notify
        lecturers_to_notify = []
        if item.assigned_to_id:
            lecturers_to_notify.append(item.assigned_to_id)
        else:
            supervisors = await self.db.execute(
                select(AssessmentSupervisor.supervisor_id)
                .where(AssessmentSupervisor.assessment_id == item.assessment_id)
            )
            lecturers_to_notify.extend(supervisors.scalars().all())

        # Dispatch notifications
        for lecturer_id in set(lecturers_to_notify):
            lecturer = await self.db.get(User, lecturer_id)
            if lecturer and lecturer.email:
                send_email_notification.delay(
                    to_email=lecturer.email,
                    subject=f"AI Grading Suggestion Ready: {assessment.title}",
                    template_name="ai_suggestion_ready",
                    context={
                        "lecturer_name": getattr(getattr(lecturer, "profile", None), "first_name", None) or "Lecturer",
                        "assessment_title": assessment.title,
                        "student_name": item.student_name or "a student",
                        "ai_confidence": round(ai_output.confidence * 100, 1),
                        "grading_url": f"{settings.FRONTEND_URL.rstrip('/')}" \
                            f"/lecturer/grading?assessment_id={item.assessment_id}",
                        "notification_type": NotificationType.AI_ASSISTANCE_READY.value
                    }
                )

        return {
            "status": "completed",
            "item_id": str(item_id),
            "response_id": str(response.id),
            "suggested_score": ai_output.suggested_score,
        }

    # -----------------------------------------------------------------------
    # APPLY AI GRADING SUGGESTION
    # -----------------------------------------------------------------------

    async def apply_ai_grading(
        self,
        *,
        response_id: uuid.UUID,
        ai_suggested_score: float,
        ai_rationale: str,
        ai_confidence: float,
        max_score: float,
        graded_by_ai_id: uuid.UUID | None = None,
    ) -> SubmissionGrade:
        """
        Store an AI-generated grading suggestion.

        Sets:
            grading_mode  = AI_ASSISTED
            ai_suggested_score, ai_rationale, ai_confidence
            score         = NULL (not awarded until lecturer confirms)
            is_final      = False

        Also marks the queue item as ai_pre_graded=True.

        IMPORTANT: AI never sets is_final=True. Only the lecturer can do that.
        """
        if ai_suggested_score < 0 or ai_suggested_score > max_score:
            raise ValidationError(
                f"AI suggested score {ai_suggested_score} is out of range [0, {max_score}]",
                code="AI_SCORE_OUT_OF_RANGE",
            )

        existing = await self.grading_repo.get_grade_by_response(response_id)
        if not existing:
            raise NotFoundError(
                "No grade row found for this response — queue it first",
                code="GRADE_NOT_FOUND",
            )

        await self.grading_repo.update_grade(
            grade_id=existing.id,
            updated_by_id=graded_by_ai_id or uuid.UUID(int=0),
            grading_mode=GradingMode.SEMI,
            ai_suggested_score=ai_suggested_score,
            ai_rationale=ai_rationale,
            ai_confidence=ai_confidence,
            max_score=max_score,
            is_final=False,
            score=None,
        )

        # Mark queue item as AI pre-graded
        queue_item = await self.grading_repo.get_active_queue_item_for_response(response_id)
        if queue_item:
            await self.grading_repo.mark_ai_pre_graded(queue_item.id)

        return existing

    # -----------------------------------------------------------------------
    # FINALIZE GRADE (Lecturer manual or confirmation)
    # -----------------------------------------------------------------------

    async def finalize_grade(
        self,
        *,
        response_id: uuid.UUID,
        lecturer_id: uuid.UUID,
        score: float,
        feedback: str | None = None,
        internal_notes: str | None = None,
        rubric_scores: list | None = None,
        accept_ai_suggestion: bool = False,
        is_final: bool = True,
        review_started_at: datetime | None = None,
        review_duration_seconds: int | None = None,
    ) -> SubmissionGrade:
        """
        Lecturer finalises a grade — sets is_final=True and awards the score.
        If is_final=False, saves a draft for later.

        accept_ai_suggestion=True: uses the ai_suggested_score already stored.
        accept_ai_suggestion=False: uses the `score` argument (lecturer override).

        Sets lecturer_override=True if the score differs from the AI suggestion.
        Records the decision trail in AIGradeReview.
        """
        existing = await self.grading_repo.get_grade_by_response(response_id)
        if not existing:
            raise NotFoundError("Grade not found", code="GRADE_NOT_FOUND")

        if existing.is_final:
            raise ConflictError(
                "This grade has already been finalised",
                code="GRADE_ALREADY_FINAL",
            )

        # 0. Authorization: Verify lecturer is assigned to this assessment's course
        from app.core.exceptions import AuthorizationError
        from app.db.models.academic import Course, TeachingAssignment
        from app.db.models.assessment import Assessment

        auth_stmt = (
            select(TeachingAssignment.id)
            .join(Course, Course.id == TeachingAssignment.course_id)
            .join(Assessment, Assessment.course_id == Course.id)
            .where(
                TeachingAssignment.lecturer_id == lecturer_id,
                Assessment.id == existing.assessment_id,
                TeachingAssignment.is_active == True
            )
        )
        auth_res = await self.db.execute(auth_stmt)
        if not auth_res.scalars().first():
            raise AuthorizationError("You are not authorized to grade responses for this course")

        # Determine final score
        if accept_ai_suggestion:
            if existing.ai_suggested_score is None:
                raise ValidationError(
                    "No AI suggestion exists for this response",
                    code="NO_AI_SUGGESTION",
                )
            final_score = existing.ai_suggested_score
        else:
            final_score = score

        if final_score < 0 or final_score > existing.max_score:
            raise ValidationError(
                f"Score {final_score} is out of range [0, {existing.max_score}]",
                code="SCORE_OUT_OF_RANGE",
            )

        lecturer_override = (
            existing.ai_suggested_score is not None
            and final_score != existing.ai_suggested_score
        )

        grading_mode = (
            GradingMode.SEMI
            if existing.grading_mode == GradingMode.SEMI
            else GradingMode.MANUAL
        )

        # Determine grading decision for audit
        from app.db.enums import AIGradeDecision
        decision = AIGradeDecision.NOT_APPLICABLE
        score_delta = None

        if existing.ai_suggested_score is not None:
            score_delta = final_score - existing.ai_suggested_score
            if accept_ai_suggestion or final_score == existing.ai_suggested_score:
                decision = AIGradeDecision.ACCEPTED
            else:
                decision = AIGradeDecision.MODIFIED

        # 1. Update/Create the grade
        await self.grading_repo.finalize_grade(
            grade_id=existing.id,
            score=final_score,
            updated_by_id=lecturer_id,
            feedback=feedback,
            rubric_scores=rubric_scores,
            lecturer_override=lecturer_override,
            grading_mode=grading_mode,
            is_final=is_final,
        )

        if internal_notes is not None:
            await self.grading_repo.update_grade(
                grade_id=existing.id,
                updated_by_id=lecturer_id,
                internal_notes=internal_notes,
            )

        # 2. Record audit trail in AIGradeReview
        await self.grading_repo.create_ai_grade_review(
            attempt_id=existing.attempt_id,
            assessment_id=existing.assessment_id,
            student_id=existing.student_id,
            response_id=existing.response_id,
            submission_grade_id=existing.id,
            ai_action_log_id=existing.ai_action_log_id,
            grading_decision=decision,
            ai_suggested_total=existing.ai_suggested_score, # "total" means per-item here
            lecturer_final_total=final_score,
            score_delta=score_delta,
            max_possible_score=existing.max_score,
            lecturer_id=lecturer_id,
            review_started_at=review_started_at,
            review_completed_at=datetime.now(UTC),
            review_duration_seconds=review_duration_seconds,
            lecturer_notes=internal_notes,
        )

        # 3. Only if final, handle completion and result calculation
        if is_final:
            # Complete the queue item
            queue_item = await self.grading_repo.get_active_queue_item_for_response(response_id)
            if queue_item:
                await self.grading_repo.complete_queue_item(queue_item.id)

            # If all responses for this attempt are now graded, calculate the result
            attempt_id = existing.attempt_id
            graded_count = await self.grading_repo.count_final_grades(attempt_id)
            response_count = await self.submission_repo.count_responses(attempt_id)

            if graded_count == response_count and response_count > 0:
                from app.db.enums import NotificationType, ResultReleaseMode
                from app.db.models.auth import User
                from app.db.repositories.assessment_repo import \
                    AssessmentRepository
                from app.db.repositories.result_repo import ResultRepository
                from app.services.result_service import ResultService
                from app.workers.tasks import send_email_notification

                result_service = ResultService(self.db)
                result, _ = await result_service.calculate_result(attempt_id=attempt_id)

                # Check result_release_mode — if it is IMMEDIATE, release and notify
                assessment_repo = AssessmentRepository(self.db)
                assessment = await assessment_repo.get_by_id_simple(result.assessment_id)

                release_mode = assessment.result_release_mode
                if hasattr(release_mode, "value"):
                    release_mode = release_mode.value

                if release_mode == ResultReleaseMode.IMMEDIATE.value and not result.integrity_hold:
                    result_repo = ResultRepository(self.db)
                    await result_repo.release(result.id, released_by_id=None)

                    # Dispatch notification for the student
                    student = await self.db.get(User, result.student_id)
                    if student and student.email:
                        first_name = student.profile.first_name if student.profile else "Student"
                        from app.core.config import settings
                        results_url = f"{settings.FRONTEND_URL}/student/results/{result.id}"

                        send_email_notification.delay(
                            to_email=student.email,
                            subject=f"Results Released: {assessment.title}",
                            template_name="result_released",
                            context={
                                "first_name": first_name,
                                "assessment_title": assessment.title,
                                "result_id": str(result.id),
                                "results_url": results_url,
                                "percentage": round(result.percentage, 1),
                                "letter_grade": result.letter_grade.value if hasattr(result.letter_grade, "value") else str(result.letter_grade),
                                "is_passing": result.is_passing,
                                "notification_type": NotificationType.RESULT_RELEASED.value,
                                "app_name": settings.APP_NAME
                            }
                        )

        existing.score = final_score
        existing.is_final = is_final
        return existing

    # -----------------------------------------------------------------------
    # GENERATE AI FEEDBACK DRAFT (Phase 4)
    # -----------------------------------------------------------------------

    async def generate_feedback_draft(
        self,
        *,
        grade_id: uuid.UUID,
        lecturer_id: uuid.UUID,
    ) -> SubmissionGrade:
        """
        Generate a professional feedback draft using the FeedbackAgent.

        The draft is stored in the SubmissionGrade record for the lecturer
        to review, edit, and eventually release.
        """
        grade = await self.grading_repo.get_grade_by_id(grade_id)
        if not grade:
            raise NotFoundError("Grade not found")

        assessment = await self.assessment_repo.get_by_id(grade.assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found")

        # 1. Gather context
        rubric_content = "Standard academic evaluation"
        if grade.rubric_scores:
            # Reconstruct rubric context from stored scores/notes if available
            rubric_content = json.dumps(grade.rubric_scores)

        student_response_summary = "Performance evaluation"
        if grade.response_id:
            resp = await self.submission_repo.get_response_by_id(grade.response_id)
            if resp:
                student_response_summary = f"Student Answer: {resp.answer_text[:500]}..."

        # 2. Call AI Feedback Agent
        from app.agents.feedback_agent import FeedbackAgent
        from app.core.ai.gateway import AIGateway
        from app.core.ai.provider_factory import get_ai_provider

        provider = get_ai_provider()
        gateway = AIGateway(self.db, provider)
        agent = FeedbackAgent(gateway)

        try:
            ai_output = await agent.draft_feedback(
                lecturer_id=lecturer_id,
                assessment_title=assessment.title,
                score=grade.score or grade.ai_suggested_score or 0.0,
                max_score=grade.max_score,
                rubric_content=rubric_content,
                lecturer_notes=grade.internal_notes,
                student_response_summary=student_response_summary,
                attempt_id=grade.attempt_id,
                grade_id=grade.id,
            )

            # 3. Store draft separately from final feedback
            # Using update_grade to store the new fields
            await self.grading_repo.update_grade(
                grade_id=grade.id,
                updated_by_id=lecturer_id,
                ai_feedback_draft=ai_output.draft_feedback,
                ai_feedback_strengths=ai_output.strengths,
                ai_feedback_improvements=ai_output.areas_for_improvement,
                ai_feedback_suggestions=ai_output.suggestions,
            )

            # Refresh local object
            grade.ai_feedback_draft = ai_output.draft_feedback
            grade.ai_feedback_strengths = ai_output.strengths
            grade.ai_feedback_improvements = ai_output.areas_for_improvement
            grade.ai_feedback_suggestions = ai_output.suggestions

        except Exception as exc:
            logger.error("AI feedback generation failed for grade %s: %s", grade_id, str(exc))
            raise

        return grade

    # -----------------------------------------------------------------------
    # GRADE ALL RESPONSES FOR AN ATTEMPT (post-submission)
    # -----------------------------------------------------------------------

    async def grade_attempt(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> dict:
        """
        Grade all questions for an attempt.

        For each question in the assessment:
            - If no response exists, treat as skipped.
            - AUTO_GRADABLE types → auto_grade_response()
            - OPEN_ENDED types → queue_manual_grading()

        Returns a summary dict with counts by mode.
        """
        counts = {"auto": 0, "queued": 0, "skipped": 0}

        # 1. Get all questions in the assessment
        aq_rows = await self.assessment_repo.list_assessment_questions(assessment_id)

        # 2. Get existing responses (grade everything available for this attempt)
        responses = await self.submission_repo.list_responses_for_attempt(attempt_id)
        response_map = {r.question_id: r for r in responses}

        for aq in aq_rows:
            if not aq.question:
                continue

            question = aq.question
            max_score = float(
                aq.marks_override if aq.marks_override is not None else question.marks
            )
            q_type = QuestionType(question.question_type)

            # Find or mock response
            response = response_map.get(question.id)
            if not response:
                # Create an empty, skipped response
                from datetime import UTC, datetime
                response, _ = await self.submission_repo.upsert_response(
                    attempt_id=attempt_id,
                    question_id=question.id,
                    answer_type="TEXT", # Default fallback
                    is_skipped=True
                )
                # Explicitly mark as final to ensure it's picked up by calculation
                response.is_final = True
                response.submitted_at = datetime.now(UTC)
                await self.db.flush()

            if response.is_skipped:
                await self.auto_grade_response(
                    response=response,
                    question=question,
                    max_score=max_score,
                    assessment_id=assessment_id,
                    student_id=student_id,
                )
                counts["skipped"] += 1
            elif q_type in AUTO_GRADABLE:
                await self.auto_grade_response(
                    response=response,
                    question=question,
                    max_score=max_score,
                    assessment_id=assessment_id,
                    student_id=student_id,
                )
                counts["auto"] += 1
            elif q_type in OPEN_ENDED:
                await self.queue_manual_grading(
                    response=response,
                    assessment_id=assessment_id,
                    student_id=student_id,
                )
                counts["queued"] += 1

        return counts

    # -----------------------------------------------------------------------
    # GET GRADING QUEUE
    # -----------------------------------------------------------------------

    async def get_grading_queue(
        self,
        lecturer_id: uuid.UUID,
        assessment_id: uuid.UUID | None = None,
        class_section_id: uuid.UUID | None = None,
        question_type: str | None = None,
        status: str | None = None,
        priority: str | None = None,
        search_query: str | None = None,
        sort_by: str | None = "date_asc",
        page: int = 1,
        page_size: int = 30,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Fetch items from the grading queue, filtered by assessments the lecturer teaches.

        Logic:
            1. Find all courses the lecturer is assigned to.
            2. Find all assessments belonging to those courses.
            3. Filter the queue by those assessment IDs.
        """
        from app.db.models.academic import Course, TeachingAssignment
        from app.db.models.assessment import Assessment
        from sqlalchemy import select

        # 1. Find lecturer's assessment IDs
        stmt = (
            select(Assessment.id)
            .join(Course, Course.id == Assessment.course_id)
            .join(TeachingAssignment, TeachingAssignment.course_id == Course.id)
            .where(TeachingAssignment.lecturer_id == lecturer_id)
        )
        res = await self.db.execute(stmt)
        allowed_assessment_ids = res.scalars().all()

        if not allowed_assessment_ids:
            return [], 0

        # 2. List queue with allowed assessment filter
        if assessment_id and assessment_id not in allowed_assessment_ids:
            return [], 0

        # Default status: show only active queue items if not specified
        statuses = [status] if status else [
            GradingQueueStatus.PENDING,
            GradingQueueStatus.ASSIGNED,
            GradingQueueStatus.IN_PROGRESS,
            GradingQueueStatus.AI_SUGGESTED, # Added this state from prompt
        ]

        items, total = await self.grading_repo.list_queue(
            assessment_ids=allowed_assessment_ids if not assessment_id else [assessment_id],
            class_section_id=class_section_id,
            question_type=question_type,
            statuses=statuses,
            priority=priority,
            search_query=search_query,
            sort_by=sort_by,
            page=page,
            page_size=page_size,
        )

        return items, total

    # -----------------------------------------------------------------------
    # MODERATION LAYER (Phase 4)
    # -----------------------------------------------------------------------

    async def get_moderation_data(
        self,
        question_id: uuid.UUID,
        moderator_id: uuid.UUID
    ) -> dict[str, Any]:
        """
        Returns analytics and outliers for a question to assist moderation.
        """
        from app.db.models.question import Question
        q = await self.db.get(Question, question_id)
        if not q:
            raise NotFoundError("Question not found")

        stats = await self.grading_repo.get_moderation_stats(question_id)
        stats["question_title"] = q.content or "Untitled Question"

        # Calculate median (simple Python side)
        if stats["score_distribution"]:
            scores = []
            for dp in stats["score_distribution"]:
                scores.extend([dp["score"]] * dp["count"])

            if scores:
                scores.sort()
                mid = len(scores) // 2
                median = (scores[mid] + scores[~mid]) / 2
                stats["median_score"] = float(median)
            else:
                stats["median_score"] = 0.0
        else:
            stats["median_score"] = 0.0

        return stats

    async def moderate_submission_grade(
        self,
        *,
        response_id: uuid.UUID,
        moderator_id: uuid.UUID,
        new_score: float,
        revision_reason: str,
        feedback_update: str | None = None,
        internal_notes: str | None = None,
    ) -> SubmissionGrade:
        """
        Moderator adjusts a grade. Old grade is superseded (immutable audit).
        """
        # 1. Get existing CURRENT grade
        existing = await self.grading_repo.get_grade_by_response(response_id)
        if not existing:
            raise NotFoundError("Grade not found")

        if not existing.is_final:
            raise ConflictError("Only finalised grades can be moderated. Use manual grading for pending items.")

        # 2. Implements the pattern: mark current False, insert new
        new_grade = await self.grading_repo.supersede_grade(
            old_grade_id=existing.id,
            new_score=new_score,
            moderator_id=moderator_id,
            revision_reason=revision_reason,
            feedback_update=feedback_update,
            internal_notes=internal_notes
        )

        # 3. Trigger result recalculation for the attempt
        from app.services.result_service import ResultService
        result_service = ResultService(self.db)
        result, _ = await result_service.calculate_result(attempt_id=existing.attempt_id)

        # 4. Notify student
        from app.core.config import settings
        from app.db.enums import NotificationType
        from app.db.models.auth import User
        from app.workers.tasks import send_email_notification

        student = await self.db.get(User, existing.student_id)
        if student and student.email:
            send_email_notification.delay(
                to_email=student.email,
                subject="Grade Updated (Moderation Review)",
                template_name="grade_updated",
                context={
                    "first_name": student.profile.first_name if student.profile else "Student",
                    "reason": revision_reason,
                    "new_score": new_score,
                    "max_score": existing.max_score,
                    "results_url": f"{settings.FRONTEND_URL}/student/results/{result.id}",
                    "notification_type": NotificationType.RESULT_RELEASED.value
                }
            )

        return new_grade

    async def _compute_auto_score(
        self,
        *,
        response: StudentResponse,
        question: Question,
        max_score: float,
    ) -> tuple[float, bool]:
        """
        Compute the score for a closed question type.

        Returns (score, is_correct).
        """
        options = await self.question_repo.list_options(question.id)

        q_type = QuestionType(question.question_type)

        # ── MCQ ─────────────────────────────────────────────────────────────
        if q_type == QuestionType.MCQ:
            correct_ids = {str(o.id) for o in options if o.is_correct}
            student_ids = {str(i) for i in (response.selected_option_ids or [])}
            is_correct = student_ids == correct_ids and bool(correct_ids)
            return (max_score if is_correct else 0.0), is_correct

        # ── TRUE/FALSE ───────────────────────────────────────────────────────
        if q_type == QuestionType.TRUE_FALSE:
            correct = next((o for o in options if o.is_correct), None)
            student_ids = response.selected_option_ids or []
            is_correct = bool(correct) and len(student_ids) == 1 and str(student_ids[0]) == str(correct.id)
            return (max_score if is_correct else 0.0), is_correct

        # ── ORDERING ────────────────────────────────────────────────────────
        if q_type == QuestionType.ORDERING:
            correct_order = [str(o.id) for o in sorted(options, key=lambda o: o.order_index)]
            student_order = [str(i) for i in (response.ordered_option_ids or [])]
            if not correct_order:
                return 0.0, False
            if student_order == correct_order:
                return max_score, True
            # Partial scoring: award marks per correct position
            correct_positions = sum(
                1 for s, c in zip(student_order, correct_order) if s == c
            )
            score = round((correct_positions / len(correct_order)) * max_score, 2)
            return score, score == max_score

        # ── MATCHING ────────────────────────────────────────────────────────
        if q_type == QuestionType.MATCHING:
            pairs = response.match_pairs_json or {}
            correct_map = {str(o.id): o.match_value for o in options if o.match_value}
            if not correct_map:
                return 0.0, False
            correct_count = sum(
                1 for k, v in pairs.items()
                if k in correct_map and correct_map[k] == v
            )
            score = round((correct_count / len(correct_map)) * max_score, 2)
            return score, score == max_score

        # ── FILL_BLANK ───────────────────────────────────────────────────────
        if q_type == QuestionType.FILL_BLANK:
            blanks = await self.question_repo.list_blanks(question.id)
            if not blanks:
                return 0.0, False
            student_answers = response.fill_blank_answers or {}
            correct_count = 0
            for blank in blanks:
                student_val = student_answers.get(str(blank.blank_index), "").strip()
                accepted = blank.accepted_answers or []
                if blank.case_sensitive:
                    match = student_val in accepted
                else:
                    match = student_val.lower() in [a.lower() for a in accepted]
                if match:
                    correct_count += 1
            score = round((correct_count / len(blanks)) * max_score, 2)
            return score, score == max_score

        # Fallback for any unhandled type
        return 0.0, False
