"""
backend/app/schemas/authoring.py

Pydantic schemas for Phase 4 authoring, delegations, version history, and diffs.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.enums import CollaboratorRole, DelegationStatus


# ── Collaborator Schemas ──────────────────────────────────────────────────────

class AssessmentCollaboratorCreate(BaseModel):
    lecturer_id: uuid.UUID
    role: CollaboratorRole = CollaboratorRole.CO_AUTHOR


class AssessmentCollaboratorResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    lecturer_id: uuid.UUID
    role: CollaboratorRole
    added_by_id: uuid.UUID
    added_at: datetime
    is_active: bool
    lecturer_name: Optional[str] = None
    lecturer_email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Delegation Schemas ────────────────────────────────────────────────────────

class AuthorDelegationCreate(BaseModel):
    delegate_id: uuid.UUID
    reason: str = Field(..., min_length=10, description="Mandatory justification (min 10 chars)")
    valid_from: datetime
    valid_to: datetime

    @model_validator(mode="after")
    def validate_dates(self) -> "AuthorDelegationCreate":
        if self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be after valid_from.")
        return self


class AuthorDelegationResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    delegator_id: uuid.UUID
    delegate_id: uuid.UUID
    created_by_id: uuid.UUID
    reason: str
    valid_from: datetime
    valid_to: datetime
    status: DelegationStatus
    revoked_at: Optional[datetime] = None
    revoked_by_id: Optional[uuid.UUID] = None
    created_at: datetime
    delegate_name: Optional[str] = None
    delegator_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Version & Diff Schemas ────────────────────────────────────────────────────

class AssessmentVersionSummaryResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    version_no: int
    content_hash: str
    created_by_id: uuid.UUID
    reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FieldChange(BaseModel):
    target_type: str = Field(description="ASSESSMENT | SECTION | QUESTION")
    target_id: Optional[str] = None
    field: str
    before: Any = None
    after: Any = None
    description: str


class AssessmentVersionDiffResponse(BaseModel):
    assessment_id: uuid.UUID
    version_from: int
    version_to: int
    summary: str
    total_changes: int
    changes: List[FieldChange] = []


# ── Post-Approval Edit Schemas ────────────────────────────────────────────────

class PostApprovalEditRequest(BaseModel):
    reason: str = Field(..., min_length=10, description="Mandatory edit justification (min 10 chars)")
    reprint_required: bool = Field(default=False, description="Confirm whether paper reprinting is needed")
    title: Optional[str] = Field(default=None, min_length=2, max_length=300)
    instructions: Optional[str] = None
    total_marks: Optional[int] = Field(default=None, ge=1)
    passing_marks: Optional[int] = Field(default=None, ge=0)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    sections_update: Optional[List[dict]] = None
    questions_update: Optional[List[dict]] = None
    notice_banner: Optional[str] = Field(
        default=None,
        description="Optional broadcast notice banner for students mid-attempt (ALLOW_WITH_NOTICE)",
    )
