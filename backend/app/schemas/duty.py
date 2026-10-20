"""
app/schemas/duty.py

Pydantic schemas for UserDutyAssignment workflows (Phase 1).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.constants import Duty


class DutyAssignmentCreate(BaseModel):
    """Payload for creating a scoped user duty assignment."""

    user_id: uuid.UUID = Field(..., description="Target user ID")
    duty: Duty = Field(..., description="Duty type: MODERATOR, EXAM_OFFICER, DEPARTMENT_HEAD")
    institution_id: uuid.UUID = Field(..., description="Institution ID")
    campus_id: uuid.UUID | None = Field(
        None, description="Campus ID (optional for EXAM_OFFICER)"
    )
    department_id: uuid.UUID | None = Field(
        None, description="Department ID (required for MODERATOR/DEPARTMENT_HEAD)"
    )
    valid_from: datetime | None = Field(
        None, description="Start date/time (defaults to now, timezone-aware)"
    )
    valid_to: datetime | None = Field(
        None, description="Expiration date/time (optional, timezone-aware)"
    )

    model_config = ConfigDict(from_attributes=True)


class DutyAssignmentResponse(BaseModel):
    """Response representation of a user duty assignment."""

    id: uuid.UUID
    user_id: uuid.UUID
    duty: Duty
    institution_id: uuid.UUID
    campus_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    is_active: bool
    valid_from: datetime
    valid_to: datetime | None = None
    assigned_by_id: uuid.UUID
    created_at: datetime
    updated_at: datetime | None = None

    # Contextual fields (enriched by service when available)
    user_email: str | None = None
    user_name: str | None = None
    institution_name: str | None = None
    campus_name: str | None = None
    department_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class DutyCheckResponse(BaseModel):
    """Response verifying duty possession."""

    has_duty: bool
    duty: Duty
    user_id: uuid.UUID
    department_id: uuid.UUID | None = None
    campus_id: uuid.UUID | None = None
    institution_id: uuid.UUID | None = None

    model_config = ConfigDict(from_attributes=True)
