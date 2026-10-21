"""
app/schemas/appeals.py

Pydantic V2 request/response schemas for Phase 6B: Appeals and Absence Excuses.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import (
    AbsenceExcuseStatus,
    AppealOutcome,
    IndividualAppealStatus,
)


# ── Appeal Policy ─────────────────────────────────────────────────────────────


class AppealPolicyUpdate(BaseModel):
    window_days: Optional[int] = Field(default=None, ge=1, le=365)
    allow_mark_decrease: Optional[bool] = None
    require_payment: Optional[bool] = None
    anonymize_for_reviewer: Optional[bool] = None


class AppealPolicyResponse(BaseModel):
    id: uuid.UUID
    institution_id: uuid.UUID
    window_days: int
    allow_mark_decrease: bool
    require_payment: bool
    anonymize_for_reviewer: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Appeal ────────────────────────────────────────────────────────────────────


class AppealCreate(BaseModel):
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    course_id: uuid.UUID
    reason: str = Field(min_length=20, description="Minimum 20 characters")
    items: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional list of disputed question IDs and notes",
    )


class AppealPaymentAttach(BaseModel):
    payment_reference_id: uuid.UUID


class AppealAssignReviewer(BaseModel):
    reviewer_id: uuid.UUID
    justification: Optional[str] = Field(
        default=None,
        description="Required when no eligible reviewer in primary pool (A-09)",
    )


class AppealSubmitReview(BaseModel):
    reviewer_total: float = Field(ge=0.0, description="Mark recommended by reviewer")
    decision_note: Optional[str] = None


class AppealCloseDecision(BaseModel):
    """HOD closes the appeal after a decision."""
    final_total: float = Field(ge=0.0)
    outcome: AppealOutcome
    decision_note: Optional[str] = None


class AppealWithdraw(BaseModel):
    reason: Optional[str] = None


class EligibleReviewerItem(BaseModel):
    reviewer_id: uuid.UUID
    from_fallback_pool: bool = False


class EligibleReviewersResponse(BaseModel):
    primary_pool: List[uuid.UUID]
    fallback_pool: List[uuid.UUID]
    fallback_justification_required: bool


class AppealStatusEvent(BaseModel):
    status: IndividualAppealStatus
    changed_at: Optional[datetime] = None


class AppealResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    course_id: uuid.UUID
    reason: str
    items: Optional[Any] = None
    status: IndividualAppealStatus
    payment_reference_id: Optional[uuid.UUID] = None
    original_total: float
    reviewer_id: Optional[uuid.UUID] = None
    assigned_by_id: Optional[uuid.UUID] = None
    assignment_justification: Optional[str] = None
    reviewer_total: Optional[float] = None
    final_total: Optional[float] = None
    outcome: Optional[AppealOutcome] = None
    decision_note: Optional[str] = None
    submitted_at: datetime
    assigned_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    # Improvement #5: status timeline so the student can track progress
    status_timeline: Optional[List[AppealStatusEvent]] = None

    model_config = ConfigDict(from_attributes=True)


class AppealListResponse(BaseModel):
    items: List[AppealResponse]
    total: int
    limit: int
    offset: int


# ── Absence Excuse Policy ─────────────────────────────────────────────────────


class AbsenceExcusePolicyUpdate(BaseModel):
    submit_days_after: Optional[int] = Field(default=None, ge=1, le=365)


class AbsenceExcusePolicyResponse(BaseModel):
    id: uuid.UUID
    institution_id: uuid.UUID
    submit_days_after: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Absence Excuse Request ────────────────────────────────────────────────────


class AbsenceExcuseCreate(BaseModel):
    assessment_id: uuid.UUID
    course_id: uuid.UUID
    reason: str = Field(min_length=10)
    evidence_file_ids: List[str] = Field(
        min_length=1,
        description="At least one evidence file ID is required",
    )


class AbsenceExcuseDecide(BaseModel):
    status: AbsenceExcuseStatus = Field(
        description="Must be APPROVED or REJECTED",
    )
    decision_note: Optional[str] = None
    granted_window_start: Optional[datetime] = None
    granted_window_end: Optional[datetime] = None


class AbsenceExcuseResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    assessment_id: uuid.UUID
    course_id: uuid.UUID
    reason: str
    evidence_file_ids: List[str]
    status: AbsenceExcuseStatus
    decided_by_id: Optional[uuid.UUID] = None
    decided_at: Optional[datetime] = None
    decision_note: Optional[str] = None
    granted_window_start: Optional[datetime] = None
    granted_window_end: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AbsenceExcuseListResponse(BaseModel):
    items: List[AbsenceExcuseResponse]
    total: int
    limit: int
    offset: int
