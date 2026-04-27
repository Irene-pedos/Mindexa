"""
app/db/repositories/integrity_repo.py

Data access for IntegrityEvent, IntegrityFlag, IntegrityWarning, SupervisionSession.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import IntegrityFlagStatus, SupervisionSessionStatus
from app.db.models.integrity import (
    IntegrityEvent,
    IntegrityFlag,
    IntegrityWarning,
    SupervisionSession,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class IntegrityRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # IntegrityEvent — append-only
    # -----------------------------------------------------------------------

    async def record_event(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        event_type: str,
        metadata_json: dict | None = None,
    ) -> IntegrityEvent:
        event = IntegrityEvent(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            event_type=event_type,
            metadata_json=metadata_json,
        )
        self.db.add(event)
        await self.db.flush()
        return event

    async def list_events_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[IntegrityEvent]:
        result = await self.db.execute(
            select(IntegrityEvent)
            .where(IntegrityEvent.attempt_id == attempt_id)
            .order_by(IntegrityEvent.created_at.asc())
        )
        return list(result.scalars().all())

    async def count_events_by_type(
        self, attempt_id: uuid.UUID
    ) -> dict[str, int]:
        """Return {event_type: count} dict for an attempt. Used in risk evaluation."""
        result = await self.db.execute(
            select(IntegrityEvent.event_type, func.count(IntegrityEvent.id))
            .where(IntegrityEvent.attempt_id == attempt_id)
            .group_by(IntegrityEvent.event_type)
        )
        return {row[0]: row[1] for row in result.all()}

    async def count_event_type(
        self, attempt_id: uuid.UUID, event_type: str
    ) -> int:
        result = await self.db.execute(
            select(func.count(IntegrityEvent.id)).where(
                IntegrityEvent.attempt_id == attempt_id,
                IntegrityEvent.event_type == event_type,
            )
        )
        return result.scalar_one()

    async def list_events_for_assessment(
        self, assessment_id: uuid.UUID, page: int = 1, page_size: int = 100
    ) -> tuple[list[IntegrityEvent], int]:
        """Supervisor live feed — all events across all attempts for an assessment."""
        count_result = await self.db.execute(
            select(func.count(IntegrityEvent.id)).where(
                IntegrityEvent.assessment_id == assessment_id
            )
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(IntegrityEvent)
            .where(IntegrityEvent.assessment_id == assessment_id)
            .order_by(IntegrityEvent.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    # -----------------------------------------------------------------------
    # IntegrityFlag — CRUD
    # -----------------------------------------------------------------------

    async def create_flag(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        raised_by: str,
        description: str,
        risk_level: str,
        raised_by_id: uuid.UUID | None = None,
        evidence_event_ids: list | None = None,
    ) -> IntegrityFlag:
        flag = IntegrityFlag(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            raised_by=raised_by,
            raised_by_id=raised_by_id,
            description=description,
            risk_level=risk_level,
            status=IntegrityFlagStatus.OPEN,
            evidence_event_ids=evidence_event_ids,
        )
        self.db.add(flag)
        await self.db.flush()
        return flag

    async def get_flag_by_id(self, flag_id: uuid.UUID) -> IntegrityFlag | None:
        result = await self.db.execute(
            select(IntegrityFlag).where(
                IntegrityFlag.id == flag_id,
                IntegrityFlag.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_flags_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[IntegrityFlag]:
        result = await self.db.execute(
            select(IntegrityFlag)
            .where(
                IntegrityFlag.attempt_id == attempt_id,
                IntegrityFlag.is_deleted == False,  # noqa: E712
            )
            .order_by(IntegrityFlag.created_at.asc())
        )
        return list(result.scalars().all())

    async def list_open_flags_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[IntegrityFlag]:
        result = await self.db.execute(
            select(IntegrityFlag).where(
                IntegrityFlag.attempt_id == attempt_id,
                IntegrityFlag.status == IntegrityFlagStatus.OPEN,
                IntegrityFlag.is_deleted == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def has_confirmed_flag(self, attempt_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(IntegrityFlag.id).where(
                IntegrityFlag.attempt_id == attempt_id,
                IntegrityFlag.status == IntegrityFlagStatus.CONFIRMED,
                IntegrityFlag.is_deleted == False,  # noqa: E712
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def resolve_flag(
        self,
        flag_id: uuid.UUID,
        status: str,
        resolved_by_id: uuid.UUID,
        resolution_notes: str,
    ) -> None:
        await self.db.execute(
            update(IntegrityFlag)
            .where(IntegrityFlag.id == flag_id)
            .values(
                status=status,
                resolved_by_id=resolved_by_id,
                resolved_at=_utcnow(),
                resolution_notes=resolution_notes,
            )
        )

    async def list_flags_for_assessment(
        self,
        assessment_id: uuid.UUID,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[IntegrityFlag], int]:
        filters = [
            IntegrityFlag.assessment_id == assessment_id,
            IntegrityFlag.is_deleted == False,  # noqa: E712
        ]
        if status:
            filters.append(IntegrityFlag.status == status)

        count_result = await self.db.execute(
            select(func.count(IntegrityFlag.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(IntegrityFlag)
            .where(*filters)
            .order_by(IntegrityFlag.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    # -----------------------------------------------------------------------
    # IntegrityWarning — CRUD
    # -----------------------------------------------------------------------

    async def create_warning(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        warning_level: str,
        message: str,
        issued_by_id: uuid.UUID | None = None,
        trigger_event_id: uuid.UUID | None = None,
        raised_flag_id: uuid.UUID | None = None,
    ) -> IntegrityWarning:
        warning = IntegrityWarning(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            warning_level=warning_level,
            message=message,
            issued_by_id=issued_by_id,
            issued_at=_utcnow(),
            trigger_event_id=trigger_event_id,
            raised_flag_id=raised_flag_id,
        )
        self.db.add(warning)
        await self.db.flush()
        return warning

    async def get_warning_by_id(
        self, warning_id: uuid.UUID
    ) -> IntegrityWarning | None:
        result = await self.db.execute(
            select(IntegrityWarning).where(
                IntegrityWarning.id == warning_id,
                IntegrityWarning.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def acknowledge_warning(self, warning_id: uuid.UUID) -> None:
        await self.db.execute(
            update(IntegrityWarning)
            .where(IntegrityWarning.id == warning_id)
            .values(acknowledged_at=_utcnow())
        )

    async def count_warnings_for_attempt(self, attempt_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(IntegrityWarning.id)).where(
                IntegrityWarning.attempt_id == attempt_id,
                IntegrityWarning.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one()

    async def list_warnings_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[IntegrityWarning]:
        result = await self.db.execute(
            select(IntegrityWarning)
            .where(
                IntegrityWarning.attempt_id == attempt_id,
                IntegrityWarning.is_deleted == False,  # noqa: E712
            )
            .order_by(IntegrityWarning.issued_at.asc())
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # SupervisionSession — CRUD
    # -----------------------------------------------------------------------

    async def create_session(
        self,
        *,
        assessment_id: uuid.UUID,
        supervisor_id: uuid.UUID,
    ) -> SupervisionSession:
        session = SupervisionSession(
            assessment_id=assessment_id,
            supervisor_id=supervisor_id,
            status=SupervisionSessionStatus.ACTIVE,
            started_at=_utcnow(),
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def end_session(self, session_id: uuid.UUID) -> None:
        await self.db.execute(
            update(SupervisionSession)
            .where(SupervisionSession.id == session_id)
            .values(status=SupervisionSessionStatus.ENDED, ended_at=_utcnow())
        )

    async def get_active_session(
        self, assessment_id: uuid.UUID, supervisor_id: uuid.UUID
    ) -> SupervisionSession | None:
        result = await self.db.execute(
            select(SupervisionSession).where(
                SupervisionSession.assessment_id == assessment_id,
                SupervisionSession.supervisor_id == supervisor_id,
                SupervisionSession.status == SupervisionSessionStatus.ACTIVE,
                SupervisionSession.is_deleted == False,  # noqa: E712
            ).limit(1)
        )
        return result.scalar_one_or_none()

    async def list_sessions_for_assessment(
        self, assessment_id: uuid.UUID
    ) -> list[SupervisionSession]:
        result = await self.db.execute(
            select(SupervisionSession).where(
                SupervisionSession.assessment_id == assessment_id,
                SupervisionSession.is_deleted == False,  # noqa: E712
            ).order_by(SupervisionSession.started_at.desc())
        )
        return list(result.scalars().all())
