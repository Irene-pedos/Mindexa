"""
app/db/schemas/attempt.py

Assessment attempt lifecycle, student responses, and autosave schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import Field, model_validator

from app.db.enums import AttemptStatus, QuestionType
from app.db.schemas.base import BaseAuditedResponse, MindexaSchema

# ─────────────────────────────────────────────────────────────────────────────
# ATTEMPT LIFECYCLE
# ─────────────────────────────────────────────────────────────────────────────

class AttemptStartRequest(MindexaSchema):
    """
    Request to begin an assessment attempt.
    The backend validates eligibility before creating the attempt.
    """

    assessment_id: uuid.UUID
    access_password: Optional[str] = Field(
        default=None,
        description="Required when assessment.is_password_protected is True.",
    )
    group_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Required when assessment.is_group_assessment is True.",
    )


class AttemptResponse(BaseAuditedResponse):
    """
    Returned to the student when an attempt is started or resumed.
    Includes server_deadline so the frontend can show an accurate timer.
    """

    student_id: uuid.UUID
    assessment_id: uuid.UUID
    attempt_number: int
    status: str
    started_at: Optional[datetime]
    server_deadline: Optional[datetime]
    time_taken_seconds: Optional[int]
    integrity_risk_score: int
    warning_count: int
    is_flagged: bool


class AttemptSummaryResponse(MindexaSchema):
    """Minimal attempt info for supervisor dashboard list."""

    id: uuid.UUID
    student_id: uuid.UUID
    assessment_id: uuid.UUID
    attempt_number: int
    status: str
    started_at: Optional[datetime]
    submitted_at: Optional[datetime]
    integrity_risk_score: int
    warning_count: int
    is_flagged: bool
    created_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT RESPONSES
# ─────────────────────────────────────────────────────────────────────────────

class StudentResponseSave(MindexaSchema):
    """
    Autosave or final answer for a single question.

    submitted_content structure varies by question_type.
    See StudentResponse docstring in attempt.py for full structure guide.

    The backend validates the structure matches the question_type
    at the service layer. Schema accepts generic dict/None for flexibility.
    """

    question_id: uuid.UUID
    content: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Answer content matching the question type structure.",
    )
    time_spent_seconds: Optional[int] = Field(
        default=None,
        ge=0,
        description="Time the student had this question visible (for analytics).",
    )
    is_final: bool = Field(
        default=False,
        description=(
            "True = this is the final answer at submission time. "
            "False = autosave during active attempt."
        ),
    )


class BulkResponseSave(MindexaSchema):
    """
    Batch autosave for all responses in an attempt.
    Sent periodically by the frontend during an active attempt.
    """

    attempt_id: uuid.UUID
    responses: List[StudentResponseSave] = Field(min_length=1)


class SubmitAttemptRequest(MindexaSchema):
    """
    Final submission request.
    May include a final batch of response saves to ensure nothing is lost.
    """

    attempt_id: uuid.UUID
    final_responses: List[StudentResponseSave] = Field(default_factory=list)
    client_submitted_at: datetime = Field(
        description="Client-side timestamp of submission (for timing analysis).",
    )


class StudentResponseReadResponse(MindexaSchema):
    """
    Response for reading a student's answer.
    Returned in lecturer grading view — never shown to students during active attempt.
    """

    id: uuid.UUID
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    submitted_content: Optional[Dict[str, Any]]
    is_submitted: bool
    time_spent_seconds: Optional[int]
    auto_grade_score: Optional[float]
    auto_grade_is_correct: Optional[bool]
    ai_grade_score: Optional[float]
    ai_grade_confidence: Optional[float]
    ai_grade_rationale: Optional[str]
    ai_grade_decision: str
    created_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# GROUP
# ─────────────────────────────────────────────────────────────────────────────

class StudentGroupCreate(MindexaSchema):
    assessment_id: uuid.UUID
    name: str = Field(min_length=1, max_length=100)
    max_members: Optional[int] = Field(default=None, ge=2)


class StudentGroupMemberAdd(MindexaSchema):
    student_id: uuid.UUID
    group_role: Optional[str] = Field(default=None, max_length=100)
    is_leader: bool = False


class StudentGroupResponse(BaseAuditedResponse):
    assessment_id: uuid.UUID
    name: str
    max_members: Optional[int]
    is_locked: bool
    member_count: int = 0
