"""Business logic for group-work assessments."""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import UserRole
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.db.enums import (
    GroupActivityType,
    GroupAppealStatus,
    GroupApprovalStatus,
    GroupSubmissionStatus,
    NotificationType,
    QuestionDistributionMode,
    StudentGroupStatus,
)
from app.db.models.auth import User, UserProfile
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.group_appeal_repo import GroupAppealRepository
from app.db.repositories.group_repo import GroupRepository
from app.db.repositories.group_submission_repo import GroupSubmissionRepository
from app.db.repositories.notification_repo import NotificationRepository
from app.schemas.group_work import (
    AddGroupCommentRequest,
    ApproveGroupAppealRequest,
    ApproveGroupSubmissionRequest,
    AutoGenerateGroupsRequest,
    CreateGroupAppealRequest,
    FinalizeGroupSubmissionRequest,
    GroupCsvImportRequest,
    GroupCsvImportResponse,
    GroupWorkspaceAssessmentResponse,
    GroupWorkspaceMemberResponse,
    GroupWorkspaceQuestionOptionResponse,
    GroupWorkspaceQuestionResponse,
    GroupMemberResponse,
    GroupWorkspaceResponse,
    GroupSubmissionAnswerResponse,
    GroupSubmissionApprovalResponse,
    GroupSubmissionCommentResponse,
    GroupActivityLogResponse,
    GroupAppealApprovalResponse,
    GroupAppealResponse,
    GroupAssessmentMaterialResponse,
    GroupSubmissionGradeRequest,
    ManualGroupCreateRequest,
    ResolveGroupAppealRequest,
    SaveGroupAnswerRequest,
    StudentGroupResponse,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class GroupWorkService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.group_repo = GroupRepository(db)
        self.submission_repo = GroupSubmissionRepository(db)
        self.appeal_repo = GroupAppealRepository(db)
        self.notification_repo = NotificationRepository(db)

    def _assert_can_edit(self, assessment, current_user: User) -> None:
        if current_user.role == UserRole.ADMIN.value:
            return
        if str(assessment.created_by_id) != str(current_user.id):
            raise AuthorizationError("You can only manage group work for your own assessments.")

    def _assert_group_assessment(self, assessment) -> None:
        if not assessment or not assessment.is_group_assessment:
            raise ValidationError("This assessment is not configured as group work.", code="NOT_GROUP_WORK")

    def _assert_draft_state(self, assessment) -> None:
        if assessment.draft_is_complete or assessment.published_at:
            raise ConflictError("Groups can only be changed before the assessment is published.", code="GROUPS_ALREADY_LOCKED")

    async def _get_assessment_for_edit(self, assessment_id: uuid.UUID, current_user: User):
        assessment = await self.assessment_repo.get_by_id(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found", code="ASSESSMENT_NOT_FOUND")
        self._assert_can_edit(assessment, current_user)
        self._assert_group_assessment(assessment)
        return assessment

    async def _get_group_context(
        self,
        *,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
    ):
        assessment = await self.assessment_repo.get_by_id(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found", code="ASSESSMENT_NOT_FOUND")
        self._assert_group_assessment(assessment)
        group = await self.group_repo.get_student_group_for_assessment(
            assessment_id=assessment_id,
            student_id=student_id,
            include_members=True,
        )
        if not group:
            raise AuthorizationError("You are not assigned to a group for this assessment.", code="GROUP_MEMBERSHIP_REQUIRED")
        return assessment, group

    async def save_manual_groups(
        self,
        *,
        assessment_id: uuid.UUID,
        current_user: User,
        data: ManualGroupCreateRequest,
        validate_full_roster: bool = True,
    ) -> list[StudentGroupResponse]:
        assessment = await self._get_assessment_for_edit(assessment_id, current_user)
        self._assert_draft_state(assessment)

        eligible_students = set(await self.group_repo.list_target_student_ids(assessment_id))
        if not eligible_students:
            raise ValidationError("No enrolled students were found in the assessment's target sections.", code="NO_TARGET_STUDENTS")

        assigned_students: set[uuid.UUID] = set()
        for group in data.groups:
            if not group.members:
                raise ValidationError(f"Group '{group.name}' must contain at least one student.", code="EMPTY_GROUP")
            if group.max_members is not None and len(group.members) > group.max_members:
                raise ValidationError(f"Group '{group.name}' exceeds its member limit.", code="GROUP_TOO_LARGE")
            leader_count = sum(1 for member in group.members if member.is_leader)
            if leader_count > 1:
                raise ValidationError(f"Group '{group.name}' cannot have more than one leader.", code="MULTIPLE_GROUP_LEADERS")
            for member in group.members:
                if member.student_id not in eligible_students:
                    raise ValidationError("One or more students are not enrolled in the targeted class sections.", code="STUDENT_NOT_ELIGIBLE")
                if member.student_id in assigned_students:
                    raise ValidationError("A student cannot belong to more than one group.", code="DUPLICATE_GROUP_MEMBER")
                assigned_students.add(member.student_id)

        if validate_full_roster and assigned_students != eligible_students:
            missing = len(eligible_students - assigned_students)
            raise ValidationError(f"All targeted students must be assigned before groups can be saved. Missing: {missing}.", code="UNASSIGNED_STUDENTS")

        await self.group_repo.remove_groups_for_assessment(assessment_id)
        created_groups = []
        for group_input in data.groups:
            group = await self.group_repo.create_group(
                assessment_id=assessment_id,
                name=group_input.name,
                max_members=group_input.max_members or assessment.max_group_size,
                status=StudentGroupStatus.READY,
            )
            for member in group_input.members:
                await self.group_repo.add_member(
                    group_id=group.id,
                    student_id=member.student_id,
                    group_role=member.group_role,
                    is_leader=member.is_leader,
                )
            created_groups.append(group)

        groups = await self.group_repo.list_groups_by_assessment(assessment_id, include_members=True)
        return await self._serialize_groups(groups)

    async def auto_generate_groups(
        self,
        *,
        assessment_id: uuid.UUID,
        current_user: User,
        data: AutoGenerateGroupsRequest,
    ) -> list[StudentGroupResponse]:
        assessment = await self._get_assessment_for_edit(assessment_id, current_user)
        self._assert_draft_state(assessment)

        student_ids = list(await self.group_repo.list_target_student_ids(assessment_id))
        if not student_ids:
            raise ValidationError("No eligible students were found for automatic grouping.", code="NO_TARGET_STUDENTS")

        if len(student_ids) < 2:
            raise ValidationError("Automatic grouping requires at least two students.", code="INSUFFICIENT_STUDENTS")

        if not data.allow_smaller_final_group and len(student_ids) % data.max_group_size != 0:
            raise ValidationError("The class size does not divide evenly into the selected group size.", code="UNEVEN_GROUP_SIZE")

        await self.group_repo.remove_groups_for_assessment(assessment_id)

        total_groups = math.ceil(len(student_ids) / data.max_group_size)
        for idx in range(total_groups):
            start = idx * data.max_group_size
            end = start + data.max_group_size
            chunk = student_ids[start:end]
            group = await self.group_repo.create_group(
                assessment_id=assessment_id,
                name=data.naming_pattern.format(index=idx + 1),
                max_members=data.max_group_size,
                status=StudentGroupStatus.READY,
            )
            for offset, student_id in enumerate(chunk):
                await self.group_repo.add_member(
                    group_id=group.id,
                    student_id=student_id,
                    is_leader=offset == 0,
                )

        groups = await self.group_repo.list_groups_by_assessment(assessment_id, include_members=True)
        return await self._serialize_groups(groups)

    async def validate_csv_groups(
        self,
        *,
        assessment_id: uuid.UUID,
        current_user: User,
        data: GroupCsvImportRequest,
    ) -> GroupCsvImportResponse:
        assessment = await self._get_assessment_for_edit(assessment_id, current_user)
        self._assert_draft_state(assessment)
        eligible_students = set(await self.group_repo.list_target_student_ids(assessment_id))
        errors = []
        grouped: dict[str, list] = {}
        seen_students: set[uuid.UUID] = set()

        for idx, row in enumerate(data.rows, start=1):
            if row.student_id not in eligible_students:
                errors.append({"row_number": idx, "student_id": row.student_id, "reason": "Student is not enrolled in the targeted class sections."})
                continue
            if row.student_id in seen_students:
                errors.append({"row_number": idx, "student_id": row.student_id, "reason": "Student is listed more than once in the CSV."})
                continue
            seen_students.add(row.student_id)
            grouped.setdefault(row.group_name, []).append(row)

        valid_groups = [
            {
                "name": group_name,
                "members": [
                    {
                        "student_id": row.student_id,
                        "group_role": row.group_role,
                        "is_leader": row.is_leader,
                    }
                    for row in rows
                ],
            }
            for group_name, rows in grouped.items()
        ]

        return GroupCsvImportResponse(
            valid_groups=valid_groups,
            imported_count=len(seen_students),
            error_count=len(errors),
            errors=errors,
        )

    async def invalidate_groups_on_enrollment_change(
        self,
        *,
        assessment_id: uuid.UUID,
        current_user: User,
    ) -> int:
        assessment = await self._get_assessment_for_edit(assessment_id, current_user)
        self._assert_draft_state(assessment)
        count = await self.group_repo.invalidate_groups_for_assessment(assessment_id)
        await self.assessment_repo.update_fields(
            assessment_id,
            updated_by_id=current_user.id,
            group_invalidated_at=_utcnow(),
            group_membership_locked_at=None,
        )
        return count

    async def lock_groups_for_publish(
        self,
        *,
        assessment_id: uuid.UUID,
        current_user: User,
    ) -> list[StudentGroupResponse]:
        assessment = await self._get_assessment_for_edit(assessment_id, current_user)
        groups = await self.group_repo.list_groups_by_assessment(assessment_id, include_members=True)
        if not groups:
            raise ValidationError("Create groups before publishing this group-work assessment.", code="GROUPS_REQUIRED")

        eligible_students = set(await self.group_repo.list_target_student_ids(assessment_id))
        assigned_students = {
            member.student_id
            for group in groups
            for member in group.members
            if not member.is_deleted
        }
        if eligible_students != assigned_students:
            missing = len(eligible_students - assigned_students)
            raise ValidationError(f"All targeted students must be assigned before groups can be locked. Missing: {missing}.", code="UNASSIGNED_STUDENTS")

        await self.group_repo.lock_groups_for_assessment(assessment_id)
        await self.assessment_repo.update_fields(
            assessment_id,
            updated_by_id=current_user.id,
            group_membership_locked_at=_utcnow(),
            group_invalidated_at=None,
        )
        locked = await self.group_repo.list_groups_by_assessment(assessment_id, include_members=True)
        return await self._serialize_groups(locked)

    async def check_enrollment_drift(
        self,
        assessment_id: uuid.UUID,
    ) -> bool:
        """
        Compare current class enrollment with assigned group members.
        Returns True if there is a mismatch (drift).
        """
        eligible_students = set(await self.group_repo.list_target_student_ids(assessment_id))
        groups = await self.group_repo.list_groups_by_assessment(assessment_id, include_members=True)
        assigned_students = {
            member.student_id
            for group in groups
            for member in group.members
            if not member.is_deleted
        }
        return eligible_students != assigned_students

    async def get_workspace(
        self,
        *,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> GroupWorkspaceResponse:
        assessment, group = await self._get_group_context(assessment_id=assessment_id, student_id=student_id)
        submission, _ = await self.submission_repo.get_or_create_submission(
            assessment_id=assessment_id,
            group_id=group.id,
        )
        submission = await self.submission_repo.get_by_id(submission.id, include_related=True) or submission
        materials = await self.submission_repo.list_materials(assessment_id=assessment_id, group_id=group.id)
        answers = submission.answers or []
        comments = submission.comments or []
        approvals = submission.approvals or []
        activity = submission.activity_logs or []
        active_member_ids = await self.submission_repo.list_active_member_ids(submission.id)
        appeal = await self.appeal_repo.get_active_by_submission(submission.id)
        questions = await self._list_workspace_questions(assessment, group.id)
        profiles = await self._get_user_profiles([member.student_id for member in group.members if not member.is_deleted])
        approval_map = {approval.student_id: approval.status for approval in approvals}
        participation_map: dict[uuid.UUID, int] = {}
        question_title_map = {str(question.id): question.text for question in questions}

        for entry in activity:
            participation_map[entry.student_id] = participation_map.get(entry.student_id, 0) + 1

        activity_responses = [
            GroupActivityLogResponse(
                id=item.id,
                submission_id=item.submission_id,
                student_id=item.student_id,
                student_name=profiles.get(item.student_id, str(item.student_id)),
                activity_type=item.activity_type,
                question_id=item.question_id,
                metadata_json=item.metadata_json,
                details={"question_title": question_title_map.get(str(item.question_id))} if item.question_id else None,
                created_at=item.created_at,
            )
            for item in activity
        ]

        return GroupWorkspaceResponse(
            assessment_id=assessment_id,
            group=await self._serialize_group(group),
            group_name=group.name,
            assessment=await self._serialize_workspace_assessment(assessment),
            submission_id=submission.id,
            submission_status=submission.status,
            question_distribution_mode=assessment.question_distribution_mode,
            questions=questions,
            members=[
                GroupWorkspaceMemberResponse(
                    student_id=member.student_id,
                    student_name=profiles.get(member.student_id, str(member.student_id)),
                    group_role=member.group_role,
                    is_leader=member.is_leader,
                    participation_count=participation_map.get(member.student_id, 0),
                    approval_status=approval_map.get(member.student_id, GroupApprovalStatus.PENDING),
                    is_online=False,
                )
                for member in group.members
                if not member.is_deleted
            ],
            materials=[GroupAssessmentMaterialResponse.model_validate(item) for item in materials],
            answers=[
                GroupSubmissionAnswerResponse(
                    id=item.id,
                    question_id=item.question_id,
                    answer_content=item.answer_content,
                    notes_content=item.notes_content,
                    last_edited_by_id=item.last_edited_by_id,
                    last_edited_at=item.last_edited_at,
                    last_modified_by_id=item.last_edited_by_id,
                    last_modified_by_name=profiles.get(item.last_edited_by_id) if item.last_edited_by_id else None,
                    last_modified_at=item.last_edited_at,
                )
                for item in answers
            ],
            comments=[
                GroupSubmissionCommentResponse(
                    id=item.id,
                    submission_id=item.submission_id,
                    question_id=item.question_id,
                    author_id=item.author_id,
                    student_id=item.author_id,
                    student_name=profiles.get(item.author_id, str(item.author_id)),
                    body=item.body,
                    created_at=item.created_at,
                )
                for item in comments
            ],
            approvals=[GroupSubmissionApprovalResponse.model_validate(item) for item in approvals],
            activity_log=activity_responses,
            activities=activity_responses,
            active_member_ids=active_member_ids,
            can_request_approval=await self._can_request_approval(submission.id, group.id, assessment_id),
            can_submit=await self._can_finalize_submission(submission.id, group.id, assessment_id),
            appeal=await self._serialize_appeal(appeal) if appeal else None,
            total_score=submission.total_score,
            feedback=submission.feedback,
            member_overrides=submission.member_overrides,
        )

    async def save_group_answer(
        self,
        *,
        assessment_id: uuid.UUID,
        submission_id: uuid.UUID,
        question_id: uuid.UUID,
        student_id: uuid.UUID,
        data: SaveGroupAnswerRequest,
    ):
        assessment, group = await self._get_group_context(assessment_id=assessment_id, student_id=student_id)
        submission = await self.submission_repo.get_by_id(submission_id)
        if not submission or submission.group_id != group.id:
            raise AuthorizationError("This group submission is not available to you.", code="GROUP_SUBMISSION_ACCESS_DENIED")
        if submission.status in {GroupSubmissionStatus.SUBMITTED, GroupSubmissionStatus.GRADED}:
            raise ConflictError("Submitted group work cannot be edited.", code="GROUP_SUBMISSION_LOCKED")
        if not await self.assessment_repo.question_in_assessment(assessment.id, question_id):
            raise ValidationError("This question does not belong to the assessment.", code="QUESTION_NOT_IN_ASSESSMENT")

        # PER_GROUP distribution enforcement
        if assessment.question_distribution_mode == QuestionDistributionMode.PER_GROUP:
            aq = await self.assessment_repo.get_assessment_question(assessment.id, question_id)
            if aq and aq.group_id and aq.group_id != group.id:
                raise ValidationError("This question is not assigned to your group.", code="QUESTION_NOT_FOR_GROUP")

        answer, _ = await self.submission_repo.upsert_answer(
            submission_id=submission_id,
            question_id=question_id,
            editor_id=student_id,
            answer_content=data.answer_content,
            notes_content=data.notes_content,
        )
        await self.submission_repo.add_activity_log(
            submission_id=submission_id,
            student_id=student_id,
            activity_type=GroupActivityType.ANSWER_EDITED if data.answer_content is not None else GroupActivityType.NOTE_ADDED,
            question_id=question_id,
            metadata_json={"change_source": data.change_source},
        )
        profiles = await self._get_user_profiles([student_id])
        return GroupSubmissionAnswerResponse(
            id=answer.id,
            question_id=answer.question_id,
            answer_content=answer.answer_content,
            notes_content=answer.notes_content,
            last_edited_by_id=answer.last_edited_by_id,
            last_edited_at=answer.last_edited_at,
            last_modified_by_id=answer.last_edited_by_id,
            last_modified_by_name=profiles.get(student_id, str(student_id)),
            last_modified_at=answer.last_edited_at,
        )

    async def add_group_comment(
        self,
        *,
        assessment_id: uuid.UUID,
        submission_id: uuid.UUID,
        student_id: uuid.UUID,
        data: AddGroupCommentRequest,
    ):
        _, group = await self._get_group_context(assessment_id=assessment_id, student_id=student_id)
        submission = await self.submission_repo.get_by_id(submission_id)
        if not submission or submission.group_id != group.id:
            raise AuthorizationError("This group submission is not available to you.", code="GROUP_SUBMISSION_ACCESS_DENIED")
        if submission.status in {GroupSubmissionStatus.SUBMITTED, GroupSubmissionStatus.GRADED}:
            raise ConflictError("Submitted group work cannot be edited.", code="GROUP_SUBMISSION_LOCKED")
        comment = await self.submission_repo.add_comment(
            submission_id=submission_id,
            author_id=student_id,
            body=data.body,
            question_id=data.question_id,
        )
        await self.submission_repo.add_activity_log(
            submission_id=submission_id,
            student_id=student_id,
            activity_type=GroupActivityType.COMMENT_ADDED,
            question_id=data.question_id,
        )
        profiles = await self._get_user_profiles([student_id])
        return GroupSubmissionCommentResponse(
            id=comment.id,
            submission_id=comment.submission_id,
            question_id=comment.question_id,
            author_id=comment.author_id,
            student_id=comment.author_id,
            student_name=profiles.get(student_id, str(student_id)),
            body=comment.body,
            created_at=comment.created_at,
        )

    async def request_submission_approval(
        self,
        *,
        assessment_id: uuid.UUID,
        submission_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> None:
        _, group = await self._get_group_context(assessment_id=assessment_id, student_id=student_id)
        submission = await self.submission_repo.get_by_id(submission_id)
        if not submission or submission.group_id != group.id:
            raise AuthorizationError("This group submission is not available to you.", code="GROUP_SUBMISSION_ACCESS_DENIED")
        if submission.status in {GroupSubmissionStatus.SUBMITTED, GroupSubmissionStatus.GRADED}:
            raise ConflictError("This group submission is already closed.", code="GROUP_SUBMISSION_LOCKED")

        if not await self._can_request_approval(submission.id, group.id, assessment_id):
            raise ValidationError("All group members must participate before approval can be requested.", code="PARTICIPATION_REQUIRED")

        member_ids = [member.student_id for member in group.members if not member.is_deleted]
        await self.submission_repo.seed_submission_approvals(
            submission_id=submission_id,
            student_ids=member_ids,
        )
        await self.submission_repo.set_submission_status(
            submission_id=submission_id,
            status=GroupSubmissionStatus.READY_FOR_APPROVAL,
            requested_by_id=student_id,
        )
        await self.submission_repo.add_activity_log(
            submission_id=submission_id,
            student_id=student_id,
            activity_type=GroupActivityType.APPROVAL_REQUESTED,
        )
        for member_id in member_ids:
            if member_id == student_id:
                continue
            await self.notification_repo.create(
                recipient_id=member_id,
                notification_type=NotificationType.GROUP_APPROVAL_REQUEST,
                title="Group submission approval requested",
                body="A group member has requested your approval to submit the group work.",
                reference_id=submission_id,
                reference_type="group_submission",
                action_url=f"/student/group-work/{assessment_id}",
            )

    async def approve_submission(
        self,
        *,
        assessment_id: uuid.UUID,
        submission_id: uuid.UUID,
        student_id: uuid.UUID,
        data: ApproveGroupSubmissionRequest,
    ):
        _, group = await self._get_group_context(assessment_id=assessment_id, student_id=student_id)
        submission = await self.submission_repo.get_by_id(submission_id)
        if not submission or submission.group_id != group.id:
            raise AuthorizationError("This group submission is not available to you.", code="GROUP_SUBMISSION_ACCESS_DENIED")
        if submission.status in {GroupSubmissionStatus.SUBMITTED, GroupSubmissionStatus.GRADED}:
            raise ConflictError("This group submission is already closed.", code="GROUP_SUBMISSION_LOCKED")
        approval, _ = await self.submission_repo.upsert_submission_approval(
            submission_id=submission_id,
            student_id=student_id,
            status=data.status,
            note=data.note,
        )
        await self.submission_repo.add_activity_log(
            submission_id=submission_id,
            student_id=student_id,
            activity_type=(
                GroupActivityType.SUBMISSION_APPROVED
                if data.status == GroupApprovalStatus.APPROVED
                else GroupActivityType.SUBMISSION_REJECTED
            ),
        )
        if await self._all_submission_approvals_approved(submission_id, group.id):
            await self.submission_repo.set_submission_status(
                submission_id=submission_id,
                status=GroupSubmissionStatus.APPROVED,
            )
        return GroupSubmissionApprovalResponse.model_validate(approval)

    async def finalize_submission(
        self,
        *,
        assessment_id: uuid.UUID,
        submission_id: uuid.UUID,
        student_id: uuid.UUID,
        data: FinalizeGroupSubmissionRequest,
    ):
        assessment, group = await self._get_group_context(assessment_id=assessment_id, student_id=student_id)
        submission = await self.submission_repo.get_by_id(submission_id)
        if not submission or submission.group_id != group.id:
            raise AuthorizationError("This group submission is not available to you.", code="GROUP_SUBMISSION_ACCESS_DENIED")
        if submission.status == GroupSubmissionStatus.SUBMITTED:
            raise ConflictError("This group submission has already been finalized.", code="GROUP_SUBMISSION_ALREADY_SUBMITTED")
        if submission.status == GroupSubmissionStatus.GRADED:
            raise ConflictError("This group submission has already been graded.", code="GROUP_SUBMISSION_LOCKED")
        if not data.confirm:
            raise ValidationError("Submission confirmation is required.", code="SUBMISSION_CONFIRMATION_REQUIRED")
        if not await self._can_finalize_submission(submission_id, group.id, assessment_id):
            raise ConflictError("The group submission does not yet satisfy the approval or participation rules.", code="GROUP_SUBMISSION_NOT_READY")
        await self.submission_repo.set_submission_status(
            submission_id=submission_id,
            status=GroupSubmissionStatus.SUBMITTED,
            submitted_by_id=student_id,
        )
        await self.submission_repo.add_activity_log(
            submission_id=submission_id,
            student_id=student_id,
            activity_type=GroupActivityType.SUBMISSION_FINALIZED,
        )

        # Notify lecturer
        if assessment.created_by_id:
            await self.notification_repo.create(
                recipient_id=assessment.created_by_id,
                notification_type=NotificationType.SUBMISSION_RECEIVED,
                title="Group submission received",
                body=f"Group '{group.name}' has submitted their work for '{assessment.title}'.",
                reference_id=submission_id,
                reference_type="group_submission",
                action_url=f"/lecturer/grading",
            )

    async def create_group_appeal(
        self,
        *,
        assessment_id: uuid.UUID,
        submission_id: uuid.UUID,
        student_id: uuid.UUID,
        data: CreateGroupAppealRequest,
    ):
        _, group = await self._get_group_context(assessment_id=assessment_id, student_id=student_id)
        submission = await self.submission_repo.get_by_id(submission_id)
        if not submission or submission.group_id != group.id:
            raise AuthorizationError("This group submission is not available to you.", code="GROUP_SUBMISSION_ACCESS_DENIED")
        if submission.status != GroupSubmissionStatus.GRADED:
            raise ConflictError("Appeals can only be opened after grading.", code="GROUP_APPEAL_NOT_AVAILABLE")
        existing = await self.appeal_repo.get_active_by_submission(submission_id)
        if existing:
            raise ConflictError("There is already an active appeal for this group submission.", code="GROUP_APPEAL_ALREADY_EXISTS")

        appeal = await self.appeal_repo.create_appeal(
            submission_id=submission_id,
            initiated_by_id=student_id,
            statement=data.statement,
            status=GroupAppealStatus.PENDING_MEMBER_APPROVAL,
        )
        member_ids = [member.student_id for member in group.members if not member.is_deleted]
        await self.appeal_repo.seed_appeal_approvals(
            appeal_id=appeal.id,
            student_ids=member_ids,
            initiated_by_id=student_id,
        )
        await self.submission_repo.add_activity_log(
            submission_id=submission_id,
            student_id=student_id,
            activity_type=GroupActivityType.APPEAL_OPENED,
        )
        for member_id in member_ids:
            if member_id == student_id:
                continue
            await self.notification_repo.create(
                recipient_id=member_id,
                notification_type=NotificationType.GROUP_APPEAL_REQUEST,
                title="Group appeal awaiting approval",
                body="A group member opened a result appeal and needs your approval.",
                reference_id=appeal.id,
                reference_type="group_appeal",
                action_url=f"/student/group-work/{assessment_id}",
            )
        return await self._serialize_appeal(await self.appeal_repo.get_by_id(appeal.id, include_approvals=True))

    async def approve_group_appeal(
        self,
        *,
        assessment_id: uuid.UUID,
        appeal_id: uuid.UUID,
        student_id: uuid.UUID,
        data: ApproveGroupAppealRequest,
    ):
        assessment, group = await self._get_group_context(assessment_id=assessment_id, student_id=student_id)
        appeal = await self.appeal_repo.get_by_id(appeal_id, include_approvals=True)
        if not appeal:
            raise NotFoundError("Group appeal not found.", code="GROUP_APPEAL_NOT_FOUND")
        submission = await self.submission_repo.get_by_id(appeal.submission_id)
        if not submission or submission.group_id != group.id:
            raise AuthorizationError("This group appeal is not available to you.", code="GROUP_APPEAL_ACCESS_DENIED")

        approval, _ = await self.appeal_repo.upsert_appeal_approval(
            appeal_id=appeal_id,
            student_id=student_id,
            status=GroupApprovalStatus.APPROVED if data.approve else GroupApprovalStatus.REJECTED,
            note=data.note,
        )
        await self.submission_repo.add_activity_log(
            submission_id=submission.id,
            student_id=student_id,
            activity_type=GroupActivityType.APPEAL_APPROVED if data.approve else GroupActivityType.APPEAL_REJECTED,
        )
        if not data.approve:
            await self.appeal_repo.set_status(appeal_id=appeal_id, status=GroupAppealStatus.CANCELLED)
        elif await self._all_appeal_approvals_approved(appeal_id, group.id):
            await self.appeal_repo.set_status(
                appeal_id=appeal_id,
                status=GroupAppealStatus.SUBMITTED_TO_LECTURER,
            )
            if assessment.created_by_id:
                await self.notification_repo.create(
                    recipient_id=assessment.created_by_id,
                    notification_type=NotificationType.GROUP_APPEAL_REQUEST,
                    title="Group appeal submitted",
                    body="A group appeal has been approved by all members and awaits your review.",
                    reference_id=appeal_id,
                    reference_type="group_appeal",
                    action_url=f"/lecturer/grading",
                )
        return GroupAppealApprovalResponse.model_validate(approval)

    async def resolve_group_appeal(
        self,
        *,
        assessment_id: uuid.UUID,
        appeal_id: uuid.UUID,
        current_user: User,
        data: ResolveGroupAppealRequest,
    ) -> None:
        assessment = await self._get_assessment_for_edit(assessment_id, current_user)
        appeal = await self.appeal_repo.get_by_id(appeal_id)
        if not appeal:
            raise NotFoundError("Group appeal not found.", code="GROUP_APPEAL_NOT_FOUND")

        status = GroupAppealStatus.APPROVED if data.approve else GroupAppealStatus.REJECTED
        await self.appeal_repo.set_status(
            appeal_id=appeal_id,
            status=status,
            lecturer_decision=data.decision,
        )

        # Notify all members
        submission = await self.submission_repo.get_by_id(appeal.submission_id)
        group = await self.group_repo.get_group_by_id(submission.group_id, include_members=True)
        for member in group.members:
            if member.is_deleted:
                continue
            await self.notification_repo.create(
                recipient_id=member.student_id,
                notification_type=NotificationType.APPEAL_RESOLVED,
                title="Group appeal resolved",
                body=f"The lecturer has resolved your group's appeal for '{assessment.title}'.",
                reference_id=appeal_id,
                reference_type="group_appeal",
                action_url=f"/student/group-work/{assessment_id}",
            )

    async def assign_group_reassessment(
        self,
        *,
        assessment_id: uuid.UUID,
        submission_id: uuid.UUID,
        current_user: User,
    ) -> uuid.UUID:
        """
        Assign a reassessment to a group that failed the original assessment.
        Creates a new assessment record linked via reassessment_of_id and clones the group.
        """
        assessment = await self._get_assessment_for_edit(assessment_id, current_user)
        submission = await self.submission_repo.get_by_id(submission_id)
        if not submission or submission.assessment_id != assessment.id:
            raise NotFoundError("Group submission not found.", code="GROUP_SUBMISSION_NOT_FOUND")

        # Validation: Only allow reassessment if group actually failed
        if submission.total_score is not None and assessment.passing_marks is not None:
            if submission.total_score >= assessment.passing_marks:
                 raise ConflictError("Reassessment cannot be assigned to a passing group.", code="GROUP_NOT_ELIGIBLE_FOR_REASSESSMENT")
        
        # Create new assessment (reassessment)
        from app.db.models.assessment import Assessment, AssessmentType, AssessmentStatus
        reassessment = Assessment(
            title=f"Reassessment: {assessment.title}",
            description=assessment.description,
            instructions=assessment.instructions,
            assessment_type=AssessmentType.REASSESSMENT,
            status=AssessmentStatus.DRAFT,
            subject_id=assessment.subject_id,
            course_id=assessment.course_id,
            teaching_workspace_id=assessment.teaching_workspace_id,
            academic_year=assessment.academic_year,
            created_by_id=current_user.id,
            reassessment_of_id=assessment.id,
            is_group_assessment=True,
            max_group_size=assessment.max_group_size,
            group_assignment_mode=assessment.group_assignment_mode,
            question_distribution_mode=assessment.question_distribution_mode,
            require_all_member_approval=assessment.require_all_member_approval,
            require_all_member_participation=assessment.require_all_member_participation,
            total_marks=assessment.total_marks,
            duration_minutes=assessment.duration_minutes,
            grading_mode=assessment.grading_mode,
        )
        self.db.add(reassessment)
        await self.db.flush()

        # Clone the group for the new assessment
        original_group = await self.group_repo.get_group_by_id(submission.group_id, include_members=True)
        new_group = await self.group_repo.create_group(
            assessment_id=reassessment.id,
            name=original_group.name,
            max_members=original_group.max_members,
            status=StudentGroupStatus.READY,
        )
        for member in original_group.members:
            if member.is_deleted:
                continue
            await self.group_repo.add_member(
                group_id=new_group.id,
                student_id=member.student_id,
                group_role=member.group_role,
                is_leader=member.is_leader,
            )

        # Update original submission to link to reassessment
        await self.submission_repo.set_submission_status(
            submission_id=submission_id,
            status=GroupSubmissionStatus.REASSESSMENT_ASSIGNED,
        )

        # Notify members
        for member in original_group.members:
            if member.is_deleted:
                continue
            await self.notification_repo.create(
                recipient_id=member.student_id,
                notification_type=NotificationType.GROUP_REASSESSMENT_ASSIGNED,
                title="Reassessment assigned",
                body=f"A reassessment has been assigned to your group for '{assessment.title}'.",
                reference_id=reassessment.id,
                reference_type="assessment",
                action_url=f"/student/group-work/{reassessment.id}",
            )

        return reassessment.id

    async def get_grading_queue(
        self,
        *,
        lecturer_id: uuid.UUID,
        assessment_id: uuid.UUID | None = None,
        page: int = 1,
        page_size: int = 30,
    ) -> tuple[list[GroupSubmissionSummary], int]:
        """Fetch group submissions that need grading for a lecturer."""
        from app.db.enums import GroupSubmissionStatus, GroupAppealStatus, GroupApprovalStatus
        from app.schemas.grading import GroupSubmissionSummary

        items, total = await self.submission_repo.get_grading_queue(
            lecturer_id=lecturer_id,
            assessment_id=assessment_id,
            status=GroupSubmissionStatus.SUBMITTED,
            page=page,
            page_size=page_size,
        )

        summaries = []
        for item in items:
            # member_count from group relationship
            member_count = 0
            if item.group:
                # We need to make sure members are loaded. 
                # Our repo uses selectinload for assessment and group, 
                # but we might need members of that group too.
                # Since we don't have nested selectinload in the repo method yet,
                # let's just count them if they are loaded or return 0.
                member_count = len(item.group.members) if hasattr(item.group, "members") else 0
            
            has_active_appeal = any(
                a.status == GroupAppealStatus.PENDING for a in item.appeals
            ) if hasattr(item, "appeals") else False

            approved_member_count = 0
            if hasattr(item, "approvals") and item.approvals:
                approved_member_count = sum(1 for appr in item.approvals if appr.status == GroupApprovalStatus.APPROVED)

            summaries.append(
                GroupSubmissionSummary(
                    id=item.id,
                    group_id=item.group_id,
                    group_name=item.group.name if item.group else "Unknown Group",
                    assessment_id=item.assessment_id,
                    assessment_title=item.assessment.title if item.assessment else "Unknown Assessment",
                    member_count=member_count,
                    approved_member_count=approved_member_count,
                    status=item.status.value,
                    score=item.total_score,
                    max_score=item.max_score,
                    submitted_at=item.submitted_at,
                    has_active_appeal=has_active_appeal,
                )
            )

        return summaries, total

    async def grade_group_submission(
        self,
        *,
        assessment_id: uuid.UUID,
        submission_id: uuid.UUID,
        current_user: User,
        data: GroupSubmissionGradeRequest,
    ) -> None:
        assessment = await self._get_assessment_for_edit(assessment_id, current_user)
        submission = await self.submission_repo.get_by_id(submission_id)
        if not submission or submission.assessment_id != assessment.id:
            raise NotFoundError("Group submission not found.", code="GROUP_SUBMISSION_NOT_FOUND")
        if submission.status not in {GroupSubmissionStatus.SUBMITTED, GroupSubmissionStatus.APPEALED, GroupSubmissionStatus.GRADED}:
            raise ConflictError("Only submitted group work can be graded.", code="GROUP_SUBMISSION_NOT_GRADABLE")
        
        status = GroupSubmissionStatus.GRADED if (data.is_final if data.is_final is not None else True) else GroupSubmissionStatus.SUBMITTED
        await self.submission_repo.set_grade(
            submission_id=submission_id,
            total_score=data.total_score,
            max_score=data.max_score,
            feedback=data.feedback,
            graded_by_id=current_user.id,
            member_overrides=data.member_overrides,
            status=status,
        )

    async def release_group_result(
        self,
        *,
        assessment_id: uuid.UUID,
        submission_id: uuid.UUID,
        current_user: User,
    ) -> None:
        assessment = await self._get_assessment_for_edit(assessment_id, current_user)
        submission = await self.submission_repo.get_by_id(submission_id)
        if not submission or submission.assessment_id != assessment.id:
            raise NotFoundError("Group submission not found.", code="GROUP_SUBMISSION_NOT_FOUND")
        if submission.status != GroupSubmissionStatus.GRADED:
            raise ConflictError("Only graded group submissions can be released.", code="GROUP_RESULT_NOT_READY")

        group = await self.group_repo.get_group_by_id(submission.group_id, include_members=True)
        if not group:
            raise NotFoundError("Group not found.", code="GROUP_NOT_FOUND")

        await self.submission_repo.mark_result_released(submission_id)
        for member in group.members:
            if member.is_deleted:
                continue
            await self.notification_repo.create(
                recipient_id=member.student_id,
                notification_type=NotificationType.GROUP_RESULT_RELEASED,
                title="Group work result released",
                body=f"Results for '{assessment.title}' have been released to your group.",
                reference_id=submission_id,
                reference_type="group_submission",
                action_url=f"/student/group-work/{assessment_id}",
            )

    async def _all_submission_approvals_approved(self, submission_id: uuid.UUID, group_id: uuid.UUID) -> bool:
        approvals = await self.submission_repo.list_submission_approvals(submission_id)
        members = await self.group_repo.list_members(group_id)
        member_ids = {member.student_id for member in members if not member.is_deleted}
        approval_map = {approval.student_id: approval.status for approval in approvals}
        return bool(member_ids) and all(approval_map.get(student_id) == GroupApprovalStatus.APPROVED for student_id in member_ids)

    async def _all_appeal_approvals_approved(self, appeal_id: uuid.UUID, group_id: uuid.UUID) -> bool:
        approvals = await self.appeal_repo.list_appeal_approvals(appeal_id)
        members = await self.group_repo.list_members(group_id)
        member_ids = {member.student_id for member in members if not member.is_deleted}
        approval_map = {approval.student_id: approval.status for approval in approvals}
        return bool(member_ids) and all(approval_map.get(student_id) == GroupApprovalStatus.APPROVED for student_id in member_ids)

    async def _can_request_approval(self, submission_id: uuid.UUID, group_id: uuid.UUID, assessment_id: uuid.UUID) -> bool:
        return await self._has_required_participation(submission_id, group_id, assessment_id)

    async def _can_finalize_submission(self, submission_id: uuid.UUID, group_id: uuid.UUID, assessment_id: uuid.UUID) -> bool:
        has_participation = await self._has_required_participation(submission_id, group_id, assessment_id)
        if not has_participation:
            return False
        has_all_approvals = await self._all_submission_approvals_approved(submission_id, group_id)
        if not has_all_approvals:
            return False
        assessment = await self.assessment_repo.get_by_id_simple(assessment_id)
        if assessment and assessment.question_distribution_mode == QuestionDistributionMode.PER_GROUP:
            total_questions = await self.assessment_repo.count_questions_for_group(assessment_id, group_id)
        else:
            total_questions = await self.assessment_repo.count_questions(assessment_id)
        completed_answers = await self.submission_repo.count_completed_answers(submission_id)
        return completed_answers >= total_questions

    async def _has_required_participation(self, submission_id: uuid.UUID, group_id: uuid.UUID, assessment_id: uuid.UUID) -> bool:
        assessment = await self.assessment_repo.get_by_id_simple(assessment_id)
        if not assessment or not assessment.require_all_member_participation:
            return True
        active_member_ids = set(await self.submission_repo.list_active_member_ids(submission_id))
        members = await self.group_repo.list_members(group_id)
        member_ids = {member.student_id for member in members if not member.is_deleted}
        return bool(member_ids) and member_ids.issubset(active_member_ids)

    async def _serialize_groups(self, groups) -> list[StudentGroupResponse]:
        return [await self._serialize_group(group) for group in groups]

    async def _serialize_group(self, group) -> StudentGroupResponse:
        members = await self.group_repo.list_members(group.id) if not getattr(group, "members", None) else [m for m in group.members if not m.is_deleted]
        profiles = await self._get_user_profiles([member.student_id for member in members])
        return StudentGroupResponse(
            id=group.id,
            assessment_id=group.assessment_id,
            name=group.name,
            max_members=group.max_members,
            status=group.status,
            is_locked=group.is_locked,
            locked_at=group.locked_at,
            invalidated_at=group.invalidated_at,
            members=[
                GroupMemberResponse(
                    id=member.student_id,
                    name=profiles.get(member.student_id, str(member.student_id)),
                    group_role=member.group_role,
                    is_leader=member.is_leader,
                )
                for member in members
            ],
            created_at=group.created_at,
            updated_at=group.updated_at,
        )

    async def _serialize_appeal(self, appeal) -> GroupAppealResponse:
        return GroupAppealResponse(
            id=appeal.id,
            submission_id=appeal.submission_id,
            initiated_by_id=appeal.initiated_by_id,
            status=appeal.status,
            statement=appeal.statement,
            lecturer_decision=appeal.lecturer_decision,
            submitted_to_lecturer_at=appeal.submitted_to_lecturer_at,
            resolved_at=appeal.resolved_at,
            created_at=appeal.created_at,
            updated_at=appeal.updated_at,
            approvals=[
                GroupAppealApprovalResponse.model_validate(approval)
                for approval in getattr(appeal, "approvals", []) or []
            ],
        )

    async def _serialize_workspace_assessment(self, assessment) -> GroupWorkspaceAssessmentResponse:
        lecturer_name = None
        if assessment.created_by_id:
            lecturer_name = (await self._get_user_profiles([assessment.created_by_id])).get(assessment.created_by_id)
        return GroupWorkspaceAssessmentResponse(
            id=assessment.id,
            title=assessment.title,
            description=assessment.description,
            instructions=assessment.instructions,
            course_name=getattr(getattr(assessment, "course", None), "name", None),
            course_code=getattr(getattr(assessment, "course", None), "code", None),
            academic_year=assessment.academic_year,
            lecturer_name=lecturer_name,
            total_marks=assessment.total_marks,
            require_all_member_approval=assessment.require_all_member_approval,
            require_all_member_participation=assessment.require_all_member_participation,
            window_start=assessment.window_start,
            window_end=assessment.window_end,
        )

    async def _list_workspace_questions(self, assessment, group_id: uuid.UUID) -> list[GroupWorkspaceQuestionResponse]:
        if assessment.question_distribution_mode == QuestionDistributionMode.PER_GROUP:
            assessment_questions = await self.assessment_repo.list_assessment_questions_for_group(assessment.id, group_id)
        else:
            assessment_questions = await self.assessment_repo.list_assessment_questions(assessment.id)
        questions: list[GroupWorkspaceQuestionResponse] = []
        for aq in assessment_questions:
            if not aq.question:
                continue
            questions.append(
                GroupWorkspaceQuestionResponse(
                    id=aq.question.id,
                    text=aq.question.content,
                    type=aq.question.question_type.value,
                    marks=aq.marks_override or aq.question.marks,
                    order_index=aq.order_index,
                    options=[
                        GroupWorkspaceQuestionOptionResponse(
                            id=option.id,
                            text=option.content,
                        )
                        for option in (aq.question.options or [])
                    ],
                )
            )
        return questions

    async def _get_user_profiles(self, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not user_ids:
            return {}
        result = await self.db.execute(
            select(User.id, UserProfile.display_name, UserProfile.first_name, UserProfile.last_name)
            .join(UserProfile, UserProfile.user_id == User.id, isouter=True)
            .where(User.id.in_(user_ids))
        )
        names: dict[uuid.UUID, str] = {}
        for user_id, display_name, first_name, last_name in result.all():
            names[user_id] = display_name or " ".join(part for part in [first_name, last_name] if part).strip() or str(user_id)
        return names

    async def get_submission_workspace(
        self,
        *,
        submission_id: uuid.UUID,
        current_user: User,
    ) -> GroupWorkspaceResponse:
        submission = await self.submission_repo.get_by_id(submission_id, include_related=True)
        if not submission:
            raise NotFoundError("Group submission not found.", code="GROUP_SUBMISSION_NOT_FOUND")
        assessment = await self._get_assessment_for_edit(submission.assessment_id, current_user)
        
        group = await self.group_repo.get_group_by_id(submission.group_id, include_members=True)
        if not group:
            raise NotFoundError("Group not found.", code="GROUP_NOT_FOUND")

        materials = await self.submission_repo.list_materials(assessment_id=assessment.id, group_id=group.id)
        answers = submission.answers or []
        comments = submission.comments or []
        approvals = submission.approvals or []
        activity = submission.activity_logs or []
        active_member_ids = await self.submission_repo.list_active_member_ids(submission.id)
        appeal = await self.appeal_repo.get_active_by_submission(submission.id)
        questions = await self._list_workspace_questions(assessment, group.id)
        profiles = await self._get_user_profiles([member.student_id for member in group.members if not member.is_deleted])
        question_title_map = {str(question.id): question.text for question in questions}

        activity_responses = [
            GroupActivityLogResponse(
                id=item.id,
                submission_id=item.submission_id,
                student_id=item.student_id,
                student_name=profiles.get(item.student_id, str(item.student_id)),
                activity_type=item.activity_type,
                question_id=item.question_id,
                metadata_json=item.metadata_json,
                details={"question_title": question_title_map.get(str(item.question_id))} if item.question_id else None,
                created_at=item.created_at,
            )
            for item in activity
        ]
        
        workspace_members = []
        approval_map = {approval.student_id: approval.status for approval in approvals}
        participation_map: dict[uuid.UUID, int] = {}
        for entry in activity:
            participation_map[entry.student_id] = participation_map.get(entry.student_id, 0) + 1
            
        for member in group.members:
            if member.is_deleted:
                continue
            workspace_members.append(
                GroupWorkspaceMemberResponse(
                    student_id=member.student_id,
                    student_name=profiles.get(member.student_id, str(member.student_id)),
                    group_role=member.group_role,
                    is_leader=member.is_leader,
                    participation_count=participation_map.get(member.student_id, 0),
                    approval_status=approval_map.get(member.student_id, GroupApprovalStatus.PENDING),
                    is_online=False,
                )
            )

        return GroupWorkspaceResponse(
            assessment_id=assessment.id,
            group=await self._serialize_group(group),
            group_name=group.name,
            assessment=await self._serialize_workspace_assessment(assessment),
            submission_id=submission.id,
            submission_status=submission.status,
            question_distribution_mode=assessment.question_distribution_mode,
            questions=questions,
            members=workspace_members,
            materials=[GroupAssessmentMaterialResponse.model_validate(item) for item in materials],
            answers=[
                GroupSubmissionAnswerResponse(
                    id=item.id,
                    question_id=item.question_id,
                    answer_content=item.answer_content,
                    notes_content=item.notes_content,
                    last_edited_by_id=item.last_edited_by_id,
                    last_edited_at=item.last_edited_at,
                    last_modified_by_id=item.last_edited_by_id,
                    last_modified_by_name=profiles.get(item.last_edited_by_id) if item.last_edited_by_id else None,
                    last_modified_at=item.last_edited_at,
                )
                for item in answers
            ],
            comments=[
                GroupSubmissionCommentResponse(
                    id=item.id,
                    submission_id=item.submission_id,
                    question_id=item.question_id,
                    author_id=item.author_id,
                    student_id=item.author_id,
                    student_name=profiles.get(item.author_id, str(item.author_id)),
                    body=item.body,
                    created_at=item.created_at,
                )
                for item in comments
            ],
            approvals=[GroupSubmissionApprovalResponse.model_validate(a) for a in approvals],
            activity_log=activity_responses,
            activities=activity_responses,
            active_member_ids=active_member_ids,
            can_request_approval=False,
            can_submit=False,
            appeal=await self._serialize_appeal(appeal) if appeal else None,
            total_score=submission.total_score,
            feedback=submission.feedback,
            member_overrides=submission.member_overrides,
        )
