"""
app/schemas/integrity.py

Pydantic schemas for integrity monitoring endpoints.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.db.enums import (
    IntegrityEventType,
    IntegrityFlagRaisedBy,
    IntegrityFlagStatus,
    RiskLevel,
    SupervisionSessionStatus,
    WarningLevel,
)

# ---------------------------------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------------------------------


class RecordEventRequest(BaseModel):
    """
    Body for POST /integrity/event.
    Frontend sends this whenever a monitored browser event occurs.
    """
    attempt_id: uuid.UUID
    access_token: uuid.UUID = Field(
        ...,
        description="Attempt access token — prevents spoofed event injection",
    )
    event_type: IntegrityEventType
    metadata_json: dict[str, Any] | None = Field(
        default=None,
        description="Event-specific context (duration_ms, tab_count, etc.)",
    )


class RaiseFlagRequest(BaseModel):
    """
    Body for POST /integrity/flag — supervisor manually raises a flag.
    """
    attempt_id: uuid.UUID
    description: str = Field(..., min_length=10)
    risk_level: RiskLevel = RiskLevel.MEDIUM
    evidence_event_ids: list[uuid.UUID] | None = None


class ResolveFlagRequest(BaseModel):
    """
    Body for PATCH /integrity/flag/{flag_id}/resolve.
    """
    status: IntegrityFlagStatus = Field(
        ...,
        description="New terminal status: confirmed | dismissed | escalated",
    )
    resolution_notes: str = Field(..., min_length=5)


class AcknowledgeWarningRequest(BaseModel):
    """Student acknowledges a warning overlay."""
    warning_id: uuid.UUID
    access_token: uuid.UUID


# ---------------------------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------------------------


class IntegrityEventResponse(BaseModel):
    """One integrity event."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    event_type: IntegrityEventType
    metadata_json: dict[str, Any] | None
    created_at: datetime


class IntegrityFlagResponse(BaseModel):
    """One integrity flag."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    status: IntegrityFlagStatus
    risk_level: RiskLevel
    raised_by: IntegrityFlagRaisedBy
    raised_by_id: uuid.UUID | None
    description: str
    evidence_event_ids: list[Any] | None
    resolved_by_id: uuid.UUID | None
    resolved_at: datetime | None
    resolution_notes: str | None
    created_at: datetime
    updated_at: datetime


class IntegrityWarningResponse(BaseModel):
    """One integrity warning."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    attempt_id: uuid.UUID
    warning_level: WarningLevel
    message: str
    issued_at: datetime
    acknowledged_at: datetime | None
    trigger_event_id: uuid.UUID | None
    raised_flag_id: uuid.UUID | None


class AttemptIntegrityReport(BaseModel):
    """
    Full integrity picture for one attempt.
    Returned to supervisor via GET /integrity/{attempt_id}.
    """
    attempt_id: uuid.UUID
    student_id: uuid.UUID
    is_flagged: bool
    total_warnings: int
    event_counts: dict[str, int]       # {event_type: count}
    events: list[IntegrityEventResponse]
    flags: list[IntegrityFlagResponse]
    warnings: list[IntegrityWarningResponse]


class SupervisionSessionResponse(BaseModel):
    """Live supervision session."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    assessment_id: uuid.UUID
    supervisor_id: uuid.UUID
    status: SupervisionSessionStatus
    started_at: datetime
    ended_at: datetime | None
    created_at: datetime
