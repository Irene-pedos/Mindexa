"""
app/schemas/assessment.py

Pydantic schemas for the Assessment domain.

Covers:
    - Create / Update requests
    - Response serialization
    - Wizard step payloads
    - Finalization validation
"""

import uuid
from datetime import datetime
from typing import List, Optional

from app.core.constants import AssessmentStatus, AssessmentType, GradingMode
from pydantic import BaseModel, Field, field_validator, model_validator

# ─── Assessment Section Schemas ───────────────────────────────────────────────


class AssessmentSectionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    instructions: Optional[str] = None
    order_index: int = Field(default=0, ge=0)
    allocated_marks: Optional[int] = Field(default=None, ge=0)


class AssessmentSectionUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = None
    instructions: Optional[str] = None
    order_index: Optional[int] = Field(default=None, ge=0)
    allocated_marks: Optional[int] = Field(default=None, ge=0)


class AssessmentSectionResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    title: str
    description: Optional[str]
    instructions: Optional[str]
    order_index: int
    allocated_marks: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Assessment Question Link Schemas ─────────────────────────────────────────


class AddQuestionToAssessmentRequest(BaseModel):
    question_id: uuid.UUID
    section_id: Optional[uuid.UUID] = None
    marks: int = Field(..., ge=1, le=1000)
    order_index: int = Field(default=0, ge=0)
    added_via: str = Field(
        default="manual",
        description="manual | ai_generated | question_bank",
    )

    @field_validator("added_via")
    @classmethod
    def validate_added_via(cls, v: str) -> str:
        allowed = {"manual", "ai_generated", "imported", "question_bank"}
        if v not in allowed:
            raise ValueError(f"added_via must be one of: {', '.join(sorted(allowed))}")
        return v


class ReorderQuestionsRequest(BaseModel):
    """
    Reorder questions in an assessment.
    Each item maps a question_id to its new order_index.
    """

    order: List[dict] = Field(
        ...,
        description="List of {question_id: str, order_index: int} pairs",
    )

    @model_validator(mode="after")
    def validate_order_items(self) -> "ReorderQuestionsRequest":
        for item in self.order:
            if "question_id" not in item or "order_index" not in item:
                raise ValueError(
                    "Each order item must have 'question_id' and 'order_index'."
                )
            if not isinstance(item["order_index"], int) or item["order_index"] < 0:
                raise ValueError("order_index must be a non-negative integer.")
        return self


class AssessmentQuestionResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    question_id: uuid.UUID
    section_id: Optional[uuid.UUID]
    marks: int
    order_index: int
    added_via: str
    is_required: bool

    model_config = {"from_attributes": True}


# ─── Assessment Draft Progress Schema ─────────────────────────────────────────


class AssessmentDraftProgressResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    current_step: int
    last_saved_at: datetime
    step_data: Optional[str]
    validation_errors: Optional[str]

    model_config = {"from_attributes": True}


# ─── Assessment Create / Update ───────────────────────────────────────────────


