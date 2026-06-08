"""
app/services/result_service.py

Business logic for assessment result calculation and release.

RULES ENFORCED HERE:
    - Results are calculated only when ALL questions have is_final=True grades.
    - Partial results (not fully graded) are NOT released to students.
    - integrity_hold=True blocks release even if is_released would be set.
    - Letter grade is computed from percentage using institution grade bands.
    - Bulk release respects integrity holds: held results are counted and
      returned in the response but not released.
    - Recalculation is idempotent — safe to call multiple times as more
      grades are finalised (for partial grading scenarios).
    - Students can only see their own result after is_released=True.
    - Lecturers and admins can see results at any time.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError
from app.db.enums import AttemptStatus, ResultLetterGrade
from app.db.models.result import AssessmentResult
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.grading_repo import GradingRepository
from app.db.repositories.result_repo import ResultRepository
from app.db.repositories.submission_repo import SubmissionRepository


def _utcnow() -> datetime:
    return datetime.now(UTC)


# Grade band thresholds (percentage >= threshold → grade)
GRADE_BANDS = [
    (90, ResultLetterGrade.A_PLUS),
    (85, ResultLetterGrade.A),
    (80, ResultLetterGrade.A_MINUS),
    (75, ResultLetterGrade.B_PLUS),
    (70, ResultLetterGrade.B),
    (65, ResultLetterGrade.B_MINUS),
    (60, ResultLetterGrade.C_PLUS),
    (55, ResultLetterGrade.C),
    (50, ResultLetterGrade.C_MINUS),
    (45, ResultLetterGrade.D),
    (0,  ResultLetterGrade.F),
]


class ResultService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.result_repo = ResultRepository(db)
        self.grading_repo = GradingRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.assessment_repo = AssessmentRepository(db)
        self.submission_repo = SubmissionRepository(db)

    # -----------------------------------------------------------------------
    # CALCULATE RESULT
    # -----------------------------------------------------------------------

    async def calculate_result(
        self,
        *,
        attempt_id: uuid.UUID,
    ) -> tuple[AssessmentResult, bool]:
        """
        Compute the AssessmentResult for an attempt.

        Uses only is_final=True grades. If not all questions are graded yet,
        still creates/updates the result (partial) but marks it accordingly.
        The result is NOT released until the lecturer triggers release.

        Returns (result, created: bool).
        """
        attempt = await self.attempt_repo.get_by_id_simple(attempt_id)
        if not attempt:
            raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

        if attempt.status not in (AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED):
            raise ConflictError(
                "Cannot calculate result for an attempt that has not been submitted",
                code="ATTEMPT_NOT_SUBMITTED",
            )

        # Sum scores from final grades
        total_score = await self.grading_repo.sum_final_scores(attempt_id)
        max_score = await self.grading_repo.sum_max_scores(attempt_id)
        graded_count = await self.grading_repo.count_final_grades(attempt_id)
        aq_count = await self.assessment_repo.count_assessment_questions(attempt.assessment_id)

        # Percentage (guard against divide-by-zero)
        percentage = round((total_score / max_score) * 100, 2) if max_score > 0 else 0.0

        # Passing threshold from assessment
        assessment = await self.assessment_repo.get_by_id_simple(attempt.assessment_id)
        passing_pct = 0.0
        if assessment and assessment.passing_marks and assessment.total_marks:
            passing_pct = (assessment.passing_marks / assessment.total_marks) * 100

        letter_grade = _compute_letter_grade(percentage)
        is_passing = percentage >= passing_pct

        result, created = await self.result_repo.create_or_update_result(
            attempt_id=attempt_id,
            student_id=attempt.student_id,
            assessment_id=attempt.assessment_id,
            total_score=total_score,
            max_score=max_score,
            percentage=percentage,
            letter_grade=letter_grade,
            is_passing=is_passing,
            graded_question_count=graded_count,
            total_question_count=aq_count,
        )

        # Set integrity hold if attempt is flagged
        if attempt.is_flagged:
            await self.result_repo.set_integrity_hold(result.id, True)

        # Update cached score on attempt
        await self.attempt_repo.set_total_score(attempt_id, total_score)

        # Generate per-question breakdown
        await self.generate_breakdown(result.id, attempt_id)

        # Gate: Automatic Release for IMMEDIATE mode
        from app.db.enums import NotificationType, ResultReleaseMode
        from app.db.models.auth import User
        from app.workers.tasks import send_email_notification

        release_mode = assessment.result_release_mode
        if hasattr(release_mode, "value"):
            release_mode = release_mode.value

        if release_mode == ResultReleaseMode.IMMEDIATE.value and not result.integrity_hold:
            await self.result_repo.release(result.id, released_by_id=None)
            result.is_released = True

            # Dispatch notification
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

        return result, created

    # -----------------------------------------------------------------------
    # GENERATE BREAKDOWN
    # -----------------------------------------------------------------------

    async def generate_breakdown(
        self,
        result_id: uuid.UUID,
        attempt_id: uuid.UUID,
    ) -> None:
        """
        Create/replace per-question breakdown rows for a result.

        Sources data from SubmissionGrade and StudentResponse rows.
        Idempotent — replaces existing breakdowns.
        """
        grades = await self.grading_repo.list_final_grades_for_attempt(attempt_id)
        responses = await self.submission_repo.list_responses_for_attempt(attempt_id)

        # Build maps for efficient lookup
        grade_map = {g.question_id: g for g in grades}
        response_map = {r.question_id: r for r in responses}

        # Get all question IDs in this attempt (via responses)
        all_question_ids = set(response_map.keys())

        breakdowns = []
        for q_id in all_question_ids:
            grade = grade_map.get(q_id)
            response = response_map.get(q_id)

            breakdowns.append({
                "question_id": q_id,
                "attempt_id": attempt_id,
                "score": grade.score if grade else None,
                "max_score": grade.max_score if grade else 0.0,
                "is_correct": (
                    grade.score == grade.max_score
                    if grade and grade.score is not None
                    else None
                ),
                "feedback": grade.feedback if grade else None,
                "grading_mode": grade.grading_mode if grade else None,
                "was_skipped": response.is_skipped if response else False,
            })

        await self.result_repo.replace_breakdowns(result_id, breakdowns)

    # -----------------------------------------------------------------------
    # RELEASE RESULTS
    # -----------------------------------------------------------------------

    async def release_results(
        self,
        *,
        assessment_id: uuid.UUID,
        released_by_id: uuid.UUID | None = None,
        attempt_ids: list[uuid.UUID] | None = None,
    ) -> dict:
        """
        Release results to students.

        If attempt_ids is None → releases all releasable results for the assessment.
        If attempt_ids is provided → releases only those specific results.

        Results with integrity_hold=True are skipped and returned in held_attempt_ids.

        Returns:
            {
                released_count: int,
                held_count: int,
                held_attempt_ids: [uuid, ...],
                message: str,
            }
        """
        if attempt_ids:
            # Load specific results
            results = await self.result_repo.list_by_attempt_ids(attempt_ids)
        else:
            results = await self.result_repo.list_unreleased_without_hold(assessment_id)

        releasable = [r for r in results if not r.integrity_hold and not r.is_released]
        held = [r for r in results if r.integrity_hold]

        released_ids = [r.id for r in releasable]
        released_count = await self.result_repo.bulk_release(
            released_ids, released_by_id=released_by_id
        )

        # Dispatch notifications for released results
        if released_ids:
            from app.db.enums import NotificationType
            from app.db.models.auth import User
            from app.workers.tasks import send_email_notification
            
            assessment = await self.assessment_repo.get_by_id_simple(assessment_id)
            assessment_title = assessment.title if assessment else "Assessment"

            for r in releasable:
                student = await self.db.get(User, r.student_id)
                if student and student.email:
                    first_name = student.profile.first_name if student.profile else "Student"
                    from app.core.config import settings
                    results_url = f"{settings.FRONTEND_URL}/student/results/{r.id}"
                    
                    send_email_notification.delay(
                        to_email=student.email,
                        subject=f"Results Released: {assessment_title}",
                        template_name="result_released",
                        context={
                            "first_name": first_name,
                            "assessment_title": assessment_title,
                            "result_id": str(r.id),
                            "results_url": results_url,
                            "percentage": round(r.percentage, 1),
                            "letter_grade": r.letter_grade.value if hasattr(r.letter_grade, "value") else str(r.letter_grade),
                            "is_passing": r.is_passing,
                            "notification_type": NotificationType.RESULT_RELEASED.value,
                            "app_name": settings.APP_NAME
                        }
                    )

        held_attempt_ids = [r.attempt_id for r in held]

        return {
            "released_count": released_count,
            "held_count": len(held),
            "held_attempt_ids": held_attempt_ids,
            "message": (
                f"{released_count} result(s) released. "
                f"{len(held)} held due to integrity flags."
            ),
        }

    # -----------------------------------------------------------------------
    # GET RESULT (role-aware)
    # -----------------------------------------------------------------------

    async def get_result_for_student(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> dict:
        """
        Return a result for a student — only if is_released=True.
        Raises NotFoundError if not released yet.
        """
        attempt = await self.attempt_repo.get_by_id_simple(attempt_id)
        if not attempt:
            raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

        if attempt.student_id != student_id:
            raise AuthorizationError("You do not own this attempt", code="ATTEMPT_OWNERSHIP_VIOLATION")

        result = await self.result_repo.get_by_attempt_with_breakdowns(attempt_id)
        if not result or not result.is_released:
            raise NotFoundError(
                "Result is not yet available",
                code="RESULT_NOT_RELEASED",
            )
        
        return await self._enrich_result_response(result)

    async def get_result_for_lecturer(
        self,
        *,
        attempt_id: uuid.UUID,
    ) -> dict:
        """
        Return a result for a lecturer/admin — no release check.
        """
        result = await self.result_repo.get_by_attempt_with_breakdowns(attempt_id)
        if not result:
            raise NotFoundError("Result not found", code="RESULT_NOT_FOUND")
        
        return await self._enrich_result_response(result)

    async def _enrich_result_response(self, result: AssessmentResult) -> dict:
        """Add question and answer text to breakdowns for UI review."""
        from app.schemas.result import AssessmentResultResponse, ResultBreakdownItem
        from app.db.models.assessment import Assessment
        
        resp = AssessmentResultResponse.model_validate(result)
        
        # Load assessment info
        assessment = await self.db.get(Assessment, result.assessment_id)
        if assessment:
            resp.assessment_title = assessment.title
            resp.academic_year = assessment.academic_year

        # Load all questions and responses for this attempt
        responses = await self.submission_repo.list_responses_for_attempt(result.attempt_id)
        response_map = {r.question_id: r for r in responses}
        
        # Map for section titles
        aq_rows = await self.assessment_repo.list_assessment_questions(result.assessment_id)
        aq_map = {aq.question_id: aq for aq in aq_rows}
        
        for bd in resp.breakdowns:
            response = response_map.get(bd.question_id)
            if not response:
                continue
                
            q = response.question
            bd.question_text = q.content
            bd.imageUrl = q.image_url
            
            # Populate section title
            aq = aq_map.get(bd.question_id)
            if aq and aq.assessment_section:
                bd.section_title = aq.assessment_section.title
            
            # Safe Enum to string conversion
            q_type = q.question_type
            if hasattr(q_type, "value"):
                q_type = q_type.value
            bd.question_type = str(q_type).lower().replace("_", "")
            
            # Format student answer
            ans_type = response.answer_type
            if hasattr(ans_type, "value"):
                ans_type = ans_type.value
            
            if ans_type == "SINGLE_OPTION":
                # Find the option text
                opt_id = response.selected_option_ids[0] if response.selected_option_ids else None
                if opt_id:
                    opt = next((o for o in q.options if str(o.id) == str(opt_id)), None)
                    bd.student_answer = opt.content if opt else "Unknown Option"
            elif ans_type == "MULTI_OPTION":
                bd.student_answer = ", ".join([
                    next((o.content for o in q.options if str(o.id) == str(oid)), "Unknown")
                    for oid in (response.selected_option_ids or [])
                ])
            elif ans_type == "MATCH_PAIRS":
                bd.student_answer = str(response.match_pairs_json)
            elif ans_type == "FILL_BLANKS":
                bd.student_answer = str(response.fill_blank_answers)
            else:
                bd.student_answer = response.answer_text
                
            # Correct answer (for auto-gradable)
            raw_q_type = q.question_type
            if hasattr(raw_q_type, "value"):
                raw_q_type = raw_q_type.value

            if raw_q_type in ["MCQ", "TRUE_FALSE"]:
                correct_opts = [o.content for o in q.options if o.is_correct]
                bd.correct_answer = ", ".join(correct_opts)
            elif raw_q_type == "MATCHING":
                # Show matches
                bd.correct_answer = ", ".join([f"{o.content} -> {o.match_value}" for o in q.options])
            
            bd.options = [
                {"id": str(o.id), "text": o.content, "is_correct": o.is_correct}
                for o in (q.options or [])
            ]

        return resp.model_dump()

    async def list_results_for_student(
        self,
        *,
        student_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AssessmentResult], int]:
        """
        Return a list of released results for a student.
        """
        return await self.result_repo.list_by_student(
            student_id=student_id,
            is_released=True,
            page=page,
            page_size=page_size,
        )

    # -----------------------------------------------------------------------
    # CLEAR INTEGRITY HOLD
    # -----------------------------------------------------------------------

    async def clear_integrity_hold(
        self,
        *,
        result_id: uuid.UUID,
        cleared_by_id: uuid.UUID,
    ) -> None:
        """
        Clear the integrity hold on a result, making it releasable.
        Must be called by a lecturer or admin after resolving the flag.
        """
        result = await self.result_repo.get_by_id(result_id)
        if not result:
            raise NotFoundError("Result not found", code="RESULT_NOT_FOUND")
        if not result.integrity_hold:
            raise ConflictError(
                "This result does not have an integrity hold",
                code="NO_INTEGRITY_HOLD",
            )
        await self.result_repo.set_integrity_hold(result_id, False)


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _compute_letter_grade(percentage: float) -> ResultLetterGrade | None:
    """Compute letter grade from percentage using institution bands."""
    for threshold, grade in GRADE_BANDS:
        if percentage >= threshold:
            return grade
    return ResultLetterGrade.F
