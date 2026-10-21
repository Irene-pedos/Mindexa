"""
app/services/calendar_service.py

Phase 6C: Academic Calendar CRUD and unified calendar view.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.db.enums import CalendarEventType, UserRole
from app.db.models.auth import User
from app.db.models.calendar import AcademicCalendarEvent
from app.db.repositories.calendar_repo import CalendarRepository

log = structlog.get_logger(__name__)


class CalendarService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = CalendarRepository(db)

    async def create_event(
        self,
        creator: User,
        institution_id: uuid.UUID,
        academic_period_id: uuid.UUID,
        event_type: CalendarEventType,
        title: str,
        starts_at: datetime,
        ends_at: datetime,
        department_id: Optional[uuid.UUID] = None,
    ) -> AcademicCalendarEvent:
        if ends_at <= starts_at:
            raise ValidationError(
                message="ends_at must be after starts_at.",
                field="ends_at",
            )
        event = await self.repo.create_event(
            institution_id=institution_id,
            academic_period_id=academic_period_id,
            event_type=event_type,
            title=title,
            starts_at=starts_at,
            ends_at=ends_at,
            created_by_id=creator.id,
            department_id=department_id,
        )
        log.info(
            "[AUDIT] calendar_event.created",
            event_id=str(event.id),
            event_type=event_type.value,
            created_by=str(creator.id),
        )
        return event

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
        return await self.repo.list_events(
            institution_id=institution_id,
            from_dt=from_dt,
            to_dt=to_dt,
            academic_period_id=academic_period_id,
            department_id=department_id,
            event_type=event_type,
            limit=limit,
            offset=offset,
        )

    async def delete_event(
        self, event_id: uuid.UUID, requester: User
    ) -> AcademicCalendarEvent:
        event = await self.repo.get_event(event_id)
        if not event:
            raise NotFoundError(resource="AcademicCalendarEvent", resource_id=str(event_id))
        event = await self.repo.delete_event(event)
        log.info("[AUDIT] calendar_event.deleted", event_id=str(event_id), deleted_by=str(requester.id))
        return event

    async def get_unified_calendar(
        self,
        user: User,
        from_dt: Optional[datetime],
        to_dt: Optional[datetime],
        institution_id: Optional[uuid.UUID] = None,
    ) -> List[Dict[str, Any]]:
        """
        Merge calendar events + assessment windows into a unified list.
        Role-scoped: students see only their enrolled courses; staff see all.
        """
        items: List[Dict[str, Any]] = []

        if institution_id:
            events = await self.repo.list_events(
                institution_id=institution_id,
                from_dt=from_dt,
                to_dt=to_dt,
                limit=500,
            )
            for ev in events:
                items.append({
                    "source": "calendar_event",
                    "id": str(ev.id),
                    "title": ev.title,
                    "starts_at": ev.starts_at.isoformat(),
                    "ends_at": ev.ends_at.isoformat(),
                    "event_type": ev.event_type.value,
                    "metadata": {
                        "department_id": str(ev.department_id) if ev.department_id else None,
                        "academic_period_id": str(ev.academic_period_id),
                    },
                })

        # Assessment windows for the user's enrolled/teaching courses
        from app.db.models.assessment import Assessment

        if user.role == UserRole.STUDENT:
            from app.db.models.academic import StudentEnrollment

            enrolled_res = await self.db.execute(
                select(StudentEnrollment.course_id).where(
                    StudentEnrollment.student_id == user.id,
                    StudentEnrollment.is_deleted == False,  # noqa: E712
                )
            )
            course_ids = list(enrolled_res.scalars().all())
        else:
            from app.db.models.academic import TeachingAssignment

            teaching_res = await self.db.execute(
                select(TeachingAssignment.course_id).where(
                    TeachingAssignment.lecturer_id == user.id,
                    TeachingAssignment.course_id.isnot(None),
                    TeachingAssignment.is_deleted == False,  # noqa: E712
                )
            )
            course_ids = list(teaching_res.scalars().all())

        if course_ids:
            stmt = select(Assessment).where(
                Assessment.course_id.in_(course_ids),
                Assessment.is_deleted == False,  # noqa: E712
            )
            if from_dt:
                stmt = stmt.where(Assessment.available_until >= from_dt)
            if to_dt:
                stmt = stmt.where(Assessment.available_from <= to_dt)

            assessments_res = await self.db.execute(stmt)
            for a in assessments_res.scalars().all():
                items.append({
                    "source": "assessment",
                    "id": str(a.id),
                    "title": a.title,
                    "starts_at": a.available_from.isoformat() if getattr(a, "available_from", None) else None,
                    "ends_at": a.available_until.isoformat() if getattr(a, "available_until", None) else None,
                    "event_type": getattr(a, "assessment_type", "ASSESSMENT"),
                    "metadata": {"course_id": str(a.course_id)},
                })

        return sorted(items, key=lambda x: x.get("starts_at") or "")
