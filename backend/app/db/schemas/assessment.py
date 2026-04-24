"""
app/db/schemas/assessment.py

Assessment management schemas: creation, wizard steps, blueprint, publish.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.db.enums import (AssessmentStatus, AssessmentType, BlueprintRuleType,
                          DifficultyLevel, GradingMode, QuestionType,
                          ResultReleaseMode, SupervisorRole)
from app.db.schemas.base import (BaseAuditedResponse, BaseResponse,
                                 MindexaSchema)
from pydantic import Field, field_validator, model_validator

# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT — STEP 1 (BASIC INFO)
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentStep1Request(MindexaSchema):
    """
    Wizard Step 1: Basic information.
    This step creates the assessment row in DRAFT status.
    """

    title: str = Field(min_length=3, max_length=255)
    instructions: Optional[str] = Field(default=None, max_length=5000)
    assessment_type: AssessmentType
    course_id: uuid.UUID
    subject_id: Optional[uuid.UUID] = None
    total_marks: int = Field(default=100, ge=1, le=1000)
    passing_marks: Optional[int] = Field(default=None, ge=0)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=480)
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    max_attempts: int = Field(default=1, ge=1, le=5)
    grading_mode: GradingMode = GradingMode.HYBRID
    result_release_mode: ResultReleaseMode = ResultReleaseMode.DELAYED
    result_release_at: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_window(self) -> "AssessmentStep1Request":
        if self.window_start and self.window_end:
            if self.window_end <= self.window_start:
                raise ValueError("window_end must be after window_start.")
        if self.result_release_mode == ResultReleaseMode.SCHEDULED:
            if not self.result_release_at:
                raise ValueError(
                    "result_release_at is required when "
                    "result_release_mode is SCHEDULED."
                )
        if self.passing_marks and self.passing_marks > self.total_marks:
            raise ValueError(
                "passing_marks cannot exceed total_marks."
            )
        return self


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT — STEP 2 (SECURITY SETTINGS)
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentStep2Request(MindexaSchema):
    """
    Wizard Step 2: Security and integrity settings.
    All fields are optional — only provided fields are updated.
    """

    is_password_protected: Optional[bool] = None
    access_password: Optional[str] = Field(
        default=None,
        min_length=4,
        max_length=50,
        description="Plain-text password. Service layer hashes before storage.",
    )
    ai_assistance_allowed: Optional[bool] = None
    is_open_book: Optional[bool] = None
    fullscreen_required: Optional[bool] = None
    integrity_monitoring_enabled: Optional[bool] = None
    randomize_questions: Optional[bool] = Field(default=None, alias="randomise_questions")
    randomize_options: Optional[bool] = Field(default=None, alias="randomise_options")
    is_group_assessment: Optional[bool] = None
    late_submission_allowed: Optional[bool] = None
    late_penalty_percent: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=100.0,
    )
    grace_period_minutes: Optional[int] = Field(
        default=None,
        ge=0,
        le=1440,
    )

    @model_validator(mode="after")
    def password_required_if_protected(self) -> "AssessmentStep2Request":
        if self.is_password_protected is True and not self.access_password:
            raise ValueError(
                "access_password is required when is_password_protected is True."
            )
        return self


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT — STEP 3 (TARGET SECTIONS & SUPERVISORS)
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentStep3Request(MindexaSchema):
    """
    Wizard Step 3: Assign target class sections and supervisors.
    Replaces the entire target section and supervisor list on each call.
    """

    class_section_ids: List[uuid.UUID] = Field(
        min_length=1,
        description="At least one class section must be targeted.",
    )
    supervisors: List["SupervisorAssignRequest"] = Field(
        default_factory=list
    )


class SupervisorAssignRequest(MindexaSchema):
    supervisor_id: uuid.UUID
    supervisor_role: SupervisorRole = SupervisorRole.ASSISTANT


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT — STEP 4 (BLUEPRINT)
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentSectionCreate(MindexaSchema):
    """A section within the assessment blueprint."""

    title: str = Field(min_length=1, max_length=255)
    instructions: Optional[str] = Field(default=None, max_length=2000)
    order_index: int = Field(ge=0)
    marks_allocated: int = Field(ge=0, le=1000)
    question_count_target: Optional[int] = Field(default=None, ge=1)
    allowed_question_types: Optional[List[str]] = None
    difficulty_distribution: Optional[Dict[str, int]] = None
    ai_generation_prompt_hint: Optional[str] = Field(
        default=None, max_length=500
    )


class BlueprintRuleCreate(MindexaSchema):
    """A validation/guidance rule within the assessment blueprint."""

    assessment_section_id: Optional[uuid.UUID] = None
    rule_type: BlueprintRuleType
    question_type: Optional[QuestionType] = None
    difficulty: Optional[DifficultyLevel] = None
    numeric_value: Optional[float] = Field(default=None, ge=0)
    is_enforced: bool = True


class AssessmentStep4Request(MindexaSchema):
    """
    Wizard Step 4: Blueprint sections and rules.
    Replaces all sections and rules on each call.
    """

    sections: List[AssessmentSectionCreate] = Field(min_length=1)
    rules: List[BlueprintRuleCreate] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT — STEP 6 (REVIEW & PUBLISH)
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentPublishRequest(MindexaSchema):
    """
    Wizard Step 6: Trigger publish after human review.
    The lecturer confirms they have reviewed the assessment before publishing.
    """

    lecturer_confirmed_review: bool = Field(
        description="Must be True. Confirms the lecturer has reviewed the assessment."
    )

    @field_validator("lecturer_confirmed_review")
    @classmethod
    def must_confirm(cls, v: bool) -> bool:
        if not v:
            raise ValueError(
                "You must confirm you have reviewed the assessment before publishing."
            )
        return v


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT RESPONSES
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentSectionResponse(BaseAuditedResponse):
    assessment_id: uuid.UUID
    title: str
    instructions: Optional[str]
    order_index: int
    marks_allocated: int
    question_count_target: Optional[int]
    allowed_question_types: Optional[Any]
    difficulty_distribution: Optional[Any]
    ai_generation_prompt_hint: Optional[str]


class AssessmentSummaryResponse(MindexaSchema):
    """Minimal assessment data for list views."""

    id: uuid.UUID
    title: str
    assessment_type: str
    status: str
    total_marks: int
    window_start: Optional[datetime]
    window_end: Optional[datetime]
    created_at: datetime


class AssessmentDetailResponse(BaseAuditedResponse):
    """Full assessment detail — returned after creation and on GET."""

    title: str
    instructions: Optional[str]
    assessment_type: str
    status: str
    course_id: uuid.UUID
    subject_id: Optional[uuid.UUID]
    total_marks: int
    passing_marks: Optional[int]
    duration_minutes: Optional[int]
    window_start: Optional[datetime]
    window_end: Optional[datetime]
    max_attempts: int
    grading_mode: str
    result_release_mode: str
    result_release_at: Optional[datetime]
    is_password_protected: bool
    ai_assistance_allowed: bool
    is_open_book: bool
    fullscreen_required: bool
    integrity_monitoring_enabled: bool
    randomize_questions: bool = Field(serialization_alias="randomise_questions")
    randomize_options: bool = Field(serialization_alias="randomise_options")
    is_group_assessment: bool
    late_submission_allowed: bool
    late_penalty_percent: Optional[float]
    grace_period_minutes: Optional[int]
    draft_step: Optional[int]
    draft_is_complete: bool
    published_at: Optional[datetime]
    sections: List[AssessmentSectionResponse] = Field(default_factory=list)


class AssessmentDraftProgressResponse(BaseAuditedResponse):
    """Response for wizard draft state."""

    assessment_id: uuid.UUID
    step_1_complete: bool
    step_2_complete: bool
    step_3_complete: bool
    step_4_complete: bool
    step_5_complete: bool
    step_6_complete: bool
    last_active_step: int


class AssessmentPublishValidationResponse(BaseAuditedResponse):
    """Response for publish validation check."""

    assessment_id: uuid.UUID
    overall_passed: bool
    validation_results: Any
    checked_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# RUBRIC
# ─────────────────────────────────────────────────────────────────────────────

class RubricCriterionLevelCreate(MindexaSchema):
    label: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    marks: int = Field(ge=0)
    order_index: int = Field(ge=0)


class RubricCriterionCreate(MindexaSchema):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    max_marks: int = Field(ge=1)
    order_index: int = Field(ge=0)
    levels: List[RubricCriterionLevelCreate] = Field(min_length=1)


class RubricCreate(MindexaSchema):
    title: str = Field(min_length=2, max_length=255)
    description: Optional[str] = None
    is_shared: bool = False
    criteria: List[RubricCriterionCreate] = Field(min_length=1)


class RubricCriterionLevelResponse(BaseAuditedResponse):
    criterion_id: uuid.UUID
    label: str
    description: Optional[str]
    marks: int
    order_index: int


class RubricCriterionResponse(BaseAuditedResponse):
    rubric_id: uuid.UUID
    title: str
    description: Optional[str]
    max_marks: int
    order_index: int
    levels: List[RubricCriterionLevelResponse] = Field(default_factory=list)


class RubricResponse(BaseAuditedResponse):
    title: str
    description: Optional[str]
    is_shared: bool
    criteria: List[RubricCriterionResponse] = Field(default_factory=list)
