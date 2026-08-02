from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field


class StudentSupportContextRequest(BaseModel):
    """Approved context snippet supplied by the service layer or client workflow."""

    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1, max_length=2000)
    source_type: Literal[
        "approved_study_material",
        "course_notes",
        "lecturer_material",
        "student_notes",
    ] = "approved_study_material"
    assessment_id: uuid.UUID | None = None

    model_config = {"str_strip_whitespace": True}


class StudentSupportRequest(BaseModel):
    """Student Support Agent request."""

    question: str = Field(..., min_length=1, max_length=64000)
    conversation_history: list[dict] = Field(default_factory=list)
    selected_resource_id: uuid.UUID | None = Field(default=None, description="Scope query to single resource")
    selected_resource_ids: list[uuid.UUID] = Field(default_factory=list, description="Scope query to multiple resources")
    teaching_workspace_id: uuid.UUID | None = Field(default=None, description="Scope RAG retrieval to specific course workspace")
    thinking_mode: bool = Field(default=False, description="Enable Chain-of-Thought deep reasoning with larger token budget")
    deep_search_mode: bool = Field(default=False, description="Enable expanded RAG search (top_k=16 multi-chunk retrieval)")

    model_config = {"str_strip_whitespace": True}


class StudentSupportResponse(BaseModel):
    """Validated Student Support Agent response."""

    explanation: str
    citations: list[dict] = Field(default_factory=list)
    fallback_used: bool = False
    model: str | None = None
    provider: str | None = None


class RevisionGuideRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    teaching_workspace_id: uuid.UUID | None = None

    model_config = {"str_strip_whitespace": True}


class RevisionGuideOutput(BaseModel):
    summary: str = Field(..., description="Comprehensive summary of key concepts")
    checklist: list[str] = Field(default_factory=list, description="Actionable revision checklist items")
    readings: list[str] = Field(default_factory=list, description="Recommended course reading materials & topics")


class StudentChatHistoryItem(BaseModel):
    id: uuid.UUID
    question: str
    answer: str
    citations: list[dict] = Field(default_factory=list)
    created_at: str
