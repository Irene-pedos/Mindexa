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
        total_responses = await self.submission_repo.count_responses(attempt_id)

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
            total_question_count=total_responses,
        )

        # Update cached score on attempt
        await self.attempt_repo.set_total_score(attempt_id, total_score)

        # Generate per-question breakdown
        await self.generate_breakdown(result.id, attempt_id)

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
        released_by_id: uuid.UUID,
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
    ) -> AssessmentResult:
        """
        Return a result for a student — only if is_released=True.
        Raises NotFoundError if not released yet (prevents timing attacks).
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
        return result

    async def get_result_for_lecturer(
        self,
        *,
        attempt_id: uuid.UUID,
    ) -> AssessmentResult:
        """
        Return a result for a lecturer/admin — no release check.
        """
        result = await self.result_repo.get_by_attempt_with_breakdowns(attempt_id)
        if not result:
            raise NotFoundError("Result not found", code="RESULT_NOT_FOUND")
        return result

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
