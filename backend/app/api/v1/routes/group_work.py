"""API routes for group-work assessment workflows."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin, require_student
from app.schemas.grading import SuggestChangesRequest
from app.schemas.group_work import (
    AddGroupCommentRequest,
    ApproveGroupAppealRequest,
    ApproveGroupSubmissionRequest,
    AutoGenerateGroupsRequest,
    CreateGroupAppealRequest,
    FinalizeGroupSubmissionRequest,
    GradeGroupQuestionRequest,
    GroupCsvImportRequest,
    GroupCsvImportResponse,
    GroupWorkspaceResponse,
    GroupSubmissionAnswerResponse,
    GroupSubmissionApprovalResponse,
    GroupSubmissionCommentResponse,
    GroupAppealApprovalResponse,
    GroupAppealResponse,
    GroupSubmissionGradeRequest,
    ManualGroupCreateRequest,
    ResolveGroupAppealRequest,
    SaveGroupAnswerRequest,
    StudentGroupResponse,
)
from app.services.group_work_service import GroupWorkService

router = APIRouter(prefix="/group-work", tags=["Group Work"])


def _service(db: AsyncSession) -> GroupWorkService:
    return GroupWorkService(db)


# ── LECTURER: GROUP MANAGEMENT ──────────────────────────────────────────────


@router.post(
    "/assessments/{assessment_id}/groups/auto-generate",
    response_model=list[StudentGroupResponse],
    summary="Automatically generate groups for an assessment",
)
async def auto_generate_groups(
    assessment_id: uuid.UUID,
    body: AutoGenerateGroupsRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> list[StudentGroupResponse]:
    svc = _service(db)
    groups = await svc.auto_generate_groups(
        assessment_id=assessment_id,
        current_user=current_user,
        data=body,
    )
    await db.commit()
    return groups


@router.post(
    "/assessments/{assessment_id}/groups/import-csv",
    response_model=GroupCsvImportResponse,
    summary="Validate and stage groups from CSV import",
)
async def import_groups_csv(
    assessment_id: uuid.UUID,
    body: GroupCsvImportRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GroupCsvImportResponse:
    svc = _service(db)
    return await svc.validate_csv_groups(
        assessment_id=assessment_id,
        current_user=current_user,
        data=body,
    )


@router.post(
    "/assessments/{assessment_id}/groups/save-manual",
    response_model=list[StudentGroupResponse],
    summary="Save manually defined groups",
)
async def save_manual_groups(
    assessment_id: uuid.UUID,
    body: ManualGroupCreateRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> list[StudentGroupResponse]:
    svc = _service(db)
    groups = await svc.save_manual_groups(
        assessment_id=assessment_id,
        current_user=current_user,
        data=body,
    )
    await db.commit()
    return groups


@router.get(
    "/assessments/{assessment_id}/groups",
    response_model=list[StudentGroupResponse],
    summary="List all groups for an assessment",
)
async def list_groups(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> list[StudentGroupResponse]:
    svc = _service(db)
    await svc._get_assessment_for_edit(assessment_id, current_user)
    from app.db.repositories.group_repo import GroupRepository
    repo = GroupRepository(db)
    groups = await repo.list_groups_by_assessment(assessment_id, include_members=True)
    return [await svc._serialize_group(g) for g in groups]


@router.post(
    "/assessments/{assessment_id}/groups/lock",
    response_model=list[StudentGroupResponse],
    summary="Lock group membership before publishing",
)
async def lock_groups(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> list[StudentGroupResponse]:
    svc = _service(db)
    groups = await svc.lock_groups_for_publish(
        assessment_id=assessment_id,
        current_user=current_user,
    )
    await db.commit()
    return groups


# ── LECTURER: WORKSPACE ───────────────────────────────────────────────────────


@router.get(
    "/submissions/{submission_id}/workspace",
    response_model=GroupWorkspaceResponse,
    summary="Get the collaborative workspace details for a group submission (Lecturer view)",
)
async def get_submission_workspace(
    submission_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GroupWorkspaceResponse:
    svc = _service(db)
    return await svc.get_submission_workspace(
        submission_id=submission_id,
        current_user=current_user,
    )


# ── STUDENT: WORKSPACE ───────────────────────────────────────────────────────


@router.get(
    "/assessments/{assessment_id}/workspace",
    response_model=GroupWorkspaceResponse,
    summary="Get the collaborative workspace for a group",
)
async def get_workspace(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> GroupWorkspaceResponse:
    svc = _service(db)
    return await svc.get_workspace(
        assessment_id=assessment_id,
        student_id=current_user.id,
    )


@router.get(
    "/submissions/{submission_id}/workspace",
    response_model=GroupWorkspaceResponse,
    summary="Get the full group workspace for a submission",
)
async def get_submission_workspace(
    submission_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GroupWorkspaceResponse:
    svc = _service(db)
    return await svc.get_submission_workspace_for_lecturer(
        submission_id=submission_id,
        current_user=current_user,
    )



@router.put(
    "/submissions/{submission_id}/answers/{question_id}",
    response_model=GroupSubmissionAnswerResponse,
    summary="Save a shared answer or note",
)
async def save_answer(
    submission_id: uuid.UUID,
    question_id: uuid.UUID,
    body: SaveGroupAnswerRequest,
    assessment_id: uuid.UUID, # We need assessment_id for context in service
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> GroupSubmissionAnswerResponse:
    svc = _service(db)
    answer = await svc.save_group_answer(
        assessment_id=assessment_id,
        submission_id=submission_id,
        question_id=question_id,
        student_id=current_user.id,
        data=body,
    )
    await db.commit()
    return answer


@router.post(
    "/submissions/{submission_id}/comments",
    response_model=GroupSubmissionCommentResponse,
    summary="Add a comment to the group workspace",
)
async def add_comment(
    submission_id: uuid.UUID,
    body: AddGroupCommentRequest,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> GroupSubmissionCommentResponse:
    svc = _service(db)
    comment = await svc.add_group_comment(
        assessment_id=assessment_id,
        submission_id=submission_id,
        student_id=current_user.id,
        data=body,
    )
    await db.commit()
    return comment


@router.post(
    "/submissions/{submission_id}/request-approval",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Request all group members to approve the submission",
)
async def request_approval(
    submission_id: uuid.UUID,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = _service(db)
    await svc.request_submission_approval(
        assessment_id=assessment_id,
        submission_id=submission_id,
        student_id=current_user.id,
    )
    await db.commit()


@router.post(
    "/submissions/{submission_id}/approve",
    response_model=GroupSubmissionApprovalResponse,
    summary="Approve or reject a group submission",
)
async def approve_submission(
    submission_id: uuid.UUID,
    body: ApproveGroupSubmissionRequest,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> GroupSubmissionApprovalResponse:
    svc = _service(db)
    approval = await svc.approve_submission(
        assessment_id=assessment_id,
        submission_id=submission_id,
        student_id=current_user.id,
        data=body,
    )
    await db.commit()
    return approval


@router.post(
    "/submissions/{submission_id}/submit",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Finalize and submit group work",
)
async def submit_group_work(
    submission_id: uuid.UUID,
    body: FinalizeGroupSubmissionRequest,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = _service(db)
    await svc.finalize_submission(
        assessment_id=assessment_id,
        submission_id=submission_id,
        student_id=current_user.id,
        data=body,
    )
    await db.commit()


# ── APPEALS ──────────────────────────────────────────────────────────────────


@router.post(
    "/submissions/{submission_id}/appeals",
    response_model=GroupAppealResponse,
    summary="Initiate a group appeal",
)
async def create_appeal(
    submission_id: uuid.UUID,
    body: CreateGroupAppealRequest,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> GroupAppealResponse:
    svc = _service(db)
    appeal = await svc.create_group_appeal(
        assessment_id=assessment_id,
        submission_id=submission_id,
        student_id=current_user.id,
        data=body,
    )
    await db.commit()
    return appeal


@router.post(
    "/appeals/{appeal_id}/approve",
    response_model=GroupAppealApprovalResponse,
    summary="Approve or reject a group appeal",
)
async def approve_appeal(
    appeal_id: uuid.UUID,
    body: ApproveGroupAppealRequest,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> GroupAppealApprovalResponse:
    svc = _service(db)
    approval = await svc.approve_group_appeal(
        assessment_id=assessment_id,
        appeal_id=appeal_id,
        student_id=current_user.id,
        data=body,
    )
    await db.commit()
    return approval


@router.post(
    "/appeals/{appeal_id}/resolve",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Resolve a group appeal (lecturer)",
)
async def resolve_appeal(
    appeal_id: uuid.UUID,
    body: ResolveGroupAppealRequest,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = _service(db)
    await svc.resolve_group_appeal(
        assessment_id=assessment_id,
        appeal_id=appeal_id,
        current_user=current_user,
        data=body,
    )
    await db.commit()


# ── LECTURER: GRADING & RESULTS ──────────────────────────────────────────────


@router.post(
    "/submissions/{submission_id}/grade",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Assign a grade to a group submission",
)
async def grade_submission(
    submission_id: uuid.UUID,
    body: GroupSubmissionGradeRequest,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = _service(db)
    await svc.grade_group_submission(
        assessment_id=assessment_id,
        submission_id=submission_id,
        current_user=current_user,
        data=body,
    )
    await db.commit()


@router.post(
    "/submissions/{submission_id}/release-result",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Release results to group members",
)
async def release_result(
    submission_id: uuid.UUID,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = _service(db)
    await svc.release_group_result(
        assessment_id=assessment_id,
        submission_id=submission_id,
        current_user=current_user,
    )
    await db.commit()


@router.post(
    "/submissions/{submission_id}/assign-reassessment",
    response_model=uuid.UUID,
    summary="Assign a reassessment to a failing group",
)
async def assign_reassessment(
    submission_id: uuid.UUID,
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    svc = _service(db)
    reassessment_id = await svc.assign_group_reassessment(
        assessment_id=assessment_id,
        submission_id=submission_id,
        current_user=current_user,
    )
    await db.commit()
    return reassessment_id


@router.put(
    "/submissions/{submission_id}/questions/{question_id}/grade",
    response_model=GroupSubmissionAnswerResponse,
    summary="Grade or save draft for a single question in group work",
)
async def grade_submission_question(
    submission_id: uuid.UUID,
    question_id: uuid.UUID,
    body: GradeGroupQuestionRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GroupSubmissionAnswerResponse:
    svc = _service(db)
    result = await svc.grade_submission_question(
        submission_id=submission_id,
        question_id=question_id,
        data=body,
        current_user=current_user,
    )
    await db.commit()
    return result


@router.post(
    "/submissions/{submission_id}/questions/{question_id}/ai-review",
    response_model=GroupSubmissionAnswerResponse,
    summary="Trigger on-demand AI review for a group submission question",
)
async def trigger_question_ai_review(
    submission_id: uuid.UUID,
    question_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GroupSubmissionAnswerResponse:
    svc = _service(db)
    result = await svc.trigger_ai_review_for_group_question(
        submission_id=submission_id,
        question_id=question_id,
        current_user=current_user,
    )
    await db.commit()
    return result


@router.post(
    "/submissions/{submission_id}/questions/{question_id}/suggest-changes",
    response_model=GroupSubmissionAnswerResponse,
    summary="Suggest changes to AI review for a group submission question",
)
async def suggest_group_question_ai_changes(
    submission_id: uuid.UUID,
    question_id: uuid.UUID,
    body: SuggestChangesRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GroupSubmissionAnswerResponse:
    svc = _service(db)
    result = await svc.suggest_ai_changes_for_group_question(
        submission_id=submission_id,
        question_id=question_id,
        feedback=body.feedback,
        current_user=current_user,
    )
    await db.commit()
    return result