class AssessmentCreateRequest(BaseModel):
    """
    Step 1 of the wizard: basic info.
    Creates the assessment record in DRAFT status at step 1.
    """

    title: str = Field(..., min_length=2, max_length=300)
    description: Optional[str] = None
    instructions: Optional[str] = None
    assessment_type: str = Field(default=AssessmentType.FORMATIVE.value)
    course_id: Optional[uuid.UUID] = None
    subject_id: Optional[uuid.UUID] = None
    grading_mode: str = Field(default=GradingMode.MANUAL.value)
    result_release_mode: str = Field(default="manual")
    total_marks: int = Field(default=100, ge=1, le=10000)
    passing_marks: Optional[int] = Field(default=None, ge=0)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)

    @field_validator("assessment_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        allowed = {t.value for t in AssessmentType}
        if v not in allowed:
            raise ValueError(f"assessment_type must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("grading_mode")
    @classmethod
    def validate_grading_mode(cls, v: str) -> str:
        allowed = {m.value for m in GradingMode}
        if v not in allowed:
            raise ValueError(f"grading_mode must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("result_release_mode")
    @classmethod
    def validate_release_mode(cls, v: str) -> str:
        allowed = {"immediate", "manual", "scheduled"}
        if v not in allowed:
            raise ValueError(f"result_release_mode must be one of: {', '.join(sorted(allowed))}")
        return v

    @model_validator(mode="after")
    def passing_marks_must_not_exceed_total(self) -> "AssessmentCreateRequest":
        if self.passing_marks and self.passing_marks > self.total_marks:
            raise ValueError("passing_marks cannot exceed total_marks.")
        return self

    model_config = {"str_strip_whitespace": True}


class AssessmentSecuritySettingsUpdate(BaseModel):
    """Step 2 of the wizard: security & integrity settings."""

    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    max_attempts: int = Field(default=1, ge=1, le=10)
    grace_period_minutes: Optional[int] = Field(default=0, ge=0, le=60)
    late_submission_allowed: bool = False
    late_penalty_percent: Optional[float] = Field(default=0, ge=0, le=100)
    is_password_protected: bool = False
    access_password: Optional[str] = Field(
        default=None, min_length=4, max_length=50,
        description="Plain text password (will be hashed before storage)"
    )
    fullscreen_required: bool = True
    is_supervised: bool = False
    ai_assistance_allowed: bool = False
    is_open_book: bool = False
    integrity_monitoring_enabled: bool = True
    randomize_questions: bool = Field(default=False, alias="randomise_questions")
    randomize_options: bool = Field(default=False, alias="randomise_options")

    @model_validator(mode="after")
    def validate_window(self) -> "AssessmentSecuritySettingsUpdate":
        if self.window_start and self.window_end:
            if self.window_end <= self.window_start:
                raise ValueError("window_end must be after window_start.")
        if self.is_password_protected and not self.access_password:
            raise ValueError(
                "access_password is required when is_password_protected=True."
            )
        return self

    model_config = {"populate_by_name": True}


class AssessmentGeneralUpdate(BaseModel):
    """General update for any writable field on an unfinalised assessment."""

    title: Optional[str] = Field(default=None, min_length=2, max_length=300)
    description: Optional[str] = None
    instructions: Optional[str] = None
    assessment_type: Optional[str] = None
    grading_mode: Optional[str] = None
    result_release_mode: Optional[str] = None
    subject: Optional[str] = Field(default=None, max_length=200)
    subject_id: Optional[uuid.UUID] = None
    target_class: Optional[str] = Field(default=None, max_length=200)
    total_marks: Optional[int] = Field(default=None, ge=1, le=10000)
    passing_marks: Optional[int] = Field(default=None, ge=0)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    show_marks_per_question: Optional[bool] = None
    show_feedback_after_submit: Optional[bool] = None
    is_ai_generation_enabled: Optional[bool] = None
    draft_step: Optional[int] = Field(default=None, ge=1, le=6)

    model_config = {"str_strip_whitespace": True}


# ─── Assessment Response Schemas ──────────────────────────────────────────────


class AssessmentSummaryResponse(BaseModel):
    """Lightweight response for list views."""

    id: uuid.UUID
    title: str
    assessment_type: str
    status: str
    grading_mode: str
    total_marks: int
    duration_minutes: Optional[int]
    window_start: Optional[datetime]
    window_end: Optional[datetime]
    is_finalized: bool
    draft_step: Optional[int]
    created_by_id: uuid.UUID
    subject: Optional[str]
    target_class: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssessmentDetailResponse(BaseModel):
    """Full response including sections, questions, and draft progress."""

    id: uuid.UUID
    title: str
    description: Optional[str]
    instructions: Optional[str]
    assessment_type: str
    status: str
    grading_mode: str
    result_release_mode: str
    total_marks: int
    passing_marks: Optional[int]
    duration_minutes: Optional[int]
    window_start: Optional[datetime]
    window_end: Optional[datetime]
    max_attempts: int
    grace_period_minutes: Optional[int]
    late_submission_allowed: bool
    late_penalty_percent: Optional[float]
    is_password_protected: bool
    fullscreen_required: bool
    is_supervised: bool
    ai_assistance_allowed: bool
    is_open_book: bool
    integrity_monitoring_enabled: bool
    randomize_questions: bool = Field(serialization_alias="randomise_questions")
    randomize_options: bool = Field(serialization_alias="randomise_options")
    is_ai_generation_enabled: bool
    show_marks_per_question: bool
    show_feedback_after_submit: bool
    draft_step: Optional[int]
    is_finalized: bool
    finalized_at: Optional[datetime]
    subject: Optional[str]
    target_class: Optional[str]
    created_by_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    sections: List[AssessmentSectionResponse] = []
    assessment_questions: List[AssessmentQuestionResponse] = []
    draft_progress: Optional[AssessmentDraftProgressResponse] = None

    model_config = {"from_attributes": True, "populate_by_name": True}


class AssessmentListResponse(BaseModel):
    items: List[AssessmentSummaryResponse]
    total: int
    page: int
    page_size: int
    has_next: bool


class FinalizeAssessmentResponse(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    is_finalized: bool
    finalized_at: Optional[datetime]
    validation_passed: bool
    errors: List[str] = []
    warnings: List[str] = []

    model_config = {"from_attributes": True}
