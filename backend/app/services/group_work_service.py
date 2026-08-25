"""Business logic for group-work assessments."""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime

from app.core.constants import UserRole
from app.core.exceptions import (AuthorizationError, ConflictError,
                                 NotFoundError, ValidationError)
from app.core.logger import get_logger
from app.db.enums import (GroupActivityType, GroupAppealStatus,
                          GroupApprovalStatus, GroupSubmissionStatus,
                          NotificationType, QuestionDistributionMode,
                          QuestionType, StudentGroupStatus)
from app.db.models.attempt import GroupSubmissionAnswer
from app.db.models.auth import User, UserProfile
from app.db.models.question import Question
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.group_appeal_repo import GroupAppealRepository
from app.db.repositories.group_repo import GroupRepository
from app.db.repositories.group_submission_repo import GroupSubmissionRepository
from app.db.repositories.notification_repo import NotificationRepository
from app.db.repositories.question_repo import QuestionRepository
from app.db.repositories.result_repo import ResultRepository
from app.schemas.group_work import (AddGroupCommentRequest,
                                    ApproveGroupAppealRequest,
                                    ApproveGroupSubmissionRequest,
                                    AutoGenerateGroupsRequest,
                                    CreateGroupAppealRequest,
                                    FinalizeGroupSubmissionRequest,
                                    GradeGroupQuestionRequest,
                                    GroupActivityLogResponse,
                                    GroupAppealApprovalResponse,
                                    GroupAppealResponse,
                                    GroupAssessmentMaterialResponse,
                                    GroupCsvImportRequest,
                                    GroupCsvImportResponse,
                                    GroupMemberResponse,
                                    GroupSubmissionAnswerResponse,
                                    GroupSubmissionApprovalResponse,
                                    GroupSubmissionCommentResponse,
                                    GroupSubmissionGradeRequest,
                                    GroupWorkspaceAssessmentResponse,
                                    GroupWorkspaceMemberResponse,
                                    GroupWorkspaceQuestionOptionResponse,
                                    GroupWorkspaceQuestionResponse,
                                    GroupWorkspaceResponse,
                                    ManualGroupCreateRequest,
                                    ResolveGroupAppealRequest,
                                    SaveGroupAnswerRequest,
                                    StudentGroupResponse)
