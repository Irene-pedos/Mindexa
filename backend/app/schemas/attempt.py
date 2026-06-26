"""
app/schemas/attempt.py

Pydantic schemas for AssessmentAttempt endpoints.
"""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field, model_validator

from app.db.enums import AttemptStatus, GroupSubmissionStatus, QuestionDistributionMode

# ---------------------------------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------------------------------


class AttemptStartRequest(BaseModel):
    """
    Body for POST /attempts/start.
    Student provides the assessment they want to attempt.
    Optional: access_password if the assessment is password-protected.
    """
    assessment_id: uuid.UUID
    access_password: Optional[str] = Field(
        default=None,
        alias="password", # Support frontend field name
        description="Required only if the assessment is password-protected",
    )
    model_config = {"populate_by_name": True}


class AttemptResumeRequest(BaseModel):
    """
    Body for POST /attempts/{attempt_id}/resume.
    The access_token issued at start must be re-validated.
    """
    access_token: uuid.UUID


class AttemptSubmitRequest(BaseModel):
    """
    Body for POST /attempts/{attempt_id}/submit.
    Student explicitly submits the attempt.
    access_token prevents stale-tab submissions.
    """
    access_token: uuid.UUID
    confirm: bool = Field(
        ...,
        description="Must be True — prevents accidental submission",
    )

    @model_validator(mode="after")
    def confirm_must_be_true(self) -> "AttemptSubmitRequest":
        if not self.confirm:
            raise ValueError("confirm must be True to submit the attempt")
        return self


# ---------------------------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------------------------

class AttemptQuestionOption(BaseModel):
    """Option for a multiple choice question in an attempt."""
    id: uuid.UUID
    text: str = Field(validation_alias="content")
    option_text_right: Optional[str] = Field(None, validation_alias="match_value")
    image_url: Optional[str] = Field(None, alias="imageUrl")
    order_index: int

    model_config = {"from_attributes": True, "populate_by_name": True}
class AttemptQuestionResponse(BaseModel):
    """Question detail within an attempt."""
    id: uuid.UUID
    type: str
    content: str
    text: Optional[str] = None
    caseStudyContext: Optional[str] = Field(None, validation_alias="case_study_context")
    image_url: Optional[str] = Field(None, alias="imageUrl")
    marks: int
    order_index: int
    assessment_section_id: Optional[uuid.UUID] = None
    section_title: Optional[str] = None
    options: Optional[List[AttemptQuestionOption]] = None

    model_config = {
        "from_attributes": True,
        "populate_by_name": True
    }

class AttemptDetailResponse(BaseModel):
    """Full attempt detail — returned to student during active attempt."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    group_id: Optional[uuid.UUID] = None
    group_submission_id: Optional[uuid.UUID] = None
    group_submission_status: Optional[GroupSubmissionStatus] = None
    question_distribution_mode: Optional[QuestionDistributionMode] = None
    attempt_number: int
    status: AttemptStatus
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    access_token: Optional[uuid.UUID] = None
    total_score: Optional[float] = None
    total_integrity_warnings: int = 0
    is_flagged: bool = False
    created_at: datetime
    
    # Nested data for the UI
    questions: List[AttemptQuestionResponse] = []
    group_members: Optional[List[Dict[str, Any]]] = None


class AttemptStartResponse(BaseModel):
    """
    Returned on POST /attempts/start.
    Includes the access_token the student must use for all subsequent requests.
    """
    model_config = {"from_attributes": True}

    id: uuid.UUID
    assessment_id: uuid.UUID
    attempt_number: int
    status: AttemptStatus
    started_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    access_token: Optional[uuid.UUID] = None
    # Seconds remaining (computed, not stored)
    seconds_remaining: Optional[int] = None


class AttemptSummary(BaseModel):
    """Lightweight summary for dashboard list views."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    assessment_id: uuid.UUID
    attempt_number: int
    status: AttemptStatus
    group_id: Optional[uuid.UUID] = None
    group_submission_id: Optional[uuid.UUID] = None
    group_submission_status: Optional[GroupSubmissionStatus] = None
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    total_score: Optional[float] = None
    is_flagged: bool = False


class AttemptListResponse(BaseModel):
    """Paginated list of attempts."""
    items: List[AttemptSummary]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# SUPERVISOR VIEW
# ---------------------------------------------------------------------------


class AttemptSupervisorView(BaseModel):
    """
    Extended view for the supervisor live monitoring panel.
    Includes integrity state and timing details not shown to students.
    """
    model_config = {"from_attributes": True}

    id: uuid.UUID
    student_id: uuid.UUID
    attempt_number: int
    status: AttemptStatus
    started_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    total_integrity_warnings: int = 0
    is_flagged: bool = False
    ip_address: Optional[str] = None

# Rebuild models to resolve deferred type evaluation
AttemptQuestionOption.model_rebuild()
AttemptQuestionResponse.model_rebuild()
AttemptDetailResponse.model_rebuild()
AttemptListResponse.model_rebuild()
AttemptStartResponse.model_rebuild()
AttemptSummary.model_rebuild()
AttemptSupervisorView.model_rebuild()
