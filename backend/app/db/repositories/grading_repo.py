"""
app/db/repositories/grading_repo.py

Data access for SubmissionGrade and GradingQueueItem.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import GradingQueuePriority, GradingQueueStatus
from app.db.models.attempt import GradingQueueItem, SubmissionGrade


def _utcnow() -> datetime:
    return datetime.now(UTC)


class GradingRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # SubmissionGrade — CREATE
    # -----------------------------------------------------------------------

    async def create_grade(
        self,
        *,
        response_id: uuid.UUID,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        question_id: uuid.UUID,
        max_score: float,
        grading_mode: str,
        created_by_id: uuid.UUID | None = None,
        score: float | None = None,
        ai_suggested_score: float | None = None,
        ai_rationale: str | None = None,
        ai_confidence: float | None = None,
        feedback: str | None = None,
        internal_notes: str | None = None,
        rubric_scores: list | None = None,
        is_final: bool = False,
    ) -> SubmissionGrade:
        grade = SubmissionGrade(
            response_id=response_id,
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            question_id=question_id,
            max_score=max_score,
            grading_mode=grading_mode,
            created_by_id=created_by_id,
            updated_by_id=created_by_id,
            score=score,
            ai_suggested_score=ai_suggested_score,
            ai_rationale=ai_rationale,
            ai_confidence=ai_confidence,
            feedback=feedback,
            internal_notes=internal_notes,
            rubric_scores=rubric_scores,
            is_final=is_final,
            graded_at=_utcnow() if is_final else None,
        )
        self.db.add(grade)
        await self.db.flush()
        return grade

    # -----------------------------------------------------------------------
    # SubmissionGrade — READS
    # -----------------------------------------------------------------------

    async def get_grade_by_response(
        self, response_id: uuid.UUID
    ) -> SubmissionGrade | None:
        result = await self.db.execute(
            select(SubmissionGrade).where(
                SubmissionGrade.response_id == response_id,
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_grade_by_id(self, grade_id: uuid.UUID) -> SubmissionGrade | None:
        result = await self.db.execute(
            select(SubmissionGrade).where(
                SubmissionGrade.id == grade_id,
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def list_grades_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[SubmissionGrade]:
        result = await self.db.execute(
            select(SubmissionGrade).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return list(result.scalars().all())

    async def list_final_grades_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[SubmissionGrade]:
        result = await self.db.execute(
            select(SubmissionGrade).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_final.is_(True),
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return list(result.scalars().all())

    async def count_final_grades(self, attempt_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(SubmissionGrade.id)).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_final.is_(True),
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return result.scalar_one()

    async def sum_final_scores(self, attempt_id: uuid.UUID) -> float:
        result = await self.db.execute(
            select(func.coalesce(func.sum(SubmissionGrade.score), 0.0)).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_final.is_(True),
                SubmissionGrade.is_deleted.is_(False),
                SubmissionGrade.score.is_not(None),
            )
        )
        return float(result.scalar_one())

    async def sum_max_scores(self, attempt_id: uuid.UUID) -> float:
        result = await self.db.execute(
            select(func.coalesce(func.sum(SubmissionGrade.max_score), 0.0)).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_final.is_(True),
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return float(result.scalar_one())

    # -----------------------------------------------------------------------
    # SubmissionGrade — UPDATES
    # -----------------------------------------------------------------------

    async def update_grade(
        self,
        grade_id: uuid.UUID,
        updated_by_id: uuid.UUID,
        **fields,
    ) -> None:
        fields["updated_by_id"] = updated_by_id
        if fields.get("is_final") and "graded_at" not in fields:
            fields["graded_at"] = _utcnow()
        await self.db.execute(
            update(SubmissionGrade)
            .where(SubmissionGrade.id == grade_id)
            .values(**fields)
        )

    async def finalize_grade(
        self,
        grade_id: uuid.UUID,
        score: float,
        updated_by_id: uuid.UUID,
        feedback: str | None = None,
        rubric_scores: list | None = None,
        lecturer_override: bool = False,
        grading_mode: str | None = None,
    ) -> None:
        values = {
            "score": score,
            "is_final": True,
            "graded_at": _utcnow(),
            "updated_by_id": updated_by_id,
            "lecturer_override": lecturer_override,
        }
        if feedback is not None:
            values["feedback"] = feedback
        if rubric_scores is not None:
            values["rubric_scores"] = rubric_scores
        if grading_mode is not None:
            values["grading_mode"] = grading_mode
        await self.db.execute(
            update(SubmissionGrade)
            .where(SubmissionGrade.id == grade_id)
            .values(**values)
        )

    # -----------------------------------------------------------------------
    # GradingQueueItem — CREATE
    # -----------------------------------------------------------------------

    async def create_queue_item(
        self,
        *,
        response_id: uuid.UUID,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        question_id: uuid.UUID,
        student_id: uuid.UUID,
        grading_mode: str,
        priority: str = GradingQueuePriority.NORMAL,
    ) -> GradingQueueItem:
        item = GradingQueueItem(
            response_id=response_id,
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            question_id=question_id,
            student_id=student_id,
            grading_mode=grading_mode,
            status=GradingQueueStatus.PENDING,
            priority=priority,
            ai_pre_graded=False,
        )
        self.db.add(item)
        await self.db.flush()
        return item

    # -----------------------------------------------------------------------
    # GradingQueueItem — READS
    # -----------------------------------------------------------------------

    async def get_queue_item_by_id(self, item_id: uuid.UUID) -> GradingQueueItem | None:
        result = await self.db.execute(
            select(GradingQueueItem).where(GradingQueueItem.id == item_id)
        )
        return result.scalar_one_or_none()

    async def get_active_queue_item_for_response(
        self, response_id: uuid.UUID
    ) -> GradingQueueItem | None:
        result = await self.db.execute(
            select(GradingQueueItem).where(
                GradingQueueItem.response_id == response_id,
                GradingQueueItem.status.in_([
                    GradingQueueStatus.PENDING,
                    GradingQueueStatus.ASSIGNED,
                    GradingQueueStatus.IN_PROGRESS,
                ]),
            ).order_by(GradingQueueItem.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def list_queue(
        self,
        assessment_id: uuid.UUID | None = None,
        status: str | None = None,
        assigned_to_id: uuid.UUID | None = None,
        priority: str | None = None,
        page: int = 1,
        page_size: int = 30,
    ) -> tuple[list[GradingQueueItem], int]:
        filters = []
        if assessment_id:
            filters.append(GradingQueueItem.assessment_id == assessment_id)
        if status:
            filters.append(GradingQueueItem.status == status)
        if assigned_to_id:
            filters.append(GradingQueueItem.assigned_to_id == assigned_to_id)
        if priority:
            filters.append(GradingQueueItem.priority == priority)

        count_result = await self.db.execute(
            select(func.count(GradingQueueItem.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(GradingQueueItem)
            .where(*filters)
            .order_by(GradingQueueItem.created_at.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    # -----------------------------------------------------------------------
    # GradingQueueItem — UPDATES
    # -----------------------------------------------------------------------

    async def update_queue_item(self, item_id: uuid.UUID, **fields) -> None:
        await self.db.execute(
            update(GradingQueueItem)
            .where(GradingQueueItem.id == item_id)
            .values(**fields)
        )

    async def assign_queue_item(
        self,
        item_id: uuid.UUID,
        assigned_to_id: uuid.UUID,
        priority: str | None = None,
    ) -> None:
        values: dict = {
            "assigned_to_id": assigned_to_id,
            "assigned_at": _utcnow(),
            "status": GradingQueueStatus.ASSIGNED,
        }
        if priority:
            values["priority"] = priority
        await self.db.execute(
            update(GradingQueueItem)
            .where(GradingQueueItem.id == item_id)
            .values(**values)
        )

    async def complete_queue_item(self, item_id: uuid.UUID) -> None:
        await self.db.execute(
            update(GradingQueueItem)
            .where(GradingQueueItem.id == item_id)
            .values(status=GradingQueueStatus.COMPLETED, completed_at=_utcnow())
        )

    async def mark_ai_pre_graded(self, item_id: uuid.UUID) -> None:
        await self.db.execute(
            update(GradingQueueItem)
            .where(GradingQueueItem.id == item_id)
            .values(ai_pre_graded=True)
        )
