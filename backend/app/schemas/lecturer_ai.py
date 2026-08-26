from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

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
        description="Mode: 'chat', 'content', 'review', 'feedback', 'analytics', 'insights'",
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
