"""
app/db/schemas/integrity.py

Integrity monitoring schemas: events, warnings, flags, supervision.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import Field

from app.db.enums import (IntegrityEventType, IntegrityFlagStatus,
                          IntegrityRiskLevel)
from app.db.schemas.base import BaseResponse, MindexaSchema

# ─────────────────────────────────────────────────────────────────────────────
# INTEGRITY EVENTS (inbound from client via WebSocket)
# ─────────────────────────────────────────────────────────────────────────────

class IntegrityEventIngest(MindexaSchema):
    """
    Payload sent by the frontend WebSocket for each detected event.
    Written to the database by the WebSocket handler without blocking.
    """

    attempt_id: uuid.UUID
    event_type: IntegrityEventType
    occurred_at: datetime
    question_id: Optional[uuid.UUID] = None
    metadata_json: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="JSON string with event-specific context data.",
    )


class IntegrityEventResponse(MindexaSchema):
    """Response representation of a raw integrity event."""

    id: uuid.UUID
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    event_type: str
    occurred_at: datetime
    severity: str
    risk_score_delta: int
    question_id: Optional[uuid.UUID]
    metadata_json: Optional[str]
    created_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRITY WARNINGS
# ─────────────────────────────────────────────────────────────────────────────

class IntegrityWarningResponse(BaseResponse):
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    warning_level: int
    warning_number: int
    message: str
    is_system_issued: bool
    acknowledged_at: Optional[datetime]


class ManualWarningRequest(MindexaSchema):
    """A supervisor manually issues a warning from the live panel."""

    attempt_id: uuid.UUID
    message: str = Field(
        min_length=10,
        max_length=500,
        description="The warning message shown to the student.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRITY FLAGS
# ─────────────────────────────────────────────────────────────────────────────

class ManualFlagRequest(MindexaSchema):
    """A supervisor manually raises an integrity flag."""

    attempt_id: uuid.UUID
    summary: str = Field(min_length=10, max_length=2000)


class FlagResolutionRequest(MindexaSchema):
    """Lecturer resolves an integrity flag."""

    flag_status: IntegrityFlagStatus
    resolution_decision: str = Field(min_length=10, max_length=2000)
    grade_impact: Optional[str] = Field(
        default=None,
        max_length=50,
        description="'NONE' | 'DEDUCTED' | 'VOID'",
    )


class IntegrityFlagResponse(BaseResponse):
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    flag_status: str
    raised_by: str
    summary: str
    raised_at: datetime
    reviewer_id: Optional[uuid.UUID]
    resolved_at: Optional[datetime]
    resolution_decision: Optional[str]
    grade_impact: Optional[str]


# ─────────────────────────────────────────────────────────────────────────────
# SUPERVISION SESSION
# ─────────────────────────────────────────────────────────────────────────────

class SupervisionSessionResponse(BaseResponse):
    assessment_id: uuid.UUID
    lecturer_id: uuid.UUID
    session_token: uuid.UUID
    is_active: bool
    started_at: datetime
    ended_at: Optional[datetime]
    last_heartbeat_at: datetime
    events_reviewed_count: int
    warnings_issued_count: int
    flags_raised_count: int


class LiveAttemptStatusResponse(MindexaSchema):
    """
    Live status of one student attempt — shown in the supervisor dashboard.
    Combines attempt data with integrity summary.
    """

    attempt_id: uuid.UUID
    student_id: uuid.UUID
    student_name: Optional[str] = None
    status: str
    started_at: Optional[datetime]
    server_deadline: Optional[datetime]
    integrity_risk_score: int
    warning_count: int
    is_flagged: bool
    fullscreen_exit_count: int
    tab_switch_count: int
    copy_attempt_count: int
    reconnect_count: int
    latest_event_at: Optional[datetime] = None
