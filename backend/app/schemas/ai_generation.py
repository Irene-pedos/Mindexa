"""
app/schemas/ai_generation.py

Pydantic schemas for the AI Question Generation domain.
"""

import uuid
from datetime import datetime
from typing import ClassVar, List, Optional

from app.db.enums import AIBatchStatus, AIQuestionDecision
from pydantic import BaseModel, Field, field_validator

# ─── Generation Request ───────────────────────────────────────────────────────


class GenerateQuestionsRequest(BaseModel):
    """
    Request to generate a batch of questions via AI.

    The AI generator uses subject, topic, question_type, difficulty,
    and additional_context to produce structured question output.
    All generated questions require lecturer review before use.
    """

    subject: Optional[str] = Field(default=None, max_length=200)
    topic: Optional[str] = Field(default=None, max_length=200)
    question_type: str = Field(default="mcq")
    difficulty: str = Field(default="medium")
    bloom_level: Optional[str] = None
    count: int = Field(default=5, ge=1, le=20)
    additional_context: Optional[str] = Field(
        default=None,
        description="Extra context for the AI: curriculum notes, learning outcomes, etc."
    )
    assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Optional: link this batch to a specific assessment"
    )

    VALID_TYPES: ClassVar[set[str]] = {
        "mcq", "true_false", "short_answer", "essay",
        "matching", "fill_blank", "computational", "case_study", "ordering"
    }
    VALID_DIFFICULTIES: ClassVar[set[str]] = {"easy", "medium", "hard"}
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

    @field_validator("bloom_level")
    @classmethod
    def validate_bloom(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in cls.VALID_BLOOM:
            raise ValueError(
                f"bloom_level must be one of: {', '.join(sorted(cls.VALID_BLOOM))}"
            )
        return v

    model_config = {"str_strip_whitespace": True}


# ─── Review Request ───────────────────────────────────────────────────────────


class ReviewAIQuestionRequest(BaseModel):
    """
    Lecturer review decision for a single AI-generated question.

    Decisions:
        approved       — Use the question as-is; promote to Question table
        rejected       — Discard; no Question row created
        edited         — Use the modified version; promote edited content
        needs_revision — Flag for later; no action yet
    """

    decision: str = Field(...)
    modified_question_text: Optional[str] = Field(
        default=None,
        description="Required when decision=edited; the corrected question text"
    )
    modified_options_json: Optional[str] = Field(
        default=None,
        description=(
            "JSON array of options with is_correct flags, "
            "required when decision=edited and question has options"
        )
    )
    modified_explanation: Optional[str] = None
    reviewer_notes: Optional[str] = Field(
        default=None,
        description="Optional notes about this review decision"
    )

    # If approving/editing, optionally add to an assessment immediately
    add_to_assessment_id: Optional[uuid.UUID] = None
    marks_if_added: Optional[int] = Field(default=None, ge=1)

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        allowed = {d for d in [
            AIQuestionDecision.APPROVED,
            AIQuestionDecision.REJECTED,
            AIQuestionDecision.EDITED,
            AIQuestionDecision.NEEDS_REVISION,
        ]}
        if v not in allowed:
            raise ValueError(f"decision must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("modified_question_text")
    @classmethod
    def validate_modified_text(cls, v: Optional[str]) -> Optional[str]:
        if v and len(v.strip()) < 5:
            raise ValueError("modified_question_text must be at least 5 characters.")
        return v


# ─── Response Schemas ─────────────────────────────────────────────────────────


class AIGeneratedQuestionResponse(BaseModel):
    id: uuid.UUID
    batch_id: uuid.UUID
    question_type: str
    difficulty: str
    parsed_successfully: bool
    parsed_question_text: Optional[str]
    parsed_options_json: Optional[str]
    parsed_explanation: Optional[str]
    parse_error: Optional[str]
    review_status: str
    promoted_question_id: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class AIQuestionReviewResponse(BaseModel):
    id: uuid.UUID
    ai_question_id: uuid.UUID
    reviewer_id: uuid.UUID
    decision: str
    modified_question_text: Optional[str]
    modified_options_json: Optional[str]
    modified_explanation: Optional[str]
    reviewer_notes: Optional[str]
    reviewed_at: datetime

    model_config = {"from_attributes": True}


class AIGenerationBatchResponse(BaseModel):
    id: uuid.UUID
    created_by_id: uuid.UUID
    assessment_id: Optional[uuid.UUID]
    subject: Optional[str]
    topic: Optional[str]
    question_type: str
    difficulty: str
    bloom_level: Optional[str]
    total_requested: int
    total_generated: int
    total_failed: int
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    ai_model_used: Optional[str]
    ai_provider: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class AIGenerationBatchDetailResponse(AIGenerationBatchResponse):
    generated_questions: List[AIGeneratedQuestionResponse] = []


class AIGenerationBatchListResponse(BaseModel):
    items: List[AIGenerationBatchResponse]
    total: int
    page: int
    page_size: int
    has_next: bool