from app.services.result_service import _compute_letter_grade
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger("mindexa.group_work_service")


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
        self.result_repo = ResultRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.question_repo = QuestionRepository(db)

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
            result_released_at=submission.result_released_at,
            is_released=bool(submission.result_released_at),
        )

    def _validate_group_answer_content_shape(
        self, q_type: str, answer_content: dict[str, Any] | None
    ) -> None:
        if answer_content is None:
            return
        if not isinstance(answer_content, dict):
            raise ValidationError(
                f"Invalid answer format for question type {q_type}. Expected a JSON object.",
                code="INVALID_ANSWER_PAYLOAD",
            )

        q_type_upper = q_type.upper()
        if q_type_upper in {"MCQ", "TRUE_FALSE"}:
            if "selected_option_ids" in answer_content:
                opts = answer_content["selected_option_ids"]
                if opts is not None and not isinstance(opts, list):
                    raise ValidationError(
                        "selected_option_ids must be a list of option IDs.",
                        code="INVALID_OPTION_SELECTION",
                    )
            elif "selected_option_id" in answer_content:
                opt = answer_content["selected_option_id"]
                if opt is not None and not isinstance(opt, (str, uuid.UUID)):
                    raise ValidationError(
                        "selected_option_id must be an option ID string.",
                        code="INVALID_OPTION_SELECTION",
                    )
        elif q_type_upper in {"SHORT_ANSWER", "ESSAY", "COMPUTATIONAL"}:
            if "text" in answer_content:
                text_val = answer_content["text"]
                if text_val is not None and not isinstance(text_val, str):
                    raise ValidationError(
                        "Answer text must be a string.",
                        code="INVALID_TEXT_ANSWER",
                    )
        elif q_type_upper == "ORDERING":
            if "ordered_option_ids" in answer_content:
                ordered = answer_content["ordered_option_ids"]
                if ordered is not None and not isinstance(ordered, list):
                    raise ValidationError(
                        "ordered_option_ids must be an ordered list of option IDs.",
                        code="INVALID_ORDERING_ANSWER",
                    )
        elif q_type_upper == "MATCHING":
            pairs = (
                answer_content.get("matches")
                or answer_content.get("matching_answers")
                or answer_content.get("pairs")
            )
            if pairs is not None and not isinstance(pairs, (list, dict)):
                raise ValidationError(
                    "Matching pairs must be a list of match entries or a mapping object.",
                    code="INVALID_MATCHING_ANSWER",
                )
        elif q_type_upper == "FILL_BLANK":
            blanks = (
                answer_content.get("fill_blank_answers")
                or answer_content.get("blanks")
                or answer_content.get("answers")
            )
            if blanks is not None and not isinstance(blanks, (list, dict)):
                raise ValidationError(
                    "Fill-in-blank answers must be a dictionary or list of answers.",
                    code="INVALID_FILL_BLANK_ANSWER",
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

        # Validate question answer content shape against question type
        if data.answer_content is not None:
            question = await self.question_repo.get_by_id_simple(question_id)
            if question:
                q_type = getattr(question, "question_type", None)
                if q_type:
                    q_type_str = q_type.value if hasattr(q_type, "value") else str(q_type)
                    self._validate_group_answer_content_shape(q_type_str, data.answer_content)

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

        # ── Auto-grade deterministic closed questions immediately ──
        try:
            await self.process_auto_grading_for_submission(submission_id)
        except Exception as e:
            logger.warning("Failed auto-grading for group submission %s: %s", str(submission_id), str(e))

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
        from app.db.models.assessment import (Assessment, AssessmentStatus,
                                              AssessmentType)
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
            language=assessment.language,
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
        lecturer_id: uuid.UUID | None = None,
        assessment_id: uuid.UUID | None = None,
        class_id: uuid.UUID | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 30,
    ) -> tuple[list[GroupSubmissionSummary], int]:
        """Fetch group submissions that need grading for a lecturer."""
        from app.db.enums import (GroupAppealStatus, GroupApprovalStatus,
                                  GroupSubmissionStatus)
        from app.schemas.grading import (GroupMemberSummary,
                                         GroupSubmissionSummary)

        status_enum = None
        if status and status.upper() != "ALL":
            try:
                status_enum = GroupSubmissionStatus(status.upper())
            except ValueError:
                pass

        items, total = await self.submission_repo.get_grading_queue(
            lecturer_id=lecturer_id,
            assessment_id=assessment_id,
            class_id=class_id,
            status=status_enum,
            page=page,
            page_size=page_size,
        )

        # Collect student IDs from all groups to fetch user profiles in one batch
        all_student_ids: list[uuid.UUID] = []
        for item in items:
            if item.group and hasattr(item.group, "members") and item.group.members:
                for m in item.group.members:
                    if not m.is_deleted:
                        all_student_ids.append(m.student_id)

        profiles = await self._get_user_profiles(all_student_ids)

        summaries = []
        for item in items:
            members_list: list[GroupMemberSummary] = []
            if item.group and hasattr(item.group, "members") and item.group.members:
                approval_map = {
                    appr.student_id: (appr.status.value if hasattr(appr.status, "value") else str(appr.status))
                    for appr in (item.approvals or [])
                }
                for m in item.group.members:
                    if not m.is_deleted:
                        members_list.append(
                            GroupMemberSummary(
                                student_id=m.student_id,
                                student_name=profiles.get(m.student_id, str(m.student_id)),
                                is_leader=m.is_leader,
                                approval_status=approval_map.get(m.student_id, "PENDING"),
                            )
                        )

            member_count = len(members_list)
            approved_member_count = sum(1 for m in members_list if m.approval_status == "APPROVED")

            has_active_appeal = any(
                a.status == GroupAppealStatus.PENDING for a in (item.appeals or [])
            )

            summaries.append(
                GroupSubmissionSummary(
                    id=item.id,
                    group_id=item.group_id,
                    group_name=item.group.name if item.group else "Unknown Group",
                    assessment_id=item.assessment_id,
                    assessment_title=item.assessment.title if item.assessment else "Unknown Assessment",
                    member_count=member_count,
                    approved_member_count=approved_member_count,
                    members=members_list,
                    status=item.status.value if hasattr(item.status, "value") else str(item.status),
                    score=item.total_score,
                    max_score=item.max_score,
                    feedback=item.feedback,
                    submitted_at=item.submitted_at,
                    graded_at=item.graded_at,
                    has_active_appeal=has_active_appeal,
                )
            )

        return summaries, total

    async def get_submission_workspace_for_lecturer(
        self,
        *,
        submission_id: uuid.UUID,
        current_user: User,
    ) -> GroupWorkspaceResponse:
        """Fetch the full workspace for a group submission so a lecturer can grade it."""
        submission = await self.submission_repo.get_by_id(submission_id, include_related=True)
        if not submission:
            raise NotFoundError("Group submission not found.", code="GROUP_SUBMISSION_NOT_FOUND")

        assessment = await self.assessment_repo.get_by_id(submission.assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.", code="ASSESSMENT_NOT_FOUND")

        group = await self.group_repo.get_by_id(submission.group_id, include_members=True)
        if not group:
            raise NotFoundError("Student group not found.", code="GROUP_NOT_FOUND")

        materials = await self.submission_repo.list_materials(assessment_id=assessment.id, group_id=group.id)
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
            assessment_id=assessment.id,
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
                self._serialize_submission_answer(item, profiles)
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
            can_request_approval=False,
            can_submit=False,
            appeal=GroupAppealResponse.model_validate(appeal) if appeal else None,
            total_score=submission.total_score,
            feedback=submission.feedback,
            member_overrides=submission.member_overrides,
            result_released_at=submission.result_released_at,
            is_released=bool(submission.result_released_at),
        )

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

        is_final = data.is_final if data.is_final is not None else True
        status = GroupSubmissionStatus.GRADED if is_final else GroupSubmissionStatus.SUBMITTED
        await self.submission_repo.set_grade(
            submission_id=submission_id,
            total_score=data.total_score,
            max_score=data.max_score,
            feedback=data.feedback,
            graded_by_id=current_user.id,
            member_overrides=data.member_overrides,
            status=status,
        )

        # ── Atomically reconcile derived AssessmentResult for all active members ──
        await self._reconcile_group_results(
            submission=submission,
            assessment=assessment,
            total_score=data.total_score,
            max_score=data.max_score,
            is_final=is_final,
            member_overrides=data.member_overrides,
            current_user=current_user,
        )

    async def _reconcile_group_results(
        self,
        *,
        submission: GroupSubmission,
        assessment: Assessment,
        total_score: float,
        max_score: float,
        is_final: bool,
        member_overrides: dict[str, float] | None = None,
        current_user: User | None = None,
    ) -> None:
        """
        Atomically reconcile per-member AssessmentResult records derived from a group submission.
        Updates letter grades, percentages, pass/fail status, and handles automatic release when applicable.
        """
        submission_id = submission.id
        members = await self.group_repo.list_members(submission.group_id)
        active_members = [m for m in members if not m.is_deleted]
        active_student_ids = {m.student_id for m in active_members}

        # Clean up any orphaned derived results if team members were reassigned
        await self.result_repo.delete_orphaned_group_results(
            group_submission_id=submission_id,
            active_student_ids=active_student_ids,
        )

        if assessment.question_distribution_mode == QuestionDistributionMode.PER_GROUP:
            total_questions_count = await self.assessment_repo.count_questions_for_group(assessment.id, submission.group_id)
        else:
            total_questions_count = await self.assessment_repo.count_questions(assessment.id)
        completed_answers_count = await self.submission_repo.count_completed_answers(submission.id)

        # For group assessments without individual Question rows (e.g. project/file submissions), treat as single graded unit
        if total_questions_count == 0:
            total_questions_count = 1
            completed_answers_count = 1 if is_final else 0
        elif is_final and completed_answers_count < total_questions_count:
            completed_answers_count = total_questions_count

        from app.db.enums import ResultReleaseMode
        release_mode = assessment.result_release_mode if assessment else None
        if hasattr(release_mode, "value"):
            release_mode = release_mode.value

        overrides = member_overrides or submission.member_overrides or {}

        for member in active_members:
            member_id_str = str(member.student_id)
            # 1. Calculate per-student score from overrides or default total_score
            student_score = (
                overrides.get(member_id_str, total_score)
                if overrides and member_id_str in overrides
                else total_score
            )
            percentage = round((student_score / max_score) * 100, 2) if (max_score and max_score > 0) else 0.0
            passing_pct = (assessment.passing_marks / assessment.total_marks * 100) if (assessment.total_marks and assessment.passing_marks) else 50.0
            is_passing = percentage >= passing_pct
            letter_grade = _compute_letter_grade(percentage)

            # 2. Check per-student integrity hold from individual attempt telemetry
            member_attempt = await self.attempt_repo.get_by_student_and_assessment(member.student_id, assessment.id)
            integrity_hold = False
            if member_attempt:
                integrity_hold = bool(
                    member_attempt.is_flagged
                    or (member_attempt.integrity_risk_score and member_attempt.integrity_risk_score >= 70.0)
                )

            # 3. Upsert the derived AssessmentResult row
            await self.result_repo.create_or_update_derived_group_result(
                student_id=member.student_id,
                assessment_id=assessment.id,
                group_submission_id=submission.id,
                attempt_id=member_attempt.id if member_attempt else None,
                total_score=student_score,
                max_score=max_score,
                percentage=percentage,
                letter_grade=letter_grade,
                is_passing=is_passing,
                integrity_hold=integrity_hold,
                is_released=False,
                graded_question_count=completed_answers_count,
                total_question_count=total_questions_count,
            )

        # Automatic Release for IMMEDIATE mode (or closed-only assessments with no open-ended questions) if fully graded
        has_open_ended = await self.assessment_repo.has_open_ended_questions(assessment.id)
        if (
            (release_mode == ResultReleaseMode.IMMEDIATE.value or not has_open_ended)
            and is_final
            and total_questions_count > 0
            and completed_answers_count >= total_questions_count
            and current_user is not None
        ):
            await self.release_group_result(
                assessment_id=assessment.id,
                submission_id=submission_id,
                current_user=current_user,
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

        # Release derived AssessmentResult rows for unheld members
        derived_results = await self.result_repo.list_by_group_submission(submission_id)
        for res in derived_results:
            if not res.integrity_hold and not res.is_released:
                await self.result_repo.release(res.id, released_by_id=current_user.id)
                await self.notification_repo.create(
                    recipient_id=res.student_id,
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
            q = aq.question
            raw_type = q.question_type.value if hasattr(q.question_type, "value") else str(q.question_type)

            # Fetch rubric if attached
            rubric_data = None
            if q.rubric_id:
                rubric_obj = await self.assessment_repo.get_rubric_for_question(q.id)
                if rubric_obj:
                    rubric_data = {
                        "id": str(rubric_obj.id),
                        "title": rubric_obj.title,
                        "description": rubric_obj.description,
                        "criteria": [
                            {
                                "id": str(c.id),
                                "title": c.title,
                                "name": c.title,
                                "description": c.description,
                                "max_marks": c.max_marks,
                                "weight": c.max_marks,
                                "levels": [
                                    {
                                        "id": str(lvl.id),
                                        "title": lvl.label,
                                        "name": lvl.label,
                                        "label": lvl.label,
                                        "description": lvl.description,
                                        "marks": lvl.marks,
                                        "score": lvl.marks,
                                    }
                                    for lvl in getattr(c, "levels", []) or []
                                ],
                            }
                            for c in getattr(rubric_obj, "criteria", []) or []
                        ],
                    }

            # Fetch blanks if fill_blank
            blanks_data = None
            if raw_type in ("FILL_BLANK", "FILL_BLANKS", "fillblank"):
                blanks_list = await self.question_repo.list_blanks(q.id)
                if blanks_list:
                    blanks_data = [
                        {
                            "id": str(b.id),
                            "blank_index": b.blank_index,
                            "accepted_answers": b.accepted_answers,
                            "case_sensitive": b.case_sensitive,
                        }
                        for b in blanks_list
                    ]

            questions.append(
                GroupWorkspaceQuestionResponse(
                    id=q.id,
                    text=q.content,
                    content=q.content,
                    type=raw_type,
                    question_type=raw_type,
                    marks=aq.marks_override or q.marks,
                    order_index=aq.order_index,
                    options=[
                        GroupWorkspaceQuestionOptionResponse(
                            id=option.id,
                            text=option.content,
                        )
                        for option in (q.options or [])
                    ],
                    case_study_context=getattr(q, "case_study_context", None),
                    question_table_context=getattr(q, "question_table_context", None),
                    image_url=getattr(q, "image_url", None),
                    image_alt_text=getattr(q, "image_alt_text", None),
                    rubric=rubric_data,
                    blanks=blanks_data,
                )
            )
        return questions

    def _serialize_submission_answer(
        self,
        item: GroupSubmissionAnswer,
        profiles: dict[uuid.UUID, str],
    ) -> GroupSubmissionAnswerResponse:
        content = dict(item.answer_content or {})
        return GroupSubmissionAnswerResponse(
            id=item.id,
            question_id=item.question_id,
            answer_content=content,
            notes_content=item.notes_content,
            last_edited_by_id=item.last_edited_by_id,
            last_edited_at=item.last_edited_at,
            last_modified_by_id=item.last_edited_by_id,
            last_modified_by_name=profiles.get(item.last_edited_by_id) if item.last_edited_by_id else None,
            last_modified_at=item.last_edited_at,
            score=content.get("score"),
            max_score=content.get("max_score"),
            feedback=content.get("feedback"),
            is_final=bool(content.get("is_final", False)),
            is_auto_graded=bool(content.get("is_auto_graded", False)),
            auto_grade_score=content.get("auto_grade_score"),
            auto_grade_is_correct=content.get("auto_grade_is_correct"),
            ai_grade_score=content.get("ai_grade_score") or content.get("ai_suggested_score"),
            ai_grade_confidence=content.get("ai_grade_confidence") or content.get("ai_confidence"),
            ai_grade_rationale=content.get("ai_grade_rationale") or content.get("ai_rationale"),
            ai_grade_breakdown=content.get("ai_grade_breakdown"),
            ai_feedback_draft=content.get("ai_feedback_draft"),
            ai_feedback_strengths=content.get("ai_feedback_strengths"),
            ai_feedback_improvements=content.get("ai_feedback_improvements"),
            ai_feedback_suggestions=content.get("ai_feedback_suggestions"),
            ai_grade_decision=content.get("ai_grade_decision"),
            rubric_scores=content.get("rubric_scores"),
            ai_grading_basis=content.get("ai_grading_basis"),
            rag_used=bool(content.get("rag_used", False)),
            ai_context_sources=content.get("ai_context_sources"),
            rag_chunk_ids=content.get("rag_chunk_ids"),
        )

    async def _compute_auto_score_for_group_answer(
        self,
        *,
        answer_dict: dict[str, Any],
        question: Question,
        max_score: float,
    ) -> tuple[float, bool]:
        """
        Evaluate auto-gradable closed questions (MCQ, TRUE_FALSE, ORDERING, MATCHING, FILL_BLANK)
        from GroupSubmissionAnswer.answer_content against Question options/blanks.
        """
        options = await self.question_repo.list_options(question.id)
        raw_type = (
            question.question_type.value
            if hasattr(question.question_type, "value")
            else str(question.question_type)
        )
        try:
            q_type = QuestionType(raw_type)
        except Exception:
            return 0.0, False

        # ── MCQ ─────────────────────────────────────────────────────────────
        if q_type == QuestionType.MCQ:
            correct_ids = {str(o.id) for o in options if o.is_correct}
            raw_ids = answer_dict.get("selected_option_ids") or []
            if not raw_ids and answer_dict.get("selected_option_id"):
                raw_ids = [answer_dict["selected_option_id"]]
            student_ids = {str(i) for i in raw_ids}
            is_correct = student_ids == correct_ids and bool(correct_ids)
            return (max_score if is_correct else 0.0), is_correct

        # ── TRUE/FALSE ───────────────────────────────────────────────────────
        if q_type == QuestionType.TRUE_FALSE:
            correct = next((o for o in options if o.is_correct), None)
            raw_ids = answer_dict.get("selected_option_ids") or []
            if not raw_ids and answer_dict.get("selected_option_id"):
                raw_ids = [answer_dict["selected_option_id"]]
            is_correct = bool(correct) and len(raw_ids) == 1 and str(raw_ids[0]) == str(correct.id)
            return (max_score if is_correct else 0.0), is_correct

        # ── ORDERING ────────────────────────────────────────────────────────
        if q_type == QuestionType.ORDERING:
            correct_order = [str(o.id) for o in sorted(options, key=lambda o: o.order_index)]
            raw_order = answer_dict.get("ordered_option_ids") or answer_dict.get("text") or []
            if isinstance(raw_order, str):
                try:
                    import json
                    raw_order = json.loads(raw_order)
                except Exception:
                    raw_order = [raw_order]
            student_order = [str(i) for i in raw_order]
            if not correct_order:
                return 0.0, False
            if student_order == correct_order:
                return max_score, True
            correct_positions = sum(
                1 for s, c in zip(student_order, correct_order) if s == c
            )
            score = round((correct_positions / len(correct_order)) * max_score, 2)
            return score, score == max_score

        # ── MATCHING ────────────────────────────────────────────────────────
        if q_type == QuestionType.MATCHING:
            pairs = answer_dict.get("match_pairs_json") or {}
            correct_map = {str(o.id): o.match_value for o in options if o.match_value}
            if not correct_map:
                return 0.0, False
            correct_count = sum(
                1 for k, v in pairs.items()
                if k in correct_map and correct_map[k] == v
            )
            score = round((correct_count / len(correct_map)) * max_score, 2)
            return score, score == max_score

        # ── FILL_BLANK ───────────────────────────────────────────────────────
        if q_type == QuestionType.FILL_BLANK:
            blanks = await self.question_repo.list_blanks(question.id)
            if not blanks:
                return 0.0, False
            student_answers = answer_dict.get("fill_blank_answers") or {}
            correct_count = 0
            for blank in blanks:
                student_val = str(student_answers.get(str(blank.blank_index), "")).strip()
                accepted = blank.accepted_answers or []
                if blank.case_sensitive:
                    match = student_val in accepted
                else:
                    match = student_val.lower() in [a.lower() for a in accepted]
                if match:
                    correct_count += 1
            score = round((correct_count / len(blanks)) * max_score, 2)
            return score, score == max_score

        return 0.0, False

    async def process_auto_grading_for_submission(self, submission_id: uuid.UUID) -> dict[str, Any]:
        """
        Immediately auto-grades closed questions and flags open questions for AI processing.
        """
        submission = await self.submission_repo.get_by_id(submission_id, include_related=True)
        if not submission:
            return {"error": "Submission not found"}

        assessment = await self.assessment_repo.get_by_id(submission.assessment_id)
        if not assessment:
            return {"error": "Assessment not found"}

        if assessment.question_distribution_mode == QuestionDistributionMode.PER_GROUP:
            aq_rows = await self.assessment_repo.list_assessment_questions_for_group(assessment.id, submission.group_id)
        else:
            aq_rows = await self.assessment_repo.list_assessment_questions(assessment.id)

        answers_map = {ans.question_id: ans for ans in (submission.answers or [])}
        auto_count = 0
        open_count = 0

        for aq in aq_rows:
            if not aq.question:
                continue
            question = aq.question
            max_score = float(aq.marks_override if aq.marks_override is not None else question.marks)
            raw_type = (
                question.question_type.value
                if hasattr(question.question_type, "value")
                else str(question.question_type)
            )
            try:
                q_type = QuestionType(raw_type)
            except Exception:
                q_type = QuestionType.SHORT_ANSWER

            ans = answers_map.get(question.id)
            if not ans:
                editor_uuid = submission.submitted_by_id or submission.requested_by_id or uuid.UUID(int=0)
                ans, _ = await self.submission_repo.upsert_answer(
                    submission_id=submission.id,
                    question_id=question.id,
                    editor_id=editor_uuid,
                    answer_content={"is_skipped": True},
                    notes_content=None,
                )

            content = dict(ans.answer_content or {})
            if q_type.is_auto_gradable:
                score, is_correct = await self._compute_auto_score_for_group_answer(
                    answer_dict=content,
                    question=question,
                    max_score=max_score,
                )
                content.update({
                    "score": score,
                    "max_score": max_score,
                    "auto_grade_score": score,
                    "auto_grade_is_correct": is_correct,
                    "is_auto_graded": True,
                    "is_final": True,
                })
                ans.answer_content = content
                self.db.add(ans)
                auto_count += 1
            elif q_type.is_open_ended:
                content.update({
                    "max_score": max_score,
                    "ai_grade_decision": "PENDING",
                })
                ans.answer_content = content
                self.db.add(ans)
                open_count += 1

        await self.db.flush()
        return {"auto_count": auto_count, "open_count": open_count}

    async def process_ai_grading_for_submission(
        self,
        submission_id: uuid.UUID,
        grading_service: Any = None,
    ) -> dict[str, Any]:
        """
        Background job to evaluate open-ended questions using AI Review Agent and Feedback Agent.
        """
        from app.services.grading_service import GradingService
        if grading_service is None:
            grading_service = GradingService(self.db)

        submission = await self.submission_repo.get_by_id(submission_id, include_related=True)
        if not submission:
            return {"error": "Submission not found"}

        assessment = await self.assessment_repo.get_by_id(submission.assessment_id)
        if not assessment:
            return {"error": "Assessment not found"}

        answers = submission.answers or []
        ai_processed = 0

        for ans in answers:
            question = await self.question_repo.get_by_id_simple(ans.question_id)
            if not question:
                continue
            raw_type = (
                question.question_type.value
                if hasattr(question.question_type, "value")
                else str(question.question_type)
            )
            try:
                q_type = QuestionType(raw_type)
            except Exception:
                q_type = QuestionType.SHORT_ANSWER

            if not q_type.is_open_ended:
                continue

            content = dict(ans.answer_content or {})
            if content.get("is_skipped"):
                content.update({
                    "score": 0.0,
                    "max_score": float(question.marks),
                    "ai_grade_score": 0.0,
                    "ai_grade_confidence": 1.0,
                    "ai_grade_rationale": "No answer submitted for this question.",
                    "ai_grade_decision": "SUGGESTED",
                })
                ans.answer_content = content
                self.db.add(ans)
                ai_processed += 1
                continue

            try:
                await grading_service.process_ai_group_answer(ans)
                ai_processed += 1
            except Exception as e:
                logger.warning("Failed AI review for group answer %s: %s", str(ans.id), str(e))

        await self.db.flush()
        return {"processed": ai_processed, "submission_id": str(submission_id)}

    async def grade_submission_question(
        self,
        *,
        submission_id: uuid.UUID,
        question_id: uuid.UUID,
        data: GradeGroupQuestionRequest,
        current_user: User,
    ) -> GroupSubmissionAnswerResponse:
        """
        Grade or save draft evaluation for a single question in a group submission.
        """
        submission = await self.submission_repo.get_by_id(submission_id, include_related=True)
        if not submission:
            raise NotFoundError("Group submission not found.", code="GROUP_SUBMISSION_NOT_FOUND")

        assessment = await self.assessment_repo.get_by_id(submission.assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.", code="ASSESSMENT_NOT_FOUND")
        self._assert_can_edit(assessment, current_user)

        if data.is_final and data.score is None:
            raise ValidationError("Score is required when finalizing a question grade.", code="SCORE_REQUIRED")

        # Resolve AssessmentQuestion row to find max_score
        if assessment.question_distribution_mode == QuestionDistributionMode.PER_GROUP:
            assessment_questions = await self.assessment_repo.list_assessment_questions_for_group(assessment.id, submission.group_id)
        else:
            assessment_questions = await self.assessment_repo.list_assessment_questions(assessment.id)

        aq = next((aq for aq in assessment_questions if aq.question_id == question_id), None)
        if not aq or not aq.question:
            raise NotFoundError("Question is not assigned to this assessment.", code="QUESTION_NOT_IN_ASSESSMENT")
        max_score = float(aq.marks_override if aq.marks_override is not None else (aq.question.marks or 0.0))

        import math
        if data.score is not None and (not math.isfinite(data.score) or data.score < 0 or data.score > max_score):
            raise ValidationError(
                f"Score {data.score} is out of range [0, {max_score}]",
                code="SCORE_OUT_OF_RANGE",
            )

        ans = next((a for a in (submission.answers or []) if a.question_id == question_id), None)
        if not ans:
            ans, _ = await self.submission_repo.upsert_answer(
                submission_id=submission_id,
                question_id=question_id,
                editor_id=current_user.id,
                answer_content={},
                notes_content=None,
            )

        content = dict(ans.answer_content or {})
        content.update({
            "score": data.score,
            "feedback": data.feedback,
            "rubric_scores": data.rubric_scores,
            "is_final": data.is_final,
            "is_ai_accepted": data.is_ai_accepted,
            "graded_by_id": str(current_user.id),
            "graded_at": _utcnow().isoformat(),
        })
        ans.answer_content = content
        ans.last_edited_by_id = current_user.id
        ans.last_edited_at = _utcnow()
        self.db.add(ans)
        await self.db.flush()

        # Recalculate total score across all questions in the submission
        all_answers = await self.submission_repo.list_answers(submission_id)
        total_score = 0.0
        all_final = True
        for a in all_answers:
            c = a.answer_content or {}
            s = c.get("score")
            if s is not None:
                total_score += float(s)
            if not c.get("is_final", False):
                all_final = False

        submission.total_score = total_score
        max_score = float(assessment.total_marks or 100.0)
        submission.max_score = max_score

        is_sub_final = bool(data.is_final and all_final)
        if is_sub_final:
            submission.status = GroupSubmissionStatus.GRADED
            submission.graded_at = _utcnow()
            submission.graded_by_id = current_user.id
        self.db.add(submission)
        await self.db.flush()

        # Atomically reconcile derived AssessmentResult rows for all active members
        await self._reconcile_group_results(
            submission=submission,
            assessment=assessment,
            total_score=total_score,
            max_score=max_score,
            is_final=is_sub_final,
            member_overrides=submission.member_overrides,
            current_user=current_user,
        )

        profiles = await self._get_user_profiles([current_user.id])
        return self._serialize_submission_answer(ans, profiles)

    async def process_ai_grading_for_single_question(
        self,
        *,
        submission_id: uuid.UUID,
        question_id: uuid.UUID,
        grading_service: Any,
    ) -> dict[str, Any]:
        submission = await self.submission_repo.get_by_id(submission_id, include_related=True)
        if not submission:
            raise NotFoundError("Group submission not found.", code="GROUP_SUBMISSION_NOT_FOUND")

        ans = next((a for a in (submission.answers or []) if a.question_id == question_id), None)
        if not ans:
            raise NotFoundError("Answer not found.", code="ANSWER_NOT_FOUND")

        await grading_service.process_ai_group_answer(ans)
        await self.db.flush()
        return {
            "submission_id": str(submission_id),
            "question_id": str(question_id),
            "status": "completed",
        }

    async def trigger_ai_review_for_group_question(
        self,
        *,
        submission_id: uuid.UUID,
        question_id: uuid.UUID,
        current_user: User,
    ) -> GroupSubmissionAnswerResponse:
        """
        Re-generate or execute AI review on demand for a single question in group work.
        Dispatches background Celery job and immediately returns the answer in PROCESSING state.
        """
        submission = await self.submission_repo.get_by_id(submission_id, include_related=True)
        if not submission:
            raise NotFoundError("Group submission not found.", code="GROUP_SUBMISSION_NOT_FOUND")

        assessment = await self.assessment_repo.get_by_id(submission.assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.", code="ASSESSMENT_NOT_FOUND")
        self._assert_can_edit(assessment, current_user)

        ans = next((a for a in (submission.answers or []) if a.question_id == question_id), None)
        if not ans:
            raise NotFoundError("Answer not found.", code="ANSWER_NOT_FOUND")

        # Mark answer content as PROCESSING
        if ans.answer_content is None:
            ans.answer_content = {}
        ans.answer_content.update({
            "ai_grade_decision": "PROCESSING",
            "ai_grade_rationale": "AI evaluation in progress...",
        })
        self.db.add(ans)
        await self.db.flush()

        # Enqueue background Celery task
        try:
            from app.workers.tasks.grading import \
                trigger_ai_grading_for_group_question
            trigger_ai_grading_for_group_question.delay(str(submission_id), str(question_id))
        except Exception as e:
            logger.warning(
                "Could not enqueue Celery AI grading task for group question %s: %s. Falling back to inline evaluation.",
                str(question_id),
                str(e),
            )
            from app.services.grading_service import GradingService
            grading_service = GradingService(self.db)
            await grading_service.process_ai_group_answer(ans)
            await self.db.flush()

        profiles = await self._get_user_profiles([current_user.id])
        return self._serialize_submission_answer(ans, profiles)

    async def suggest_ai_changes_for_group_question(
        self,
        *,
        submission_id: uuid.UUID,
        question_id: uuid.UUID,
        feedback: str,
        current_user: User,
    ) -> GroupSubmissionAnswerResponse:
        """
        Re-evaluate a single group question incorporating lecturer guidance/feedback.
        """
        submission = await self.submission_repo.get_by_id(submission_id, include_related=True)
        if not submission:
            raise NotFoundError("Group submission not found.", code="GROUP_SUBMISSION_NOT_FOUND")

        assessment = await self.assessment_repo.get_by_id(submission.assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.", code="ASSESSMENT_NOT_FOUND")
        self._assert_can_edit(assessment, current_user)

        ans = next((a for a in (submission.answers or []) if a.question_id == question_id), None)
        if not ans:
            raise NotFoundError("Answer not found.", code="ANSWER_NOT_FOUND")

        from app.services.grading_service import GradingService
        grading_service = GradingService(self.db)
        await grading_service.process_ai_group_answer(ans, lecturer_feedback=feedback)
        await self.db.flush()

        profiles = await self._get_user_profiles([current_user.id])
        return self._serialize_submission_answer(ans, profiles)

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
                self._serialize_submission_answer(item, profiles)
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
            result_released_at=submission.result_released_at,
            is_released=bool(submission.result_released_at),
        )
