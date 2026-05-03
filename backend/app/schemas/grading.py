"""
app/schemas/grading.py

Pydantic schemas for grading endpoints.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.db.enums import GradingMode, GradingQueuePriority, GradingQueueStatus

# ---------------------------------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------------------------------


class ManualGradeRequest(BaseModel):
    """
    Body for POST /grading/manual — lecturer submits a grade.
    """
    response_id: uuid.UUID
    score: float = Field(..., ge=0, description="Awarded score. Must be <= max_score.")
    feedback: str | None = Field(
        default=None,
        description="Feedback shown to student after result release",
    )
    internal_notes: str | None = Field(
        default=None,
        description="Private grader notes — never shown to student",
    )
    rubric_scores: list[dict[str, Any]] | None = Field(
        default=None,
        description=(
            'Per-criterion scores: [{"criterion_id": "uuid", '
            '"criterion_title": "Analysis", "score": 7, "max": 10, "feedback": "..."}]'
        ),
    )
    is_final: bool = Field(
        default=True,
        description="False = save draft grade. True = lock the grade.",
    )


class AIGradeConfirmRequest(BaseModel):
    """
    Body for POST /grading/confirm-ai — lecturer confirms or overrides AI suggestion.
    """
    response_id: uuid.UUID
    accept_ai_suggestion: bool = Field(
        ...,
        description="True = use ai_suggested_score as final. False = override below.",
    )
    override_score: float | None = Field(
        default=None,
        ge=0,
        description="Required if accept_ai_suggestion=False",
    )
    feedback: str | None = None
    internal_notes: str | None = None
    rubric_scores: list[dict[str, Any]] | None = None

    @field_validator("override_score")
    @classmethod
    def override_required_when_not_accepting(
        cls, v: float | None, info: Any
    ) -> float | None:
        if not info.data.get("accept_ai_suggestion") and v is None:
            raise ValueError("override_score required when accept_ai_suggestion=False")
        return v


class QueueItemAssignRequest(BaseModel):
    """Assign a queue item to a specific lecturer."""
    assigned_to_id: uuid.UUID
    priority: GradingQueuePriority | None = None


# ---------------------------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------------------------


class RubricScoreDetail(BaseModel):
    """One criterion's score within a rubric-graded response."""
    criterion_id: uuid.UUID
    criterion_title: str
    score: float
    max: float
    feedback: str | None = None


class SubmissionGradeResponse(BaseModel):
    """Full grade detail for one response."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    response_id: uuid.UUID
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    score: float | None
    max_score: float
    grading_mode: GradingMode
    ai_suggested_score: float | None
    ai_rationale: str | None
    ai_confidence: float | None
    lecturer_override: bool
    feedback: str | None
    rubric_scores: list[dict[str, Any]] | None
    is_final: bool
    graded_at: datetime | None
    created_by_id: uuid.UUID | None
    updated_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class GradingQueueItemResponse(BaseModel):
    """One item in the grading queue."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    response_id: uuid.UUID
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    question_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str | None = None
    assessment_title: str | None = None
    status: GradingQueueStatus
    priority: GradingQueuePriority
    grading_mode: GradingMode
    assigned_to_id: uuid.UUID | None
    assigned_at: datetime | None
    completed_at: datetime | None
    ai_pre_graded: bool
    created_at: datetime


class GradingQueueListResponse(BaseModel):
    """Paginated grading queue."""
    items: list[GradingQueueItemResponse]
    total: int
    page: int
    page_size: int


class AttemptGradingSummary(BaseModel):
    """
    Overview of grading progress for one attempt.
    Returned to the supervisor when they open the grading panel.
    """
    attempt_id: uuid.UUID
    total_questions: int
    graded_count: int
    pending_count: int
    auto_graded_count: int
    ai_suggested_count: int
    manual_count: int
    is_fully_graded: bool
