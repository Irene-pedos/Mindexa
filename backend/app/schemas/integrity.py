"""
app/schemas/integrity.py

Pydantic schemas for integrity monitoring endpoints.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

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
    metadata_json: Optional[Dict[str, Any]] = Field(
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
    evidence_event_ids: Optional[List[uuid.UUID]] = None


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
    metadata_json: Optional[Dict[str, Any]]
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
    raised_by_id: Optional[uuid.UUID]
    description: str
    evidence_event_ids: Optional[List[Any]]
    resolved_by_id: Optional[uuid.UUID]
    resolved_at: Optional[datetime]
    resolution_notes: Optional[str]
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
    acknowledged_at: Optional[datetime]
    trigger_event_id: Optional[uuid.UUID]
    raised_flag_id: Optional[uuid.UUID]


class AttemptIntegrityReport(BaseModel):
    """
    Full integrity picture for one attempt.
    Returned to supervisor via GET /integrity/{attempt_id}.
    """
    attempt_id: uuid.UUID
    student_id: uuid.UUID
    is_flagged: bool
    total_warnings: int
    event_counts: Dict[str, int]       # {event_type: count}
    events: List[IntegrityEventResponse]
    flags: List[IntegrityFlagResponse]
    warnings: List[IntegrityWarningResponse]


class SupervisionSessionResponse(BaseModel):
    """Live supervision session."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    assessment_id: uuid.UUID
    supervisor_id: uuid.UUID
    status: SupervisionSessionStatus
    started_at: datetime
    ended_at: Optional[datetime]
    created_at: datetime
