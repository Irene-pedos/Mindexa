"""
app/schemas/question.py

Pydantic schemas for the Question Bank domain.
"""

import uuid
from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, Field, field_validator

# ─── Question Option Schemas ──────────────────────────────────────────────────


class QuestionOptionCreate(BaseModel):
    option_text: str = Field(..., min_length=1)
    option_text_right: str | None = None  # For matching questions
    is_correct: bool = False
    order_index: int = Field(default=0, ge=0)
    explanation: str | None = None


class QuestionOptionResponse(BaseModel):
    id: uuid.UUID
    question_id: uuid.UUID
    option_text: str
    option_text_right: str | None
    is_correct: bool
    order_index: int
    explanation: str | None

    model_config = {"from_attributes": True}


# ─── Question Tag Schemas ─────────────────────────────────────────────────────


class QuestionTagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)

    @field_validator("name")
    @classmethod
    def normalize_tag_name(cls, v: str) -> str:
        return v.strip().lower()


class QuestionTagResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}


# ─── Question Create / Update ─────────────────────────────────────────────────


class QuestionCreateRequest(BaseModel):
    content: str = Field(
        ..., min_length=5,
        description="The question stem / prompt text"
    )
    explanation: str | None = None
    hint: str | None = None
    question_type: str = Field(...)
    difficulty: str = Field(default="medium")
    grading_mode: str | None = None
    subject: str | None = Field(default=None, max_length=200)
    topic: str | None = Field(default=None, max_length=200)
    bloom_level: str | None = None
    suggested_marks: int | None = Field(default=None, ge=1)
    estimated_time_minutes: int | None = Field(default=None, ge=1)
    fill_blank_template: str | None = None
    correct_order_json: str | None = None
    options: list[QuestionOptionCreate] = Field(default_factory=list)
    tag_names: list[str] = Field(
        default_factory=list,
        description="Tag names to attach (created if they don't exist)"
    )

    VALID_TYPES: ClassVar[set[str]] = {
        "mcq", "true_false", "short_answer", "essay",
        "matching", "fill_blank", "computational", "case_study", "ordering"
    }
    VALID_DIFFICULTIES: ClassVar[set[str]] = {"easy", "medium", "hard"}
    VALID_GRADING_MODES: ClassVar[set[str]] = {
        "auto", "semi_auto", "manual", "ai_assisted", "hybrid"
    }
    VALID_BLOOM: ClassVar[set[str]] = {
        "remember", "understand", "apply", "analyze", "evaluate", "create"
    }

    @field_validator("question_type")
    @classmethod
    def validate_question_type(cls, v: str) -> str:
        if v not in cls.VALID_TYPES:
            raise ValueError(
                f"question_type must be one of: {', '.join(sorted(cls.VALID_TYPES))}"
            )
        return v

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v: str) -> str:
        if v not in cls.VALID_DIFFICULTIES:
            raise ValueError(
                f"difficulty must be one of: {', '.join(sorted(cls.VALID_DIFFICULTIES))}"
            )
        return v

    @field_validator("grading_mode")
    @classmethod
    def validate_grading_mode(cls, v: str | None) -> str | None:
        if v and v not in cls.VALID_GRADING_MODES:
            raise ValueError(
                f"grading_mode must be one of: {', '.join(sorted(cls.VALID_GRADING_MODES))}"
            )
        return v

    @field_validator("bloom_level")
    @classmethod
    def validate_bloom(cls, v: str | None) -> str | None:
        if v and v not in cls.VALID_BLOOM:
            raise ValueError(
                f"bloom_level must be one of: {', '.join(sorted(cls.VALID_BLOOM))}"
            )
        return v

    model_config = {"str_strip_whitespace": True}


class QuestionUpdateRequest(BaseModel):
    """
    Update a question (creates a new version — the original is archived).
    All fields are optional — only provided fields are changed.
    """

    content: str | None = Field(default=None, min_length=5)
    explanation: str | None = None
    hint: str | None = None
    difficulty: str | None = None
    grading_mode: str | None = None
    subject: str | None = Field(default=None, max_length=200)
    topic: str | None = Field(default=None, max_length=200)
    bloom_level: str | None = None
    suggested_marks: int | None = Field(default=None, ge=1)
    estimated_time_minutes: int | None = Field(default=None, ge=1)
    fill_blank_template: str | None = None
    correct_order_json: str | None = None
    options: list[QuestionOptionCreate] | None = None
    tag_names: list[str] | None = None
    create_new_version: bool = Field(
        default=True,
        description=(
            "True (default) = archive current and create new version. "
            "False = update in place (no version history — use carefully)."
        )
    )

    model_config = {"str_strip_whitespace": True}


class AttachTagsRequest(BaseModel):
    tag_names: list[str] = Field(
        ..., min_length=1,
        description="Tag names to attach (created if they don't exist)"
    )


class DetachTagsRequest(BaseModel):
    tag_names: list[str] = Field(..., min_length=1)


# ─── Question Response Schemas ────────────────────────────────────────────────


class QuestionSummaryResponse(BaseModel):
    """Lightweight response for list/search views."""

    id: uuid.UUID
    content: str
    question_type: str
    difficulty: str
    grading_mode: str
    status: str
    subject: str | None
    topic: str | None
    bloom_level: str | None
    suggested_marks: int | None
    is_active: bool
    source_type: str
    version_number: int
    parent_question_id: uuid.UUID | None
    created_by_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionDetailResponse(BaseModel):
    """Full response including options and tags."""

    id: uuid.UUID
    content: str
    explanation: str | None
    hint: str | None
    question_type: str
    difficulty: str
    grading_mode: str
    status: str
    source_type: str
    subject: str | None
    topic: str | None
    bloom_level: str | None
    suggested_marks: int | None
    estimated_time_minutes: int | None
    fill_blank_template: str | None
    correct_order_json: str | None
    is_active: bool
    version_number: int
    parent_question_id: uuid.UUID | None
    created_by_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    options: list[QuestionOptionResponse] = []
    tags: list[QuestionTagResponse] = []

    model_config = {"from_attributes": True}


class QuestionListResponse(BaseModel):
    items: list[QuestionSummaryResponse]
    total: int
    page: int
    page_size: int
    has_next: bool


# ─── Search / Filter ──────────────────────────────────────────────────────────


class QuestionSearchParams(BaseModel):
    q: str | None = Field(
        default=None,
        description="Full-text search on question content"
    )
    question_type: str | None = None
    difficulty: str | None = None
    subject: str | None = None
    topic: str | None = None
    bloom_level: str | None = None
    source_type: str | None = None
    tag_names: list[str] | None = None
    is_active: bool | None = Field(default=True)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
