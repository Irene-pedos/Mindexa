"""
tests/unit/test_phase6c_calendar.py

Unit tests for Phase 6C calendar and grading reminder:
1. Calendar event creation validates ends_at > starts_at
2. CalendarEventCreate model validation
3. Grading reminder milestone key idempotency
4. UnifiedCalendarItem schema
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.db.enums import CalendarEventType
from app.schemas.calendar import CalendarEventCreate, UnifiedCalendarItem


def _utc(year, month, day, hour=0) -> datetime:
    return datetime(year, month, day, hour, tzinfo=timezone.utc)


# ── CalendarEventCreate Validation ────────────────────────────────────────────


def test_calendar_event_valid():
    event = CalendarEventCreate(
        institution_id=uuid.uuid4(),
        academic_period_id=uuid.uuid4(),
        event_type=CalendarEventType.MARKS_DEADLINE,
        title="Marks Submission Deadline",
        starts_at=_utc(2026, 11, 1),
        ends_at=_utc(2026, 11, 8),
    )
    assert event.ends_at > event.starts_at


def test_calendar_event_ends_before_starts_rejected():
    with pytest.raises(Exception):
        CalendarEventCreate(
            institution_id=uuid.uuid4(),
            academic_period_id=uuid.uuid4(),
            event_type=CalendarEventType.MARKS_DEADLINE,
            title="Bad event",
            starts_at=_utc(2026, 11, 8),
            ends_at=_utc(2026, 11, 1),  # before starts_at
        )


def test_calendar_event_same_time_rejected():
    ts = _utc(2026, 11, 5)
    with pytest.raises(Exception):
        CalendarEventCreate(
            institution_id=uuid.uuid4(),
            academic_period_id=uuid.uuid4(),
            event_type=CalendarEventType.EXAM_PERIOD,
            title="Zero duration",
            starts_at=ts,
            ends_at=ts,
        )


def test_calendar_event_with_department():
    event = CalendarEventCreate(
        institution_id=uuid.uuid4(),
        academic_period_id=uuid.uuid4(),
        department_id=uuid.uuid4(),
        event_type=CalendarEventType.APPEAL_WINDOW,
        title="Appeal Window",
        starts_at=_utc(2026, 12, 1),
        ends_at=_utc(2026, 12, 15),
    )
    assert event.department_id is not None


# ── Grading Reminder Idempotency Keys ─────────────────────────────────────────


def test_milestone_key_format():
    from app.workers.tasks.grading_reminder import _milestone_key

    event_id = uuid.uuid4()
    key = _milestone_key(event_id, 7)
    assert str(event_id) in key
    assert "t_minus_7d" in key


def test_different_events_have_different_keys():
    from app.workers.tasks.grading_reminder import _milestone_key

    id1 = uuid.uuid4()
    id2 = uuid.uuid4()
    assert _milestone_key(id1, 3) != _milestone_key(id2, 3)


def test_different_milestones_have_different_keys():
    from app.workers.tasks.grading_reminder import _milestone_key

    event_id = uuid.uuid4()
    assert _milestone_key(event_id, 7) != _milestone_key(event_id, 3)
    assert _milestone_key(event_id, 3) != _milestone_key(event_id, 1)


def test_overdue_key_different_from_milestone():
    from app.workers.tasks.grading_reminder import _milestone_key, _overdue_key

    event_id = uuid.uuid4()
    assert _overdue_key(event_id) != _milestone_key(event_id, 1)


# ── UnifiedCalendarItem ───────────────────────────────────────────────────────


def test_unified_calendar_item_minimal():
    item = UnifiedCalendarItem(
        source="calendar_event",
        id=uuid.uuid4(),
        title="Appeal Window",
        starts_at=_utc(2026, 11, 1),
    )
    assert item.source == "calendar_event"
    assert item.ends_at is None
    assert item.event_type is None


def test_unified_calendar_item_full():
    item = UnifiedCalendarItem(
        source="assessment",
        id=uuid.uuid4(),
        title="Midterm CAT",
        starts_at=_utc(2026, 11, 10),
        ends_at=_utc(2026, 11, 11),
        event_type="CAT",
        metadata={"course_id": str(uuid.uuid4())},
    )
    assert item.metadata is not None
    assert "course_id" in item.metadata


# ── CalendarEventType Enum ────────────────────────────────────────────────────


def test_calendar_event_types_defined():
    expected = {
        "MARKS_DEADLINE", "DELIBERATION", "APPEAL_WINDOW",
        "REASSESSMENT_WINDOW", "EXAM_PERIOD", "OTHER",
    }
    actual = {e.value for e in CalendarEventType}
    assert expected == actual
