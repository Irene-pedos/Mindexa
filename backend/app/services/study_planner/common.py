from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Optional

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)



def _wall_clock_utc(day: datetime, hour: int, minute: int) -> datetime:
    """UTC instant of local wall-clock ``hour:minute`` on ``day``'s calendar date.

    Students choose session times in their local zone (``STUDY_PLANNER_UTC_OFFSET_MINUTES``),
    but sessions are stored in UTC; treating "19:00" as UTC put every session 2 hours off.
    """
    offset = timedelta(minutes=settings.STUDY_PLANNER_UTC_OFFSET_MINUTES)
    local = day.replace(hour=hour, minute=minute, second=0, microsecond=0, tzinfo=None)
    return (local - offset).replace(tzinfo=UTC)


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _clamp_session_duration(preferred_time_start: Optional[str], preferred_time_end: Optional[str], session_duration_minutes: int) -> int:
    """Ensure session_duration_minutes does not exceed the window between preferred_time_start and preferred_time_end."""
    if preferred_time_start and preferred_time_end and ":" in preferred_time_start and ":" in preferred_time_end:
        try:
            start_parts = preferred_time_start.split(":")
            end_parts = preferred_time_end.split(":")
            start_mins = int(start_parts[0]) * 60 + int(start_parts[1])
            end_mins = int(end_parts[0]) * 60 + int(end_parts[1])
            if end_mins > start_mins:
                max_allowed = end_mins - start_mins
                return min(session_duration_minutes, max_allowed)
        except Exception:
            pass
    return session_duration_minutes
