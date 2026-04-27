"""
app/db/schemas/question.py

Question bank schemas: all question types, options, blanks, AI generation.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field, model_validator

from app.db.enums import AIQuestionDecision, DifficultyLevel, QuestionType
from app.db.schemas.base import BaseAuditedResponse, MindexaSchema

# ─────────────────────────────────────────────────────────────────────────────
# QUESTION OPTIONS (for MCQ, T/F, Matching, Ordering)
# ─────────────────────────────────────────────────────────────────────────────

class QuestionOptionCreate(MindexaSchema):
    content: str = Field(min_length=1, max_length=2000)
    is_correct: bool | None = None
    match_key: str | None = Field(default=None, max_length=500)
    match_value: str | None = Field(default=None, max_length=500)
    order_index: int = Field(ge=0)


class QuestionOptionResponse(BaseAuditedResponse):
    question_id: uuid.UUID
    content: str
    is_correct: bool | None
    match_key: str | None
    match_value: str | None
    order_index: int


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION BLANKS (for Fill-in-the-blank)
# ─────────────────────────────────────────────────────────────────────────────

class QuestionBlankCreate(MindexaSchema):
    blank_index: int = Field(ge=0)
    accepted_answers: list[str] = Field(
        min_length=1,
        description="List of acceptable answers for this blank.",
    )
    case_sensitive: bool = False


class QuestionBlankResponse(BaseAuditedResponse):
    question_id: uuid.UUID
    blank_index: int
    accepted_answers: list[str]
    case_sensitive: bool


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION CREATE / UPDATE
# ─────────────────────────────────────────────────────────────────────────────

class QuestionCreate(MindexaSchema):
    """
    Create a question manually.
    Options and blanks are provided inline and created together with the question.
    """

    subject_id: uuid.UUID | None = None
    question_type: QuestionType
    content: str = Field(min_length=5, max_length=5000)
    explanation: str | None = Field(default=None, max_length=2000)
    marks: int = Field(default=1, ge=1, le=100)
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    topic_tag: str | None = Field(default=None, max_length=100)
    is_shared: bool = False

    # Inline content for relevant question types
    options: list[QuestionOptionCreate] = Field(default_factory=list)
    blanks: list[QuestionBlankCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_type_content(self) -> QuestionCreate:
        """
        Ensure content matches the question type requirements.
        Service layer does deeper validation; schema does structural checks.
        """
        closed_types = {
            QuestionType.MCQ,
            QuestionType.TRUE_FALSE,
            QuestionType.MATCHING,
            QuestionType.ORDERING,
        }
        if self.question_type in closed_types and not self.options:
            raise ValueError(
                f"{self.question_type} questions require at least one option."
            )
        if self.question_type == QuestionType.FILL_BLANK and not self.blanks:
            raise ValueError(
                "Fill-in-the-blank questions require at least one blank definition."
            )
        if self.question_type == QuestionType.TRUE_FALSE and len(self.options) != 2:
            raise ValueError(
                "True/False questions must have exactly two options."
            )
        return self


class QuestionUpdate(MindexaSchema):
    """Partial update for a question. Only provided fields are changed."""

    content: str | None = Field(default=None, min_length=5, max_length=5000)
    explanation: str | None = Field(default=None, max_length=2000)
    marks: int | None = Field(default=None, ge=1, le=100)
    difficulty: DifficultyLevel | None = None
    topic_tag: str | None = Field(default=None, max_length=100)
    is_shared: bool | None = None
    options: list[QuestionOptionCreate] | None = None
    blanks: list[QuestionBlankCreate] | None = None


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION RESPONSES
# ─────────────────────────────────────────────────────────────────────────────

class QuestionSummaryResponse(MindexaSchema):
    """Minimal question data for bank list views."""

    id: uuid.UUID
    question_type: str
    content: str
    marks: int
    difficulty: str
    topic_tag: str | None
    is_approved: bool
    source_type: str
    created_at: datetime


class QuestionDetailResponse(BaseAuditedResponse):
    """Full question data including options and blanks."""

    subject_id: uuid.UUID | None
    question_type: str
    content: str
    explanation: str | None
    marks: int
    difficulty: str
    topic_tag: str | None
    source_type: str
    is_approved: bool
    is_shared: bool
    is_in_question_bank: bool
    version: int
    parent_question_id: uuid.UUID | None
    options: list[QuestionOptionResponse] = Field(default_factory=list)
    blanks: list[QuestionBlankResponse] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT QUESTION (junction)
# ─────────────────────────────────────────────────────────────────────────────

class AddQuestionToAssessmentRequest(MindexaSchema):
    """Add an existing bank question to an assessment."""

    question_id: uuid.UUID
    assessment_section_id: uuid.UUID | None = None
    order_index: int = Field(ge=0)
    marks_override: int | None = Field(default=None, ge=1, le=100)
    is_required: bool = True


class AssessmentQuestionResponse(BaseAuditedResponse):
    assessment_id: uuid.UUID
    question_id: uuid.UUID
    assessment_section_id: uuid.UUID | None
    order_index: int
    marks_override: int | None
    is_required: bool
    added_via: str
    question: QuestionSummaryResponse | None = None


# ─────────────────────────────────────────────────────────────────────────────
# AI QUESTION GENERATION
# ─────────────────────────────────────────────────────────────────────────────

class AIGenerationRequest(MindexaSchema):
    """Request to start an AI question generation batch."""

    assessment_id: uuid.UUID
    assessment_section_id: uuid.UUID | None = None
    question_type: QuestionType | None = None
    difficulty: DifficultyLevel | None = None
    count_requested: int = Field(default=5, ge=1, le=20)
    custom_prompt_hint: str | None = Field(default=None, max_length=500)


class AIQuestionReviewDecision(MindexaSchema):
    """Lecturer decision on a single AI-generated candidate."""

    question_id: uuid.UUID
    decision: AIQuestionDecision
    modification_summary: str | None = Field(default=None, max_length=500)
    add_to_assessment: bool = False
    add_to_bank: bool = False

    # If decision is ACCEPTED or MODIFIED, the modified content (if any)
    updated_content: str | None = Field(default=None, max_length=5000)
    updated_explanation: str | None = Field(default=None, max_length=2000)
    updated_marks: int | None = Field(default=None, ge=1, le=100)


class AIGenerationBatchResponse(BaseAuditedResponse):
    assessment_id: uuid.UUID
    assessment_section_id: uuid.UUID | None
    status: str
    count_requested: int
    count_generated: int
    review_completed: bool
    review_completed_at: datetime | None


class AIQuestionReviewResponse(BaseAuditedResponse):
    batch_id: uuid.UUID
    question_id: uuid.UUID
    candidate_order: int
    lecturer_decision: str
    decided_at: datetime | None
    added_to_assessment: bool
    added_to_bank: bool
    question: QuestionDetailResponse | None = None
