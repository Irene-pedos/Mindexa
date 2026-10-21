"""
app/db/repositories/calendar_repo.py

Repository for Phase 6C: Academic Calendar Events.
Strictly follows the repository pattern: executes database queries on AsyncSession.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Sequence

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.enums import CalendarEventType
from app.db.models.calendar import AcademicCalendarEvent


class CalendarRepository:
    """Data access repository for academic calendar events."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Create ────────────────────────────────────────────────────────────────

    async def create_event(
        self,
        institution_id: uuid.UUID,
        academic_period_id: uuid.UUID,
        event_type: CalendarEventType,
        title: str,
        starts_at: datetime,
        ends_at: datetime,
        created_by_id: uuid.UUID,
        department_id: Optional[uuid.UUID] = None,
    ) -> AcademicCalendarEvent:
        """Create and persist a new academic calendar event."""
        event = AcademicCalendarEvent(
            institution_id=institution_id,
            academic_period_id=academic_period_id,
            event_type=event_type,
            title=title,
            starts_at=starts_at,
            ends_at=ends_at,
            created_by_id=created_by_id,
            department_id=department_id,
        )
        self.db.add(event)
        await self.db.flush()
        await self.db.refresh(event)
        return event

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get_event(self, event_id: uuid.UUID) -> Optional[AcademicCalendarEvent]:
        """Fetch a single calendar event by primary key (excluding soft-deleted rows)."""
        stmt = select(AcademicCalendarEvent).where(
            AcademicCalendarEvent.id == event_id,
            AcademicCalendarEvent.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def list_events(
        self,
        institution_id: uuid.UUID,
        from_dt: Optional[datetime] = None,
        to_dt: Optional[datetime] = None,
        academic_period_id: Optional[uuid.UUID] = None,
        department_id: Optional[uuid.UUID] = None,
        event_type: Optional[CalendarEventType] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Sequence[AcademicCalendarEvent]:
        """
        List calendar events for an institution, with optional filters for date range,
        academic period, department, and event type.
        """
        stmt = (
            select(AcademicCalendarEvent)
            .where(
                AcademicCalendarEvent.institution_id == institution_id,
                AcademicCalendarEvent.is_deleted == False,
            )
            .order_by(AcademicCalendarEvent.starts_at.asc())
            .limit(limit)
            .offset(offset)
        )
        if from_dt is not None:
            stmt = stmt.where(AcademicCalendarEvent.starts_at >= from_dt)
        if to_dt is not None:
            stmt = stmt.where(AcademicCalendarEvent.ends_at <= to_dt)
        if academic_period_id is not None:
            stmt = stmt.where(AcademicCalendarEvent.academic_period_id == academic_period_id)
        if department_id is not None:
            stmt = stmt.where(AcademicCalendarEvent.department_id == department_id)
        if event_type is not None:
            stmt = stmt.where(AcademicCalendarEvent.event_type == event_type)

        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def list_upcoming_deadline_events(
        self, institution_id: uuid.UUID, after: datetime
    ) -> Sequence[AcademicCalendarEvent]:
        """
        Return MARKS_DEADLINE events that have not yet ended (ends_at > after).
        Used by the grading-reminder Celery task.
        """
        stmt = (
            select(AcademicCalendarEvent)
            .where(
                AcademicCalendarEvent.institution_id == institution_id,
                AcademicCalendarEvent.event_type == CalendarEventType.MARKS_DEADLINE,
                AcademicCalendarEvent.ends_at > after,
                AcademicCalendarEvent.is_deleted == False,
            )
            .order_by(AcademicCalendarEvent.ends_at.asc())
        )
        res = await self.db.execute(stmt)
        return res.scalars().all()

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete_event(self, event: AcademicCalendarEvent) -> AcademicCalendarEvent:
        """Soft-delete a calendar event."""
        event.is_deleted = True
        event.deleted_at = utcnow()
        event.updated_at = utcnow()
        await self.db.flush()
        await self.db.refresh(event)
        return event
