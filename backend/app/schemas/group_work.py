"""API-facing schemas for group-work assessment workflows."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.db.enums import (
    GroupActivityType,
    GroupAppealStatus,
    GroupApprovalStatus,
    GroupSubmissionStatus,
    QuestionDistributionMode,
    StudentGroupStatus,
)


class GroupMemberResponse(BaseModel):
    id: uuid.UUID
    name: str
    group_role: str | None = None
    is_leader: bool = False


class StudentGroupResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    name: str
    max_members: int | None = None
    status: StudentGroupStatus
    is_locked: bool
    locked_at: datetime | None = None
    invalidated_at: datetime | None = None
    members: list[GroupMemberResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ManualGroupMemberInput(BaseModel):
    student_id: uuid.UUID
    group_role: str | None = Field(default=None, max_length=100)
    is_leader: bool = False


class ManualGroupInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    max_members: int | None = Field(default=None, ge=1)
    members: list[ManualGroupMemberInput] = Field(default_factory=list)


class ManualGroupCreateRequest(BaseModel):
    groups: list[ManualGroupInput] = Field(..., min_length=1)


class AutoGenerateGroupsRequest(BaseModel):
    max_group_size: int = Field(..., ge=2, le=100)
    naming_pattern: str = Field(default="Group {index}", min_length=3, max_length=100)
    allow_smaller_final_group: bool = True


class GroupCsvImportRow(BaseModel):
    student_id: uuid.UUID
    group_name: str = Field(..., min_length=1, max_length=100)
    group_role: str | None = Field(default=None, max_length=100)
    is_leader: bool = False


class GroupCsvImportRequest(BaseModel):
    rows: list[GroupCsvImportRow] = Field(..., min_length=1)


class GroupCsvImportError(BaseModel):
    row_number: int
    student_id: uuid.UUID | None = None
    reason: str


class GroupCsvImportResponse(BaseModel):
    valid_groups: list[ManualGroupInput] = []
    imported_count: int = 0
    error_count: int = 0
    errors: list[GroupCsvImportError] = []


class GroupAssessmentMaterialResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    file_url: str
    is_required: bool = False

    model_config = {"from_attributes": True}


class GroupSubmissionAnswerResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID | None = None
    question_id: uuid.UUID
    answer_content: dict[str, Any] | None = None
    notes_content: dict[str, Any] | None = None
    last_edited_by_id: uuid.UUID | None = None
    last_edited_at: datetime | None = None
    last_modified_by_id: uuid.UUID | None = None
    last_modified_by_name: str | None = None
    last_modified_at: datetime | None = None
    score: float | None = None
    max_score: float | None = None
    feedback: str | None = None
    is_final: bool = False
    is_auto_graded: bool = False
    auto_grade_score: float | None = None
    auto_grade_is_correct: bool | None = None
    ai_grade_score: float | None = None
    ai_grade_confidence: float | None = None
    ai_grade_rationale: str | None = None
    ai_grade_breakdown: list[dict[str, Any]] | dict[str, Any] | None = None
    ai_feedback_draft: str | None = None
    ai_feedback_strengths: list[str] | None = None
    ai_feedback_improvements: list[str] | None = None
    ai_feedback_suggestions: list[str] | None = None
    ai_grade_decision: str | None = None
    rubric_scores: list[dict[str, Any]] | dict[str, Any] | None = None
    ai_grading_basis: str | None = None
    rag_used: bool = False
    ai_context_sources: list[str] | None = None
    rag_chunk_ids: list[str] | None = None

    model_config = {"from_attributes": True}


class GroupSubmissionCommentResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    question_id: uuid.UUID | None = None
    author_id: uuid.UUID
    student_id: uuid.UUID | None = None
    student_name: str | None = None
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupSubmissionApprovalResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    student_id: uuid.UUID
    status: GroupApprovalStatus
    responded_at: datetime | None = None
    note: str | None = None

    model_config = {"from_attributes": True}


class GroupActivityLogResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str | None = None
    activity_type: GroupActivityType
    question_id: uuid.UUID | None = None
    metadata_json: dict[str, Any] | None = None
    details: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupWorkspaceQuestionOptionResponse(BaseModel):
    id: uuid.UUID | str
    text: str


class GroupWorkspaceQuestionResponse(BaseModel):
    id: uuid.UUID
    text: str
    content: str | None = None
    type: str
    question_type: str | None = None
    marks: float | int
    order_index: int
    options: list[GroupWorkspaceQuestionOptionResponse] = []
    case_study_context: str | None = None
    question_table_context: dict[str, Any] | list[Any] | None = None
    image_url: str | None = None
    image_alt_text: str | None = None
    rubric: dict[str, Any] | None = None
    blanks: list[dict[str, Any]] | None = None


class GroupWorkspaceMemberResponse(BaseModel):
    student_id: uuid.UUID
    student_name: str
    group_role: str | None = None
    is_leader: bool = False
    participation_count: int = 0
    approval_status: GroupApprovalStatus = GroupApprovalStatus.PENDING
    is_online: bool = False


class GroupWorkspaceAssessmentResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    instructions: str | None = None
    course_name: str | None = None
    course_code: str | None = None
    academic_year: str | None = None
    lecturer_name: str | None = None
    total_marks: int | None = None
    require_all_member_approval: bool = False
    require_all_member_participation: bool = False
    window_start: datetime | None = None
    window_end: datetime | None = None


class GroupAppealResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    initiated_by_id: uuid.UUID
    status: GroupAppealStatus
    statement: str
    lecturer_decision: str | None = None
    submitted_to_lecturer_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    approvals: list["GroupAppealApprovalResponse"] = []

    model_config = {"from_attributes": True}


class GroupAppealApprovalResponse(BaseModel):
    id: uuid.UUID
    appeal_id: uuid.UUID
    student_id: uuid.UUID
    status: GroupApprovalStatus
    responded_at: datetime | None = None
    note: str | None = None

    model_config = {"from_attributes": True}


class GroupWorkspaceResponse(BaseModel):
    assessment_id: uuid.UUID
    group: StudentGroupResponse
    group_name: str | None = None
    assessment: GroupWorkspaceAssessmentResponse | None = None
    submission_id: uuid.UUID | None = None
    submission_status: GroupSubmissionStatus | None = None
    question_distribution_mode: QuestionDistributionMode | None = None
    questions: list[GroupWorkspaceQuestionResponse] = []
    members: list[GroupWorkspaceMemberResponse] = []
    materials: list[GroupAssessmentMaterialResponse] = []
    answers: list[GroupSubmissionAnswerResponse] = []
    comments: list[GroupSubmissionCommentResponse] = []
    approvals: list[GroupSubmissionApprovalResponse] = []
    activity_log: list[GroupActivityLogResponse] = []
    activities: list[GroupActivityLogResponse] = []
    active_member_ids: list[uuid.UUID] = []
    can_request_approval: bool = False
    can_submit: bool = False
    appeal: GroupAppealResponse | None = None
    total_score: float | None = None
    feedback: str | None = None
    member_overrides: dict[str, float] | None = None
    result_released_at: datetime | None = None
    is_released: bool = False


class SaveGroupAnswerRequest(BaseModel):
    answer_content: dict[str, Any] | None = None
    notes_content: dict[str, Any] | None = None
    change_source: Literal["manual_edit", "autosave", "paste", "imported_note"] = "manual_edit"


class AddGroupCommentRequest(BaseModel):
    question_id: uuid.UUID | None = None
    body: str = Field(..., min_length=1, max_length=5000)


class ApproveGroupSubmissionRequest(BaseModel):
    status: GroupApprovalStatus
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def disallow_withdrawn_on_student_action(self) -> "ApproveGroupSubmissionRequest":
        if self.status == GroupApprovalStatus.WITHDRAWN:
            raise ValueError("WITHDRAWN is not a valid direct approval action.")
        return self


class FinalizeGroupSubmissionRequest(BaseModel):
    confirm: bool = True

    @model_validator(mode="after")
    def confirm_must_be_true(self) -> "FinalizeGroupSubmissionRequest":
        if not self.confirm:
            raise ValueError("confirm must be True to finalize the group submission")
        return self


class CreateGroupAppealRequest(BaseModel):
    statement: str = Field(..., min_length=10, max_length=5000)


class ApproveGroupAppealRequest(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=2000)


class GroupSubmissionGradeRequest(BaseModel):
    total_score: float = Field(..., ge=0)
    max_score: float = Field(..., gt=0)
    feedback: str | None = Field(default=None, max_length=5000)
    member_overrides: dict[str, float] | None = None
    is_final: bool | None = Field(default=True)

    @model_validator(mode="after")
    def score_cannot_exceed_max(self) -> "GroupSubmissionGradeRequest":
        if self.total_score > self.max_score:
            raise ValueError("total_score cannot exceed max_score")
        return self


class ResolveGroupAppealRequest(BaseModel):
    """Payload for a lecturer to resolve a submitted group appeal."""
    approve: bool
    decision: str = Field(..., min_length=10, max_length=5000)
    feedback: str | None = Field(default=None, max_length=5000)


class GradeGroupQuestionRequest(BaseModel):
    """Payload for a lecturer to score or save draft for a single question in group work."""
    score: float | None = Field(default=None, ge=0)
    feedback: str | None = Field(default=None, max_length=5000)
    rubric_scores: list[dict[str, Any]] | dict[str, Any] | None = None
    is_final: bool = True
    is_ai_accepted: bool = False
