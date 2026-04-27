"""
app/db/schemas/grading.py

Grading, rubric scoring, result release, and appeal schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from app.db.enums import AIGradeDecision, SubmissionGradingMode
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
    feedback: str | None = Field(default=None, max_length=5000)

    # Per-question adjustments if the lecturer changed individual scores
    response_overrides: list[ResponseGradeOverride] = Field(
        default_factory=list
    )


class ResponseGradeOverride(MindexaSchema):
    """Override the score for a specific student response."""

    student_response_id: uuid.UUID
    override_score: float = Field(ge=0)
    override_reason: str | None = Field(default=None, max_length=500)
    ai_grade_decision: AIGradeDecision = AIGradeDecision.ACCEPTED


class GradeReleaseRequest(MindexaSchema):
    """
    Request to release grades for one or more attempts.
    Called by the lecturer or admin when ready to make results visible.
    """

    submission_grade_ids: list[uuid.UUID] = Field(min_length=1)
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
    raw_score: float | None
    final_marks: float | None
    percentage: float | None
    grade_letter: str | None
    is_passing: bool | None
    feedback: str | None
    released_at: datetime | None
    is_current: bool
    score_breakdown: Any | None


# ─────────────────────────────────────────────────────────────────────────────
# RUBRIC GRADING
# ─────────────────────────────────────────────────────────────────────────────

class RubricGradeEntry(MindexaSchema):
    """A single criterion grading entry in a rubric grading session."""

    criterion_id: uuid.UUID
    student_response_id: uuid.UUID | None = None
    selected_level_id: uuid.UUID | None = None
    marks_awarded: float = Field(ge=0)
    feedback: str | None = Field(default=None, max_length=1000)


class RubricGradingRequest(MindexaSchema):
    """Submit rubric grades for a submission."""

    submission_grade_id: uuid.UUID
    grades: list[RubricGradeEntry] = Field(min_length=1)


class RubricGradeResponse(BaseAuditedResponse):
    submission_grade_id: uuid.UUID
    student_response_id: uuid.UUID | None
    criterion_id: uuid.UUID
    selected_level_id: uuid.UUID | None
    marks_awarded: float
    feedback: str | None
    ai_suggested_marks: float | None
    ai_suggestion_rationale: str | None


# ─────────────────────────────────────────────────────────────────────────────
# RESULT APPEAL
# ─────────────────────────────────────────────────────────────────────────────

class ResultAppealCreate(MindexaSchema):
    """Student submits an appeal for a released grade."""

    submission_grade_id: uuid.UUID
    student_statement: str = Field(min_length=20, max_length=3000)
    supporting_evidence: str | None = Field(
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
    new_final_marks: float | None = Field(
        default=None,
        ge=0,
        description="Required when grade_changed is True.",
    )
    new_feedback: str | None = Field(default=None, max_length=5000)

    @field_validator("new_final_marks")
    @classmethod
    def marks_required_if_changed(
        cls, v: float | None, info: object
    ) -> float | None:
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
    reviewer_id: uuid.UUID | None
    review_started_at: datetime | None
    review_completed_at: datetime | None
    reviewer_decision: str | None
    grade_changed: bool | None
