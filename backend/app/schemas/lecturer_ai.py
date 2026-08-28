from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.agents.rubric_agent import RubricCriterionDraft, RubricDraftOutput
from app.agents.slide_deck_agent import SlideDeckOutput
from app.db.schemas.rag import SourceCitation


class LecturerSupportRequest(BaseModel):
    """Lecturer Support Agent request."""

    workspace_id: uuid.UUID = Field(..., description="The active teaching workspace ID")
    question: str = Field(..., min_length=1, max_length=64000, description="Lecturer question")
    conversation_id: Optional[uuid.UUID] = Field(
        default=None, description="Optional conversation thread ID"
    )
    mode: str = Field(
        default="chat",
        description="Mode: 'chat', 'questions', 'slides', 'rubric', 'digest'",
    )
    selected_material_ids: Optional[List[uuid.UUID]] = Field(
        default=None, description="Optional selected material IDs to filter RAG"
    )
    conversation_history: List[Dict[str, Any]] = Field(
        default_factory=list, description="Prior conversation turns"
    )
    feature_payload: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional extra parameters for specific modes"
    )

    model_config = {"str_strip_whitespace": True}


class LecturerSupportResponse(BaseModel):
    """Lecturer Support Agent response."""

    answer: str
    conversation_id: Optional[uuid.UUID] = None
    citations: List[SourceCitation] = Field(default_factory=list)
    fallback_used: bool = False
    selected_sources: List[str] = Field(default_factory=list)
    mode: str
    model: Optional[str] = None
    provider: Optional[str] = None


# ─── Slide Deck Schemas ───────────────────────────────────────────────────────

class LearningUnitItemResponse(BaseModel):
    id: uuid.UUID
    order_index: int
    title: str
    summary: Optional[str] = None
    learning_outcomes: List[str] = Field(default_factory=list)
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    source_material_id: Optional[uuid.UUID] = None
    estimated_study_minutes: int = 45
    chunk_count: int = 0


class SlideDeckGenerateRequest(BaseModel):
    estimated_minutes: int = Field(default=45, ge=5, le=180)
    selected_outcomes: Optional[List[str]] = Field(default=None, description="Optional subset of learning outcomes to emphasize in the deck")


class SlideDeckGenerateResponse(BaseModel):
    learning_unit_id: uuid.UUID
    unit_title: str
    deck: SlideDeckOutput


class SlideDeckExportRequest(BaseModel):
    deck: SlideDeckOutput


# ─── Rubric Assistant Schemas ─────────────────────────────────────────────────

class RubricDraftRequest(BaseModel):
    question_id: uuid.UUID
    total_marks: Optional[int] = Field(default=None, ge=1, le=100)
    existing_rubric: Optional[str] = Field(default=None, max_length=5000)


class RubricDraftResponse(BaseModel):
    question_id: uuid.UUID
    rubric: RubricDraftOutput


class RubricSaveRequest(BaseModel):
    question_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    criteria: List[RubricCriterionDraft] = Field(..., min_length=1)


class RubricSaveResponse(BaseModel):
    question_id: uuid.UUID
    rubric_id: uuid.UUID
    title: str
    criteria_count: int
    message: str
