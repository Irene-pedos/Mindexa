"""
app/services/assessment_service.py

Assessment service — core business logic for the Assessment domain.

Responsibilities:
    - create_assessment()          — Start wizard; create draft assessment
    - update_wizard_step()         — Advance wizard step with field updates
    - update_security_settings()   — Apply Step 2 security configuration
    - finalize_assessment()        — Validate + publish to students
    - add_question_to_assessment() — Add a question from the bank
    - remove_question()            — Remove a question from assessment
    - reorder_questions()          — Change display order of questions
    - create_section()             — Add a section to the assessment
    - update_section()             — Edit a section
    - delete_section()             — Remove a section
    - get_assessment()             — Load with authorization check
    - list_assessments()           — Paginated list (role-aware)
    - soft_delete_assessment()     — Archive assessment

FINALIZATION RULES (all must pass):
    1. Assessment must not already be finalized
    2. Assessment must have at least 1 section
    3. Assessment must have at least 1 question
    4. Sum of question marks must equal total_marks
    5. Blueprint rules (if any) must pass validation (no blocking violations)
    6. window_start must be set (scheduled assessments)
"""

import uuid
from datetime import UTC, datetime

from app.core.constants import AssessmentStatus, UserRole
from app.core.exceptions import (AuthorizationError, ConflictError,
                                 NotFoundError, ValidationError)
from app.core.security import hash_password
from app.db.enums import AssessmentStatus as DbAssessmentStatus
from app.db.enums import AssessmentType as DbAssessmentType
from app.db.enums import (AttemptStatus, DifficultyLevel, GradingMode,
                          GroupAssignmentMode, GroupSubmissionStatus,
                          QuestionAddedVia, QuestionDistributionMode,
                          QuestionSourceType)
from app.db.enums import QuestionType as DbQuestionType
from app.db.enums import ResultReleaseMode, SupervisorRole
from app.db.models.assessment import Assessment, AssessmentSupervisor
from app.db.models.auth import User
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.group_repo import GroupRepository
from app.db.repositories.notification_repo import NotificationRepository
from app.db.repositories.question_repo import QuestionRepository
from app.schemas.assessment import (AddQuestionToAssessmentRequest,
                                    AssessmentCreateRequest,
                                    AssessmentGeneralUpdate,
                                    AssessmentListResponse,
                                    AssessmentSectionCreate,
                                    AssessmentSectionUpdate,
                                    AssessmentSecuritySettingsUpdate,
                                    AssessmentSummaryResponse,
                                    BulkAssessmentPublishRequest,
                                    FinalizeAssessmentResponse,
                                    ReorderQuestionsRequest)
from app.services.blueprint_service import BlueprintService
from sqlalchemy.ext.asyncio import AsyncSession


class AssessmentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._repo = AssessmentRepository(db)
        self._attempt_repo = AttemptRepository(db)
        self._group_repo = GroupRepository(db)
        self._notification_repo = NotificationRepository(db)
        self._question_repo = QuestionRepository(db)
        self._blueprint_service = BlueprintService(db)

    # ─── Authorization Helpers ────────────────────────────────────────────────

    def _can_edit(self, assessment, current_user: User) -> bool:
        """Check if user can edit this assessment."""
        if current_user.role == UserRole.ADMIN.value:
            return True
        return str(assessment.created_by_id) == str(current_user.id)

    def _assert_can_edit(self, assessment, current_user: User) -> None:
        if not self._can_edit(assessment, current_user):
            raise AuthorizationError(
                "You can only modify assessments you created."
            )

    def _assert_not_finalized(self, assessment) -> None:
        """Block edits only when the assessment is truly immutable.

        DRAFT / PUBLISHED assessments are always editable by their creator.
        ACTIVE, CLOSED, and ARCHIVED assessments cannot be structurally changed.
        """
        from app.db.enums import AssessmentStatus as _Status
        locked_statuses = {_Status.ACTIVE, _Status.CLOSED, _Status.ARCHIVED}
        current_status = assessment.status
        if isinstance(current_status, str):
            try:
                current_status = _Status(current_status)
            except ValueError:
                current_status = None
        if current_status in locked_statuses:
            raise ConflictError(
                f"This assessment is {current_status.value.lower()} and cannot be modified.",
                code="ASSESSMENT_FINALIZED",
            )

    # ─── Create ───────────────────────────────────────────────────────────────

    async def create_assessment(
        self,
        data: AssessmentCreateRequest,
        created_by: User,
    ):
        """
        Step 1 of wizard: create a draft assessment.

        Creates the assessment record and an initial draft progress row.
        Returns the full assessment detail.
        """
        if not data.teaching_workspace_id:
            raise ValidationError("teaching_workspace_id is required to create an assessment.")

        from app.db.repositories.workspace_repo import WorkspaceRepository
        ws_repo = WorkspaceRepository(self._repo.db)
        workspace = await ws_repo.get_by_id(data.teaching_workspace_id)
        if not workspace:
            raise NotFoundError("Teaching Workspace", str(data.teaching_workspace_id))

        # Verify ownership
        if workspace.teaching_assignment.lecturer_id != created_by.id and created_by.role != "ADMIN":
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("You do not have permission to create assessments in this workspace.")

        # Validate enum values
        try:
            assessment_type = DbAssessmentType(data.assessment_type)
        except ValueError as e:
            raise ValidationError(
                f"Invalid assessment_type: '{data.assessment_type}'. "
                f"Valid values are: {', '.join([t.value for t in DbAssessmentType])}"
            ) from e

        try:
            grading_mode = GradingMode(data.grading_mode)
        except ValueError as e:
            raise ValidationError(
                f"Invalid grading_mode: '{data.grading_mode}'. "
                f"Valid values are: {', '.join([m.value for m in GradingMode])}"
            ) from e

        try:
            result_release_mode = ResultReleaseMode(data.result_release_mode)
        except ValueError as e:
            raise ValidationError(
                f"Invalid result_release_mode: '{data.result_release_mode}'. "
                f"Valid values are: {', '.join([r.value for r in ResultReleaseMode])}"
            ) from e

        assessment = await self._repo.create(
            title=data.title,
            description=data.description,
            assessment_type=assessment_type,
            teaching_workspace_id=workspace.id,
            course_id=workspace.course_id,
            subject_id=data.subject_id,
            academic_year=workspace.academic_period.name,
            created_by_id=created_by.id,
            grading_mode=grading_mode,
            result_release_mode=result_release_mode,
            total_marks=data.total_marks,
            instructions=data.instructions,
            passing_marks=data.passing_marks,
            duration_minutes=data.duration_minutes,
            is_group_assessment=data.is_group_assessment,
            max_group_size=data.max_group_size,
            group_formation_mode=data.group_formation_mode,
            group_assignment_mode=GroupAssignmentMode(data.group_assignment_mode) if data.group_assignment_mode else None,
            question_distribution_mode=QuestionDistributionMode(data.question_distribution_mode) if data.question_distribution_mode else None,
            require_all_member_approval=data.require_all_member_approval,
            require_all_member_participation=data.require_all_member_participation,
            submission_mode=data.submission_mode,
            peer_evaluation_enabled=data.peer_evaluation_enabled,
            peer_evaluation_deadline=data.peer_evaluation_deadline,
            peer_evaluation_weight_percent=data.peer_evaluation_weight_percent,
            individual_weighting_enabled=data.individual_weighting_enabled,
            appeal_window_days=data.appeal_window_days,
        )

        # Initialize draft progress
        await self._repo.upsert_draft_progress(
            assessment_id=assessment.id,
            last_active_step=1,
        )

        return await self._repo.get_by_id(assessment.id)

    # ─── Update Wizard Step ───────────────────────────────────────────────────

    async def update_wizard_step(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        step: int,
        data: AssessmentGeneralUpdate,
    ):
        """
        Advance or save a wizard step.
        Updates fields and records the current step in draft progress.
        """
        assessment = await self._get_and_validate(assessment_id, current_user)

        update_fields = {}
        if data.teaching_workspace_id is not None:
            update_fields["teaching_workspace_id"] = data.teaching_workspace_id
            from app.db.models.academic import CourseSubject, TeachingWorkspace
            from sqlalchemy import select
            res = await self.db.execute(
                select(TeachingWorkspace).where(TeachingWorkspace.id == data.teaching_workspace_id)
            )
            workspace = res.scalars().first()
            if workspace:
                update_fields["course_id"] = workspace.course_id
                sub_res = await self.db.execute(
                    select(CourseSubject.subject_id).where(CourseSubject.course_id == workspace.course_id).limit(1)
                )
                subj_id = sub_res.scalar_one_or_none()
                if subj_id:
                    update_fields["subject_id"] = subj_id

        if data.course_id is not None:
            update_fields["course_id"] = data.course_id

        if data.title is not None:
            update_fields["title"] = data.title
        if data.description is not None:
            update_fields["description"] = data.description
        if data.instructions is not None:
            update_fields["instructions"] = data.instructions
        if data.assessment_type is not None:
            try:
                update_fields["assessment_type"] = DbAssessmentType(data.assessment_type)
            except ValueError as e:
                raise ValidationError(
                    f"Invalid assessment_type: '{data.assessment_type}'. "
                    f"Valid values are: {', '.join([t.value for t in DbAssessmentType])}"
                ) from e
        if data.grading_mode is not None:
            try:
                update_fields["grading_mode"] = GradingMode(data.grading_mode)
            except ValueError as e:
                raise ValidationError(
                    f"Invalid grading_mode: '{data.grading_mode}'. "
                    f"Valid values are: {', '.join([m.value for m in GradingMode])}"
                ) from e
        if data.result_release_mode is not None:
            try:
                update_fields["result_release_mode"] = ResultReleaseMode(data.result_release_mode)
            except ValueError as e:
                raise ValidationError(
                    f"Invalid result_release_mode: '{data.result_release_mode}'. "
                    f"Valid values are: {', '.join([r.value for r in ResultReleaseMode])}"
                ) from e
        if hasattr(data, "subject") and data.subject is not None:
            update_fields["subject"] = data.subject
        if data.total_marks is not None:
            update_fields["total_marks"] = data.total_marks
        if data.passing_marks is not None:
            update_fields["passing_marks"] = data.passing_marks
        if data.duration_minutes is not None:
            update_fields["duration_minutes"] = data.duration_minutes
        if data.is_group_assessment is not None:
            update_fields["is_group_assessment"] = data.is_group_assessment
        if data.max_group_size is not None:
            update_fields["max_group_size"] = data.max_group_size
        if data.group_formation_mode is not None:
            update_fields["group_formation_mode"] = data.group_formation_mode
        if data.group_assignment_mode is not None:
            update_fields["group_assignment_mode"] = GroupAssignmentMode(data.group_assignment_mode)
        if data.question_distribution_mode is not None:
            update_fields["question_distribution_mode"] = QuestionDistributionMode(data.question_distribution_mode)
        if data.require_all_member_approval is not None:
            update_fields["require_all_member_approval"] = data.require_all_member_approval
        if data.require_all_member_participation is not None:
            update_fields["require_all_member_participation"] = data.require_all_member_participation
        if data.submission_mode is not None:
            update_fields["submission_mode"] = data.submission_mode
        if data.peer_evaluation_enabled is not None:
            update_fields["peer_evaluation_enabled"] = data.peer_evaluation_enabled
        if data.peer_evaluation_deadline is not None:
            update_fields["peer_evaluation_deadline"] = data.peer_evaluation_deadline
        if data.peer_evaluation_weight_percent is not None:
            update_fields["peer_evaluation_weight_percent"] = data.peer_evaluation_weight_percent
        if data.individual_weighting_enabled is not None:
            update_fields["individual_weighting_enabled"] = data.individual_weighting_enabled
        if data.appeal_window_days is not None:
            update_fields["appeal_window_days"] = data.appeal_window_days
        if data.show_marks_per_question is not None:
            update_fields["show_marks_per_question"] = data.show_marks_per_question
        if data.show_feedback_after_submit is not None:
            update_fields["show_feedback_after_submit"] = data.show_feedback_after_submit
        if data.is_ai_generation_enabled is not None:
            update_fields["is_ai_generation_enabled"] = data.is_ai_generation_enabled
        if data.audience_type is not None:
            update_fields["audience_type"] = data.audience_type
        if data.target_student_ids is not None:
            update_fields["target_student_ids"] = data.target_student_ids

        # Timing fields
        if data.window_start is not None:
            update_fields["window_start"] = data.window_start
        if data.window_end is not None:
            update_fields["window_end"] = data.window_end
        if data.result_release_at is not None:
            update_fields["result_release_at"] = data.result_release_at

        if data.max_attempts is not None:
            update_fields["max_attempts"] = data.max_attempts
        if data.is_password_protected is not None:
            update_fields["is_password_protected"] = data.is_password_protected
            if data.is_password_protected:
                if getattr(data, "access_password", None):
                    update_fields["access_password_hash"] = hash_password(data.access_password)
            else:
                update_fields["access_password_hash"] = None
        elif getattr(data, "access_password", None):
            is_protected = update_fields.get("is_password_protected", assessment.is_password_protected)
            if is_protected:
                update_fields["access_password_hash"] = hash_password(data.access_password)
        if data.fullscreen_required is not None:
            update_fields["fullscreen_required"] = data.fullscreen_required
        if data.is_supervised is not None:
            update_fields["is_supervised"] = data.is_supervised
        if data.ai_assistance_allowed is not None:
            update_fields["ai_assistance_allowed"] = data.ai_assistance_allowed
        if data.is_open_book is not None:
            update_fields["is_open_book"] = data.is_open_book
        if data.integrity_monitoring_enabled is not None:
            update_fields["integrity_monitoring_enabled"] = data.integrity_monitoring_enabled
        if data.randomize_questions is not None:
            update_fields["randomize_questions"] = data.randomize_questions
        if data.randomize_options is not None:
            update_fields["randomize_options"] = data.randomize_options
        if data.late_submission_allowed is not None:
            update_fields["late_submission_allowed"] = data.late_submission_allowed
        if data.late_penalty_percent is not None:
            update_fields["late_penalty_percent"] = data.late_penalty_percent
        if data.grace_period_minutes is not None:
            update_fields["grace_period_minutes"] = data.grace_period_minutes

        # Update target sections (class groups)
        # Update target sections (class groups)
        async def add_or_restore_target_in_wizard(class_sec_id):
            res = await self.db.execute(
                select(AssessmentTargetSection).where(
                    AssessmentTargetSection.assessment_id == assessment_id,
                    AssessmentTargetSection.class_section_id == class_sec_id
                )
            )
            existing = res.scalars().first()
            if existing:
                existing.is_deleted = False
                existing.deleted_at = None
                existing.added_by_id = current_user.id
            else:
                target = AssessmentTargetSection(
                    assessment_id=assessment_id,
                    class_section_id=class_sec_id,
                    added_by_id=current_user.id
                )
                self.db.add(target)

        async def add_or_restore_supervisor_in_wizard(supervisor_uuid, role):
            res = await self.db.execute(
                select(AssessmentSupervisor).where(
                    AssessmentSupervisor.assessment_id == assessment_id,
                    AssessmentSupervisor.supervisor_id == supervisor_uuid
                )
            )
            existing = res.scalars().first()
            if existing:
                existing.is_deleted = False
                existing.deleted_at = None
                existing.supervisor_role = role
                existing.assigned_by_id = current_user.id
            else:
                sup = AssessmentSupervisor(
                    assessment_id=assessment_id,
                    supervisor_id=supervisor_uuid,
                    supervisor_role=role,
                    assigned_by_id=current_user.id
                )
                self.db.add(sup)

        if data.class_group_ids is not None:
            # Clear existing targets
            from app.db.models.academic import ClassSection, TeachingAssignment
            from app.db.models.assessment import AssessmentTargetSection
            from sqlalchemy import select, update
            await self.db.execute(
                update(AssessmentTargetSection)
                .where(AssessmentTargetSection.assessment_id == assessment_id)
                .values(is_deleted=True, deleted_at=datetime.now(UTC))
            )
            for cg_id in data.class_group_ids:
                res = await self.db.execute(
                    select(ClassSection.id)
                    .join(TeachingAssignment, TeachingAssignment.class_section_id == ClassSection.id)
                    .where(
                        TeachingAssignment.course_id == assessment.course_id,
                        ClassSection.class_group_id == cg_id,
                        ClassSection.is_deleted == False
                    )
                )
                section_id = res.scalar_one_or_none()
                if section_id:
                    await add_or_restore_target_in_wizard(section_id)

        if "teaching_workspace_id" in update_fields and update_fields["teaching_workspace_id"]:
            from app.db.models.academic import TeachingWorkspace
            from app.db.models.assessment import AssessmentTargetSection
            from sqlalchemy import select, update
            await self.db.execute(
                update(AssessmentTargetSection)
                .where(AssessmentTargetSection.assessment_id == assessment_id)
                .values(is_deleted=True, deleted_at=datetime.now(UTC))
            )
            res = await self.db.execute(
                select(TeachingWorkspace.class_section_id).where(TeachingWorkspace.id == update_fields["teaching_workspace_id"])
            )
            ws_section_id = res.scalar_one_or_none()
            if ws_section_id:
                await add_or_restore_target_in_wizard(ws_section_id)

        # Update supervisors
        if data.supervisor_ids is not None:
            # Clear existing supervisors
            from app.db.enums import SupervisorRole
            from app.db.models.assessment import AssessmentSupervisor
            from sqlalchemy import update
            await self.db.execute(
                update(AssessmentSupervisor)
                .where(AssessmentSupervisor.assessment_id == assessment_id)
                .values(is_deleted=True, deleted_at=datetime.now(UTC))
            )
            for sup_id in data.supervisor_ids:
                role = SupervisorRole.PRIMARY if str(sup_id) == str(assessment.created_by_id) else SupervisorRole.ASSISTANT
                await add_or_restore_supervisor_in_wizard(sup_id, role)

        # Advance wizard step if moving forward
        if step > (assessment.draft_step or 0):
            update_fields["draft_step"] = step

        if update_fields:
            await self._repo.update_fields(
                assessment_id,
                updated_by_id=current_user.id,
                **update_fields
            )

        await self.db.flush()

        await self._repo.upsert_draft_progress(
            assessment_id=assessment_id,
            last_active_step=step,
        )

        return await self._repo.get_by_id(assessment_id)

    # ─── Update Security Settings ─────────────────────────────────────────────

    async def update_security_settings(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        data: AssessmentSecuritySettingsUpdate,
    ):
        """
        Step 2 of wizard: apply security and integrity settings.
        Hashes the access password if password protection is enabled.
        """
        assessment = await self._get_and_validate(assessment_id, current_user)

        update_fields: dict = {
            "max_attempts": data.max_attempts,
            "grace_period_minutes": data.grace_period_minutes,
            "late_submission_allowed": data.late_submission_allowed,
            "late_penalty_percent": data.late_penalty_percent,
            "is_password_protected": data.is_password_protected,
            "fullscreen_required": data.fullscreen_required,
            "is_supervised": data.is_supervised,
            "ai_assistance_allowed": data.ai_assistance_allowed,
            "is_open_book": data.is_open_book,
            "integrity_monitoring_enabled": data.integrity_monitoring_enabled,
            "randomize_questions": data.randomize_questions,
            "randomize_options": data.randomize_options,
        }

        if data.window_start:
            update_fields["window_start"] = data.window_start
        if data.window_end:
            update_fields["window_end"] = data.window_end

        if data.is_password_protected and data.access_password:
            update_fields["access_password_hash"] = hash_password(data.access_password)
        elif not data.is_password_protected:
            update_fields["access_password_hash"] = None

        # Advance to step 2 if not already past it
        if (assessment.draft_step or 0) < 2:
            update_fields["draft_step"] = 2

        await self._repo.update_fields(
            assessment_id,
            updated_by_id=current_user.id,
            **update_fields
        )
        await self._repo.upsert_draft_progress(
            assessment_id=assessment_id,
            last_active_step=2
        )

        return await self._repo.get_by_id(assessment_id)

    # ─── Sections ─────────────────────────────────────────────────────────────

    async def create_section(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        data: AssessmentSectionCreate,
    ):
        assessment = await self._get_and_validate(assessment_id, current_user)
        section = await self._repo.create_section(
            assessment_id=assessment_id,
            title=data.title,
            description=data.description,
            order_index=data.order_index,
            instructions=data.instructions,
            allocated_marks=data.allocated_marks or 0,
        )

        # Advance wizard step if needed
        if (assessment.draft_step or 0) < 3:
            await self._repo.update_fields(
                assessment_id,
                updated_by_id=current_user.id,
                draft_step=3
            )

        return section

    async def update_section(
        self,
        assessment_id: uuid.UUID,
        section_id: uuid.UUID,
        current_user: User,
        data: AssessmentSectionUpdate,
    ):
        await self._get_and_validate(assessment_id, current_user)
        section = await self._repo.get_section(section_id)
        if not section or str(section.assessment_id) != str(assessment_id):
            raise NotFoundError("Section not found in this assessment.")

        update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
        if update_fields:
            await self._repo.update_section(section_id, **update_fields)
        return await self._repo.get_section(section_id)

    async def delete_section(
        self,
        assessment_id: uuid.UUID,
        section_id: uuid.UUID,
        current_user: User,
    ) -> None:
        await self._get_and_validate(assessment_id, current_user)
        section = await self._repo.get_section(section_id)
        if not section or str(section.assessment_id) != str(assessment_id):
            raise NotFoundError("Section not found in this assessment.")
        await self._repo.soft_delete_section(section_id)

    # ─── Questions ────────────────────────────────────────────────────────────

    async def add_question_to_assessment(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        data: AddQuestionToAssessmentRequest,
    ):
        """
        Add a question from the bank to an assessment.

        Validates:
            - Assessment exists and belongs to caller
            - Assessment is not finalized
            - Question exists and is active
            - Question is not already in the assessment
        """
        assessment = await self._get_and_validate(assessment_id, current_user)

        question = await self._question_repo.get_by_id_simple(data.question_id)
        if not question or question.is_deleted:
            raise NotFoundError("Question not found or not active.")

        already_added = await self._repo.question_in_assessment(
            assessment_id, data.question_id
        )
        if already_added:
            raise ConflictError(
                "This question is already in the assessment.",
                code="QUESTION_ALREADY_ADDED",
            )

        aq = await self._repo.add_question(
            assessment_id=assessment_id,
            question_id=data.question_id,
            marks_override=data.marks,
            order_index=data.order_index,
            added_via=data.added_via,
            assessment_section_id=data.section_id,
        )

        # Advance wizard step if needed
        if (assessment.draft_step or 0) < 4:
            await self._repo.update_fields(
                assessment_id,
                updated_by_id=current_user.id,
                draft_step=4
            )

        return aq

    async def remove_question_from_assessment(
        self,
        assessment_id: uuid.UUID,
        question_id: uuid.UUID,
        current_user: User,
    ) -> None:
        assessment = await self._get_and_validate(assessment_id, current_user)
        await self._repo.remove_question(assessment_id, question_id)

    async def reorder_questions(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        data: ReorderQuestionsRequest,
    ) -> None:
        """
        Update the order_index of assessment questions.

        Validates that all question_ids belong to this assessment.
        """
        await self._get_and_validate(assessment_id, current_user)

        for item in data.order:
            question_id = uuid.UUID(str(item["question_id"]))
            order_index = int(item["order_index"])

            aq = await self._repo.get_assessment_question(
                assessment_id, question_id
            )
            if not aq:
                raise NotFoundError(
                    f"Question {question_id} not found in this assessment."
                )
            await self._repo.update_question_order(aq.id, order_index)

    # ─── Finalize ─────────────────────────────────────────────────────────────

    async def finalize_assessment(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
    ) -> FinalizeAssessmentResponse:
        """
        Publish the assessment to students.

        Runs all finalization checks:
            1. Not already finalized
            2. Has at least 1 section
            3. Has at least 1 question
            4. Marks sum matches total_marks
            5. Blueprint rules pass (no blocking violations)

        If all checks pass: sets is_finalized=True, status=SCHEDULED.
        If any blocking check fails: returns errors list without finalizing.
        """
        assessment = await self._get_and_validate(assessment_id, current_user)

        errors: list[str] = []
        warnings: list[str] = []

        # Check 1: Not already finalized
        if assessment.draft_is_complete:
            return FinalizeAssessmentResponse(
                id=assessment.id,
                title=assessment.title,
                status=assessment.status.value if hasattr(assessment.status, 'value') else str(assessment.status),
                is_finalized=True,
                finalized_at=assessment.published_at,
                validation_passed=False,
                errors=["Assessment is already finalized."],
            )

        # Check 2: Has sections
        section_count = await self._repo.count_sections(assessment_id)
        if section_count == 0:
            errors.append("Assessment must have at least 1 section before finalizing.")

        # Check 3: Has questions
        question_count = await self._repo.count_questions(assessment_id)
        if question_count == 0:
            errors.append("Assessment must have at least 1 question before finalizing.")

        # Check 4: Marks match
        if question_count > 0:
            marks_sum = await self._repo.sum_marks(assessment_id)
            if marks_sum != assessment.total_marks:
                errors.append(
                    f"Question marks total ({marks_sum}) does not match "
                    f"assessment total_marks ({assessment.total_marks}). "
                    f"Adjust question marks or update total_marks."
                )

        # Check 5: Blueprint validation
        try:
            blueprint_result = await self._blueprint_service.validate_blueprint(
                assessment_id
            )
            for v in blueprint_result.violations:
                errors.append(f"Blueprint: {v.message}")
            for w in blueprint_result.warnings:
                warnings.append(f"Blueprint warning: {w.message}")
        except Exception:
            # No blueprint defined — that's allowed
            pass
        # Check 5b: Fill-in-the-blank placeholder validation
        for aq in (assessment.assessment_questions or []):
            if aq.question and aq.question.question_type == DbQuestionType.FILL_BLANK:
                content = aq.question.content or ""
                if "[blank]" not in content:
                    errors.append(
                        f"Fill-in-the-blank question '{content[:40]}...' must contain the '[blank]' placeholder in its text."
                    )

        # Check 6: Group-work configuration must be complete before publish
        if assessment.is_group_assessment:
            groups = await self._group_repo.list_groups_by_assessment(assessment_id, include_members=True)
            if not groups:
                errors.append("Group work assessments must have groups created before finalizing.")
            else:
                if assessment.group_invalidated_at is not None:
                    errors.append("Group assignments were invalidated and must be rebuilt before finalizing.")

                # Check for enrollment changes (Phase 12 rule)
                from app.services.group_work_service import GroupWorkService
                group_svc = GroupWorkService(self.db)
                if await group_svc.check_enrollment_drift(assessment_id):
                    errors.append("Class enrollment has changed. Group assignments are no longer valid and must be rebuilt.")

                # Validate exactly one group per student mapping
                roster_student_ids = set(await self._group_repo.list_target_student_ids(assessment_id))
                student_group_counts = {}
                for group in groups:
                    for member in group.members:
                        if not member.is_deleted:
                            student_group_counts[member.student_id] = student_group_counts.get(member.student_id, 0) + 1

                # 1. Double assignment check
                multiple_groups = [sid for sid, count in student_group_counts.items() if count > 1]
                if multiple_groups:
                    errors.append("Some students are assigned to more than one group.")

                # 2. Complete coverage check
                unassigned_students = roster_student_ids - set(student_group_counts.keys())
                if unassigned_students:
                    errors.append("All enrolled students must be assigned to exactly one group before finalizing.")

                unlocked = [group for group in groups if not group.is_locked]
                if unlocked:
                    errors.append("All groups must be locked before finalizing the assessment.")
                if assessment.question_distribution_mode is None:
                    errors.append("Group work assessments must define a question distribution mode before finalizing.")
                if assessment.peer_evaluation_enabled:
                    if not assessment.peer_evaluation_deadline:
                        errors.append("Peer evaluation deadline is required when peer evaluation is enabled.")
                    elif assessment.window_end and assessment.peer_evaluation_deadline <= assessment.window_end:
                        errors.append("Peer evaluation deadline must occur after the group submission deadline.")
                    if assessment.peer_evaluation_weight_percent is not None:
                        if not (0 < assessment.peer_evaluation_weight_percent <= 100):
                            errors.append("Peer evaluation weight percentage must be between 1 and 100.")

        # If any errors, don't finalize
        if errors:
            return FinalizeAssessmentResponse(
                id=assessment.id,
                title=assessment.title,
                status=assessment.status.value if hasattr(assessment.status, 'value') else str(assessment.status),
                is_finalized=False,
                finalized_at=None,
                validation_passed=False,
                errors=errors,
                warnings=warnings,
            )

        # Capture student enrollment snapshot
        try:
            from app.db.models.academic import (AssessmentTargetSection,
                                                StudentEnrollment)
            from app.db.models.auth import User, UserProfile
            from sqlalchemy import select

            stmt = (
                select(
                    User.id,
                    User.email,
                    UserProfile.first_name,
                    UserProfile.last_name,
                    UserProfile.student_id
                )
                .join(StudentEnrollment, StudentEnrollment.student_id == User.id)
                .join(UserProfile, UserProfile.user_id == User.id)
                .join(AssessmentTargetSection, AssessmentTargetSection.class_section_id == StudentEnrollment.class_section_id)
                .where(
                    AssessmentTargetSection.assessment_id == assessment_id,
                    AssessmentTargetSection.is_deleted == False,
                    StudentEnrollment.is_deleted == False
                )
                .distinct()
            )
            res = await self.db.execute(stmt)
            snapshot_students = []
            for uid, email, fname, lname, sid in res.all():
                snapshot_students.append({
                    "id": str(uid),
                    "email": email,
                    "name": f"{fname} {lname}",
                    "student_id": sid or "N/A"
                })

            await self._repo.update_fields(
                assessment_id,
                updated_by_id=current_user.id,
                student_enrollment_snapshot=snapshot_students
            )
        except Exception as e:
            print(f"Failed to save student enrollment snapshot: {e}")

        # All checks passed — finalize
        await self._repo.publish(assessment_id, updated_by_id=current_user.id)

        # Delete draft progress (no longer needed)
        await self._repo.delete_draft_progress(assessment_id)

        # Notify students if it's a group assessment
        from app.db.enums import NotificationType
        if assessment.is_group_assessment:
            groups = await self._group_repo.list_groups_by_assessment(assessment.id, include_members=True)
            for group in groups:
                for member in group.members:
                    if member.is_deleted:
                        continue
                    await self._notification_repo.create(
                        recipient_id=member.student_id,
                        notification_type=NotificationType.GROUP_WORK_ASSIGNED,
                        title="Group work assigned",
                        body=f"You have been assigned to group '{group.name}' for assessment '{assessment.title}'.",
                        reference_id=assessment.id,
                        reference_type="assessment",
                        action_url=f"/student/group-work/{assessment.id}",
                    )
        else:
            lecturer_name = current_user.profile.display_name if current_user.profile and current_user.profile.display_name else "Your Lecturer"
            # General assessment publication notification
            student_ids = await self._repo.list_enrolled_students(assessment.id)
            for s_id in student_ids:
                await self._notification_repo.create(
                    recipient_id=s_id,
                    notification_type=NotificationType.ASSESSMENT_PUBLISHED,
                    title="New assessment published",
                    body=f"Lecturer {lecturer_name} has published a new assessment: '{assessment.title}'.",
                    reference_id=assessment.id,
                    reference_type="assessment",
                    action_url=f"/student/assessments",
                )

                # If already active, send start work notification too
                now = datetime.now(tz=UTC)
                if assessment.window_start and assessment.window_start <= now:
                     await self._notification_repo.create(
                        recipient_id=s_id,
                        notification_type=NotificationType.ASSESSMENT_PUBLISHED, # Using published for now, or add new type
                        title="Assessment now active",
                        body=f"The assessment '{assessment.title}' is now active. You can start working on it.",
                        reference_id=assessment.id,
                        reference_type="assessment",
                        action_url=f"/student/assessments/{assessment.id}/take",
                    )

        return FinalizeAssessmentResponse(
            id=assessment.id,
            title=assessment.title,
            status=AssessmentStatus.PUBLISHED.value,
            is_finalized=True,
            finalized_at=datetime.now(tz=UTC),
            validation_passed=True,
            errors=[],
            warnings=warnings,
        )

    # ─── Read ─────────────────────────────────────────────────────────────────

    async def get_assessment(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
    ):
        """Load assessment with authorization check."""
        assessment = await self._repo.get_by_id(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")

        # Lecturers can only see their own assessments
        if current_user.role == UserRole.LECTURER.value:
            if str(assessment.created_by_id) != str(current_user.id):
                raise AuthorizationError("You do not have access to this assessment.")

        # Students can only see finalized assessments
        if current_user.role == UserRole.STUDENT.value:
            if not assessment.draft_is_complete:
                raise NotFoundError("Assessment not found.")
            if assessment.audience_type == "selected":
                target_ids = assessment.target_student_ids or []
                if str(current_user.id) not in [str(tid) for tid in target_ids]:
                    raise NotFoundError("Assessment not found.")

        return assessment

    async def list_questions(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
    ) -> list:
        """
        Return all questions linked to an assessment.
        """
        # Reuse auth logic from get_assessment
        await self.get_assessment(assessment_id, current_user)
        return await self._repo.list_assessment_questions(assessment_id)

    async def list_assessments(
        self,
        current_user: User,
        status: str | None = None,
        assessment_type: str | None = None,
        page: int = 1,
        page_size: int = 20,
        sort: str = "newest",
    ):
        """Paginated list of assessments (role-aware)."""
        db_status = None
        if status:
            try:
                db_status = DbAssessmentStatus(status)
            except ValueError as e:
                raise ValidationError(
                    f"Invalid status: '{status}'. "
                    f"Valid values are: {', '.join([s.value for s in DbAssessmentStatus])}"
                ) from e

        db_type = None
        if assessment_type:
            try:
                db_type = DbAssessmentType(assessment_type)
            except ValueError as e:
                raise ValidationError(
                    f"Invalid assessment_type: '{assessment_type}'. "
                    f"Valid values are: {', '.join([t.value for t in DbAssessmentType])}"
                ) from e

        if current_user.role == UserRole.ADMIN.value:
            items, total = await self._repo.list_all(
                status=db_status,
                assessment_type=db_type,
                page=page,
                page_size=page_size,
                sort=sort,
            )
        elif current_user.role == UserRole.LECTURER.value:
            items, total = await self._repo.list_by_creator(
                created_by_id=current_user.id,
                status=db_status,
                assessment_type=db_type,
                page=page,
                page_size=page_size,
                sort=sort,
            )
        else:
            # Students and others
            items, total = await self._repo.list_available_for_student(
                student_id=current_user.id,
                page=page,
                page_size=page_size,
                sort=sort,
            )

        summary_items = []
        for a in items:
            summary = AssessmentSummaryResponse.model_validate(a)
            if hasattr(a, "course") and a.course:
                summary.course_name = a.course.name
                summary.course_code = a.course.code

            # Populate student status if current user is a student
            if current_user.role == UserRole.STUDENT.value:
                attempts, _ = await self._attempt_repo.list_by_student(
                    student_id=current_user.id,
                    assessment_id=a.id
                )
                summary.attempts_used = len(attempts)
                if not attempts:
                    summary.student_status = "NOT_STARTED"
                else:
                    # Check if any attempt is submitted or in progress
                    # Sort attempts by submitted_at desc to find the primary one
                    submitted_attempts = [att for att in attempts if att.status in [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]]
                    if submitted_attempts:
                        summary.student_status = "SUBMITTED"
                        # Use the most recent submitted attempt for the result link
                        submitted_attempts.sort(key=lambda x: x.submitted_at or x.started_at, reverse=True)
                        summary.student_attempt_id = submitted_attempts[0].id
                    else:
                        summary.student_status = "IN_PROGRESS"
                        # For IN_PROGRESS, use the most recent active attempt
                        summary.student_attempt_id = attempts[0].id
                        summary.student_attempt_expires_at = attempts[0].expires_at

                    # For group work, reflect group submission status
                    if a.is_group_assessment and attempts[0].group_id:
                        from app.db.models.attempt import GroupSubmission
                        from sqlalchemy import select
                        sub_stmt = select(GroupSubmission).where(
                            GroupSubmission.assessment_id == a.id,
                            GroupSubmission.group_id == attempts[0].group_id
                        )
                        sub_res = await self.db.execute(sub_stmt)
                        submission = sub_res.scalar_one_or_none()
                        if submission and submission.status in [GroupSubmissionStatus.SUBMITTED, GroupSubmissionStatus.APPROVED]:
                             summary.student_status = "SUBMITTED"

            summary_items.append(summary)

        return AssessmentListResponse(
            items=summary_items,
            total=total,
            page=page,
            page_size=page_size,
            has_next=(page * page_size) < total,
        )

    async def soft_delete_assessment(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
    ) -> None:
        assessment = await self._repo.get_by_id_simple(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")

        self._assert_can_edit(assessment, current_user)

        # Only block if it's currently ACTIVE (being taken by students)
        if assessment.status == DbAssessmentStatus.ACTIVE and current_user.role != UserRole.ADMIN.value:
            raise ConflictError(
                "Active assessments currently being taken cannot be deleted. Archive them instead or contact an admin.",
                code="CANNOT_DELETE_ACTIVE",
            )

        await self._repo.soft_delete(assessment_id, deleted_by_id=current_user.id)

    # ─── Internal Helpers ─────────────────────────────────────────────────────

    async def _get_and_validate(self, assessment_id: uuid.UUID, current_user: User):
        """Load assessment and validate edit permission.

        Allows editing DRAFT and PUBLISHED assessments.
        Blocks edits on ACTIVE, CLOSED, and ARCHIVED assessments.
        """
        assessment = await self._repo.get_by_id_simple(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")
        self._assert_can_edit(assessment, current_user)
        self._assert_not_finalized(assessment)
        return assessment

    # ─── Bulk Operations ──────────────────────────────────────────────────────

    async def bulk_publish_assessment(
        self,
        data: BulkAssessmentPublishRequest,
        current_user: User,
    ) -> FinalizeAssessmentResponse:
        """
        Creates an assessment and all its dependencies in one go.
        Used by the frontend single-page builder.
        """
        assessment = await self._build_bulk_assessment(data, current_user, is_publish=True)

        if assessment.is_group_assessment:
            from app.services.group_work_service import GroupWorkService
            group_svc = GroupWorkService(self.db)
            await group_svc.lock_groups_for_publish(assessment_id=assessment.id, current_user=current_user)

        # We call the existing finalize logic to ensure all validations pass.
        return await self.finalize_assessment(assessment.id, current_user)

    async def bulk_save_draft_assessment(
        self,
        data: BulkAssessmentPublishRequest,
        current_user: User,
    ) -> Assessment:
        assessment = await self._build_bulk_assessment(data, current_user)
        await self.db.flush()
        assessment_id = assessment.id
        self.db.expire(assessment)
        return await self._repo.get_by_id(assessment_id)

    async def _build_bulk_assessment(
        self,
        data: BulkAssessmentPublishRequest,
        current_user: User,
        is_publish: bool = False,
    ):
        # Note: Frontend 'mode' maps to AssessmentType (e.g. 'CAT' -> 'CAT')
        mode_mapping = {
            "Practice": "FORMATIVE",
            "Formative": "FORMATIVE",
            "Homework": "HOMEWORK",
            "CAT": "CAT",
            "Summative": "SUMMATIVE",
            "Groupwork": "GROUP_WORK",
            "Reassessment": "REASSESSMENT",
        }
        assessment_type = mode_mapping.get(data.metadata.mode, "FORMATIVE")
        is_group = data.metadata.mode == "Groupwork"

        # Instructions logic: merge selected and custom using a consistent split marker
        selected_list = data.metadata.selectedInstructions or []
        custom_text = data.metadata.customInstructions or ""
        instructions = "\n".join(selected_list) + "\n\nAdditional Instructions:\n" + custom_text

        # Calculate window start/end
        window_start = data.metadata.windowStart
        window_end = data.metadata.windowEnd
        if window_start is None and data.metadata.date and data.metadata.startTime:
            def parse_time(t_str: str) -> datetime | None:
                formats = ["%H:%M", "%I:%M %p", "%I:%M%p", "%H:%M:%S"]
                for fmt in formats:
                    try:
                        t = datetime.strptime(t_str, fmt).time()
                        # Ensure we have a datetime object to call .date() on
                        base_date = data.metadata.date
                        if isinstance(base_date, str):
                            try:
                                base_date = datetime.fromisoformat(base_date.replace("Z", "+00:00"))
                            except ValueError:
                                return None

                        if not hasattr(base_date, "date"):
                            return None

                        # Use the date from metadata, but preserve timezone if present
                        dt = datetime.combine(base_date.date(), t)
                        if hasattr(base_date, "tzinfo") and base_date.tzinfo:
                            dt = dt.replace(tzinfo=base_date.tzinfo)
                            return dt.astimezone(UTC)
                        return dt.replace(tzinfo=UTC)
                    except (ValueError, AttributeError):
                        continue
                return None

            window_start = parse_time(data.metadata.startTime)
            if data.metadata.endTime:
                window_end = parse_time(data.metadata.endTime)

        # 2. Get or Create Assessment
        from app.db.enums import AssessmentStatus as DbAssessmentStatus
        from app.db.models.academic import (ClassSection, Course,
                                            TeachingWorkspace)
        from app.db.models.assessment import AssessmentTargetSection
        from sqlalchemy import or_, select, update

        teaching_workspace_id = None
        course_id = None
        subject_id = None

        # Determine Teaching Workspace & Course
        # Strategy:
        # 1. If teaching_workspace_id is provided, use it and get course_id from it.
        # 2. If course_id is provided, try to see if it's actually a workspace ID.
        # 3. If it's a real course ID, find/default a workspace for this lecturer.

        input_course_val = str(data.metadata.course_id) if data.metadata.course_id else None
        input_workspace_val = str(data.metadata.teaching_workspace_id) if data.metadata.teaching_workspace_id else None

        if input_workspace_val:
            try:
                teaching_workspace_id = uuid.UUID(input_workspace_val)
                res = await self.db.execute(select(TeachingWorkspace).where(TeachingWorkspace.id == teaching_workspace_id))
                workspace = res.scalars().first()
                if workspace:
                    course_id = workspace.course_id
            except (ValueError, TypeError):
                pass

        if not teaching_workspace_id and input_course_val:
            try:
                potential_id = uuid.UUID(input_course_val)
                # Check if it's a workspace
                res = await self.db.execute(select(TeachingWorkspace).where(TeachingWorkspace.id == potential_id))
                workspace = res.scalars().first()
                if workspace:
                    teaching_workspace_id = potential_id
                    course_id = workspace.course_id
                else:
                    # It's a real course ID
                    course_id = potential_id
            except (ValueError, TypeError):
                # Try search by code/name
                res = await self.db.execute(
                    select(Course).where(or_(Course.code == input_course_val, Course.name == input_course_val))
                )
                course = res.scalars().first()
                if course:
                    course_id = course.id

        if not teaching_workspace_id and course_id:
            # Find a workspace for this lecturer and this course
            res = await self.db.execute(
                select(TeachingWorkspace).where(
                    TeachingWorkspace.course_id == course_id,
                    TeachingWorkspace.lecturer_id == current_user.id,
                    TeachingWorkspace.is_active == True
                )
            )
            workspace = res.scalars().first()
            if workspace:
                teaching_workspace_id = workspace.id
            else:
                # Fallback: Just take any active workspace for this course if admin,
                # or raise if lecturer can't be found
                res = await self.db.execute(
                    select(TeachingWorkspace).where(
                        TeachingWorkspace.course_id == course_id,
                        TeachingWorkspace.is_active == True
                    ).limit(1)
                )
                workspace = res.scalars().first()
                if workspace:
                    teaching_workspace_id = workspace.id

        if not teaching_workspace_id or not course_id:
            raise ValidationError("A valid Teaching Workspace and Course are required for assessment creation.")

        # Derived subject if not explicitly provided
        if data.metadata.subject_id:
            try:
                subject_id = uuid.UUID(str(data.metadata.subject_id))
            except (ValueError, TypeError):
                pass

        if not subject_id:
            from app.db.models.academic import CourseSubject
            res = await self.db.execute(
                select(CourseSubject.subject_id).where(CourseSubject.course_id == course_id).limit(1)
            )
            subject_id = res.scalar_one_or_none()

        if data.id:
            assessment = await self._repo.get_by_id_simple(data.id)
            if not assessment:
                raise NotFoundError("Assessment to update not found.")

            # Check permissions
            self._assert_can_edit(assessment, current_user)

            # Update basic fields
            update_data = {
                "title": data.metadata.title,
                "description": data.metadata.description,
                "assessment_type": DbAssessmentType(assessment_type),
                "teaching_workspace_id": teaching_workspace_id,
                "course_id": course_id,
                "subject_id": subject_id,
                "academic_year": data.metadata.academic_year,
                "grading_mode": GradingMode.MANUAL,
                "result_release_mode": (
                    ResultReleaseMode.SCHEDULED if data.rules.resultRelease == "scheduled"
                    else (ResultReleaseMode.MANUAL if data.rules.resultRelease == "manual" else ResultReleaseMode.IMMEDIATE)
                ),
                "total_marks": sum(s.marks for s in data.blueprint),
                "passing_marks": data.metadata.passing_marks,
                "instructions": instructions,
                "duration_minutes": data.metadata.durationMinutes,
                "is_group_assessment": is_group,
                "max_group_size": data.metadata.maxGroupSize if is_group else None,
                "group_formation_mode": data.metadata.groupFormation if is_group else None,
                "group_assignment_mode": GroupAssignmentMode(data.metadata.groupAssignmentMode) if is_group and data.metadata.groupAssignmentMode else None,
                "question_distribution_mode": QuestionDistributionMode(data.metadata.questionDistributionMode) if is_group and data.metadata.questionDistributionMode else None,
                "require_all_member_approval": data.rules.requireAllMemberApproval if is_group else False,
                "require_all_member_participation": data.rules.requireAllMemberParticipation if is_group else False,
                "submission_mode": data.metadata.submissionMode if is_group else None,
                "peer_evaluation_enabled": data.metadata.peerEvaluationEnabled if is_group else False,
                "peer_evaluation_deadline": data.metadata.peerEvaluationDeadline if is_group else None,
                "peer_evaluation_weight_percent": data.metadata.peerEvaluationWeightPercent if is_group else None,
                "individual_weighting_enabled": data.metadata.individualWeightingEnabled if is_group else False,
                "appeal_window_days": data.metadata.appealWindowDays if is_group else None,
                "audience_type": data.metadata.audience_type,
                "target_student_ids": data.metadata.target_student_ids,
            }
            if data.draft_step is not None:
                update_data["draft_step"] = data.draft_step
            if data.rules.autosaveToken:
                update_data["autosave_token"] = data.rules.autosaveToken

            await self._repo.update_fields(assessment.id, updated_by_id=current_user.id, **update_data)

            # Clear existing sections and questions to rebuild them
            await self._repo.clear_sections_and_questions(assessment.id)
        else:
            assessment = await self._repo.create(
                title=data.metadata.title,
                description=data.metadata.description,
                assessment_type=DbAssessmentType(assessment_type),
                teaching_workspace_id=teaching_workspace_id,
                course_id=course_id,
                subject_id=subject_id,
                academic_year=data.metadata.academic_year,
                created_by_id=current_user.id,
                grading_mode=GradingMode.MANUAL,
                result_release_mode=(
                    ResultReleaseMode.SCHEDULED if data.rules.resultRelease == "scheduled"
                    else (ResultReleaseMode.MANUAL if data.rules.resultRelease == "manual" else ResultReleaseMode.IMMEDIATE)
                ),
                total_marks=sum(s.marks for s in data.blueprint),
                passing_marks=data.metadata.passing_marks,
                instructions=instructions,
                duration_minutes=data.metadata.durationMinutes,
                window_start=window_start,
                window_end=window_end,
                result_release_at=data.rules.resultReleaseAt,
                max_attempts=data.rules.attempts,
                is_group_assessment=is_group,
                max_group_size=data.metadata.maxGroupSize if is_group else None,
                group_formation_mode=data.metadata.groupFormation if is_group else None,
                group_assignment_mode=GroupAssignmentMode(data.metadata.groupAssignmentMode) if is_group and data.metadata.groupAssignmentMode else None,
                question_distribution_mode=QuestionDistributionMode(data.metadata.questionDistributionMode) if is_group and data.metadata.questionDistributionMode else None,
                require_all_member_approval=data.rules.requireAllMemberApproval if is_group else False,
                require_all_member_participation=data.rules.requireAllMemberParticipation if is_group else False,
                submission_mode=data.metadata.submissionMode if is_group else None,
                peer_evaluation_enabled=data.metadata.peerEvaluationEnabled if is_group else False,
                peer_evaluation_deadline=data.metadata.peerEvaluationDeadline if is_group else None,
                peer_evaluation_weight_percent=data.metadata.peerEvaluationWeightPercent if is_group else None,
                individual_weighting_enabled=data.metadata.individualWeightingEnabled if is_group else False,
                appeal_window_days=data.metadata.appealWindowDays if is_group else None,
                late_submission_allowed=data.rules.lateSubmissionAllowed,
                late_penalty_percent=data.rules.latePenaltyPercent,
                grace_period_minutes=data.rules.gracePeriodMinutes,
                autosave_token=data.rules.autosaveToken,
                audience_type=data.metadata.audience_type or "all",
                target_student_ids=data.metadata.target_student_ids,
                draft_step=data.draft_step or 1,
            )

        # 3. Update Security Settings
        access_password_hash = None
        if data.rules.passwordProtected:
            if data.rules.accessPassword:
                access_password_hash = hash_password(data.rules.accessPassword)
            elif data.id:
                # Keep existing password hash for draft updates
                access_password_hash = assessment.access_password_hash

        security_fields = {
            "max_attempts": data.rules.attempts,
            "window_start": window_start,
            "window_end": window_end,
            "result_release_at": data.rules.resultReleaseAt,
            "is_password_protected": data.rules.passwordProtected,
            "access_password_hash": access_password_hash,
            "fullscreen_required": data.rules.browserRestricted,
            "is_supervised": data.rules.supervised,
            "ai_assistance_allowed": data.rules.aiAllowed,
            "is_open_book": data.rules.openBook,
            "integrity_monitoring_enabled": data.rules.integrityMonitoring if data.rules.integrityMonitoring is not None else True,
            "randomize_questions": data.rules.shuffleQuestions,
            "randomize_options": data.rules.shuffleOptions,
            "late_submission_allowed": data.rules.lateSubmissionAllowed,
            "late_penalty_percent": data.rules.latePenaltyPercent,
            "grace_period_minutes": data.rules.gracePeriodMinutes,
            "audience_type": data.metadata.audience_type or "all",
            "target_student_ids": data.metadata.target_student_ids,
        }
        await self._repo.update_fields(assessment.id, updated_by_id=current_user.id, **security_fields)

        # 3.1. Target Classes (Many-to-Many)
        async def add_or_restore_target_in_bulk(class_sec_id):
            res = await self.db.execute(
                select(AssessmentTargetSection).where(
                    AssessmentTargetSection.assessment_id == assessment.id,
                    AssessmentTargetSection.class_section_id == class_sec_id
                )
            )
            existing = res.scalars().first()
            if existing:
                existing.is_deleted = False
                existing.deleted_at = None
                existing.added_by_id = current_user.id
            else:
                target = AssessmentTargetSection(
                    assessment_id=assessment.id,
                    class_section_id=class_sec_id,
                    added_by_id=current_user.id
                )
                self.db.add(target)

        # Clear existing targets for re-publish/update
        await self.db.execute(
            update(AssessmentTargetSection)
            .where(AssessmentTargetSection.assessment_id == assessment.id)
            .values(is_deleted=True, deleted_at=datetime.now(UTC))
        )

        if teaching_workspace_id:
            res = await self.db.execute(
                select(TeachingWorkspace.class_section_id).where(TeachingWorkspace.id == teaching_workspace_id)
            )
            ws_section_id = res.scalar_one_or_none()
            if ws_section_id:
                await add_or_restore_target_in_bulk(ws_section_id)

        if data.metadata.class_group_ids:
            for cg_id in data.metadata.class_group_ids:
                # Find the ClassSection for this course and this class group via assignments
                from app.db.models.academic import TeachingAssignment
                res = await self.db.execute(
                    select(ClassSection.id)
                    .join(TeachingAssignment, TeachingAssignment.class_section_id == ClassSection.id)
                    .where(
                        TeachingAssignment.course_id == course_id,
                        ClassSection.class_group_id == cg_id,
                        ClassSection.is_deleted == False
                    )
                )
                section_id = res.scalar_one_or_none()
                if section_id:
                    # Check to avoid duplicate if it's the same as ws_section_id
                    if not teaching_workspace_id or str(section_id) != str(ws_section_id):
                        await add_or_restore_target_in_bulk(section_id)

        await self.db.flush()

        # 4. Create Sections & Questions
        section_id_map = {}
        for i, b_sec in enumerate(data.blueprint):
            sec_uuid = None
            try:
                sec_uuid = uuid.UUID(str(b_sec.id))
            except (ValueError, TypeError):
                pass

            section = await self._repo.create_section(
                id=sec_uuid,
                assessment_id=assessment.id,
                title=b_sec.section,
                order_index=i,
                allocated_marks=b_sec.marks,
                description=b_sec.topics,
                question_count_target=b_sec.questions,
                allowed_question_types={
                    "types": b_sec.allowedTypes or ["mcq"],
                    "difficulty": b_sec.difficulty or "Medium",
                    "bloom_level": b_sec.bloomLevel or "understand",
                    "per_group": getattr(b_sec, "per_group", False),
                },
                difficulty_distribution=b_sec.difficultyDistribution,
                ai_generation_prompt_hint=b_sec.aiPromptHint,
            )
            section_id_map[b_sec.id] = section.id

        # Add or update questions
        from app.db.models.question import Question as QuestionModel

        for i, q in enumerate(data.questions):
            q_type_map = {
                "mcq": DbQuestionType.MCQ,
                "truefalse": DbQuestionType.TRUE_FALSE,
                "true_false": DbQuestionType.TRUE_FALSE,
                "shortanswer": DbQuestionType.SHORT_ANSWER,
                "short_answer": DbQuestionType.SHORT_ANSWER,
                "essay": DbQuestionType.ESSAY,
                "matching": DbQuestionType.MATCHING,
                "fillblank": DbQuestionType.FILL_BLANK,
                "fill_blank": DbQuestionType.FILL_BLANK,
                "computational": DbQuestionType.COMPUTATIONAL,
                "ordering": DbQuestionType.ORDERING,
                "casestudy": DbQuestionType.CASE_STUDY,
                "case_study": DbQuestionType.CASE_STUDY,
            }
            raw_type = (q.type or "shortanswer").lower().replace("_", "")
            db_q_type = q_type_map.get(raw_type, DbQuestionType.SHORT_ANSWER)

            q_uuid = None
            existing_q = None
            is_bank_question = False

            if q.id.startswith("q-bank-"):
                stripped = q.id.replace("q-bank-", "")
                last_hyphen = stripped.rfind("-")
                bank_uuid_str = stripped[:last_hyphen] if last_hyphen != -1 else stripped
                try:
                    q_uuid = uuid.UUID(bank_uuid_str)
                    is_bank_question = True
                except (ValueError, TypeError):
                    pass
            else:
                try:
                    q_uuid = uuid.UUID(str(q.id))
                except (ValueError, TypeError):
                    pass

            if is_bank_question:
                existing_copy = None
                if assessment.id:
                    res = await self.db.execute(
                        select(QuestionModel)
                        .where(
                            QuestionModel.parent_question_id == q_uuid,
                            QuestionModel.source_assessment_id == assessment.id,
                            QuestionModel.is_deleted == False
                        )
                    )
                    existing_copy = res.scalars().first()
                if existing_copy:
                    existing_q = existing_copy
                    is_bank_question = False
                else:
                    existing_q = None
            elif q_uuid:
                existing_q = await self.db.get(QuestionModel, q_uuid)

            if existing_q and not is_bank_question:
                existing_q.content = q.text or ""
                existing_q.image_url = q.imageUrl
                existing_q.question_type = db_q_type
                existing_q.marks = q.marks or 0
                existing_q.case_study_context = q.caseStudyContext
                existing_q.computational_type = q.computationalType
                existing_q.is_deleted = False
                existing_q.deleted_at = None
                
                await self._question_repo.delete_all_options(existing_q.id)
                await self._question_repo.delete_all_blanks(existing_q.id)
                new_q = existing_q
            else:
                new_q = QuestionModel(
                    content=q.text or "",
                    image_url=q.imageUrl,
                    question_type=db_q_type,
                    marks=q.marks or 0,
                    difficulty=DifficultyLevel.MEDIUM,
                    created_by_id=current_user.id,
                    is_approved=True,
                    is_in_question_bank=False,
                    source_type=QuestionSourceType.IMPORTED if is_bank_question else QuestionSourceType.MANUAL,
                    source_assessment_id=assessment.id,
                    parent_question_id=q_uuid if is_bank_question else None,
                    grading_mode=GradingMode.MANUAL if db_q_type in [
                        DbQuestionType.SHORT_ANSWER,
                        DbQuestionType.ESSAY,
                        DbQuestionType.COMPUTATIONAL,
                        DbQuestionType.CASE_STUDY
                    ] else GradingMode.AUTO,
                    computational_type=q.computationalType
                )
                if q.caseStudyContext:
                    new_q.case_study_context = q.caseStudyContext
                self.db.add(new_q)
                await self.db.flush()

            # Handle options based on question type
            if q.options:
                if db_q_type in [DbQuestionType.MCQ, DbQuestionType.TRUE_FALSE, DbQuestionType.ORDERING]:
                    for opt in q.options:
                        await self._question_repo.add_option(
                            question_id=new_q.id,
                            content=opt.option_text or "",
                            order_index=opt.order_index or 0,
                            is_correct=opt.is_correct
                        )
                elif db_q_type == DbQuestionType.MATCHING:
                    for opt in q.options:
                        await self._question_repo.add_option(
                            question_id=new_q.id,
                            content=opt.option_text or "",
                            order_index=opt.order_index or 0,
                            match_key=opt.option_text,
                            match_value=opt.option_text_right,
                            is_correct=True
                        )
                elif db_q_type == DbQuestionType.FILL_BLANK:
                    blank_count = 0
                    for opt in q.options:
                        # 1. Create Option (Forms the student's draggable pool)
                        await self._question_repo.add_option(
                            question_id=new_q.id,
                            content=opt.option_text or "",
                            order_index=opt.order_index or 0,
                            is_correct=opt.is_correct
                        )
                        # 2. Create Blank (Target for grading logic)
                        # blank_index corresponds to the n-th [blank] in the text
                        if opt.is_correct:
                            await self._question_repo.add_blank(
                                question_id=new_q.id,
                                blank_index=blank_count,
                                accepted_answers=[opt.option_text or ""],
                                case_sensitive=False
                            )
                            blank_count += 1
                elif db_q_type in [DbQuestionType.SHORT_ANSWER, DbQuestionType.ESSAY, DbQuestionType.COMPUTATIONAL]:
                    # Store sample answer in explanation if provided
                    if q.options and len(q.options) > 0 and q.options[0].option_text:
                        new_q.explanation = q.options[0].option_text
                elif db_q_type == DbQuestionType.CASE_STUDY:
                    if q.options and len(q.options) > 0 and q.options[0].option_text:
                        new_q.explanation = q.options[0].option_text
                    for idx, opt in enumerate(q.options):
                        await self._question_repo.add_option(
                            question_id=new_q.id,
                            content=opt.option_text or "",
                            order_index=idx,
                            match_key=opt.match_key,
                            match_value=opt.option_text_right,
                            is_correct=True
                        )

            # Map Group ID safely
            target_group_id = None
            if q.groupId:
                try:
                    target_group_id = uuid.UUID(str(q.groupId))
                except (ValueError, TypeError):
                    pass

            # Resolve section ID safely
            section_id = None
            if q.sectionId:
                section_id = section_id_map.get(q.sectionId)
                if not section_id:
                    try:
                        section_id = uuid.UUID(str(q.sectionId))
                    except (ValueError, TypeError):
                        pass

            if not section_id and section_id_map:
                section_id = list(section_id_map.values())[0]

            # Look up QuestionBankEntry ID if this question is copied from bank
            bank_entry_id = None
            parent_q_id = q_uuid if is_bank_question else getattr(new_q, "parent_question_id", None)
            if parent_q_id:
                from app.db.models.question import QuestionBankEntry
                res_be = await self.db.execute(
                    select(QuestionBankEntry).where(QuestionBankEntry.question_id == parent_q_id)
                )
                bank_entry = res_be.scalars().first()
                if bank_entry:
                    bank_entry_id = bank_entry.id

            await self._repo.add_question(
                assessment_id=assessment.id,
                question_id=new_q.id,
                order_index=i,
                added_via=QuestionAddedVia.BANK_INSERT if parent_q_id else QuestionAddedVia.MANUAL_WRITE,
                assessment_section_id=section_id,
                group_id=target_group_id,
                marks_override=q.marks,
                is_required=q.is_required if q.is_required is not None else True,
                bank_entry_id=bank_entry_id,
            )

        # 5. Handle Supervisors
        async def add_or_restore_supervisor_in_bulk(supervisor_uuid, role):
            res = await self.db.execute(
                select(AssessmentSupervisor).where(
                    AssessmentSupervisor.assessment_id == assessment.id,
                    AssessmentSupervisor.supervisor_id == supervisor_uuid
                )
            )
            existing = res.scalars().first()
            if existing:
                existing.is_deleted = False
                existing.deleted_at = None
                existing.supervisor_role = role
                existing.assigned_by_id = current_user.id
            else:
                sup = AssessmentSupervisor(
                    assessment_id=assessment.id,
                    supervisor_id=supervisor_uuid,
                    supervisor_role=role,
                    assigned_by_id=current_user.id
                )
                self.db.add(sup)

        # Clear existing supervisors for updates
        await self.db.execute(
            update(AssessmentSupervisor)
            .where(AssessmentSupervisor.assessment_id == assessment.id)
            .values(is_deleted=True, deleted_at=datetime.now(UTC))
        )

        # Add creator as primary supervisor
        await add_or_restore_supervisor_in_bulk(current_user.id, SupervisorRole.PRIMARY)

        # Add extra supervisors from payload
        if data.rules.supervisor_ids:
            for s_id in data.rules.supervisor_ids:
                if str(s_id) == str(current_user.id):
                    continue
                await add_or_restore_supervisor_in_bulk(s_id, SupervisorRole.ASSISTANT)

        # 6. Save Groups from payload if provided
        if is_group and data.groups:
            from app.services.group_work_service import GroupWorkService
            from app.schemas.group_work import ManualGroupCreateRequest, ManualGroupInput, ManualGroupMemberInput
            group_svc = GroupWorkService(self.db)
            manual_request = ManualGroupCreateRequest(
                groups=[
                    ManualGroupInput(
                        name=g.name,
                        members=[
                            ManualGroupMemberInput(
                                student_id=m.student_id,
                                is_leader=m.is_leader
                            )
                            for m in g.members
                        ]
                    )
                    for g in data.groups
                ]
            )
            await group_svc.save_manual_groups(
                assessment_id=assessment.id,
                current_user=current_user,
                data=manual_request,
                validate_full_roster=is_publish
            )

        return assessment
