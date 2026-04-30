"""
app/db/models/result.py

Assessment result models for Mindexa Platform.

Tables:
    assessment_result   — One row per attempt. The final computed result
                          for a student's attempt. Released to student per
                          the assessment's result_release_mode.
    result_breakdown    — Per-question score detail within a result.
                          Enables per-question feedback view.

Design decisions:
    ASSESSMENT RESULT:
    - One row per attempt (1:1 with AssessmentAttempt via unique constraint).
    - Created/updated by result_service.calculate_result() once all
      SubmissionGrade.is_final rows exist for the attempt.
    - is_released=False until the lecturer/system releases results.
    - letter_grade computed from percentage using institution grade bands.
    - is_passing: percentage >= assessment.passing_marks / assessment.total_marks * 100
    - integrity_hold: True if any CONFIRMED integrity flag blocks release.

    RESULT BREAKDOWN:
    - One row per (result, question) pair.
    - score / max_score stored for efficient per-question display.
    - feedback duplicated from submission_grade.feedback for fast read-path.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Column, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, Relationship

from app.db.base import BaseModel, utcnow
from app.db.enums import ResultLetterGrade
from app.db.mixins import composite_index

if TYPE_CHECKING:
    from app.db.models.attempt import AssessmentAttempt


class AssessmentResult(BaseModel, table=True):
    """
    The final computed result for one student attempt.

    LIFECYCLE:
        1. All SubmissionGrade rows for the attempt become is_final=True.
        2. result_service.calculate_result() sums scores, computes percentage,
           assigns letter_grade, sets is_passing, creates this row.
        3. Row sits with is_released=False until release is triggered.
        4. On release: is_released=True, released_at=now, and the student
           receives a notification.

    INTEGRITY HOLD:
        If integrity_hold=True the result is blocked from release even if
        is_released would otherwise be set. The hold is lifted by a lecturer
        or admin who resolves the pending integrity flags.

    GRADE BANDS (configured per institution — enforced at service layer):
        A+  >= 90%      B+  >= 75%      C+  >= 60%      D  >= 50%
        A   >= 85%      B   >= 70%      C   >= 55%      F  <  50%
        A-  >= 80%      B-  >= 65%      C-  >= 50%
    """

    __tablename__ = "assessment_result"

    __table_args__ = (
        UniqueConstraint("attempt_id", name="uq_assessment_result_attempt"),
        composite_index("assessment_result", "attempt_id"),
        composite_index("assessment_result", "is_released"),
        composite_index("assessment_result", "is_released", "integrity_hold"),
    )

    attempt_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    # Denormalised — avoids joins on every student dashboard read
    student_id: uuid.UUID = Field(nullable=False)
    assessment_id: uuid.UUID = Field(nullable=False)

    # -- Score ----------------------------------------------------------------

    total_score: float = Field(
        nullable=False,
        description="Sum of all final submission_grade.score values",
    )
    max_score: float = Field(
        nullable=False,
        description="Sum of all effective max_score values for the assessment",
    )
    percentage: float = Field(
        nullable=False,
        description="(total_score / max_score) * 100, rounded to 2dp",
    )
    letter_grade: ResultLetterGrade | None = Field(
        default=None,
        nullable=True,
        description="Computed from percentage using institution grade bands",
    )
    is_passing: bool = Field(
        default=False,
        nullable=False,
        description="True if percentage >= the assessment's pass threshold",
    )

    # -- Release state --------------------------------------------------------

    is_released: bool = Field(
        default=False,
        nullable=False,
        description="False until lecturer/system triggers result release",
    )
    released_at: datetime | None = Field(
        default=None,
        nullable=True,
        description="UTC timestamp of release",
    )
    released_by_id: uuid.UUID | None = Field(
        default=None,
        nullable=True,
        description="UUID of lecturer/admin who triggered release. NULL=auto-release.",
    )

    # -- Integrity hold -------------------------------------------------------

    integrity_hold: bool = Field(
        default=False,
        nullable=False,
        description=(
            "True if CONFIRMED integrity flags block this result from release. "
            "Must be manually cleared by a lecturer or admin."
        ),
    )

    # -- Calculation metadata -------------------------------------------------

    calculated_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        description="When calculate_result() last ran for this attempt",
    )
    graded_question_count: int = Field(
        default=0,
        nullable=False,
        description="Number of questions with is_final=True grades at calc time",
    )
    total_question_count: int = Field(
        default=0,
        nullable=False,
        description="Total questions in the assessment at calc time",
    )

    # -- Relationships --------------------------------------------------------

    attempt: Optional["AssessmentAttempt"] = Relationship(back_populates="result")
    breakdowns: List["ResultBreakdown"] = Relationship(
        back_populates="result",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ResultBreakdown(BaseModel, table=True):
    """
    Per-question score detail for one AssessmentResult.

    One row per (result, question). Created alongside AssessmentResult
    by result_service.generate_breakdown().

    feedback is denormalised from submission_grade.feedback so the
    student's result view requires only a single query (result + breakdowns).
    """

    __tablename__ = "result_breakdown"

    __table_args__ = (
        UniqueConstraint(
            "result_id", "question_id",
            name="uq_result_breakdown_result_question",
        ),
        composite_index("result_breakdown", "result_id"),
        composite_index("result_breakdown", "result_id", "question_id"),
    )

    result_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_result.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    question_id: uuid.UUID = Field(nullable=False, index=True)
    # Denormalised for fast display
    attempt_id: uuid.UUID = Field(nullable=False)

    # -- Scores ---------------------------------------------------------------

    score: float | None = Field(
        default=None,
        nullable=True,
        description="Awarded score. NULL if question was not graded.",
    )
    max_score: float = Field(
        nullable=False,
        description="Maximum possible score for this question in this assessment",
    )
    is_correct: bool | None = Field(
        default=None,
        nullable=True,
        description=(
            "Simple correct/incorrect flag for MCQ-style display. "
            "NULL for partial-credit or manually graded questions."
        ),
    )

    # -- Feedback (denormalised) ----------------------------------------------

    feedback: str | None = Field(
        default=None,
        nullable=True,
        description="Copied from submission_grade.feedback at result calculation time",
    )

    # -- Grading metadata -----------------------------------------------------

    grading_mode: str | None = Field(
        default=None,
        nullable=True,
        description="Grading mode used: auto | ai_assisted | manual",
    )
    was_skipped: bool = Field(
        default=False,
        nullable=False,
        description="True if student skipped this question (score=0)",
    )

    # -- Relationships --------------------------------------------------------

    result: Optional["AssessmentResult"] = Relationship(back_populates="breakdowns")
