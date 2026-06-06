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

    question: str = Field(..., min_length=3, max_length=4000)
    contexts: list[StudentSupportContextRequest] = Field(default_factory=list, max_length=5)

    model_config = {"str_strip_whitespace": True}


class StudentSupportResponse(BaseModel):
    """Validated Student Support Agent response."""

    explanation: str
    revision_plan: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    safety_notice: str | None = None
    model: str
    provider: str
