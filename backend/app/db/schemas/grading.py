"""
app/db/schemas/grading.py

Grading, rubric scoring, result release, and appeal schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import Field, field_validator

from app.db.enums import AIGradeDecision, AppealStatus, SubmissionGradingMode
from app.db.schemas.base import BaseAuditedResponse, MindexaSchema

# ─────────────────────────────────────────────────────────────────────────────
# SUBMISSION GRADE
# ─────────────────────────────────────────────────────────────────────────────

class GradeConfirmRequest(MindexaSchema):
    """
    Lecturer confirms or overrides AI-suggested grades for a submission.
    This creates the final SubmissionGrade row.
    """

    attempt_id: uuid.UUID
    final_marks: float = Field(ge=0)
    grading_mode: SubmissionGradingMode
    feedback: Optional[str] = Field(default=None, max_length=5000)

    # Per-question adjustments if the lecturer changed individual scores
    response_overrides: List["ResponseGradeOverride"] = Field(
        default_factory=list
    )


class ResponseGradeOverride(MindexaSchema):
    """Override the score for a specific student response."""

    student_response_id: uuid.UUID
    override_score: float = Field(ge=0)
    override_reason: Optional[str] = Field(default=None, max_length=500)
    ai_grade_decision: AIGradeDecision = AIGradeDecision.ACCEPTED


class GradeReleaseRequest(MindexaSchema):
    """
    Request to release grades for one or more attempts.
    Called by the lecturer or admin when ready to make results visible.
    """

    submission_grade_ids: List[uuid.UUID] = Field(min_length=1)
    release_feedback: bool = Field(
        default=True,
        description="Whether to release lecturer feedback along with the grade.",
    )


class SubmissionGradeResponse(BaseAuditedResponse):
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    submission_status: str
    grading_mode: str
    raw_score: Optional[float]
    final_marks: Optional[float]
    percentage: Optional[float]
    grade_letter: Optional[str]
    is_passing: Optional[bool]
    feedback: Optional[str]
    released_at: Optional[datetime]
    is_current: bool
    score_breakdown: Optional[Any]


# ─────────────────────────────────────────────────────────────────────────────
# RUBRIC GRADING
# ─────────────────────────────────────────────────────────────────────────────

class RubricGradeEntry(MindexaSchema):
    """A single criterion grading entry in a rubric grading session."""

    criterion_id: uuid.UUID
    student_response_id: Optional[uuid.UUID] = None
    selected_level_id: Optional[uuid.UUID] = None
    marks_awarded: float = Field(ge=0)
    feedback: Optional[str] = Field(default=None, max_length=1000)


class RubricGradingRequest(MindexaSchema):
    """Submit rubric grades for a submission."""

    submission_grade_id: uuid.UUID
    grades: List[RubricGradeEntry] = Field(min_length=1)


class RubricGradeResponse(BaseAuditedResponse):
    submission_grade_id: uuid.UUID
    student_response_id: Optional[uuid.UUID]
    criterion_id: uuid.UUID
    selected_level_id: Optional[uuid.UUID]
    marks_awarded: float
    feedback: Optional[str]
    ai_suggested_marks: Optional[float]
    ai_suggestion_rationale: Optional[str]


# ─────────────────────────────────────────────────────────────────────────────
# RESULT APPEAL
# ─────────────────────────────────────────────────────────────────────────────

class ResultAppealCreate(MindexaSchema):
    """Student submits an appeal for a released grade."""

    submission_grade_id: uuid.UUID
    student_statement: str = Field(min_length=20, max_length=3000)
    supporting_evidence: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Optional description or references to supporting materials.",
    )


class AppealReviewDecision(MindexaSchema):
    """Lecturer or admin submits their decision on an appeal."""

    reviewer_decision: str = Field(
        min_length=10,
        max_length=2000,
        description="The lecturer's written decision explaining the outcome.",
    )
    grade_changed: bool
    new_final_marks: Optional[float] = Field(
        default=None,
        ge=0,
        description="Required when grade_changed is True.",
    )
    new_feedback: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("new_final_marks")
    @classmethod
    def marks_required_if_changed(
        cls, v: Optional[float], info: object
    ) -> Optional[float]:
        data = getattr(info, "data", {})
        if data.get("grade_changed") and v is None:
            raise ValueError(
                "new_final_marks is required when grade_changed is True."
            )
        return v


class ResultAppealResponse(BaseAuditedResponse):
    student_id: uuid.UUID
    submission_grade_id: uuid.UUID
    assessment_id: uuid.UUID
    student_statement: str
    status: str
    submitted_at: datetime
    reviewer_id: Optional[uuid.UUID]
    review_started_at: Optional[datetime]
    review_completed_at: Optional[datetime]
    reviewer_decision: Optional[str]
    grade_changed: Optional[bool]
