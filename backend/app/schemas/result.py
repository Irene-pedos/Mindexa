"""
app/schemas/result.py

Pydantic schemas for assessment result endpoints.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

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
    attempt_ids: Optional[List[uuid.UUID]] = Field(
        default=None,
        description="If None, releases results for ALL attempts in the assessment",
    )


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
    model_config = {"from_attributes": True}

    id: uuid.UUID
    question_id: uuid.UUID
    score: Optional[float]
    max_score: float
    is_correct: Optional[bool]
    feedback: Optional[str]
    grading_mode: Optional[str]
    was_skipped: bool


class AssessmentResultResponse(BaseModel):
    """
    Full result — returned to a student after release,
    or to a lecturer/admin at any time.
    """
    model_config = {"from_attributes": True}

    id: uuid.UUID
    attempt_id: uuid.UUID
    student_id: uuid.UUID
    assessment_id: uuid.UUID
    total_score: float
    max_score: float
    percentage: float
    letter_grade: Optional[ResultLetterGrade]
    is_passing: bool
    is_released: bool
    released_at: Optional[datetime]
    integrity_hold: bool
    calculated_at: datetime
    graded_question_count: int
    total_question_count: int
    breakdowns: List[ResultBreakdownItem] = []


class ResultSummary(BaseModel):
    """Lightweight result — used in lists."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    attempt_id: uuid.UUID
    student_id: uuid.UUID
    assessment_id: uuid.UUID
    total_score: float
    max_score: float
    percentage: float
    letter_grade: Optional[ResultLetterGrade]
    is_passing: bool
    is_released: bool
    integrity_hold: bool


class ResultListResponse(BaseModel):
    """Paginated list of results (lecturer view)."""
    items: List[ResultSummary]
    total: int
    page: int
    page_size: int


class ResultReleaseResponse(BaseModel):
    """Returned after POST /results/release."""
    released_count: int
    held_count: int
    held_attempt_ids: List[uuid.UUID]
    message: str
