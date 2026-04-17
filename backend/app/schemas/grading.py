"""
app/schemas/grading.py

Pydantic schemas for grading endpoints.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

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
    feedback: Optional[str] = Field(
        default=None,
        description="Feedback shown to student after result release",
    )
    internal_notes: Optional[str] = Field(
        default=None,
        description="Private grader notes — never shown to student",
    )
    rubric_scores: Optional[List[Dict[str, Any]]] = Field(
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
    override_score: Optional[float] = Field(
        default=None,
        ge=0,
        description="Required if accept_ai_suggestion=False",
    )
    feedback: Optional[str] = None
    internal_notes: Optional[str] = None
    rubric_scores: Optional[List[Dict[str, Any]]] = None

    @field_validator("override_score")
    @classmethod
    def override_required_when_not_accepting(
        cls, v: Optional[float], info: Any
    ) -> Optional[float]:
        if not info.data.get("accept_ai_suggestion") and v is None:
            raise ValueError("override_score required when accept_ai_suggestion=False")
        return v


class QueueItemAssignRequest(BaseModel):
    """Assign a queue item to a specific lecturer."""
    assigned_to_id: uuid.UUID
    priority: Optional[GradingQueuePriority] = None


# ---------------------------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------------------------


class RubricScoreDetail(BaseModel):
    """One criterion's score within a rubric-graded response."""
    criterion_id: uuid.UUID
    criterion_title: str
    score: float
    max: float
    feedback: Optional[str] = None


class SubmissionGradeResponse(BaseModel):
    """Full grade detail for one response."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    response_id: uuid.UUID
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    score: Optional[float]
    max_score: float
    grading_mode: GradingMode
    ai_suggested_score: Optional[float]
    ai_rationale: Optional[str]
    ai_confidence: Optional[float]
    lecturer_override: bool
    feedback: Optional[str]
    rubric_scores: Optional[List[Dict[str, Any]]]
    is_final: bool
    graded_at: Optional[datetime]
    created_by_id: Optional[uuid.UUID]
    updated_by_id: Optional[uuid.UUID]
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
    status: GradingQueueStatus
    priority: GradingQueuePriority
    grading_mode: GradingMode
    assigned_to_id: Optional[uuid.UUID]
    assigned_at: Optional[datetime]
    completed_at: Optional[datetime]
    ai_pre_graded: bool
    created_at: datetime


class GradingQueueListResponse(BaseModel):
    """Paginated grading queue."""
    items: List[GradingQueueItemResponse]
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
