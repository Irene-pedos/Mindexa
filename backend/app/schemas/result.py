"""
app/schemas/result.py

Pydantic schemas for assessment result endpoints.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.db.enums import ResultLetterGrade

# ---------------------------------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------------------------------


class ReleaseResultsRequest(BaseModel):
    """
    Body for POST /results/release.
    Lecturer triggers result release for one or many attempts.
    """
    assessment_id: uuid.UUID
    attempt_ids: list[uuid.UUID] | None = Field(
        default=None,
        description="If None, releases results for ALL attempts in the assessment",
    )
    class_section_id: uuid.UUID | None = Field(
        default=None,
        description="If provided, releases results only for this class section",
    )


class AssessmentReleasePolicyRequest(BaseModel):
    """
    Body for PATCH /results/assessment/{assessment_id}/release-policy.
    Update the assessment's result release configuration.
    """
    policy: str  # string from frontend: 'immediate', 'scheduled', 'hold'
    release_date: datetime | None = None


class ClearIntegrityHoldRequest(BaseModel):
    """
    Body for POST /results/{result_id}/clear-hold.
    Admin or primary supervisor clears the integrity hold on a result,
    allowing it to be released despite a prior flag.
    """
    result_id: uuid.UUID
    justification: str = Field(
        ...,
        min_length=10,
        description="Required explanation for clearing the hold",
    )


# ---------------------------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------------------------


class ResultBreakdownItem(BaseModel):
    """Per-question breakdown within a result."""
    model_config = {
        "from_attributes": True,
        "populate_by_name": True
    }

    id: uuid.UUID
    question_id: uuid.UUID
    score: float | None
    max_score: float
    is_correct: bool | None
    feedback: str | None
    grading_mode: str | None
    feedback_author_basis: str | None = None
    was_skipped: bool

    # UI fields for the student (populated by result_service)
    question_text: str | None = None
    question_type: str | None = None
    section_title: str | None = None
    image_url: str | None = Field(None, alias="imageUrl")
    case_study_context: str | None = None
    question_table_context: dict | None = Field(None, alias="questionTableContext")
    requires_table_answer: bool | None = Field(False, alias="requiresTableAnswer")
    answer_table_template: dict | None = Field(None, alias="answerTableTemplate")
    student_answer: str | None = None
    student_answer_json: dict | list | None = None
    correct_answer: str | None = None
    options: list[dict] | None = None
    blanks: list[dict] | None = None


class AssessmentResultResponse(BaseModel):
    """
    Full result — returned to a student after release,
    or to a lecturer/admin at any time.
    """
    model_config = {"from_attributes": True}

    id: uuid.UUID
    attempt_id: uuid.UUID | None = None
    group_submission_id: uuid.UUID | None = None
    is_group_result: bool = False
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    group_feedback: str | None = None
    student_id: uuid.UUID
    assessment_id: uuid.UUID
    assessment_title: str | None = None
    academic_year: str | None = None
    course_code: str | None = None
    course_name: str | None = None
    institution_name: str | None = None
    institution_logo_url: str | None = None
    campus_name: str | None = None
    college_name: str | None = None
    school_name: str | None = None
    department_name: str | None = None
    option_name: str | None = None
    assessment_type: str | None = None
    duration_minutes: int | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    class_name: str | None = None
    academic_level: str | None = None
    submitted_at: datetime | None = None
    started_at: datetime | None = None
    total_score: float
    max_score: float
    percentage: float
    letter_grade: ResultLetterGrade | None
    is_passing: bool
    is_released: bool
    released_at: datetime | None
    integrity_hold: bool
    calculated_at: datetime
    graded_question_count: int
    total_question_count: int
    is_post_release_corrected: bool = False
    post_release_corrected_at: datetime | None = None
    breakdowns: list[ResultBreakdownItem] = []


class ResultSummary(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    attempt_id: uuid.UUID | None = None
    group_submission_id: uuid.UUID | None = None
    is_group_result: bool = False
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    student_id: uuid.UUID
    student_name: str | None = None
    assessment_id: uuid.UUID
    assessment_title: str | None = None
    assessment_type: str | None = None
    academic_year: str | None = None
    course_code: str | None = None
    course_name: str | None = None
    submitted_at: datetime | None = None
    released_at: datetime | None = None
    student_status: str | None = None
    total_score: float
    max_score: float
    percentage: float
    letter_grade: ResultLetterGrade | None
    is_passing: bool
    is_released: bool
    integrity_hold: bool
    is_post_release_corrected: bool = False
    post_release_corrected_at: datetime | None = None
    graded_question_count: int | None = None
    total_question_count: int | None = None


class ResultListResponse(BaseModel):
    """Paginated list of results (lecturer view)."""
    items: list[ResultSummary]
    total: int
    page: int
    page_size: int


class ResultReleaseResponse(BaseModel):
    """Returned after POST /results/release."""
    released_count: int
    held_count: int
    held_attempt_ids: list[uuid.UUID] = []
    incomplete_count: int = 0
    incomplete_attempt_ids: list[uuid.UUID] = []
    message: str


class ReleaseQueueItem(BaseModel):
    student_id: uuid.UUID
    student_name: str
    attempt_id: uuid.UUID | None = None
    graded_question_count: int
    total_question_count: int
    integrity_hold: bool
    is_released: bool
    can_release: bool
    status: str = "PENDING_RELEASE"
    total_score: float | None = None
    max_score: float | None = None
    percentage: float | None = None
    letter_grade: str | None = None


class ReleaseQueueResponse(BaseModel):
    items: list[ReleaseQueueItem]
    class_fully_graded: bool


# Rebuild models
ReleaseResultsRequest.model_rebuild()
ClearIntegrityHoldRequest.model_rebuild()
ResultBreakdownItem.model_rebuild()
AssessmentResultResponse.model_rebuild()
ResultSummary.model_rebuild()
ResultListResponse.model_rebuild()
ResultReleaseResponse.model_rebuild()
ReleaseQueueItem.model_rebuild()
ReleaseQueueResponse.model_rebuild()
