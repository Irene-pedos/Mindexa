"""
app/db/repositories/result_repo.py

Data access for AssessmentResult and ResultBreakdown.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.result import AssessmentResult, ResultBreakdown


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ResultRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # AssessmentResult — CREATE / UPDATE
    # -----------------------------------------------------------------------

    async def create_or_update_result(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
        assessment_id: uuid.UUID,
        total_score: float,
        max_score: float,
        percentage: float,
        letter_grade: str | None,
        is_passing: bool,
        graded_question_count: int,
        total_question_count: int,
    ) -> tuple[AssessmentResult, bool]:
        """
        Upsert a result row. Returns (result, created).
        Recalculates are idempotent — safe to call multiple times.
        """
        existing = await self.get_by_attempt(attempt_id)

        if existing:
            existing.total_score = total_score
            existing.max_score = max_score
            existing.percentage = percentage
            existing.letter_grade = letter_grade
            existing.is_passing = is_passing
            existing.calculated_at = _utcnow()
            existing.graded_question_count = graded_question_count
            existing.total_question_count = total_question_count
            await self.db.flush()
            return existing, False

        result = AssessmentResult(
            attempt_id=attempt_id,
            student_id=student_id,
            assessment_id=assessment_id,
            total_score=total_score,
            max_score=max_score,
            percentage=percentage,
            letter_grade=letter_grade,
            is_passing=is_passing,
            is_released=False,
            integrity_hold=False,
            calculated_at=_utcnow(),
            graded_question_count=graded_question_count,
            total_question_count=total_question_count,
        )
        self.db.add(result)
        await self.db.flush()
        return result, True

    # -----------------------------------------------------------------------
    # AssessmentResult — READS
    # -----------------------------------------------------------------------

    async def get_by_id(self, result_id: uuid.UUID) -> AssessmentResult | None:
        result = await self.db.execute(
            select(AssessmentResult)
            .options(selectinload(AssessmentResult.breakdowns))
            .where(
                AssessmentResult.id == result_id,
                AssessmentResult.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_by_attempt(self, attempt_id: uuid.UUID) -> AssessmentResult | None:
        result = await self.db.execute(
            select(AssessmentResult).where(
                AssessmentResult.attempt_id == attempt_id,
                AssessmentResult.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_by_attempt_with_breakdowns(
        self, attempt_id: uuid.UUID
    ) -> AssessmentResult | None:
        result = await self.db.execute(
            select(AssessmentResult)
            .options(selectinload(AssessmentResult.breakdowns))
            .where(
                AssessmentResult.attempt_id == attempt_id,
                AssessmentResult.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_by_assessment(
        self,
        assessment_id: uuid.UUID,
        is_released: bool | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[AssessmentResult], int]:
        filters = [
            AssessmentResult.assessment_id == assessment_id,
            AssessmentResult.is_deleted == False,  # noqa: E712
        ]
        if is_released is not None:
            filters.append(AssessmentResult.is_released == is_released)

        count_result = await self.db.execute(
            select(func.count(AssessmentResult.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(AssessmentResult)
            .where(*filters)
            .order_by(AssessmentResult.calculated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def list_unreleased_without_hold(
        self, assessment_id: uuid.UUID
    ) -> list[AssessmentResult]:
        """Return all releasable results (not released, no integrity hold)."""
        result = await self.db.execute(
            select(AssessmentResult).where(
                AssessmentResult.assessment_id == assessment_id,
                AssessmentResult.is_released == False,  # noqa: E712
                AssessmentResult.integrity_hold == False,  # noqa: E712
                AssessmentResult.is_deleted == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def list_by_attempt_ids(
        self, attempt_ids: list[uuid.UUID]
    ) -> list[AssessmentResult]:
        result = await self.db.execute(
            select(AssessmentResult).where(
                AssessmentResult.attempt_id.in_(attempt_ids),
                AssessmentResult.is_deleted == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def list_by_student(
        self,
        student_id: uuid.UUID,
        is_released: bool | None = True,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AssessmentResult], int]:
        filters = [
            AssessmentResult.student_id == student_id,
            AssessmentResult.is_deleted == False,  # noqa: E712
        ]
        if is_released is not None:
            filters.append(AssessmentResult.is_released == is_released)

        count_result = await self.db.execute(
            select(func.count(AssessmentResult.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(AssessmentResult)
            .where(*filters)
            .options(selectinload(AssessmentResult.assessment))
            .order_by(AssessmentResult.released_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    # -----------------------------------------------------------------------
    # AssessmentResult — UPDATES
    # -----------------------------------------------------------------------

    async def release(
        self,
        result_id: uuid.UUID,
        released_by_id: uuid.UUID | None = None,
    ) -> None:
        now = _utcnow()
        await self.db.execute(
            update(AssessmentResult)
            .where(AssessmentResult.id == result_id)
            .values(
                is_released=True,
                released_at=now,
                released_by_id=released_by_id,
            )
        )

    async def set_integrity_hold(self, result_id: uuid.UUID, hold: bool) -> None:
        await self.db.execute(
            update(AssessmentResult)
            .where(AssessmentResult.id == result_id)
            .values(integrity_hold=hold)
        )

    async def bulk_release(
        self,
        result_ids: list[uuid.UUID],
        released_by_id: uuid.UUID | None = None,
    ) -> int:
        """Release multiple results atomically. Returns count released."""
        now = _utcnow()
        result = await self.db.execute(
            update(AssessmentResult)
            .where(
                AssessmentResult.id.in_(result_ids),
                AssessmentResult.integrity_hold == False,  # noqa: E712
            )
            .values(
                is_released=True,
                released_at=now,
                released_by_id=released_by_id,
            )
        )
        return result.rowcount

    # -----------------------------------------------------------------------
    # ResultBreakdown — CREATE / READ
    # -----------------------------------------------------------------------

    async def replace_breakdowns(
        self,
        result_id: uuid.UUID,
        breakdowns: list[dict],
    ) -> list[ResultBreakdown]:
        """
        Delete existing breakdowns for a result, then insert fresh rows.
        Called each time calculate_result() runs (idempotent).
        """
        from sqlalchemy import delete
        await self.db.execute(
            delete(ResultBreakdown).where(ResultBreakdown.result_id == result_id)
        )

        rows = []
        for bd in breakdowns:
            row = ResultBreakdown(
                result_id=result_id,
                question_id=bd["question_id"],
                attempt_id=bd["attempt_id"],
                score=bd.get("score"),
                max_score=bd["max_score"],
                is_correct=bd.get("is_correct"),
                feedback=bd.get("feedback"),
                grading_mode=bd.get("grading_mode"),
                was_skipped=bd.get("was_skipped", False),
            )
            self.db.add(row)
            rows.append(row)

        await self.db.flush()
        return rows

    async def list_breakdowns(self, result_id: uuid.UUID) -> list[ResultBreakdown]:
        result = await self.db.execute(
            select(ResultBreakdown).where(
                ResultBreakdown.result_id == result_id,
                ResultBreakdown.is_deleted == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())
