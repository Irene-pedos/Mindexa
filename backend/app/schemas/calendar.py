"""
app/schemas/calendar.py

Pydantic schemas for Phase 6C: Academic Calendar Events.
Strictly Pydantic V2 BaseModel with ConfigDict.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.db.enums import CalendarEventType


# ── Create / Request ──────────────────────────────────────────────────────────


class CalendarEventCreate(BaseModel):
    institution_id: uuid.UUID
    academic_period_id: uuid.UUID
    department_id: Optional[uuid.UUID] = None
    event_type: CalendarEventType
    title: str = Field(..., min_length=1, max_length=255)
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def ends_after_starts(self) -> "CalendarEventCreate":
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be strictly after starts_at")
        return self


# ── Response ──────────────────────────────────────────────────────────────────


class CalendarEventResponse(BaseModel):
    id: uuid.UUID
    institution_id: uuid.UUID
    academic_period_id: uuid.UUID
    department_id: Optional[uuid.UUID]
    event_type: CalendarEventType
    title: str
    starts_at: datetime
    ends_at: datetime
    created_by_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CalendarEventListResponse(BaseModel):
    items: List[CalendarEventResponse]
    total: int


# ── Unified Calendar (GET /me/calendar) ───────────────────────────────────────


class UnifiedCalendarItem(BaseModel):
    """
    Normalised view of any schedulable entity returned by the unified calendar endpoint.
    source values: "calendar_event" | "assessment" | "reassessment" | "study_session"
    """

    source: str
    id: uuid.UUID
    title: str
    starts_at: datetime
    ends_at: Optional[datetime] = None
    event_type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
