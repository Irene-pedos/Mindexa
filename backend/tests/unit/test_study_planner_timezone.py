from datetime import UTC, datetime, timedelta

import pytest
from app.core.config import settings
from app.services.study_planner_service import _wall_clock_utc


def test_local_evening_session_is_stored_two_hours_earlier_in_utc(monkeypatch):
    monkeypatch.setattr(settings, "STUDY_PLANNER_UTC_OFFSET_MINUTES", 120)

    start = _wall_clock_utc(datetime(2027, 3, 1, tzinfo=UTC), 19, 0)

    assert start == datetime(2027, 3, 1, 17, 0, tzinfo=UTC)  # 19:00 Kigali


def test_early_morning_local_time_lands_on_the_previous_utc_date(monkeypatch):
    monkeypatch.setattr(settings, "STUDY_PLANNER_UTC_OFFSET_MINUTES", 120)

    start = _wall_clock_utc(datetime(2027, 3, 1), 1, 30)

    assert start == datetime(2027, 2, 28, 23, 30, tzinfo=UTC)


def test_zero_offset_keeps_the_old_utc_behaviour(monkeypatch):
    monkeypatch.setattr(settings, "STUDY_PLANNER_UTC_OFFSET_MINUTES", 0)

    assert _wall_clock_utc(datetime(2027, 3, 1, tzinfo=UTC), 19, 0) == datetime(2027, 3, 1, 19, 0, tzinfo=UTC)


@pytest.mark.parametrize("offset", [120, -300, 0])
def test_result_is_always_timezone_aware_utc(monkeypatch, offset):
    monkeypatch.setattr(settings, "STUDY_PLANNER_UTC_OFFSET_MINUTES", offset)

    result = _wall_clock_utc(datetime(2027, 3, 1, 8, 15, tzinfo=UTC), 7, 45)

    assert result.tzinfo is not None and result.utcoffset() == timedelta(0)
