"""
app/schemas/ai_generation.py

Pydantic schemas for the AI Question Generation domain.
"""

import uuid
from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, Field, field_validator, computed_field

from app.db.enums import AIQuestionDecision

# ─── Generation Request ───────────────────────────────────────────────────────


class GenerateQuestionsSectionRequest(BaseModel):
    section_id: uuid.UUID
    topic: str | None = Field(default=None, max_length=200)
    question_type: str = Field(default="mcq")
    type: str | None = Field(default=None, description="Alias for question_type")
    difficulty: str = Field(default="medium")
    bloom_level: str | None = None
    count: int = Field(default=5, ge=1, le=20)
    marks_per_question: int | None = Field(default=None, ge=1)

    @field_validator("question_type")
    @classmethod
    def validate_question_type(cls, v: str) -> str:
        if v not in GenerateQuestionsRequest.VALID_TYPES:
            raise ValueError(
                f"question_type must be one of: {', '.join(sorted(GenerateQuestionsRequest.VALID_TYPES))}"
            )
        return v

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str | None) -> str | None:
        if v and v not in GenerateQuestionsRequest.VALID_TYPES:
            raise ValueError(
                f"type must be one of: {', '.join(sorted(GenerateQuestionsRequest.VALID_TYPES))}"
            )
        return v

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v: str) -> str:
        v_lower = v.strip().lower()
        if v_lower not in GenerateQuestionsRequest.VALID_DIFFICULTIES:
            raise ValueError(
                f"difficulty must be one of: {', '.join(sorted(GenerateQuestionsRequest.VALID_DIFFICULTIES))}"
            )
        return v_lower

    @field_validator("bloom_level")
    @classmethod
    def validate_bloom(cls, v: str | None) -> str | None:
        if v:
            v_lower = v.strip().lower()
            if v_lower not in GenerateQuestionsRequest.VALID_BLOOM:
                raise ValueError(
                    f"bloom_level must be one of: {', '.join(sorted(GenerateQuestionsRequest.VALID_BLOOM))}"
                )
            return v_lower
        return v


