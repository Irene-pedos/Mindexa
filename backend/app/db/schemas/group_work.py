"""Domain schemas for group-work assessment operations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field, model_validator

from app.db.enums import (
    GroupActivityType,
    GroupAppealStatus,
    GroupApprovalStatus,
    GroupSubmissionStatus,
    QuestionDistributionMode,
    StudentGroupStatus,
)
from app.db.schemas.base import BaseAuditedResponse, MindexaSchema


class GroupMemberResponse(MindexaSchema):
    id: uuid.UUID
    name: str
    group_role: str | None = None
    is_leader: bool = False


class StudentGroupResponse(BaseAuditedResponse):
    assessment_id: uuid.UUID
    name: str
    max_members: int | None = None
    status: StudentGroupStatus
    is_locked: bool
    locked_at: datetime | None = None
    invalidated_at: datetime | None = None
    members: list[GroupMemberResponse] = Field(default_factory=list)


class ManualGroupMemberInput(MindexaSchema):
    student_id: uuid.UUID
    group_role: str | None = Field(default=None, max_length=100)
    is_leader: bool = False


class ManualGroupInput(MindexaSchema):
    name: str = Field(..., min_length=1, max_length=100)
    max_members: int | None = Field(default=None, ge=1)
    members: list[ManualGroupMemberInput] = Field(default_factory=list)


class ManualGroupCreateRequest(MindexaSchema):
    groups: list[ManualGroupInput] = Field(..., min_length=1)


class AutoGenerateGroupsRequest(MindexaSchema):
    max_group_size: int = Field(..., ge=2, le=100)
    naming_pattern: str = Field(default="Group {index}", min_length=3, max_length=100)
    allow_smaller_final_group: bool = True


class GroupCsvImportRow(MindexaSchema):
    student_id: uuid.UUID
    group_name: str = Field(..., min_length=1, max_length=100)
    group_role: str | None = Field(default=None, max_length=100)
    is_leader: bool = False


class GroupCsvImportRequest(MindexaSchema):
    rows: list[GroupCsvImportRow] = Field(..., min_length=1)


class GroupCsvImportError(MindexaSchema):
    row_number: int
    student_id: uuid.UUID | None = None
    reason: str


class GroupCsvImportResponse(MindexaSchema):
    valid_groups: list[ManualGroupInput] = Field(default_factory=list)
    imported_count: int = 0
    error_count: int = 0
    errors: list[GroupCsvImportError] = Field(default_factory=list)


class GroupAssessmentMaterialResponse(BaseAuditedResponse):
    assessment_id: uuid.UUID
    group_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    file_url: str
    is_required: bool = False


class GroupSubmissionAnswerResponse(BaseAuditedResponse):
    submission_id: uuid.UUID
    question_id: uuid.UUID
    answer_content: dict[str, Any] | None = None
    notes_content: dict[str, Any] | None = None
    last_edited_by_id: uuid.UUID | None = None
    last_edited_at: datetime | None = None
    last_modified_by_id: uuid.UUID | None = None
    last_modified_by_name: str | None = None
    last_modified_at: datetime | None = None


class GroupSubmissionCommentResponse(MindexaSchema):
    id: uuid.UUID
    submission_id: uuid.UUID
    question_id: uuid.UUID | None = None
    author_id: uuid.UUID
    student_id: uuid.UUID | None = None
    student_name: str | None = None
    body: str
    created_at: datetime


class GroupSubmissionApprovalResponse(BaseAuditedResponse):
    submission_id: uuid.UUID
    student_id: uuid.UUID
    status: GroupApprovalStatus
    responded_at: datetime | None = None
    note: str | None = None


class GroupActivityLogResponse(MindexaSchema):
    id: uuid.UUID
    submission_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str | None = None
    activity_type: GroupActivityType
    question_id: uuid.UUID | None = None
    metadata_json: dict[str, Any] | None = None
    details: dict[str, Any] | None = None
    created_at: datetime


class GroupWorkspaceQuestionOptionResponse(MindexaSchema):
    id: uuid.UUID | str
    text: str


class GroupWorkspaceQuestionResponse(MindexaSchema):
    id: uuid.UUID
    text: str
    type: str
    marks: int
    order_index: int
    options: list[GroupWorkspaceQuestionOptionResponse] = Field(default_factory=list)


class GroupWorkspaceMemberResponse(MindexaSchema):
    student_id: uuid.UUID
    student_name: str
    group_role: str | None = None
    is_leader: bool = False
    participation_count: int = 0
    approval_status: GroupApprovalStatus = GroupApprovalStatus.PENDING
    is_online: bool = False


class GroupWorkspaceAssessmentResponse(MindexaSchema):
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


class GroupAppealResponse(BaseAuditedResponse):
    submission_id: uuid.UUID
    initiated_by_id: uuid.UUID
    status: GroupAppealStatus
    statement: str
    lecturer_decision: str | None = None
    submitted_to_lecturer_at: datetime | None = None
    resolved_at: datetime | None = None
    approvals: list["GroupAppealApprovalResponse"] = Field(default_factory=list)


class GroupAppealApprovalResponse(BaseAuditedResponse):
    appeal_id: uuid.UUID
    student_id: uuid.UUID
    status: GroupApprovalStatus
    responded_at: datetime | None = None
    note: str | None = None


class GroupWorkspaceResponse(MindexaSchema):
    assessment_id: uuid.UUID
    group: StudentGroupResponse
    group_name: str | None = None
    assessment: GroupWorkspaceAssessmentResponse | None = None
    submission_id: uuid.UUID | None = None
    submission_status: GroupSubmissionStatus | None = None
    question_distribution_mode: QuestionDistributionMode | None = None
    questions: list[GroupWorkspaceQuestionResponse] = Field(default_factory=list)
    members: list[GroupWorkspaceMemberResponse] = Field(default_factory=list)
    materials: list[GroupAssessmentMaterialResponse] = Field(default_factory=list)
    answers: list[GroupSubmissionAnswerResponse] = Field(default_factory=list)
    comments: list[GroupSubmissionCommentResponse] = Field(default_factory=list)
    approvals: list[GroupSubmissionApprovalResponse] = Field(default_factory=list)
    activity_log: list[GroupActivityLogResponse] = Field(default_factory=list)
    activities: list[GroupActivityLogResponse] = Field(default_factory=list)
    active_member_ids: list[uuid.UUID] = Field(default_factory=list)
    can_request_approval: bool = False
    can_submit: bool = False
    appeal: GroupAppealResponse | None = None


class SaveGroupAnswerRequest(MindexaSchema):
    answer_content: dict[str, Any] | None = None
    notes_content: dict[str, Any] | None = None
    change_source: Literal["manual_edit", "autosave", "paste", "imported_note"] = "manual_edit"


class AddGroupCommentRequest(MindexaSchema):
    question_id: uuid.UUID | None = None
    body: str = Field(..., min_length=1, max_length=5000)


class ApproveGroupSubmissionRequest(MindexaSchema):
    status: GroupApprovalStatus
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def disallow_withdrawn_on_student_action(self) -> "ApproveGroupSubmissionRequest":
        if self.status == GroupApprovalStatus.WITHDRAWN:
            raise ValueError("WITHDRAWN is not a valid direct approval action.")
        return self


class FinalizeGroupSubmissionRequest(MindexaSchema):
    confirm: bool = True

    @model_validator(mode="after")
    def confirm_must_be_true(self) -> "FinalizeGroupSubmissionRequest":
        if not self.confirm:
            raise ValueError("confirm must be True to finalize the group submission")
        return self


class CreateGroupAppealRequest(MindexaSchema):
    statement: str = Field(..., min_length=10, max_length=5000)


class ApproveGroupAppealRequest(MindexaSchema):
    approve: bool
    note: str | None = Field(default=None, max_length=2000)


class GroupSubmissionGradeRequest(MindexaSchema):
    total_score: float = Field(..., ge=0)
    max_score: float = Field(..., gt=0)
    feedback: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def score_cannot_exceed_max(self) -> "GroupSubmissionGradeRequest":
        if self.total_score > self.max_score:
            raise ValueError("total_score cannot exceed max_score")
        return self
