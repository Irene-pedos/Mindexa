"""
app/db/models/integrity.py

Academic integrity monitoring models for Mindexa Platform.

Tables:
    integrity_event      — AppendOnlyModel. One row per client-side event
                           (tab switch, fullscreen exit, etc.). High-volume.
    integrity_flag       — BaseModel. A human or system-raised concern about
                           a specific attempt. Requires lecturer resolution.
    integrity_warning    — BaseModel. A warning issued to the student during
                           the attempt (up to 3 levels before auto-flag).
    supervision_session  — BaseModel. Tracks a lecturer's live supervision
                           window for a specific assessment.

Design decisions:
    INTEGRITY EVENT:
    - AppendOnlyModel — never updated or deleted. Immutable ledger.
    - High write volume: each tab switch, fullscreen exit, etc. is one row.
    - metadata_json stores event-specific context (e.g., duration of tab
      switch in ms, detected extension names, etc.)
    - Indexed on (attempt_id, event_type) for supervisor live feed queries.

    INTEGRITY FLAG:
    - Raised by system (threshold crossed) or supervisor (manual raise).
    - status lifecycle: OPEN -> UNDER_REVIEW -> CONFIRMED | DISMISSED | ESCALATED
    - CONFIRMED flags set attempt.is_flagged=True and block result release
      (result.integrity_hold=True).
    - resolved_by_id / resolved_at: set when status moves to a terminal state.

    INTEGRITY WARNING:
    - Issued to the student (shown as in-app overlay during the attempt).
    - warning_level controls severity:
        WARNING_1 — shown to student only (mild)
        WARNING_2 — shown to student + logged to supervisor feed
        WARNING_3 — shown to student + auto-raises an integrity_flag
    - Incrementing attempt.total_integrity_warnings cached counter.

    SUPERVISION SESSION:
    - One row per (assessment, supervisor) live session.
    - Tracks when the supervisor opened and closed the live monitoring panel.
    - Used to determine supervisor availability during disputes.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from app.db.base import AppendOnlyModel, BaseModel, utcnow
from app.db.enums import (IntegrityEventType, IntegrityFlagRaisedBy,
                          IntegrityFlagStatus, RiskLevel,
                          SupervisionSessionStatus, WarningLevel)
from app.db.mixins import composite_index
from sqlalchemy import Column, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

if TYPE_CHECKING:
    from app.db.models.assessment import Assessment
    from app.db.models.attempt import AssessmentAttempt


class IntegrityEvent(AppendOnlyModel, table=True):
    """
    One row per client-side integrity event. Immutable append-only ledger.

    High write volume — kept minimal. No soft delete, no updated_at.

    metadata_json stores event-specific context:
        FULLSCREEN_EXIT    -> {"duration_ms": 1200}
        TAB_SWITCH         -> {"tab_count": 3, "duration_ms": 800}
        COPY_ATTEMPT       -> {"content_length": 45}
        DEVTOOLS_DETECTED  -> {"trigger": "resize_heuristic"}
        SUSPICIOUS_INACTIVITY -> {"inactive_seconds": 240}
        RECONNECT          -> {"was_disconnected_seconds": 45}
    """

    __tablename__ = "integrity_event"

    __table_args__ = (
        composite_index("integrity_event", "attempt_id", "event_type"),
        composite_index("integrity_event", "attempt_id", "created_at"),
        composite_index("integrity_event", "assessment_id"),
    )

    attempt_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    # Denormalised for supervisor live-feed queries per assessment
    assessment_id: uuid.UUID = Field(nullable=False, index=True)
    student_id: uuid.UUID = Field(nullable=False, index=True)

    event_type: IntegrityEventType = Field(nullable=False, index=True)

    metadata_json: Optional[dict] = Field(
        default=None,
        sa_column=Column(
            JSONB,
            nullable=True,
            server_default=text("'{}'::jsonb"),
        ),
    )

    # -- Relationships --------------------------------------------------------
    attempt: Optional["AssessmentAttempt"] = Relationship(
        back_populates="integrity_events"
    )


class IntegrityFlag(BaseModel, table=True):
    """
    A concern raised about a specific attempt requiring lecturer resolution.

    Raised by:
        SYSTEM     — Automatic: event threshold crossed (e.g. 3+ tab switches)
        SUPERVISOR — Lecturer manually flagged via the live supervision panel
        ADMIN      — Admin investigation

    Status machine:
        OPEN -> UNDER_REVIEW -> CONFIRMED | DISMISSED | ESCALATED

    CONFIRMED:
        Sets attempt.is_flagged=True and result.integrity_hold=True.
        Blocks result release until resolved.

    DISMISSED:
        The concern was reviewed and found to be without merit.
        Attempt proceeds normally.

    ESCALATED:
        Referred to the academic office or disciplinary committee.
        Result remains on hold.
    """

    __tablename__ = "integrity_flag"

    __table_args__ = (
        composite_index("integrity_flag", "attempt_id", "status"),
        composite_index("integrity_flag", "assessment_id", "status"),
        composite_index("integrity_flag", "status"),
    )

    attempt_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    # Denormalised for supervisor dashboard queries
    assessment_id: uuid.UUID = Field(nullable=False, index=True)
    student_id: uuid.UUID = Field(nullable=False, index=True)

    # -- Flag content ---------------------------------------------------------

    status: IntegrityFlagStatus = Field(
        default=IntegrityFlagStatus.OPEN,
        nullable=False,
        index=True,
    )
    risk_level: RiskLevel = Field(
        default=RiskLevel.MEDIUM,
        nullable=False,
        index=True,
    )
    raised_by: IntegrityFlagRaisedBy = Field(
        nullable=False,
        description="Who raised this flag: system | supervisor | admin",
    )
    raised_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        description="UUID of supervisor/admin who raised flag. NULL for system flags.",
    )
    description: str = Field(
        nullable=False,
        description=(
            "Human-readable explanation of the concern. "
            "For system flags: auto-generated based on event counts. "
            "For supervisor flags: typed by the supervisor."
        ),
    )
    evidence_event_ids: Optional[list] = Field(
        default=None,
        sa_column=Column(
            JSONB,
            nullable=True,
            comment="Array of IntegrityEvent UUIDs that triggered/support this flag",
        ),
    )

    # -- Resolution -----------------------------------------------------------

    resolved_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        description="UUID of lecturer/admin who resolved this flag",
    )
    resolved_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
    )
    resolution_notes: Optional[str] = Field(
        default=None,
        nullable=True,
        description="Lecturer/admin notes on resolution decision",
    )

    # -- Relationships --------------------------------------------------------
    attempt: Optional["AssessmentAttempt"] = Relationship(
        back_populates="integrity_flags"
    )


class IntegrityWarning(BaseModel, table=True):
    """
    A formal warning issued to the student during an active attempt.

    WARNING LEVEL BEHAVIOUR:
        WARNING_1 — In-app overlay shown to student only. Logged here.
        WARNING_2 — In-app overlay + pushed to supervisor live feed.
        WARNING_3 — In-app overlay + auto-raises an IntegrityFlag (SYSTEM).

    acknowledged_at:
        Set when the student clicks "I Understand" on the warning overlay.
        NULL if the attempt timed out before acknowledgement.
    """

    __tablename__ = "integrity_warning"

    __table_args__ = (
        composite_index("integrity_warning", "attempt_id"),
        composite_index("integrity_warning", "attempt_id", "warning_level"),
    )

    attempt_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    assessment_id: uuid.UUID = Field(nullable=False, index=True)
    student_id: uuid.UUID = Field(nullable=False, index=True)

    warning_level: WarningLevel = Field(nullable=False, index=True)
    message: str = Field(
        nullable=False,
        description="Message shown to the student in the warning overlay",
    )
    issued_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        description="NULL for system-issued warnings. Set for supervisor-issued.",
    )
    issued_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
    )
    acknowledged_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
    )
    # Link to triggering event (for audit)
    trigger_event_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        description="IntegrityEvent.id that triggered this warning",
    )
    # Link to flag raised by WARNING_3
    raised_flag_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        description="IntegrityFlag.id auto-raised when warning_level=WARNING_3",
    )

    # -- Relationships --------------------------------------------------------
    attempt: Optional["AssessmentAttempt"] = Relationship(
        back_populates="integrity_warnings"
    )


class SupervisionSession(BaseModel, table=True):
    """
    Tracks when a lecturer is actively monitoring a live assessment.

    One row per (assessment, supervisor) monitoring session.
    A supervisor can have multiple sessions per assessment if they
    reconnect (each reconnect creates a new row).

    Used to determine:
    - Whether a supervisor was present during a specific integrity event.
    - For dispute resolution: "was the supervisor watching when this happened?"
    """

    __tablename__ = "supervision_session"

    __table_args__ = (
        composite_index("supervision_session", "assessment_id", "supervisor_id"),
        composite_index("supervision_session", "assessment_id", "status"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    supervisor_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )

    status: SupervisionSessionStatus = Field(
        default=SupervisionSessionStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    started_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
    )
    ended_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
    )

    # -- Relationships --------------------------------------------------------
    assessment: Optional["Assessment"] = Relationship(
        back_populates="supervision_sessions"
    )
    attempt: Optional["AssessmentAttempt"] = Relationship(
        back_populates="supervision_sessions"
    )
