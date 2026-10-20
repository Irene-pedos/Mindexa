"""
app/schemas/moderation.py

Pydantic schemas for Phase 3 Moderation and Exam Office workflows.
Strict typing and JSON validation.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import (
    ModerationCommentCategory,
    ModerationCommentTarget,
    ModerationReviewStatus,
    PrintJobStatus,
)


class ChecklistItemResponse(BaseModel):
    code: str
    severity: str
    passed: bool
    message: str
    details: Optional[dict] = None


class ChecklistResultResponse(BaseModel):
    items: List[ChecklistItemResponse]
    has_blocking_failures: bool
    warnings_count: int


class ModerationSubmitRequest(BaseModel):
    run_ai_review: bool = Field(default=False, description="Run advisory AI wording check")


class ModerationResubmitRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500, description="Notes on changes made")
    run_ai_review: bool = Field(default=False, description="Run advisory AI wording check")


class ModerationCommentCreate(BaseModel):
    target_type: ModerationCommentTarget
    target_id: Optional[uuid.UUID] = None
    category: ModerationCommentCategory
    comment: str = Field(min_length=1, max_length=2000)


class ModerationCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    review_id: uuid.UUID
    target_type: ModerationCommentTarget
    target_id: Optional[uuid.UUID] = None
    category: ModerationCommentCategory
    comment: str
    resolved: bool
    resolved_at: Optional[datetime] = None
    created_at: datetime


class ModerationDecideRequest(BaseModel):
    decision_note: str = Field(min_length=1, max_length=2000, description="Reviewer feedback or explanation")


class ModerationApproveRequest(BaseModel):
    decision_note: Optional[str] = Field(default=None, max_length=2000, description="Optional sign-off note")
    acknowledge_warnings: bool = Field(default=True, description="Acknowledge any soft structure warnings")


class ModerationReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    round_no: int
    reviewer_id: Optional[uuid.UUID] = None
    status: ModerationReviewStatus
    decision_note: Optional[str] = None
    started_at: datetime
    claimed_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None
    checklist_result: Optional[dict] = None
    comments: List[ModerationCommentResponse] = []


class ModerationOverviewResponse(BaseModel):
    assessment_id: uuid.UUID
    status: str
    latest_version_no: int
    rounds: List[dict]


class ModeratorQueueItemResponse(BaseModel):
    review_id: uuid.UUID
    assessment_id: uuid.UUID
    assessment_title: str
    round_no: int
    review_status: str
    assessment_status: str
    reviewer_id: Optional[uuid.UUID] = None
    started_at: Optional[str] = None
    claimed_at: Optional[str] = None


class SealAssessmentRequest(BaseModel):
    spare_percent: int = Field(default=5, ge=0, le=50, description="Spare copies percent (default 5%)")
    notes: Optional[str] = Field(default=None, max_length=1000)


class SealAssessmentResponse(BaseModel):
    assessment_id: uuid.UUID
    seal_id: uuid.UUID
    verification_code: str
    status: str
    copies_total: int
    print_job_id: uuid.UUID


class RevokeSealRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=1000, description="Mandatory reason for seal revocation")


class RevokeSealResponse(BaseModel):
    assessment_id: uuid.UUID
    seal_id: uuid.UUID
    revoked_at: datetime
    revoke_reason: str
    status: str


class PrintJobUpdateRequest(BaseModel):
    status: PrintJobStatus
    notes: Optional[str] = Field(default=None, max_length=1000)


class PrintJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assessment_id: uuid.UUID
    seal_id: uuid.UUID
    enrolled_count: int
    spare_percent: int
    copies_total: int
    status: PrintJobStatus
    handled_by_id: Optional[uuid.UUID] = None
    printed_at: Optional[datetime] = None
    stored_at: Optional[datetime] = None
    distributed_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime


class ExamOfficeQueueItemResponse(BaseModel):
    assessment_id: uuid.UUID
    title: str
    status: str
    course_id: uuid.UUID
    seal: Optional[dict] = None
    print_job: Optional[dict] = None


class PublicSealVerificationResponse(BaseModel):
    valid: bool
    assessment_title: Optional[str] = None
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    sealed_at: Optional[str] = None
    version_no: Optional[int] = None
    error: Optional[str] = None
