"""
app/db/repositories/attempt_repo.py

Data access for AssessmentAttempt.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.enums import AttemptStatus, GradingMode
from app.db.models.attempt import AssessmentAttempt


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AttemptRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # CREATE
    # -----------------------------------------------------------------------

    async def create(
        self,
        *,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        attempt_number: int,
        grading_mode: GradingMode,
        expires_at: datetime,
        access_token: uuid.UUID,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AssessmentAttempt:
        attempt = AssessmentAttempt(
            assessment_id=assessment_id,
            student_id=student_id,
            attempt_number=attempt_number,
            grading_mode=grading_mode,
            status=AttemptStatus.IN_PROGRESS,
            started_at=_utcnow(),
            expires_at=expires_at,
            last_activity_at=_utcnow(),
            access_token=access_token,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(attempt)
        await self.db.flush()
        return attempt

    # -----------------------------------------------------------------------
    # READS
    # -----------------------------------------------------------------------

    async def get_by_id(self, attempt_id: uuid.UUID) -> Optional[AssessmentAttempt]:
        result = await self.db.execute(
            select(AssessmentAttempt)
            .options(
                selectinload(AssessmentAttempt.responses),
                selectinload(AssessmentAttempt.integrity_flags),
                selectinload(AssessmentAttempt.integrity_warnings),
            )
            .where(
                AssessmentAttempt.id == attempt_id,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id_simple(self, attempt_id: uuid.UUID) -> Optional[AssessmentAttempt]:
        result = await self.db.execute(
            select(AssessmentAttempt).where(
                AssessmentAttempt.id == attempt_id,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_active_attempt(
        self, student_id: uuid.UUID, assessment_id: uuid.UUID
    ) -> Optional[AssessmentAttempt]:
        """Return the single IN_PROGRESS or PAUSED attempt for a student on an assessment."""
        result = await self.db.execute(
            select(AssessmentAttempt).where(
                AssessmentAttempt.student_id == student_id,
                AssessmentAttempt.assessment_id == assessment_id,
                AssessmentAttempt.status.in_([
                    AttemptStatus.IN_PROGRESS,
                    AttemptStatus.PAUSED,
                ]),
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_access_token(
        self, attempt_id: uuid.UUID, access_token: uuid.UUID
    ) -> Optional[AssessmentAttempt]:
        """Validate the access_token for a specific attempt."""
        result = await self.db.execute(
            select(AssessmentAttempt).where(
                AssessmentAttempt.id == attempt_id,
                AssessmentAttempt.access_token == access_token,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def count_attempts_by_student(
        self, student_id: uuid.UUID, assessment_id: uuid.UUID
    ) -> int:
        """Count all non-deleted attempts for a student on an assessment."""
        result = await self.db.execute(
            select(func.count(AssessmentAttempt.id)).where(
                AssessmentAttempt.student_id == student_id,
                AssessmentAttempt.assessment_id == assessment_id,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one()

    async def list_by_student(
        self,
        student_id: uuid.UUID,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[AssessmentAttempt], int]:
        filters = [
            AssessmentAttempt.student_id == student_id,
            AssessmentAttempt.is_deleted.is_(False),
        ]
        if status:
            filters.append(AssessmentAttempt.status == status)

        count_result = await self.db.execute(
            select(func.count(AssessmentAttempt.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(AssessmentAttempt)
            .where(*filters)
            .order_by(AssessmentAttempt.started_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def list_by_assessment(
        self,
        assessment_id: uuid.UUID,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[AssessmentAttempt], int]:
        """Supervisor view: all attempts on an assessment."""
        filters = [
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.is_deleted.is_(False),
        ]
        if status:
            filters.append(AssessmentAttempt.status == status)

        count_result = await self.db.execute(
            select(func.count(AssessmentAttempt.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(AssessmentAttempt)
            .where(*filters)
            .order_by(AssessmentAttempt.started_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def list_expired_in_progress(self) -> List[AssessmentAttempt]:
        """Return all IN_PROGRESS attempts where expires_at < now. Used by auto-submit task."""
        now = _utcnow()
        result = await self.db.execute(
            select(AssessmentAttempt).where(
                AssessmentAttempt.status == AttemptStatus.IN_PROGRESS,
                AssessmentAttempt.expires_at < now,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # UPDATES
    # -----------------------------------------------------------------------

    async def update_fields(self, attempt_id: uuid.UUID, **fields) -> None:
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(**fields)
        )

    async def touch_activity(self, attempt_id: uuid.UUID) -> None:
        """Stamp last_activity_at=now. Called on every answer save."""
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(last_activity_at=_utcnow())
        )

    async def set_status(self, attempt_id: uuid.UUID, status: AttemptStatus) -> None:
        values: dict = {"status": status}
        if status in (AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED):
            values["submitted_at"] = _utcnow()
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(**values)
        )

    async def set_total_score(self, attempt_id: uuid.UUID, score: float) -> None:
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(total_score=score)
        )

    async def increment_warning_count(self, attempt_id: uuid.UUID) -> None:
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(
                total_integrity_warnings=AssessmentAttempt.total_integrity_warnings + 1
            )
        )

    async def set_flagged(self, attempt_id: uuid.UUID, flagged: bool) -> None:
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(is_flagged=flagged)
        )
