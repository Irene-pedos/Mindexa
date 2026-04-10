"""
app/db/models/integrity.py

Integrity monitoring and live supervision models for Mindexa.

Tables defined here:
    integrity_event      — Raw browser/client signal recorded during an attempt
    integrity_warning    — Escalating formal warning issued to a student
    integrity_flag       — A high-severity composite incident raised for review
    supervision_session  — A lecturer's active live supervision context record

Architectural principles applied here:

    1. APPEND-ONLY for raw events.
       integrity_event uses AppendOnlyModel — no updated_at, no soft delete,
       no mutations ever. Once written, it is the permanent record. The integrity
       monitoring system writes to this table in a fire-and-forget pattern via
       WebSocket ingestion. It must never block the assessment attempt.

    2. SEPARATE raw events from formal warnings.
       integrity_event = every raw signal (tab switch, blur, fullscreen exit, etc.)
       integrity_warning = a formal escalating warning that appears in the student
                           UI and is logged to the lecturer's supervision panel.
       These are deliberately different tables. Raw events are machine-generated;
       warnings are human-visible escalations. A single warning may be triggered
       by multiple raw events (e.g. 3 tab switches → 1 warning).

    3. SEPARATE warnings from flags.
       integrity_flag = a composite incident raised when the risk score crosses
                        a threshold OR when a lecturer manually flags an attempt.
                        Flags require a human decision (dismiss or escalate).
                        Unresolved flags pause grade release.

    4. Supervision sessions are time-bounded.
       A supervision_session starts when a lecturer opens the live supervision
       panel and ends when they leave. Multiple lecturers can supervise the
       same assessment simultaneously (multi-supervisor support). Each has
       their own session row.

Import order safety:
    This file imports from:
        app.db.base    → AppendOnlyModel, BaseModel, utcnow
        app.db.enums   → IntegrityEventType, IntegrityRiskLevel,
                         IntegrityFlagRaisedBy, IntegrityFlagStatus,
                         WarningLevel, SecurityEventSeverity
        app.db.mixins  → composite_index, unique_composite_index

    This file references via TYPE_CHECKING only:
        app.db.models.attempt    → AssessmentAttempt
        app.db.models.assessment → Assessment

Cascade rules:
    integrity_event    → CASCADE from assessment_attempt
                         (events are owned by the attempt; if the attempt
                          is purged in test cleanup, events go with it)
                         Note: in production, attempts are never deleted.
                         This cascade is a test-safety measure only.
    integrity_warning  → CASCADE from assessment_attempt
    integrity_flag     → RESTRICT on assessment_attempt
                         (a flagged attempt must be manually resolved
                          before any attempt record can be deleted)
    supervision_session → RESTRICT on assessment
                          (cannot delete an assessment with active sessions)

Indexes strategy:
    The primary read pattern for all these tables is:
        "Give me all [events|warnings|flags] for attempt X, ordered by time."
    Secondary patterns:
        "Give me all high-risk attempts for assessment Y." (supervisor dashboard)
        "Give me all unresolved flags across my assessments." (lecturer queue)
    All indexes are built for these patterns explicitly.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from app.db.base import AppendOnlyModel, BaseModel, utcnow
from app.db.enums import (IntegrityEventType, IntegrityFlagRaisedBy,
                          IntegrityFlagStatus, IntegrityRiskLevel,
                          WarningLevel)
from app.db.mixins import composite_index, unique_composite_index
from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, Relationship

if TYPE_CHECKING:
    from app.db.models.assessment import Assessment
    from app.db.models.attempt import AssessmentAttempt


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRITY EVENT
# ─────────────────────────────────────────────────────────────────────────────

class IntegrityEvent(AppendOnlyModel, table=True):
    """
    A raw browser or client signal recorded during an assessment attempt.

    This is the lowest-level integrity record. Every detectable client
    event during an active attempt is written here — no filtering,
    no deduplication, no threshold logic. The raw stream is the permanent
    audit trail.

    Inherits AppendOnlyModel:
        - has id (UUID PK) and created_at only
        - NO updated_at
        - NO is_deleted / soft delete
        - NO AuditMixin fields
        Once written, this row is immutable for the lifetime of the platform.

    event_type (IntegrityEventType enum):
        FULLSCREEN_EXIT        → Student exited fullscreen mode
        FULLSCREEN_BLOCKED     → System prevented fullscreen exit
        TAB_SWITCH             → Browser tab change detected
        WINDOW_BLUR            → Browser window lost focus
        WINDOW_FOCUS           → Browser window regained focus (paired with blur)
        PAGE_HIDDEN            → Page visibility API fired "hidden"
        PAGE_VISIBLE           → Page visibility API fired "visible" (resume)
        COPY_ATTEMPT           → Ctrl+C or right-click copy in closed-book mode
        PASTE_ATTEMPT          → Ctrl+V or right-click paste in closed-book mode
        RIGHT_CLICK            → Right-click context menu triggered
        KEYBOARD_SHORTCUT      → Suspicious keyboard shortcut (Ctrl+U, F12, etc.)
        DEVTOOLS_OPEN          → DevTools open signal detected
        SUSPICIOUS_INACTIVITY  → No interactions for threshold duration
        RECONNECT              → Student WebSocket reconnected after drop
        AUTO_SUBMIT_TRIGGERED  → Server triggered auto-submission (timer expired)
        MANUAL_SUBMIT          → Student voluntarily clicked Submit
        WARNING_ACKNOWLEDGED   → Student acknowledged an integrity warning popup

    occurred_at:
        Client-reported timestamp of when the event occurred on the browser.
        This may differ from created_at (server receipt time) due to network
        latency or clock skew. Both are recorded. Discrepancy > 30s is itself
        a signal worth noting in the integrity analysis.

    severity (IntegrityRiskLevel enum):
        LOW    → Informational; single occurrence is not suspicious.
                  Examples: window_blur (phone call), page_hidden (brief)
        MEDIUM → Noteworthy; repeated occurrences increase risk score.
                  Examples: tab_switch, reconnect
        HIGH   → Significant; directly raises risk score.
                  Examples: fullscreen_exit, copy_attempt, devtools_open

    risk_score_delta:
        The integer points added to the attempt's integrity_risk_score
        as a result of this event. Computed by the Integrity Analysis Agent
        and stored here for auditability. The agent may assign 0 to LOW events
        after context analysis (e.g. first window_blur after 89 minutes is
        low risk; fifth in 10 minutes is high risk).

    metadata_json:
        Supplementary structured data specific to the event type.
        Stored as text (JSON string) rather than JSONB because:
        1. This is an append-only table — we never query inside the JSON.
        2. Avoiding JSONB on a very high-volume append-only table reduces
           PostgreSQL toast overhead.
        3. The event stream is analysed by the AI agent which reads it as text.

        Examples by event_type:
            TAB_SWITCH:
                '{"switch_count_cumulative": 3, "away_duration_ms": 2100}'
            SUSPICIOUS_INACTIVITY:
                '{"inactive_seconds": 180, "last_action": "question_3"}'
            RECONNECT:
                '{"reconnect_count_cumulative": 2, "gap_seconds": 45}'

    question_id:
        The question the student was on when the event occurred.
        NULL for events not tied to a specific question (e.g. reconnect).
    """

    __tablename__ = "integrity_event"

    __table_args__ = (
        # Primary: all events for an attempt, time-ordered (most common query)
        composite_index("integrity_event", "attempt_id", "created_at"),
        # Secondary: filter by type within an attempt
        composite_index("integrity_event", "attempt_id", "event_type"),
        # Risk analysis: high-severity events across an assessment
        composite_index("integrity_event", "assessment_id", "severity"),
        # AI processing queue: unprocessed high-severity events
        composite_index(
            "integrity_event",
            "is_processed_by_ai", "severity",
        ),
    )

    # ── Core references ───────────────────────────────────────────────────────

    attempt_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    # Denormalised — avoids joining through attempt for supervisor queries
    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    # Plain UUID — student who owns this attempt; validated at service layer
    student_id: uuid.UUID = Field(nullable=False, index=True)

    # ── Event identity ────────────────────────────────────────────────────────

    event_type: IntegrityEventType = Field(nullable=False, index=True)
    occurred_at: datetime = Field(
        nullable=False,
        index=True,
        # Client-side timestamp — may differ from created_at (server receipt)
    )
    severity: IntegrityRiskLevel = Field(nullable=False, index=True)
    risk_score_delta: int = Field(
        default=0,
        nullable=False,
        # Points added to attempt.integrity_risk_score.
        # Set by the Integrity Analysis Agent after context evaluation.
        # 0 = no impact (event was contextually low-risk after analysis).
    )

    # ── Context ───────────────────────────────────────────────────────────────

    question_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        # Plain UUID — question the student was answering at the time.
        # Not a declared FK to keep this append-only table lightweight.
    )
    metadata_json: Optional[str] = Field(
        default=None,
        nullable=True,
        # JSON string (not JSONB) — see docstring rationale above.
    )

    # ── AI processing state ───────────────────────────────────────────────────

    is_processed_by_ai: bool = Field(
        default=False,
        nullable=False,
        index=True,
        # Set to True after the Integrity Analysis Agent processes this event.
        # The agent batches unprocessed events periodically (Celery task).
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    attempt: Optional["AssessmentAttempt"] = Relationship(
        back_populates="integrity_events"
    )


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRITY WARNING
# ─────────────────────────────────────────────────────────────────────────────

class IntegrityWarning(BaseModel, table=True):
    """
    A formal escalating warning issued to a student during an attempt.

    Warnings are distinct from raw events. A warning is what the student
    sees in the assessment UI (a modal popup) and what appears in the
    lecturer's live supervision panel as an action item.

    The escalating warning model has three levels (WarningLevel int enum):
        LEVEL_1 (1) → Mild caution. Student is notified.
                       "We noticed you left fullscreen. Please return."
        LEVEL_2 (2) → Stronger caution. Student is notified with stronger language.
                       "Second violation logged. Further violations may result
                       in your attempt being flagged for review."
        LEVEL_3 (3) → Attempt flagged. Student is notified.
                       "Your attempt has been flagged for lecturer review.
                       Continue your attempt; your responses are being saved."
                       At this level, integrity_flag is automatically created.

    warning_number:
        The ordinal warning for this specific attempt (1, 2, 3…).
        Distinct from warning_level — a student may receive two level-1
        warnings for different event types before reaching level-2.

    triggered_by_event_id:
        The primary IntegrityEvent that caused this warning to be issued.
        A warning may be triggered by a pattern of events, but one event
        is recorded as the trigger for traceability.

    issued_by:
        SYSTEM  → Automatically generated by the Integrity Analysis Agent.
        LECTURER → Manually issued by a supervisor in the live panel.

    acknowledged_at:
        When the student clicked "I understand" on the warning popup.
        NULL if the student has not yet acknowledged (or if the attempt
        was auto-submitted before acknowledgement was possible).
    """

    __tablename__ = "integrity_warning"

    __table_args__ = (
        # All warnings for an attempt, ordered by creation
        composite_index("integrity_warning", "attempt_id", "created_at"),
        # Supervisor view: all level-3 warnings for an assessment
        composite_index(
            "integrity_warning",
            "assessment_id", "warning_level",
        ),
        # Unacknowledged warnings for an attempt (student UI state)
        composite_index(
            "integrity_warning",
            "attempt_id", "acknowledged_at",
        ),
    )

    # ── Core references ───────────────────────────────────────────────────────

    attempt_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    # Denormalised for supervisor dashboard queries
    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    # Plain UUID — validated at service layer
    student_id: uuid.UUID = Field(nullable=False, index=True)

    # ── Warning identity ──────────────────────────────────────────────────────

    warning_level: WarningLevel = Field(nullable=False, index=True)
    warning_number: int = Field(
        nullable=False,
        # Ordinal warning count for this attempt (1-based).
    )
    message: str = Field(
        nullable=False,
        max_length=1000,
        # The exact message shown to the student.
        # Stored here because the message text may be customised per assessment
        # in future — having it persisted prevents retroactive ambiguity.
    )

    # ── Trigger traceability ──────────────────────────────────────────────────

    triggered_by_event_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("integrity_event.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )
    # Plain UUID — NULL for SYSTEM-issued; set for LECTURER-issued
    issued_by_lecturer_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    is_system_issued: bool = Field(
        default=True,
        nullable=False,
        # True = Integrity Analysis Agent issued this warning.
        # False = A supervisor manually issued it via the live panel.
    )

    # ── Student acknowledgement ───────────────────────────────────────────────

    acknowledged_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    attempt: Optional["AssessmentAttempt"] = Relationship(
        back_populates="integrity_warnings"
    )


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRITY FLAG
# ─────────────────────────────────────────────────────────────────────────────

class IntegrityFlag(BaseModel, table=True):
    """
    A composite high-severity integrity incident requiring human review.

    A flag is raised when:
        1. A student reaches warning_level 3 (auto-created by the system), OR
        2. A supervisor manually flags an attempt from the live panel, OR
        3. The Integrity Analysis Agent detects a high-risk pattern that
           warrants immediate attention (e.g. copy-paste in closed-book mode)

    One attempt can have multiple flags over time (though in practice,
    a third warning creates a flag and further violations add evidence
    to the existing open flag rather than creating new ones).

    Flags have direct consequences:
        - An attempt with an OPEN flag is visible in the lecturer's
          priority review queue.
        - A submission_grade linked to an attempt with any OPEN or ESCALATED
          flag CANNOT be released to the student until the flag is resolved.
        - This is enforced by the result release service, not DB constraints.

    flag_status (IntegrityFlagStatus enum):
        OPEN         → Raised; awaiting lecturer review.
        UNDER_REVIEW → A lecturer has opened the flag and is reviewing it.
        RESOLVED     → Lecturer made a decision (see resolution_decision).
        DISMISSED    → Lecturer determined no violation occurred (false positive).
        ESCALATED    → Referred to admin or institution level for further action.

    resolution_decision:
        Free text. Required when transitioning to RESOLVED, DISMISSED,
        or ESCALATED. Enforced at service layer.
        Example: "Review complete. Student confirmed network issues caused
        reconnects. Grade released."

    grade_impact:
        NULL       → No grade impact determined yet.
        "NONE"     → Grade stands; no penalty applied.
        "DEDUCTED" → Grade deducted per policy; see resolution_decision.
        "VOID"     → Attempt voided; student must retake.
        Stored as Optional[str] rather than enum — institution policies
        vary and this field is extensible.

    raised_by (IntegrityFlagRaisedBy enum):
        SYSTEM   → Created automatically by escalating warning logic or
                    AI pattern detection.
        LECTURER → Manually raised by a supervisor in the live panel.
    """

    __tablename__ = "integrity_flag"

    __table_args__ = (
        # All flags for an attempt
        composite_index("integrity_flag", "attempt_id", "flag_status"),
        # Lecturer review queue: open flags by assessment
        composite_index(
            "integrity_flag",
            "assessment_id", "flag_status",
        ),
        # Admin escalation queue
        composite_index(
            "integrity_flag",
            "flag_status", "raised_by",
        ),
        # Resolved flags history
        composite_index(
            "integrity_flag",
            "assessment_id", "resolved_at",
        ),
    )

    # ── Core references ───────────────────────────────────────────────────────

    attempt_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
        # RESTRICT: a flagged attempt cannot be deleted.
        # The flag must be resolved or dismissed first.
    )
    # Denormalised for lecturer queue queries without joining through attempt
    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    # Plain UUID — student who owns the flagged attempt
    student_id: uuid.UUID = Field(nullable=False, index=True)

    # ── Flag identity ─────────────────────────────────────────────────────────

    flag_status: IntegrityFlagStatus = Field(
        default=IntegrityFlagStatus.OPEN,
        nullable=False,
        index=True,
    )
    raised_by: IntegrityFlagRaisedBy = Field(nullable=False, index=True)
    summary: str = Field(
        nullable=False,
        max_length=2000,
        # Human-readable summary of why this flag was raised.
        # Auto-generated for SYSTEM flags; entered manually for LECTURER flags.
        # Example: "3 warnings issued. Tab switches (5), fullscreen exits (3),
        # copy attempt detected. Total risk score: 87."
    )

    # ── Evidence chain ────────────────────────────────────────────────────────

    # Plain UUID — the level-3 warning that auto-created this flag (if any)
    triggering_warning_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    # Plain UUID — the lecturer who manually raised this flag (if any)
    raised_by_lecturer_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    raised_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        index=True,
    )

    # ── Review ────────────────────────────────────────────────────────────────

    # Plain UUID — lecturer reviewing this flag
    reviewer_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    review_started_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Resolution ────────────────────────────────────────────────────────────

    resolved_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    resolution_decision: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=2000,
    )
    grade_impact: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=50,
        # "NONE" | "DEDUCTED" | "VOID" — set by reviewer at resolution.
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    attempt: Optional["AssessmentAttempt"] = Relationship(
        back_populates="integrity_flags"
    )


# ─────────────────────────────────────────────────────────────────────────────
# SUPERVISION SESSION
# ─────────────────────────────────────────────────────────────────────────────

class SupervisionSession(BaseModel, table=True):
    """
    A lecturer's active live supervision context record.

    A supervision session begins when a lecturer opens the Live Supervision
    Panel for an active assessment. It ends when they close the panel or
    their session token expires.

    Purpose:
        1. Track which lecturers are actively watching an assessment at
           any given moment (for multi-supervisor coordination).
        2. Provide an audit trail of who supervised which assessments and
           for how long.
        3. Support the WebSocket connection management layer — the
           supervision session ID is used to namespace WebSocket channels.

    Multiple supervisors can have simultaneous sessions for the same
    assessment. There is no uniqueness constraint on (assessment_id, lecturer_id)
    because a lecturer may open multiple browser tabs on the same assessment
    (though this is discouraged — the service layer shows a warning if it
    detects duplicate active sessions for the same lecturer + assessment).

    session_token:
        A UUID generated at session start. Used as the WebSocket channel
        identifier. Invalidated on session end.

    is_active:
        True while the lecturer is connected.
        Set to False when:
            - The lecturer closes the panel (graceful disconnect).
            - The WebSocket heartbeat timeout fires (ungraceful disconnect).
            - The assessment window closes (all sessions auto-terminated).

    ended_at:
        NULL while active; set when is_active transitions to False.

    events_reviewed_count:
        Running count of integrity events the lecturer reviewed during
        this session. Used for performance and workload reporting.
    """

    __tablename__ = "supervision_session"

    __table_args__ = (
        # Active sessions for an assessment (primary lookup for WS routing)
        composite_index(
            "supervision_session",
            "assessment_id", "is_active",
        ),
        # Active sessions for a specific lecturer
        composite_index(
            "supervision_session",
            "lecturer_id", "is_active",
        ),
        # Session lookup by token (WebSocket auth)
        composite_index(
            "supervision_session",
            "session_token", "is_active",
        ),
    )

    # ── Core references ───────────────────────────────────────────────────────

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    # Plain UUID — lecturer opening this session; validated at service layer
    lecturer_id: uuid.UUID = Field(nullable=False, index=True)

    # ── Session identity ──────────────────────────────────────────────────────

    session_token: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        nullable=False,
        index=True,
        # Unique per session — used as the WebSocket channel namespace.
    )

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    is_active: bool = Field(default=True, nullable=False, index=True)
    started_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        index=True,
    )
    ended_at: Optional[datetime] = Field(default=None, nullable=True)
    last_heartbeat_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        # Updated by the WebSocket heartbeat every 30 seconds.
        # If last_heartbeat_at + 90s < now → session is considered stale
        # and is_active is set to False by the heartbeat Celery task.
    )

    # ── Activity tracking ─────────────────────────────────────────────────────

    events_reviewed_count: int = Field(default=0, nullable=False)
    warnings_issued_count: int = Field(default=0, nullable=False)
    flags_raised_count: int = Field(default=0, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────

    assessment: Optional["Assessment"] = Relationship(
        back_populates="supervision_sessions"
    )