class GenerateQuestionsRequest(BaseModel):
    """
    Request to generate a batch of questions via AI.

    The AI generator uses subject, topic, question_type, difficulty,
    bloom_level, course_material_context (from RAG), blueprint_constraints,
    and learning_outcomes to produce structured, grounded question output.
    All generated questions require lecturer review before use.
    """

    subject: str | None = Field(default=None, max_length=200)
    topic: str | None = Field(default=None, max_length=200)
    question_type: str = Field(default="mcq")
    difficulty: str = Field(default="medium")
    bloom_level: str | None = None
    count: int = Field(default=5, ge=1, le=20)
    additional_context: str | None = Field(
        default=None,
        description="Extra context for the AI: curriculum notes, learning outcomes, etc."
    )
    # Link to assessment (required to enforce safety rules — AI never touches finalized assessments)
    assessment_id: uuid.UUID | None = Field(
        default=None,
        description="Link this batch to a specific draft assessment (optional during early generation)"
    )
    target_assessment_id: uuid.UUID | None = Field(
        default=None,
        description="Alias for assessment_id"
    )
    target_section_id: uuid.UUID | None = Field(
        default=None,
        description="Optional: link this batch to a specific section of the assessment"
    )
    sections: list[GenerateQuestionsSectionRequest] | None = Field(
        default=None,
        description="Optional list of section requirements to generate for in a single batch"
    )
    # RAG source: which workspace's uploaded materials to retrieve context from
    teaching_workspace_id: uuid.UUID | None = Field(
        default=None,
        description="Teaching workspace ID — used to retrieve uploaded course materials for RAG grounding"
    )
    workspace_id: uuid.UUID | None = Field(
        default=None,
        description="Alias for teaching_workspace_id"
    )
    # Blueprint alignment
    blueprint_constraints: str | None = Field(
        default=None,
        description="Blueprint rules: marks allocation, difficulty distribution, weighting per section"
    )
    learning_outcomes: str | None = Field(
        default=None,
        description="Course learning outcomes that the questions must address"
    )
    marks_per_question: int | None = Field(
        default=None,
        ge=1,
        description="Marks allocated per question, from the blueprint"
    )

    VALID_TYPES: ClassVar[set[str]] = {
        "mcq", "true_false", "short_answer", "essay",
        "matching", "fill_blank", "computational", "case_study", "ordering", "practical"
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
        v_lower = v.strip().lower()
        if v_lower not in cls.VALID_DIFFICULTIES:
            raise ValueError(
                f"difficulty must be one of: {', '.join(sorted(cls.VALID_DIFFICULTIES))}"
            )
        return v_lower

    @field_validator("bloom_level")
    @classmethod
    def validate_bloom(cls, v: str | None) -> str | None:
        if v:
            v_lower = v.strip().lower()
            if v_lower not in cls.VALID_BLOOM:
                raise ValueError(
                    f"bloom_level must be one of: {', '.join(sorted(cls.VALID_BLOOM))}"
                )
            return v_lower
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
    modified_question_text: str | None = Field(
        default=None,
        description="Required when decision=edited; the corrected question text"
    )
    modified_options_json: str | None = Field(
        default=None,
        description=(
            "JSON array of options with is_correct flags, "
            "required when decision=edited and question has options"
        )
    )
    modified_explanation: str | None = None
    reviewer_notes: str | None = Field(
        default=None,
        description="Optional notes about this review decision"
    )

    # If approving/editing, optionally add to an assessment immediately
    add_to_assessment_id: uuid.UUID | None = None
    add_to_section_id: uuid.UUID | None = None
    marks_if_added: int | None = Field(default=None, ge=1)
    save_to_bank: bool = Field(
        default=False,
        description="Optionally save the approved/edited question to the lecturer's reusable question bank"
    )

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("decision must be a string")
        v_upper = v.strip().upper()
        mapping = {
            "APPROVED": "ACCEPTED",
            "EDITED": "MODIFIED",
            "REJECTED": "REJECTED",
            "NEEDS_REVISION": "NEEDS_REVISION",
            "ACCEPTED": "ACCEPTED",
            "MODIFIED": "MODIFIED",
        }
        mapped = mapping.get(v_upper, v_upper)
        allowed = {"ACCEPTED", "MODIFIED", "REJECTED", "NEEDS_REVISION"}
        if mapped not in allowed:
            raise ValueError(f"decision must be one of: {', '.join(sorted(allowed))}")
        return mapped

    @field_validator("modified_question_text")
    @classmethod
    def validate_modified_text(cls, v: str | None) -> str | None:
        if v and len(v.strip()) < 5:
            raise ValueError("modified_question_text must be at least 5 characters.")
        return v


# ─── Response Schemas ─────────────────────────────────────────────────────────


class AIGeneratedQuestionResponse(BaseModel):
    id: uuid.UUID
    batch_id: uuid.UUID
    target_section_id: uuid.UUID | None = None
    question_type: str
    difficulty: str
    parsed_successfully: bool
    parsed_question_text: str | None
    parsed_options_json: str | None
    parsed_explanation: str | None
    parse_error: str | None
    review_status: str
    promoted_question_id: uuid.UUID | None = None
    # True  → grounded in lecturer's uploaded course materials (RAG)
    # False → generated from the AI model's general knowledge
    grounded_by_rag: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def options(self) -> list[dict]:
        import json
        if not self.parsed_options_json:
            return []
        try:
            return json.loads(self.parsed_options_json)
        except Exception:
            return []


class AIQuestionReviewResponse(BaseModel):
    id: uuid.UUID
    ai_question_id: uuid.UUID
    reviewer_id: uuid.UUID
    decision: str
    modified_question_text: str | None
    modified_options_json: str | None
    modified_explanation: str | None
    reviewer_notes: str | None
    reviewed_at: datetime

    model_config = {"from_attributes": True}


class AIGenerationBatchResponse(BaseModel):
    id: uuid.UUID
    created_by_id: uuid.UUID
    assessment_id: uuid.UUID | None
    subject: str | None
    topic: str | None
    question_type: str
    difficulty: str
    bloom_level: str | None
    total_requested: int
    total_generated: int
    total_failed: int
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    ai_model_used: str | None
    ai_provider: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AIGenerationBatchDetailResponse(AIGenerationBatchResponse):
    generated_questions: list[AIGeneratedQuestionResponse] = []


class AIGenerationBatchListResponse(BaseModel):
    items: list[AIGenerationBatchResponse]
    total: int
    page: int
    page_size: int
    has_next: bool
