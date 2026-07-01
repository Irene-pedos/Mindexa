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
    review_started_at: datetime | None = Field(
        default=None,
        description="When the lecturer opened the grading UI (for duration tracking)",
    )
    review_duration_seconds: int | None = Field(
        default=None,
        description="Duration of review in seconds (computed by frontend)",
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
    review_started_at: datetime | None = Field(
        default=None,
        description="When the lecturer opened the grading UI",
    )
    review_duration_seconds: int | None = Field(
        default=None,
        description="Duration of review in seconds",
    )

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


class RubricCriterionLevelResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    marks: int
    order_index: int


class RubricCriterionResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    max_marks: int
    order_index: int
    levels: list[RubricCriterionLevelResponse]


class RubricResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    criteria: list[RubricCriterionResponse]


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
    ai_feedback_draft: str | None = None
    ai_feedback_strengths: list[str] | None = None
    ai_feedback_improvements: list[str] | None = None
    ai_feedback_suggestions: list[str] | None = None
    lecturer_override: bool
    feedback: str | None
    feedback_author_basis: str = "LECTURER"
    rubric_scores: list[dict[str, Any]] | None
    is_final: bool
    ai_grading_basis: str | None = None
    is_individually_reviewed: bool = False
    graded_at: datetime | None
    created_by_id: uuid.UUID | None
    updated_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    
    # Contextual extras for grading UI
    question_text: str | None = None
    student_answer: str | None = None
    rubric: RubricResponse | None = None


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
    
    # Dimensions
    class_section_id: uuid.UUID | None = None
    class_section_name: str | None = None
    question_type: str | None = None
    question_title: str | None = None
    
    # Decision State & Metadata
    status: GradingQueueStatus
    priority: GradingQueuePriority
    grading_mode: GradingMode
    ai_pre_graded: bool
    ai_suggested_score: float | None = None
    ai_confidence: float | None = None
    ai_grading_basis: str | None = None
    max_score: float | None = None
    institution_name: str | None = None
    workspace_title: str | None = None
    
    # Risk & Timing
    integrity_risk_score: float | None = None
    is_flagged: bool = False
    submitted_at: datetime | None = None
    
    # Assignments
    assigned_to_id: uuid.UUID | None = None
    assigned_to_name: str | None = None
    assigned_at: datetime | None = None
    completed_at: datetime | None = None
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


class GroupSubmissionSummary(BaseModel):
    """Simplified summary of a group submission for the grading queue."""
    id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    assessment_id: uuid.UUID
    assessment_title: str
    member_count: int
    status: str
    score: float | None = None
    max_score: float | None = None
    submitted_at: datetime | None = None
    has_active_appeal: bool = False


class GroupGradingQueueListResponse(BaseModel):
    """Paginated list of group submissions for grading."""
    items: list[GroupSubmissionSummary]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# MODERATION SCHEMAS
# ---------------------------------------------------------------------------

class ModerationScorePoint(BaseModel):
    score: float
    count: int


class ModerationOutlier(BaseModel):
    response_id: uuid.UUID
    student_name: str
    score: float
    ai_suggested_score: float | None
    deviation: float | None
    risk_score: float


class ModerationStatsResponse(BaseModel):
    """Analytics for a specific question to assist in moderation."""
    question_id: uuid.UUID
    question_title: str
    total_graded: int
    average_score: float
    median_score: float
    score_distribution: list[ModerationScorePoint]
    significant_deviations_count: int
    outliers: list[ModerationOutlier]


class ModerateGradeRequest(BaseModel):
    """Body for POST /grading/moderate — supersede an existing grade."""
    response_id: uuid.UUID
    new_score: float = Field(..., ge=0)
    revision_reason: str = Field(..., min_length=10, max_length=1000)
    feedback_update: str | None = None
    internal_notes: str | None = None


class AIReviewSuggestionResponse(BaseModel):
    status: str
    item_id: uuid.UUID
    response_id: uuid.UUID
    suggested_score: float | None


# ---------------------------------------------------------------------------
# CLASS-CENTRIC GRADING SCHEMAS
# ---------------------------------------------------------------------------

class ClassGradingStats(BaseModel):
    """Grading progress for a single class section."""
    class_id: uuid.UUID
    class_name: str
    workspace_id: uuid.UUID
    workspace_title: str
    total_students: int
    submitted_count: int
    not_submitted_count: int
    pending_review_count: int
    reviewed_count: int
    released_count: int
    latest_submission_at: datetime | None = None


class AssessmentClassStatsResponse(BaseModel):
    """Aggregated grading status for all classes assigned to an assessment."""
    assessment_id: uuid.UUID
    assessment_title: str
    classes: list[ClassGradingStats]


class ClassAiSummaryResponse(BaseModel):
    """AI-generated pedagogical summary for a class's performance."""
    class_id: uuid.UUID
    class_name: str
    average_score: float
    pass_rate: float
    strong_topics: list[str]
    weak_topics: list[str]
    common_mistakes: list[str]
    students_needing_attention: list[dict[str, Any]] # student_id, name, reason
    ai_generated_at: datetime


class VerifyMarksResponse(BaseModel):
    valid: bool
    ungraded_count: int
    unreviewed_bulk_count: int
    errors: list[str] = []


class AIGradeFeedbackRequest(BaseModel):
    submission_grade_id: uuid.UUID
    is_accurate: bool
    comments: str | None = None
