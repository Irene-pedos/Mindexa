"""
app/services/academic_calendar_service.py

The dated items of an academic year (registration, holidays, special exams, results, appeals…),
managed in whole days by the admin, plus saving a reviewed calendar import in one step.

The table behind it (`academic_calendar_event`) stores timestamps, so a day is stored as the
institution's local midnight .. 23:59:59 and read back in the same timezone. A date typed in
Kigali therefore never slips to the day before or after.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.db.enums import AcademicPeriodType
from app.db.models.academic import AcademicPeriod, Institution
from app.db.models.auth import User
from app.db.models.calendar import AcademicCalendarEvent
from app.db.repositories.academic_structure_repo import AcademicStructureRepository
from app.db.schemas.academic import AcademicPeriodCreate
from app.schemas.academic_calendar import (
    CalendarApplyRequest,
    CalendarApplyResult,
    CalendarEventIn,
    CalendarEventItem,
    CalendarEventUpdate,
    normalize_audience,
)
from app.services.academic_period_service import AcademicPeriodService

logger = get_logger(__name__)


def _zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def day_bounds(tz_name: str | None, start: date, end: date | None) -> tuple[datetime, datetime]:
    """Local start of `start` and the last second of `end` (or of `start`), as UTC instants."""
    zone = _zone(tz_name)
    first = datetime.combine(start, time.min, zone).astimezone(UTC)
    last = datetime.combine(end or start, time(23, 59, 59), zone).astimezone(UTC)
    return first, last


def local_day(tz_name: str | None, moment: datetime) -> date:
    return moment.astimezone(_zone(tz_name)).date()


def to_item(event: AcademicCalendarEvent, tz_name: str | None) -> CalendarEventItem:
    return CalendarEventItem(
        id=event.id,
        period_id=event.academic_period_id,
        kind=getattr(event.event_type, "value", str(event.event_type)),
        title=event.title,
        start_date=local_day(tz_name, event.starts_at),
        end_date=local_day(tz_name, event.ends_at),
        audience=event.audience,
    )


class AcademicCalendarService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = AcademicStructureRepository(db)

    async def _period(self, period_id: uuid.UUID) -> tuple[AcademicPeriod, Institution]:
        period = await self.db.get(AcademicPeriod, period_id)
        if period is None or period.is_deleted:
            raise NotFoundError("Academic period not found.")
        institution = await self.db.get(Institution, period.institution_id)
        if institution is None or institution.is_deleted:
            raise NotFoundError("Institution not found.")
        return period, institution

    def _inside_period(self, period: AcademicPeriod, start: date, end: date | None) -> None:
        last = end or start
        if start < period.start_date or last > period.end_date:
            raise ValidationError(
                f"This date falls outside {period.name} "
                f"({period.start_date:%d %b %Y} to {period.end_date:%d %b %Y})."
            )

    async def list_events(self, period_id: uuid.UUID) -> list[CalendarEventItem]:
        period, institution = await self._period(period_id)
        events = await self.repo.list_period_events(period.id)
        return [to_item(e, institution.timezone) for e in events]

    async def create_event(
        self, user: User, period_id: uuid.UUID, body: CalendarEventIn
    ) -> CalendarEventItem:
        period, institution = await self._period(period_id)
        self._inside_period(period, body.start_date, body.end_date)
        starts, ends = day_bounds(institution.timezone, body.start_date, body.end_date)
        event = AcademicCalendarEvent(
            institution_id=institution.id,
            academic_period_id=period.id,
            event_type=body.kind,
            title=body.title.strip(),
            audience=body.audience,
            starts_at=starts,
            ends_at=ends,
            created_by_id=user.id,
        )
        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)
        logger.info("calendar_event_created", id=str(event.id), period_id=str(period.id))
        return to_item(event, institution.timezone)

    async def update_event(
        self, event_id: uuid.UUID, body: CalendarEventUpdate
    ) -> CalendarEventItem:
        event = await self.db.get(AcademicCalendarEvent, event_id)
        if event is None or event.is_deleted:
            raise NotFoundError("Calendar date not found.")
        period, institution = await self._period(event.academic_period_id)
        changes = body.model_dump(exclude_unset=True)

        start = changes.get("start_date") or local_day(institution.timezone, event.starts_at)
        if "end_date" in changes:
            end = changes["end_date"]
        else:
            end = local_day(institution.timezone, event.ends_at)
        if end is not None and end < start:
            raise ValidationError("The end date cannot be before the start date.")
        self._inside_period(period, start, end)

        event.starts_at, event.ends_at = day_bounds(institution.timezone, start, end)
        if changes.get("kind") is not None:
            event.event_type = changes["kind"]
        if changes.get("title"):
            event.title = changes["title"].strip()
        if "audience" in changes:
            event.audience = normalize_audience(changes["audience"])
        await self.db.commit()
        await self.db.refresh(event)
        return to_item(event, institution.timezone)

    async def delete_event(self, event_id: uuid.UUID) -> None:
        event = await self.db.get(AcademicCalendarEvent, event_id)
        if event is None or event.is_deleted:
            raise NotFoundError("Calendar date not found.")
        event.soft_delete()
        await self.db.commit()
        logger.info("calendar_event_deleted", id=str(event_id))

    # ── saving a reviewed import ──────────────────────────────────────────────

    async def apply_import(self, user: User, request: CalendarApplyRequest) -> CalendarApplyResult:
        """Create the year, its semesters and every dated item, or nothing at all."""
        draft = request.draft
        institution = await self.db.get(Institution, request.institution_id)
        if institution is None or institution.is_deleted:
            raise NotFoundError("Institution not found.")
        if draft.year_end <= draft.year_start:
            raise ValidationError("The academic year must end after it starts.")
        names = [s.name.strip().lower() for s in draft.semesters]
        if len(set(names)) != len(names):
            raise ValidationError("Two semesters have the same name.")
        for sem in draft.semesters:
            if sem.end_date <= sem.start_date:
                raise ValidationError(f"{sem.name} must end after it starts.")
        by_name = {s.name.strip().lower(): s for s in draft.semesters}
        for ev in draft.events:
            if ev.semester and ev.semester.strip().lower() not in by_name:
                raise ValidationError(
                    f"“{ev.title}” points at an unknown semester “{ev.semester}”."
                )

        # Everything below is flushed, not committed, until the very end: if any rule fails the
        # whole import is rolled back and no half-built year is left behind.
        periods = AcademicPeriodService(self.db)
        savepoint = await self.db.begin_nested()
        try:
            year = await periods.create(
                AcademicPeriodCreate(
                    institution_id=institution.id,
                    name=draft.year_name,
                    period_type=AcademicPeriodType.YEAR,
                    start_date=draft.year_start,
                    end_date=draft.year_end,
                ),
                commit=False,
            )
            semester_rows: dict[str, AcademicPeriod] = {}
            for sem in draft.semesters:
                semester_rows[sem.name.strip().lower()] = await periods.create(
                    AcademicPeriodCreate(
                        institution_id=institution.id,
                        name=sem.name,
                        period_type=sem.period_type,
                        start_date=sem.start_date,
                        end_date=sem.end_date,
                        parent_id=year.id,
                    ),
                    commit=False,
                )
        except Exception:
            await savepoint.rollback()
            raise
        await savepoint.commit()

        count = 0
        for ev in draft.events:
            target = semester_rows.get((ev.semester or "").strip().lower(), year)
            start, end = ev.start_date, ev.end_date
            # A date the document puts slightly outside its semester is kept on the year instead.
            if start < target.start_date or (end or start) > target.end_date:
                target = year
            if start < year.start_date or (end or start) > year.end_date:
                continue
            starts, ends = day_bounds(institution.timezone, start, end)
            self.db.add(
                AcademicCalendarEvent(
                    institution_id=institution.id,
                    academic_period_id=target.id,
                    event_type=ev.kind,
                    title=ev.title.strip()[:255],
                    audience=normalize_audience(ev.audience),
                    starts_at=starts,
                    ends_at=ends,
                    created_by_id=user.id,
                )
            )
            count += 1
        await self.db.commit()
        logger.info(
            "academic_calendar_imported",
            institution_id=str(institution.id),
            year_id=str(year.id),
            semesters=len(semester_rows),
            events=count,
        )
        return CalendarApplyResult(
            year_id=year.id,
            semester_ids=[p.id for p in semester_rows.values()],
            event_count=count,
        )
