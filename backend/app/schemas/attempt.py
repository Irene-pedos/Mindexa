"""
app/schemas/attempt.py

Pydantic schemas for AssessmentAttempt endpoints.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.db.enums import AttemptStatus

# ---------------------------------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------------------------------


class AttemptStartRequest(BaseModel):
    """
    Body for POST /attempts/start.
    Student provides the assessment they want to attempt.
    Optional: access_password if the assessment is password-protected.
    """
    assessment_id: uuid.UUID
    access_password: str | None = Field(
        default=None,
        description="Required only if the assessment is password-protected",
    )


class AttemptResumeRequest(BaseModel):
    """
    Body for POST /attempts/{attempt_id}/resume.
    The access_token issued at start must be re-validated.
    """
    access_token: uuid.UUID


class AttemptSubmitRequest(BaseModel):
    """
    Body for POST /attempts/{attempt_id}/submit.
    Student explicitly submits the attempt.
    access_token prevents stale-tab submissions.
    """
    access_token: uuid.UUID
    confirm: bool = Field(
        ...,
        description="Must be True — prevents accidental submission",
    )

    @model_validator(mode="after")
    def confirm_must_be_true(self) -> AttemptSubmitRequest:
        if not self.confirm:
            raise ValueError("confirm must be True to submit the attempt")
        return self


# ---------------------------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------------------------


class AttemptResponse(BaseModel):
    """Full attempt detail — returned to student during active attempt."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    attempt_number: int
    status: AttemptStatus
    started_at: datetime
    submitted_at: datetime | None
    expires_at: datetime
    last_activity_at: datetime | None
    access_token: uuid.UUID
    total_score: float | None
    total_integrity_warnings: int
    is_flagged: bool
    created_at: datetime


class AttemptStartResponse(BaseModel):
    """
    Returned on POST /attempts/start.
    Includes the access_token the student must use for all subsequent requests.
    """
    model_config = {"from_attributes": True}

    id: uuid.UUID
    assessment_id: uuid.UUID
    attempt_number: int
    status: AttemptStatus
    started_at: datetime
    expires_at: datetime
    access_token: uuid.UUID
    # Seconds remaining (computed, not stored)
    seconds_remaining: int | None = None


class AttemptSummary(BaseModel):
    """Lightweight summary for dashboard list views."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    assessment_id: uuid.UUID
    attempt_number: int
    status: AttemptStatus
    started_at: datetime
    submitted_at: datetime | None
    expires_at: datetime
    total_score: float | None
    is_flagged: bool


class AttemptListResponse(BaseModel):
    """Paginated list of attempts."""
    items: list[AttemptSummary]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# SUPERVISOR VIEW
# ---------------------------------------------------------------------------


class AttemptSupervisorView(BaseModel):
    """
    Extended view for the supervisor live monitoring panel.
    Includes integrity state and timing details not shown to students.
    """
    model_config = {"from_attributes": True}

    id: uuid.UUID
    student_id: uuid.UUID
    attempt_number: int
    status: AttemptStatus
    started_at: datetime
    expires_at: datetime
    last_activity_at: datetime | None
    total_integrity_warnings: int
    is_flagged: bool
    ip_address: str | None
