"""
app/schemas/submission.py

Pydantic schemas for student answer submission endpoints.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator

from app.db.enums import SubmissionAnswerType


# ---------------------------------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------------------------------


class SubmitAnswerRequest(BaseModel):
    """
    Body for POST /submissions — save or update an answer.

    Exactly one answer payload field must be populated based on answer_type.
    Validation is enforced by the model_validator below.
    """
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    access_token: uuid.UUID = Field(
        ...,
        description="Access token issued at attempt start — prevents stale submissions",
    )
    answer_type: SubmissionAnswerType

    # Payload fields — only one populated per request
    answer_text: Optional[str] = None
    selected_option_ids: Optional[List[uuid.UUID]] = None
    ordered_option_ids: Optional[List[uuid.UUID]] = None
    match_pairs_json: Optional[Dict[str, str]] = None
    fill_blank_answers: Optional[Dict[str, str]] = None
    file_url: Optional[str] = Field(default=None, max_length=2000)

    # Client metadata
    change_type: str = Field(
        default="manual_save",
        description="autosave | manual_save | submit | auto_submit",
    )
    time_spent_seconds: Optional[int] = Field(
        default=None,
        ge=0,
        description="Time spent on this question in seconds (reported by frontend)",
    )
    is_skipped: bool = False

    @model_validator(mode="after")
    def validate_answer_payload(self) -> "SubmitAnswerRequest":
        t = self.answer_type
        if t == SubmissionAnswerType.TEXT and self.answer_text is None and not self.is_skipped:
            raise ValueError("answer_text required for TEXT answer_type")
        if t in (SubmissionAnswerType.SINGLE_OPTION, SubmissionAnswerType.MULTI_OPTION):
            if not self.selected_option_ids and not self.is_skipped:
                raise ValueError("selected_option_ids required for OPTION answer types")
        if t == SubmissionAnswerType.ORDERED_LIST and not self.ordered_option_ids and not self.is_skipped:
            raise ValueError("ordered_option_ids required for ORDERED_LIST answer_type")
        if t == SubmissionAnswerType.MATCH_PAIRS and self.match_pairs_json is None and not self.is_skipped:
            raise ValueError("match_pairs_json required for MATCH_PAIRS answer_type")
        if t == SubmissionAnswerType.FILL_BLANKS and self.fill_blank_answers is None and not self.is_skipped:
            raise ValueError("fill_blank_answers required for FILL_BLANKS answer_type")
        if t == SubmissionAnswerType.FILE and not self.file_url and not self.is_skipped:
            raise ValueError("file_url required for FILE answer_type")
        return self


# ---------------------------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------------------------


class SubmissionResponse(BaseModel):
    """Full response row — returned after every save."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    answer_type: SubmissionAnswerType
    answer_text: Optional[str]
    selected_option_ids: Optional[List[Any]]
    ordered_option_ids: Optional[List[Any]]
    match_pairs_json: Optional[Dict[str, Any]]
    fill_blank_answers: Optional[Dict[str, Any]]
    file_url: Optional[str]
    is_final: bool
    saved_at: Optional[datetime]
    submitted_at: Optional[datetime]
    time_spent_seconds: Optional[int]
    is_skipped: bool
    created_at: datetime
    updated_at: datetime


class SubmissionSummary(BaseModel):
    """Lightweight — used in attempt detail views."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    question_id: uuid.UUID
    answer_type: SubmissionAnswerType
    is_final: bool
    is_skipped: bool
    saved_at: Optional[datetime]


class SubmissionLogEntry(BaseModel):
    """One entry in the answer change audit log."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    response_id: uuid.UUID
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    change_type: str
    previous_value: Optional[Dict[str, Any]]
    new_value: Optional[Dict[str, Any]]
    created_at: datetime


class AttemptSubmissionsResponse(BaseModel):
    """All submissions for an attempt (used at grading time)."""
    attempt_id: uuid.UUID
    submissions: List[SubmissionResponse]
    total: int
