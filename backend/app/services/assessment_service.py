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
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from app.core.constants import AssessmentStatus, AssessmentType, UserRole
from app.core.exceptions import (AuthorizationError, ConflictError,
                                 NotFoundError, ValidationError)
from app.core.security import hash_password
from app.db.enums import AssessmentStatus as DbAssessmentStatus
from app.db.enums import AssessmentType as DbAssessmentType
from app.db.enums import GradingMode, ResultReleaseMode
from app.db.models.auth import User
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.blueprint_repo import BlueprintRepository
from app.db.repositories.question_repo import QuestionRepository
from app.schemas.assessment import (AddQuestionToAssessmentRequest,
                                    AssessmentCreateRequest,
                                    AssessmentDetailResponse,
                                    AssessmentGeneralUpdate,
                                    AssessmentListResponse,
                                    AssessmentSectionCreate,
                                    AssessmentSectionResponse,
                                    AssessmentSectionUpdate,
                                    AssessmentSecuritySettingsUpdate,
                                    AssessmentSummaryResponse,
                                    FinalizeAssessmentResponse,
                                    ReorderQuestionsRequest)
from app.services.blueprint_service import BlueprintService
from sqlalchemy.ext.asyncio import AsyncSession


class AssessmentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._repo = AssessmentRepository(db)
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
        if assessment.draft_is_complete:
            raise ConflictError(
                "This assessment is finalized and cannot be modified.",
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
        if not data.course_id:
            raise ValidationError("course_id is required to create an assessment.")

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
            course_id=data.course_id,
            subject_id=data.subject_id,
            created_by_id=created_by.id,
            grading_mode=grading_mode,
            result_release_mode=result_release_mode,
            total_marks=data.total_marks,
            instructions=data.instructions,
            passing_marks=data.passing_marks,
            duration_minutes=data.duration_minutes,
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
        if data.subject is not None:
            update_fields["subject"] = data.subject
        if data.target_class is not None:
            update_fields["target_class"] = data.target_class
        if data.total_marks is not None:
            update_fields["total_marks"] = data.total_marks
        if data.passing_marks is not None:
            update_fields["passing_marks"] = data.passing_marks
        if data.duration_minutes is not None:
            update_fields["duration_minutes"] = data.duration_minutes
        if data.show_marks_per_question is not None:
            update_fields["show_marks_per_question"] = data.show_marks_per_question
        if data.show_feedback_after_submit is not None:
            update_fields["show_feedback_after_submit"] = data.show_feedback_after_submit
        if data.is_ai_generation_enabled is not None:
            update_fields["is_ai_generation_enabled"] = data.is_ai_generation_enabled

        # Advance wizard step if moving forward
        if step > (assessment.draft_step or 0):
            update_fields["draft_step"] = step

        if update_fields:
            await self._repo.update_fields(
                assessment_id,
                updated_by_id=current_user.id,
                **update_fields
            )

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
            "randomise_questions": data.randomize_questions,
            "randomise_options": data.randomize_options,
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
            marks_allocated=data.allocated_marks or 0,
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

        errors: List[str] = []
        warnings: List[str] = []

        # Check 1: Not already finalized
        if assessment.draft_is_complete:
            return FinalizeAssessmentResponse(
                id=assessment.id,
                title=assessment.title,
                status=assessment.status,
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

        # If any errors, don't finalize
        if errors:
            return FinalizeAssessmentResponse(
                id=assessment.id,
                title=assessment.title,
                status=assessment.status,
                is_finalized=False,
                finalized_at=None,
                validation_passed=False,
                errors=errors,
                warnings=warnings,
            )

        # All checks passed — finalize
        await self._repo.publish(assessment_id, updated_by_id=current_user.id)

        # Delete draft progress (no longer needed)
        await self._repo.delete_draft_progress(assessment_id)

        return FinalizeAssessmentResponse(
            id=assessment.id,
            title=assessment.title,
            status=AssessmentStatus.SCHEDULED.value,
            is_finalized=True,
            finalized_at=datetime.now(tz=timezone.utc),
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

        return assessment

    async def list_assessments(
        self,
        current_user: User,
        status: Optional[str] = None,
        assessment_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
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
            )
        else:
            items, total = await self._repo.list_by_creator(
                created_by_id=current_user.id,
                status=db_status,
                assessment_type=db_type,
                page=page,
                page_size=page_size,
            )

        return AssessmentListResponse(
            items=[AssessmentSummaryResponse.model_validate(a) for a in items],
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
        assessment = await self._get_and_validate(assessment_id, current_user)
        if assessment.draft_is_complete and current_user.role != UserRole.ADMIN.value:
            raise ConflictError(
                "Finalized assessments cannot be deleted. Contact an admin.",
                code="CANNOT_DELETE_FINALIZED",
            )
        await self._repo.soft_delete(assessment_id, deleted_by_id=current_user.id)

    # ─── Internal Helpers ─────────────────────────────────────────────────────

    async def _get_and_validate(self, assessment_id: uuid.UUID, current_user: User):
        """Load assessment and validate edit permission + not-finalized."""
        assessment = await self._repo.get_by_id_simple(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")
        self._assert_can_edit(assessment, current_user)
        self._assert_not_finalized(assessment)
        return assessment
