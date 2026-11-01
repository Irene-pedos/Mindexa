"""
app/schemas/academic_calendar.py

The dates of an academic year, in day terms (not timestamps): events attached to a period, and the
"draft" an AI reading of the registrar's calendar produces for an admin to review before anything
is saved.
"""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator

from app.db.enums import AcademicPeriodType, CalendarEventType
from app.db.schemas.base import MindexaSchema


def normalize_audience(value: str | None) -> str | None:
    """ "All" and blank both mean everyone, which is stored as no audience."""
    text = (value or "").strip()
    return None if text.lower() in {"", "all", "everyone", "none", "n/a"} else text[:120]


class CalendarEventIn(MindexaSchema):
    kind: CalendarEventType = CalendarEventType.OTHER
    title: str = Field(min_length=2, max_length=255)
    start_date: date
    end_date: date | None = None  # empty: a single day
    audience: str | None = Field(default=None, max_length=120)

    @field_validator("audience")
    @classmethod
    def _blank_audience(cls, value: str | None) -> str | None:
        return normalize_audience(value)

    @model_validator(mode="after")
    def _end_not_before_start(self) -> CalendarEventIn:
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("The end date cannot be before the start date.")
        return self


class CalendarEventUpdate(MindexaSchema):
    kind: CalendarEventType | None = None
    title: str | None = Field(default=None, min_length=2, max_length=255)
    start_date: date | None = None
    end_date: date | None = None
    audience: str | None = Field(default=None, max_length=120)


class CalendarEventItem(BaseModel):
    id: uuid.UUID
    period_id: uuid.UUID
    kind: str
    title: str
    start_date: date
    end_date: date  # equals start_date for a single day
    audience: str | None = None


# ── AI import draft ───────────────────────────────────────────────────────────


class CalendarDraftSemester(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    period_type: AcademicPeriodType = AcademicPeriodType.SEMESTER
    start_date: date
    end_date: date


class CalendarDraftEvent(BaseModel):
    semester: str | None = None  # name of the semester it belongs to; empty: the whole year
    kind: CalendarEventType = CalendarEventType.OTHER
    title: str = Field(min_length=1, max_length=255)
    start_date: date
    end_date: date | None = None
    audience: str | None = None
    #: Why a person should look at this row again (set by the checks, never by the client).
    warning: str | None = None


class CalendarDraft(BaseModel):
    year_name: str = Field(min_length=1, max_length=255)
    year_start: date
    year_end: date
    semesters: list[CalendarDraftSemester] = Field(default_factory=list, max_length=6)
    events: list[CalendarDraftEvent] = Field(default_factory=list, max_length=200)
    warnings: list[str] = Field(default_factory=list)
    #: Which reader produced it ("gemini", "groq", "text"), for the review screen.
    source: str | None = None


class CalendarApplyRequest(MindexaSchema):
    institution_id: uuid.UUID
    draft: CalendarDraft


class CalendarApplyResult(BaseModel):
    year_id: uuid.UUID
    semester_ids: list[uuid.UUID]
    event_count: int
