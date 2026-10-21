"""
app/schemas/eligibility.py

Pydantic schemas for Phase 6A: Eligibility, Reassessment, and Retakes.
Strictly Pydantic V2 BaseModel with ConfigDict.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import (
    EligibilityDecisionType,
    EligibilityResult,
    FormativeScope,
    NoCourseworkBehavior,
    OverrideSource,
    PaymentPurpose,
    PaymentStatus,
    PendingMarksBehavior,
    ReassessmentBlockScope,
    ReassessmentRequirementStatus,
    RetakeStatus,
    RetakeTrigger,
)


# ── Eligibility Policy ────────────────────────────────────────────────────────


class EligibilityPolicyBase(BaseModel):
    institution_id: uuid.UUID
    department_id: Optional[uuid.UUID] = None
    formative_exempt_pct: float = Field(default=70.0, ge=0.0, le=100.0)
    summative_entry_pct: float = Field(default=50.0, ge=0.0, le=100.0)
    summative_pass_pct: float = Field(default=50.0, ge=0.0, le=100.0)
    formative_scope: FormativeScope = FormativeScope.PER_FORMATIVE
    reassessment_block_scope: ReassessmentBlockScope = ReassessmentBlockScope.COURSE
    pending_marks_behavior: PendingMarksBehavior = PendingMarksBehavior.BLOCK
    no_coursework_behavior: NoCourseworkBehavior = NoCourseworkBehavior.MANUAL_REVIEW
    allow_hod_override: bool = True


class EligibilityPolicyCreate(EligibilityPolicyBase):
    pass


class EligibilityPolicyUpdate(BaseModel):
    institution_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    formative_exempt_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    summative_entry_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    summative_pass_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    formative_scope: Optional[FormativeScope] = None
    reassessment_block_scope: Optional[ReassessmentBlockScope] = None
    pending_marks_behavior: Optional[PendingMarksBehavior] = None
    no_coursework_behavior: Optional[NoCourseworkBehavior] = None
    allow_hod_override: Optional[bool] = None


class EligibilityPolicyResponse(EligibilityPolicyBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Reassessment Requirement ─────────────────────────────────────────────────


class ReassessmentRequirementResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    academic_period_id: uuid.UUID
    source_assessment_id: uuid.UUID
    original_percentage: float
    status: ReassessmentRequirementStatus
    reassessment_assessment_id: Optional[uuid.UUID] = None
    reassessment_attempt_id: Optional[uuid.UUID] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    source_assessment_title: Optional[str] = None
    course_code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Eligibility Decision ─────────────────────────────────────────────────────


class EligibilityDecisionResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    assessment_id: Optional[uuid.UUID] = None
    decision_type: EligibilityDecisionType
    result: EligibilityResult
    reason_code: str
    inputs_json: dict
    policy_snapshot_json: dict
    computed_at: datetime
    computed_by: str

    model_config = ConfigDict(from_attributes=True)


# ── Attempt Eligibility Override ─────────────────────────────────────────────


class AttemptEligibilityOverrideCreate(BaseModel):
    student_id: uuid.UUID
    assessment_id: uuid.UUID
    reason: str = Field(..., min_length=1, description="Mandatory reason for override")
    allowed_window_start: Optional[datetime] = None
    allowed_window_end: Optional[datetime] = None


class AttemptEligibilityOverrideResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    assessment_id: uuid.UUID
    source: OverrideSource
    allowed_window_start: datetime
    allowed_window_end: Optional[datetime] = None
    reason: str
    granted_by_id: uuid.UUID
    excuse_id: Optional[uuid.UUID] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Payment Reference ────────────────────────────────────────────────────────


class PaymentReferenceCreate(BaseModel):
    external_reference: Optional[str] = None
    amount_text: Optional[str] = None
    notes: Optional[str] = None


class PaymentConfirmationRequest(BaseModel):
    status: PaymentStatus = Field(..., description="CONFIRMED or REJECTED")
    notes: Optional[str] = None


class PaymentReferenceResponse(BaseModel):
    id: uuid.UUID
    purpose: PaymentPurpose
    student_id: uuid.UUID
    external_reference: Optional[str] = None
    amount_text: Optional[str] = None
    status: PaymentStatus
    confirmed_by_id: Optional[uuid.UUID] = None
    confirmed_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Retake Record ────────────────────────────────────────────────────────────


class RetakeEnrollRequest(BaseModel):
    target_period_id: Optional[uuid.UUID] = None
    target_course_id: Optional[uuid.UUID] = None


class RetakeRecordResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    from_period_id: uuid.UUID
    from_period_name: Optional[str] = None
    target_period_id: Optional[uuid.UUID] = None
    target_period_name: Optional[str] = None
    target_course_id: Optional[uuid.UUID] = None
    trigger: RetakeTrigger
    status: RetakeStatus
    payment_reference_id: Optional[uuid.UUID] = None
    payment_reference: Optional[PaymentReferenceResponse] = None
    decided_decision_id: Optional[uuid.UUID] = None
    enrolled_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Student & Lecturer Eligibility Overviews ─────────────────────────────────


class StudentCourseEligibilityResponse(BaseModel):
    student_id: uuid.UUID
    course_id: uuid.UUID
    course_code: str
    course_title: str
    academic_period_id: uuid.UUID
    coursework_average: Optional[float] = None
    pending_marks_count: int = 0
    has_coursework: bool = False
    summative_entry_eligible: bool = False
    summative_entry_reason: str
    pending_reassessments: List[ReassessmentRequirementResponse] = []
    active_override: bool = False
    retake_status: Optional[RetakeStatus] = None
    decisions: List[EligibilityDecisionResponse] = []


class StudentCohortEligibilityItem(BaseModel):
    student_id: uuid.UUID
    student_name: str
    registration_number: Optional[str] = None
    coursework_average: Optional[float] = None
    pending_marks_count: int = 0
    summative_eligible: bool = False
    blocked_reason: Optional[str] = None
    active_override: bool = False
    pending_reassessments_count: int = 0


class LecturerCourseEligibilityResponse(BaseModel):
    course_id: uuid.UUID
    course_code: str
    course_title: str
    total_enrolled: int
    eligible_count: int
    blocked_count: int
    students: List[StudentCohortEligibilityItem] = []


class BlockedStudentItem(BaseModel):
    student_id: uuid.UUID
    student_name: str
    registration_number: Optional[str] = None
    reason_code: str
    detail: str
    has_override: bool


class AssessmentBlockedStudentsResponse(BaseModel):
    assessment_id: uuid.UUID
    assessment_title: str
    assessment_type: str
    warning: Optional[str] = None
    blocked_students: List[BlockedStudentItem] = []
