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

import uuid
from typing import List, Optional

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.db.enums import GradingMode, GradingQueuePriority, QuestionType
from app.db.models.attempt import GradingQueueItem, SubmissionGrade
from app.db.models.question import Question
from app.db.models.attempt import StudentResponse
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.grading_repo import GradingRepository
from app.db.repositories.submission_repo import SubmissionRepository
from sqlalchemy.ext.asyncio import AsyncSession

# AUTO-GRADABLE question types
AUTO_GRADABLE = {
    QuestionType.MCQ,
    QuestionType.TRUE_FALSE,
    QuestionType.ORDERING,
    QuestionType.MATCHING,
    QuestionType.FILL_BLANK,
}

# Requires human or AI review
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

    # -----------------------------------------------------------------------
    # AUTO-GRADE MCQ / CLOSED QUESTIONS
    # -----------------------------------------------------------------------

    async def auto_grade_response(
        self,
        *,
        response: StudentResponse,
        question: Question,
        max_score: float,
        graded_by_id: Optional[uuid.UUID] = None,
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
        return item

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
        graded_by_ai_id: Optional[uuid.UUID] = None,
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
            grading_mode=GradingMode.AI_ASSISTED,
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
        feedback: Optional[str] = None,
        internal_notes: Optional[str] = None,
        rubric_scores: Optional[list] = None,
        accept_ai_suggestion: bool = False,
    ) -> SubmissionGrade:
        """
        Lecturer finalises a grade — sets is_final=True and awards the score.

        accept_ai_suggestion=True: uses the ai_suggested_score already stored.
        accept_ai_suggestion=False: uses the `score` argument (lecturer override).

        Sets lecturer_override=True if the score differs from the AI suggestion.
        """
        existing = await self.grading_repo.get_grade_by_response(response_id)
        if not existing:
            raise NotFoundError("Grade not found", code="GRADE_NOT_FOUND")

        if existing.is_final:
            raise ConflictError(
                "This grade has already been finalised",
                code="GRADE_ALREADY_FINAL",
            )

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
            GradingMode.AI_ASSISTED
            if existing.grading_mode == GradingMode.AI_ASSISTED
            else GradingMode.MANUAL
        )

        await self.grading_repo.finalize_grade(
            grade_id=existing.id,
            score=final_score,
            updated_by_id=lecturer_id,
            feedback=feedback,
            rubric_scores=rubric_scores,
            lecturer_override=lecturer_override,
            grading_mode=grading_mode,
        )

        if internal_notes is not None:
            await self.grading_repo.update_grade(
                grade_id=existing.id,
                updated_by_id=lecturer_id,
                internal_notes=internal_notes,
            )

        # Complete the queue item
        queue_item = await self.grading_repo.get_active_queue_item_for_response(response_id)
        if queue_item:
            await self.grading_repo.complete_queue_item(queue_item.id)

        existing.score = final_score
        existing.is_final = True
        return existing

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
        Grade all final responses for an attempt.

        For each question:
            - AUTO_GRADABLE types → auto_grade_response()
            - OPEN_ENDED types → queue_manual_grading()

        Returns a summary dict with counts by mode.
        """
        responses = await self.submission_repo.list_final_responses(attempt_id)
        counts = {"auto": 0, "queued": 0, "skipped": 0}

        for response in responses:
            # Load question with options via assessment question link
            aq_rows = await self.assessment_repo.list_assessment_questions(assessment_id)
            aq_map = {row.question_id: row for row in aq_rows}
            aq = aq_map.get(response.question_id)
            if not aq or not aq.question:
                continue

            question = aq.question
            max_score = float(
                aq.marks_override if aq.marks_override is not None else question.marks
            )

            q_type = QuestionType(question.question_type)
            if response.is_skipped:
                await self.auto_grade_response(
                    response=response,
                    question=question,
                    max_score=max_score,
                )
                counts["skipped"] += 1
            elif q_type in AUTO_GRADABLE:
                await self.auto_grade_response(
                    response=response,
                    question=question,
                    max_score=max_score,
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
    # INTERNAL: COMPUTE AUTO SCORE
    # -----------------------------------------------------------------------

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
        from app.db.repositories.question_repo import QuestionRepository
        q_repo = QuestionRepository(self.db)
        options = await q_repo.list_options(question.id)

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
            if student_order == correct_order:
                return max_score, True
            # Partial scoring: award marks per correct position
            correct_positions = sum(
                1 for s, c in zip(student_order, correct_order) if s == c
            )
            score = round((correct_positions / len(correct_order)) * max_score, 2) if correct_order else 0.0
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
            from app.db.repositories.question_repo import QuestionRepository
            q_repo2 = QuestionRepository(self.db)
            blanks = await q_repo2.list_blanks(question.id)
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
