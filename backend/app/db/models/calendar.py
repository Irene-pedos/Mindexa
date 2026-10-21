"""
app/db/models/calendar.py

Phase 6C: Academic Calendar Events data model.
Spec: MINDEXA_INSTITUTIONAL_WORKFLOWS_SPEC.md Section 12
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, Relationship

from app.db.base import BaseModel
from app.db.enums import CalendarEventType

if TYPE_CHECKING:
    from app.db.models.academic import AcademicPeriod, Department, Institution
    from app.db.models.auth import User


class AcademicCalendarEvent(BaseModel, table=True):
    """
    A key institutional date pinned to an academic period.
    Examples: marks submission deadline, deliberation day, appeal window open/close.
    Optionally scoped to a single department; if department_id is None the event
    applies institution-wide.
    """

    __tablename__ = "academic_calendar_event"
    __table_args__ = (
        Index(
            "ix_academic_calendar_event_inst_period_type",
            "institution_id",
            "academic_period_id",
            "event_type",
        ),
        Index("ix_academic_calendar_event_starts_at", "starts_at"),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    academic_period_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_period.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    department_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("department.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    event_type: CalendarEventType = Field(
        sa_column=Column(
            sa.Enum(CalendarEventType, name="calendareventtype", create_type=False),
            nullable=False,
        )
    )
    title: str = Field(sa_column=Column(Text, nullable=False))
    starts_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    ends_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    created_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=False,
        )
    )

    institution: Optional["Institution"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[AcademicCalendarEvent.institution_id]"}
    )
    academic_period: Optional["AcademicPeriod"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[AcademicCalendarEvent.academic_period_id]"}
    )
    department: Optional["Department"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[AcademicCalendarEvent.department_id]"}
    )
    created_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[AcademicCalendarEvent.created_by_id]"}
    )
