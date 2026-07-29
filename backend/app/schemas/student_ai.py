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

    model_config = {"str_strip_whitespace": True}


class StudentSupportResponse(BaseModel):
    """Validated Student Support Agent response."""

    explanation: str
    citations: list[dict] = Field(default_factory=list)
    fallback_used: bool = False
    model: str | None = None
    provider: str | None = None
