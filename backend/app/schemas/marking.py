"""
app/schemas/marking.py

Pydantic schemas for Phase 5 marking schemes, step marks,
material key points, AI sample checks, and grading delegations.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import (
    DelegationStatus,
    GradingDelegationScope,
    KeyPointImportance,
    SampleCheckStatus,
    StepKind,
)


# ── Marking Schemes ──────────────────────────────────────────────────────────


class MarkingSchemeBase(BaseModel):
    model_answer: str = Field(..., min_length=1)
    allow_partial_credit: bool = Field(default=True)
    notes: Optional[str] = None
    rubric_id: Optional[uuid.UUID] = None


class MarkingSchemeCreate(MarkingSchemeBase):
    pass


class MarkingSchemeUpdate(BaseModel):
    model_answer: Optional[str] = None
    allow_partial_credit: Optional[bool] = None
    notes: Optional[str] = None
    rubric_id: Optional[uuid.UUID] = None


class MarkingSchemeResponse(MarkingSchemeBase):
    id: uuid.UUID
    question_id: uuid.UUID
    created_by_id: uuid.UUID
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Step Marks (Method Marks) ────────────────────────────────────────────────


class QuestionMarkStepBase(BaseModel):
    step_no: int = Field(..., ge=1)
    description: str = Field(..., min_length=1)
    marks: float = Field(..., gt=0.0)
    kind: StepKind = Field(default=StepKind.METHOD)


class QuestionMarkStepCreate(QuestionMarkStepBase):
    pass


class QuestionMarkStepUpdate(BaseModel):
    step_no: Optional[int] = Field(default=None, ge=1)
    description: Optional[str] = None
    marks: Optional[float] = Field(default=None, gt=0.0)
    kind: Optional[StepKind] = None


class QuestionMarkStepResponse(QuestionMarkStepBase):
    id: uuid.UUID
    question_id: uuid.UUID
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionMarkStepsBatchRequest(BaseModel):
    steps: List[QuestionMarkStepCreate] = Field(..., min_length=1)


# ── Material Key Points ──────────────────────────────────────────────────────


class MaterialKeyPointBase(BaseModel):
    text: str = Field(..., min_length=1)
    importance: KeyPointImportance = Field(default=KeyPointImportance.CORE)
    chunk_id: Optional[uuid.UUID] = None
    page_number: Optional[int] = Field(default=None, ge=1)


class MaterialKeyPointCreate(MaterialKeyPointBase):
    pass


class MaterialKeyPointResponse(MaterialKeyPointBase):
    id: uuid.UUID
    lecturer_material_id: uuid.UUID
    created_by_id: uuid.UUID
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionKeyPointAttachRequest(BaseModel):
    key_point_ids: List[uuid.UUID] = Field(..., min_length=1)


class QuestionKeyPointsResponse(BaseModel):
    question_id: uuid.UUID
    key_points: List[MaterialKeyPointResponse]


# ── AI Grade Sample Check ────────────────────────────────────────────────────


class SampleCheckCreateRequest(BaseModel):
    sample_size: Optional[int] = Field(default=None, ge=1)


class SampleCheckVerifyItem(BaseModel):
    review_id: uuid.UUID
    agreed: bool = Field(default=True)
    lecturer_score: Optional[float] = None
    lecturer_feedback: Optional[str] = None


class SampleCheckVerifyRequest(BaseModel):
    verifications: List[SampleCheckVerifyItem] = Field(..., min_length=1)


class SampleCheckResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    lecturer_id: uuid.UUID
    sample_size: int
    sampled_review_ids: List[str]
    checked_count: int
    agreement_rate: float
    status: SampleCheckStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BulkAcceptRequest(BaseModel):
    sample_check_id: Optional[uuid.UUID] = None
    override_low_agreement: bool = Field(default=False)
    override_reason: Optional[str] = None
    agreement_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class BulkAcceptResponse(BaseModel):
    assessment_id: uuid.UUID
    accepted_count: int
    sample_check_id: uuid.UUID
    agreement_rate: float
    status: str = "COMPLETED"


# ── Grading Delegations ──────────────────────────────────────────────────────


class GradingDelegationCreate(BaseModel):
    delegate_id: uuid.UUID
    scope: GradingDelegationScope = Field(default=GradingDelegationScope.WHOLE)
    target_section_id: Optional[uuid.UUID] = None
    target_student_ids: Optional[List[str]] = None
    reason: str = Field(..., min_length=5)
    valid_from: datetime
    valid_to: datetime


class GradingDelegationResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    delegator_id: uuid.UUID
    delegate_id: uuid.UUID
    scope: GradingDelegationScope
    target_section_id: Optional[uuid.UUID] = None
    target_student_ids: Optional[List[str]] = None
    reason: str
    valid_from: datetime
    valid_to: datetime
    status: DelegationStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
