"""
app/db/repositories/assessment_repo.py

Repository layer for the Assessment domain.

Covers all tables defined in app/db/models/assessment.py:
    Assessment
    AssessmentSection
    AssessmentBlueprintRule
    AssessmentDraftProgress
    AssessmentAutosave
    AssessmentPublishValidation
    AssessmentTargetSection
    AssessmentSupervisor

DESIGN RULES:
    - Every query filters is_deleted=False by default (soft-delete safety).
    - Repositories never contain business logic — only data access.
    - All methods are async; use SQLModel select() + AsyncSession.
    - selectinload() is used for relationships to prevent N+1 queries.
    - Repositories receive primitive values only — no Pydantic schemas.
    - Committed at the service layer, never here. Only flush() after add().

FIELD MAPPING (model -> repo):
    Assessment:
        title, assessment_type, status, course_id, subject_id,
        reassessment_of_id, created_by_id, updated_by_id,
        instructions, total_marks, passing_marks,
        duration_minutes, window_start, window_end, max_attempts,
        grading_mode, result_release_mode, result_release_at,
        is_password_protected, access_password_hash,
        ai_assistance_allowed, is_open_book, fullscreen_required,
        integrity_monitoring_enabled, randomize_questions,
        randomize_options, is_group_assessment,
        late_submission_allowed, late_penalty_percent, grace_period_minutes,
        draft_step, draft_is_complete, autosave_token,
        publish_validated_at, published_at,
        is_deleted, deleted_at

    AssessmentSection:
        assessment_id, title, instructions, order_index, marks_allocated,
        question_count_target, allowed_question_types (JSONB),
        difficulty_distribution (JSONB), ai_generation_prompt_hint,
        is_deleted, deleted_at

    AssessmentBlueprintRule:
        assessment_id, assessment_section_id, rule_type,
        question_type, difficulty, numeric_value, is_enforced,
        is_deleted, deleted_at

    AssessmentDraftProgress:
        assessment_id, step_1..6_complete, last_active_step,
        step_1..6_validated_at, is_deleted, deleted_at

    AssessmentAutosave:
        assessment_id, lecturer_id, step_number, snapshot (JSONB),
        client_version, saved_at, expires_at, is_deleted, deleted_at

    AssessmentPublishValidation:
        assessment_id, checked_by_id, checked_at, overall_passed,
        validation_results (JSONB), is_deleted, deleted_at

    AssessmentTargetSection:
        assessment_id, class_section_id, added_by_id, is_deleted, deleted_at

    AssessmentSupervisor:
        assessment_id, supervisor_id, supervisor_role,
        assigned_at, assigned_by_id, is_deleted, deleted_at
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import col, select

from app.db.enums import (
    AssessmentStatus,
    AssessmentType,
    GradingMode,
    ResultReleaseMode,
)
from app.db.models.assessment import (
    Assessment,
    AssessmentAutosave,
    AssessmentBlueprintRule,
    AssessmentDraftProgress,
    AssessmentPublishValidation,
    AssessmentSection,
    AssessmentSupervisor,
    AssessmentTargetSection,
)
from app.db.models.question import AssessmentQuestion

# ---------------------------------------------------------------------------
# INTERNAL HELPERS
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# ASSESSMENT REPOSITORY
# ---------------------------------------------------------------------------


class AssessmentRepository:
    """
    Data access for the Assessment aggregate.

    Instantiated per-request — pass the AsyncSession from the FastAPI
    dependency injection system.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # Assessment — create
    # -----------------------------------------------------------------------

    async def create(
        self,
        *,
        title: str,
        assessment_type: AssessmentType,
        course_id: uuid.UUID,
        created_by_id: uuid.UUID,
        grading_mode: GradingMode,
        result_release_mode: ResultReleaseMode,
        total_marks: int,
        subject_id: uuid.UUID | None = None,
        description: str | None = None,
        reassessment_of_id: uuid.UUID | None = None,
        instructions: str | None = None,
        passing_marks: int | None = None,
        duration_minutes: int | None = None,
    ) -> Assessment:
        """
        Create a new Assessment row.

        Sets:
            status           -> DRAFT
            draft_step       -> 1
            draft_is_complete -> False
        """
        assessment = Assessment(
            title=title,
            description=description,
            assessment_type=assessment_type,
            course_id=course_id,
            subject_id=subject_id,
            reassessment_of_id=reassessment_of_id,
            created_by_id=created_by_id,
            updated_by_id=created_by_id,
            grading_mode=grading_mode,
            result_release_mode=result_release_mode,
            total_marks=total_marks,
            status=AssessmentStatus.DRAFT,
            instructions=instructions,
            passing_marks=passing_marks,
            duration_minutes=duration_minutes,
            draft_step=1,
            draft_is_complete=False,
        )
        self.db.add(assessment)
        await self.db.flush()
        return assessment

    # -----------------------------------------------------------------------
    # Assessment — reads
    # -----------------------------------------------------------------------

    async def get_by_id(self, assessment_id: uuid.UUID) -> Assessment | None:
        """
        Load an Assessment with all first-level relationships.

        Eagerly loads:
            sections, blueprint_rules, draft_progress,
            assessment_questions (with nested question), supervisors,
            target_sections, publish_validations

        Excludes soft-deleted records.
        """
        result = await self.db.execute(
            select(Assessment)
            .options(
                selectinload("sections"),
                selectinload("blueprint_rules"),
                selectinload("draft_progress"),
                selectinload("supervisors"),
                selectinload("target_sections"),
                selectinload("publish_validations"),
                selectinload("assessment_questions").selectinload(
                    "question"
                ),
            )
            .where(
                col(Assessment.id) == assessment_id,
                col(Assessment.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id_simple(
        self, assessment_id: uuid.UUID
    ) -> Assessment | None:
        """
        Lightweight load — no relationships.

        Use for existence checks, permission checks, and field updates
        where relationship data is not needed.
        """
        result = await self.db.execute(
            select(Assessment).where(
                col(Assessment.id) == assessment_id,
                col(Assessment.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_by_creator(
        self,
        *,
        created_by_id: uuid.UUID,
        status: AssessmentStatus | None = None,
        assessment_type: AssessmentType | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Assessment], int]:
        """
        Paginated list of assessments owned by a given user.
        Returns (items, total_count).
        """
        filters = [
            col(Assessment.created_by_id) == created_by_id,
            col(Assessment.is_deleted) == False,  # noqa: E712
        ]
        if status:
            filters.append(col(Assessment.status) == status)
        if assessment_type:
            filters.append(col(Assessment.assessment_type) == assessment_type)

        count_result = await self.db.execute(
            select(func.count(col(Assessment.id))).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(Assessment)
            .where(*filters)
            .order_by(col(Assessment.created_at).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def list_all(
        self,
        *,
        status: AssessmentStatus | None = None,
        assessment_type: AssessmentType | None = None,
        course_id: uuid.UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Assessment], int]:
        """
        Paginated list of all assessments (admin use).
        Returns (items, total_count).
        """
        filters = [col(Assessment.is_deleted) == False]  # noqa: E712
        if status:
            filters.append(col(Assessment.status) == status)
        if assessment_type:
            filters.append(col(Assessment.assessment_type) == assessment_type)
        if course_id:
            filters.append(col(Assessment.course_id) == course_id)

        count_result = await self.db.execute(
            select(func.count(col(Assessment.id))).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(Assessment)
            .where(*filters)
            .order_by(col(Assessment.created_at).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    # -----------------------------------------------------------------------
    # Assessment — updates
    # -----------------------------------------------------------------------

    async def update_fields(
        self, assessment_id: uuid.UUID, updated_by_id: uuid.UUID, **fields
    ) -> None:
        """
        Update arbitrary scalar fields on an Assessment row.

        Always stamps updated_by_id so the audit trail stays accurate.
        Never pass relationship objects here — scalars and UUIDs only.
        """
        fields["updated_by_id"] = updated_by_id
        await self.db.execute(
            update(Assessment)
            .where(col(Assessment.id) == assessment_id)
            .values(**fields)
        )

    async def mark_draft_complete(
        self, assessment_id: uuid.UUID, updated_by_id: uuid.UUID
    ) -> None:
        """
        Set draft_is_complete=True and draft_step=NULL when wizard is finished.
        Called by the service layer immediately before publish validation.
        """
        await self.db.execute(
            update(Assessment)
            .where(col(Assessment.id) == assessment_id)
            .values(
                draft_is_complete=True,
                draft_step=None,
                updated_by_id=updated_by_id,
            )
        )

    async def publish(
        self,
        assessment_id: uuid.UUID,
        updated_by_id: uuid.UUID,
        published_at: datetime | None = None,
    ) -> None:
        """
        Set status=SCHEDULED and published_at on a finalized assessment.

        draft_step is set to NULL — the wizard is no longer relevant once
        the assessment is published.
        """
        now = published_at or _utcnow()
        await self.db.execute(
            update(Assessment)
            .where(col(Assessment.id) == assessment_id)
            .values(
                status=AssessmentStatus.SCHEDULED,
                draft_is_complete=True,
                draft_step=None,
                published_at=now,
                updated_by_id=updated_by_id,
            )
        )

    async def soft_delete(
        self, assessment_id: uuid.UUID, deleted_by_id: uuid.UUID
    ) -> None:
        """Soft-delete an assessment. Sets is_deleted=True, deleted_at=now."""
        now = _utcnow()
        await self.db.execute(
            update(Assessment)
            .where(col(Assessment.id) == assessment_id)
            .values(
                is_deleted=True,
                deleted_at=now,
                updated_by_id=deleted_by_id,
            )
        )

    # -----------------------------------------------------------------------
    # AssessmentSection — CRUD
    # -----------------------------------------------------------------------

    async def create_section(
        self,
        *,
        assessment_id: uuid.UUID,
        title: str,
        order_index: int,
        description: str | None = None,
        instructions: str | None = None,
        marks_allocated: int = 0,
        question_count_target: int | None = None,
        allowed_question_types: dict | None = None,
        difficulty_distribution: dict | None = None,
        ai_generation_prompt_hint: str | None = None,
    ) -> AssessmentSection:
        section = AssessmentSection(
            assessment_id=assessment_id,
            title=title,
            description=description,
            order_index=order_index,
            instructions=instructions,
            marks_allocated=marks_allocated,
            question_count_target=question_count_target,
            allowed_question_types=allowed_question_types,
            difficulty_distribution=difficulty_distribution,
            ai_generation_prompt_hint=ai_generation_prompt_hint,
        )
        self.db.add(section)
        await self.db.flush()
        return section

    async def get_section(
        self, section_id: uuid.UUID
    ) -> AssessmentSection | None:
        result = await self.db.execute(
            select(AssessmentSection).where(
                col(AssessmentSection.id) == section_id,
                col(AssessmentSection.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_sections(
        self, assessment_id: uuid.UUID
    ) -> list[AssessmentSection]:
        """
        Return all active sections for an assessment, ordered by order_index.
        """
        result = await self.db.execute(
            select(AssessmentSection)
            .where(
                col(AssessmentSection.assessment_id) == assessment_id,
                col(AssessmentSection.is_deleted) == False,  # noqa: E712
            )
            .order_by(col(AssessmentSection.order_index))
        )
        return list(result.scalars().all())

    async def count_sections(self, assessment_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(col(AssessmentSection.id))).where(
                col(AssessmentSection.assessment_id) == assessment_id,
                col(AssessmentSection.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one()

    async def update_section(
        self, section_id: uuid.UUID, **fields
    ) -> None:
        """Update scalar fields on an AssessmentSection."""
        await self.db.execute(
            update(AssessmentSection)
            .where(col(AssessmentSection.id) == section_id)
            .values(**fields)
        )

    async def soft_delete_section(self, section_id: uuid.UUID) -> None:
        now = _utcnow()
        await self.db.execute(
            update(AssessmentSection)
            .where(col(AssessmentSection.id) == section_id)
            .values(is_deleted=True, deleted_at=now)
        )

    async def section_order_exists(
        self, assessment_id: uuid.UUID, order_index: int, exclude_id: uuid.UUID | None = None
    ) -> bool:
        """
        Check whether a given order_index is already taken within an assessment.
        Used before insert/update to enforce the unique constraint gracefully.
        """
        q = select(col(AssessmentSection.id)).where(
            col(AssessmentSection.assessment_id) == assessment_id,
            col(AssessmentSection.order_index) == order_index,
            col(AssessmentSection.is_deleted) == False,  # noqa: E712
        )
        if exclude_id:
            q = q.where(col(AssessmentSection.id) != exclude_id)
        result = await self.db.execute(q)
        return result.scalar_one_or_none() is not None

    # -----------------------------------------------------------------------
    # AssessmentQuestion (junction) — CRUD
    # -----------------------------------------------------------------------

    async def add_question(
        self,
        *,
        assessment_id: uuid.UUID,
        question_id: uuid.UUID,
        order_index: int,
        added_via: str,
        assessment_section_id: uuid.UUID | None = None,
        marks_override: int | None = None,
        is_required: bool = True,
        ai_review_id: uuid.UUID | None = None,
        bank_entry_id: uuid.UUID | None = None,
    ) -> AssessmentQuestion:
        """
        Link a question to an assessment.

        marks_override:
            If None, the assessment uses question.marks at grading time.
            If set, this value overrides question.marks for this assessment.

        added_via:
            Must match QuestionAddedVia enum values:
                manual_write | bank_insert |
                ai_generated_accepted | ai_generated_modified

        ai_review_id / bank_entry_id:
            Set the provenance FK when the question came from those sources.
        """
        aq = AssessmentQuestion(
            assessment_id=assessment_id,
            question_id=question_id,
            assessment_section_id=assessment_section_id,
            order_index=order_index,
            marks_override=marks_override,
            is_required=is_required,
            added_via=added_via,
            ai_review_id=ai_review_id,
            bank_entry_id=bank_entry_id,
        )
        self.db.add(aq)
        await self.db.flush()
        return aq

    async def get_assessment_question(
        self, assessment_id: uuid.UUID, question_id: uuid.UUID
    ) -> AssessmentQuestion | None:
        """Load the junction row for a specific (assessment, question) pair."""
        result = await self.db.execute(
            select(AssessmentQuestion).where(
                col(AssessmentQuestion.assessment_id) == assessment_id,
                col(AssessmentQuestion.question_id) == question_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_assessment_question_by_id(
        self, aq_id: uuid.UUID
    ) -> AssessmentQuestion | None:
        result = await self.db.execute(
            select(AssessmentQuestion).where(col(AssessmentQuestion.id) == aq_id)
        )
        return result.scalar_one_or_none()

    async def question_in_assessment(
        self, assessment_id: uuid.UUID, question_id: uuid.UUID
    ) -> bool:
        """Return True if the question is already linked to this assessment."""
        result = await self.db.execute(
            select(col(AssessmentQuestion.id)).where(
                col(AssessmentQuestion.assessment_id) == assessment_id,
                col(AssessmentQuestion.question_id) == question_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def list_assessment_questions(
        self, assessment_id: uuid.UUID
    ) -> list[AssessmentQuestion]:
        """
        Return all AssessmentQuestion rows for an assessment,
        ordered by order_index. Each row has question selectin-loaded.
        """
        result = await self.db.execute(
            select(AssessmentQuestion)
            .options(
                selectinload("question"),
                selectinload("assessment_section"),
            )
            .where(col(AssessmentQuestion.assessment_id) == assessment_id)
            .order_by(col(AssessmentQuestion.order_index))
        )
        return list(result.scalars().all())

    async def count_questions(self, assessment_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(col(AssessmentQuestion.id))).where(
                col(AssessmentQuestion.assessment_id) == assessment_id
            )
        )
        return result.scalar_one()

    async def sum_marks(self, assessment_id: uuid.UUID) -> int:
        """
        Return the total effective marks for all questions in the assessment.

        Effective marks = marks_override if set, else question.marks.
        This query uses COALESCE to handle that logic at the DB level.
        """
        from sqlalchemy import case

        from app.db.models.question import Question

        result = await self.db.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (
                                col(AssessmentQuestion.marks_override).isnot(None),
                                col(AssessmentQuestion.marks_override),
                            ),
                            else_=col(Question.marks),
                        )
                    ),
                    0,
                )
            )
            .join(Question, col(Question.id) == col(AssessmentQuestion.question_id))
            .where(col(AssessmentQuestion.assessment_id) == assessment_id)
        )
        return result.scalar_one()

    async def update_question_order(
        self, aq_id: uuid.UUID, order_index: int
    ) -> None:
        """Update the order_index of a single AssessmentQuestion row."""
        await self.db.execute(
            update(AssessmentQuestion)
            .where(col(AssessmentQuestion.id) == aq_id)
            .values(order_index=order_index)
        )

    async def update_assessment_question(
        self, aq_id: uuid.UUID, **fields
    ) -> None:
        """Update arbitrary fields on an AssessmentQuestion row."""
        await self.db.execute(
            update(AssessmentQuestion)
            .where(col(AssessmentQuestion.id) == aq_id)
            .values(**fields)
        )

    async def remove_question(
        self, assessment_id: uuid.UUID, question_id: uuid.UUID
    ) -> None:
        """Hard-delete the AssessmentQuestion junction row."""
        await self.db.execute(
            delete(AssessmentQuestion).where(
                col(AssessmentQuestion.assessment_id) == assessment_id,
                col(AssessmentQuestion.question_id) == question_id,
            )
        )

    async def remove_all_questions_from_section(
        self, assessment_section_id: uuid.UUID
    ) -> None:
        """
        Nullify assessment_section_id for all questions in a section.

        Called before soft-deleting a section so questions remain on the
        assessment (unassigned from the deleted section).
        """
        await self.db.execute(
            update(AssessmentQuestion)
            .where(
                col(AssessmentQuestion.assessment_section_id) == assessment_section_id
            )
            .values(assessment_section_id=None)
        )

    # -----------------------------------------------------------------------
    # AssessmentBlueprintRule — CRUD
    # -----------------------------------------------------------------------

    async def create_blueprint_rule(
        self,
        *,
        assessment_id: uuid.UUID,
        rule_type: str,
        is_enforced: bool = True,
        assessment_section_id: uuid.UUID | None = None,
        question_type: str | None = None,
        difficulty: str | None = None,
        numeric_value: float | None = None,
    ) -> AssessmentBlueprintRule:
        rule = AssessmentBlueprintRule(
            assessment_id=assessment_id,
            assessment_section_id=assessment_section_id,
            rule_type=rule_type,
            question_type=question_type,
            difficulty=difficulty,
            numeric_value=numeric_value,
            is_enforced=is_enforced,
        )
        self.db.add(rule)
        await self.db.flush()
        return rule

    async def get_blueprint_rule(
        self, rule_id: uuid.UUID
    ) -> AssessmentBlueprintRule | None:
        result = await self.db.execute(
            select(AssessmentBlueprintRule).where(
                col(AssessmentBlueprintRule.id) == rule_id,
                col(AssessmentBlueprintRule.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_blueprint_rules(
        self,
        assessment_id: uuid.UUID,
        assessment_section_id: uuid.UUID | None = None,
    ) -> list[AssessmentBlueprintRule]:
        """
        List all active blueprint rules for an assessment.
        Optionally filter to a specific section (None = assessment-level rules only).
        """
        filters = [
            col(AssessmentBlueprintRule.assessment_id) == assessment_id,
            col(AssessmentBlueprintRule.is_deleted) == False,  # noqa: E712
        ]
        if assessment_section_id is not None:
            filters.append(
                col(AssessmentBlueprintRule.assessment_section_id) == assessment_section_id
            )
        result = await self.db.execute(
            select(AssessmentBlueprintRule).where(*filters)
        )
        return list(result.scalars().all())

    async def delete_all_blueprint_rules(
        self, assessment_id: uuid.UUID
    ) -> int:
        """
        Hard-delete all blueprint rules for an assessment.
        Returns the number of rows deleted.
        Used by set_blueprint() to replace the rule set atomically.
        """
        result = await self.db.execute(
            delete(AssessmentBlueprintRule).where(
                col(AssessmentBlueprintRule.assessment_id) == assessment_id
            )
        )
        return result.rowcount

    async def delete_blueprint_rule(self, rule_id: uuid.UUID) -> None:
        await self.db.execute(
            delete(AssessmentBlueprintRule).where(
                col(AssessmentBlueprintRule.id) == rule_id
            )
        )

    async def update_blueprint_rule(
        self, rule_id: uuid.UUID, **fields
    ) -> None:
        await self.db.execute(
            update(AssessmentBlueprintRule)
            .where(col(AssessmentBlueprintRule.id) == rule_id)
            .values(**fields)
        )

    # -----------------------------------------------------------------------
    # AssessmentDraftProgress — upsert / delete
    # -----------------------------------------------------------------------

    async def upsert_draft_progress(
        self,
        *,
        assessment_id: uuid.UUID,
        last_active_step: int,
        step_1_complete: bool | None = None,
        step_2_complete: bool | None = None,
        step_3_complete: bool | None = None,
        step_4_complete: bool | None = None,
        step_5_complete: bool | None = None,
        step_6_complete: bool | None = None,
        step_1_validated_at: datetime | None = None,
        step_2_validated_at: datetime | None = None,
        step_3_validated_at: datetime | None = None,
        step_4_validated_at: datetime | None = None,
        step_5_validated_at: datetime | None = None,
        step_6_validated_at: datetime | None = None,
    ) -> AssessmentDraftProgress:
        """
        Create or update the draft progress record for an assessment.

        Only provided (non-None) step_N_complete and step_N_validated_at
        values are applied — unprovided steps are left unchanged on update.
        """
        result = await self.db.execute(
            select(AssessmentDraftProgress).where(
                col(AssessmentDraftProgress.assessment_id) == assessment_id,
                col(AssessmentDraftProgress.is_deleted) == False,  # noqa: E712
            )
        )
        existing = result.scalar_one_or_none()

        step_fields: dict = {"last_active_step": last_active_step}
        if step_1_complete is not None:
            step_fields["step_1_complete"] = step_1_complete
        if step_2_complete is not None:
            step_fields["step_2_complete"] = step_2_complete
        if step_3_complete is not None:
            step_fields["step_3_complete"] = step_3_complete
        if step_4_complete is not None:
            step_fields["step_4_complete"] = step_4_complete
        if step_5_complete is not None:
            step_fields["step_5_complete"] = step_5_complete
        if step_6_complete is not None:
            step_fields["step_6_complete"] = step_6_complete
        if step_1_validated_at is not None:
            step_fields["step_1_validated_at"] = step_1_validated_at
        if step_2_validated_at is not None:
            step_fields["step_2_validated_at"] = step_2_validated_at
        if step_3_validated_at is not None:
            step_fields["step_3_validated_at"] = step_3_validated_at
        if step_4_validated_at is not None:
            step_fields["step_4_validated_at"] = step_4_validated_at
        if step_5_validated_at is not None:
            step_fields["step_5_validated_at"] = step_5_validated_at
        if step_6_validated_at is not None:
            step_fields["step_6_validated_at"] = step_6_validated_at

        if existing:
            for k, v in step_fields.items():
                setattr(existing, k, v)
            await self.db.flush()
            return existing

        progress = AssessmentDraftProgress(
            assessment_id=assessment_id,
            **step_fields,
        )
        self.db.add(progress)
        await self.db.flush()
        return progress

    async def get_draft_progress(
        self, assessment_id: uuid.UUID
    ) -> AssessmentDraftProgress | None:
        result = await self.db.execute(
            select(AssessmentDraftProgress).where(
                col(AssessmentDraftProgress.assessment_id) == assessment_id,
                col(AssessmentDraftProgress.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def delete_draft_progress(self, assessment_id: uuid.UUID) -> None:
        """
        Hard-delete draft progress once the assessment is published.
        Wizard state is no longer relevant after publication.
        """
        await self.db.execute(
            delete(AssessmentDraftProgress).where(
                col(AssessmentDraftProgress.assessment_id) == assessment_id
            )
        )

    # -----------------------------------------------------------------------
    # AssessmentAutosave — create / get / delete
    # -----------------------------------------------------------------------

    async def upsert_autosave(
        self,
        *,
        assessment_id: uuid.UUID,
        lecturer_id: uuid.UUID,
        step_number: int,
        snapshot: dict,
        client_version: int,
        expires_at: datetime,
    ) -> AssessmentAutosave:
        """
        Create or replace an autosave snapshot for a (assessment, lecturer, step).

        Enforces client_version ordering — a lower version NEVER overwrites
        a higher one (stale network response protection).
        """
        result = await self.db.execute(
            select(AssessmentAutosave).where(
                col(AssessmentAutosave.assessment_id) == assessment_id,
                col(AssessmentAutosave.lecturer_id) == lecturer_id,
                col(AssessmentAutosave.step_number) == step_number,
                col(AssessmentAutosave.is_deleted) == False,  # noqa: E712
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            if client_version <= existing.client_version:
                # Stale — do not overwrite
                return existing
            existing.snapshot = snapshot
            existing.client_version = client_version
            existing.saved_at = _utcnow()
            existing.expires_at = expires_at
            await self.db.flush()
            return existing

        autosave = AssessmentAutosave(
            assessment_id=assessment_id,
            lecturer_id=lecturer_id,
            step_number=step_number,
            snapshot=snapshot,
            client_version=client_version,
            saved_at=_utcnow(),
            expires_at=expires_at,
        )
        self.db.add(autosave)
        await self.db.flush()
        return autosave

    async def get_autosave(
        self,
        assessment_id: uuid.UUID,
        lecturer_id: uuid.UUID,
        step_number: int,
    ) -> AssessmentAutosave | None:
        result = await self.db.execute(
            select(AssessmentAutosave).where(
                col(AssessmentAutosave.assessment_id) == assessment_id,
                col(AssessmentAutosave.lecturer_id) == lecturer_id,
                col(AssessmentAutosave.step_number) == step_number,
                col(AssessmentAutosave.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def delete_autosaves_for_assessment(
        self, assessment_id: uuid.UUID
    ) -> None:
        """Hard-delete all autosave snapshots when the assessment is published."""
        await self.db.execute(
            delete(AssessmentAutosave).where(
                col(AssessmentAutosave.assessment_id) == assessment_id
            )
        )

    async def delete_expired_autosaves(self) -> int:
        """
        Hard-delete all autosave rows where expires_at < now.
        Called by a periodic Celery task. Returns rows deleted.
        """
        now = _utcnow()
        result = await self.db.execute(
            delete(AssessmentAutosave).where(col(AssessmentAutosave.expires_at) < now)
        )
        return result.rowcount

    # -----------------------------------------------------------------------
    # AssessmentPublishValidation — create / read
    # -----------------------------------------------------------------------

    async def create_publish_validation(
        self,
        *,
        assessment_id: uuid.UUID,
        checked_by_id: uuid.UUID | None,
        overall_passed: bool,
        validation_results: list,
    ) -> AssessmentPublishValidation:
        """
        Insert a new publish validation result row.

        This is append-only — each validation run creates a new row.
        The service layer reads the most recent row with overall_passed=True
        to determine publishability.
        """
        validation = AssessmentPublishValidation(
            assessment_id=assessment_id,
            checked_by_id=checked_by_id,
            checked_at=_utcnow(),
            overall_passed=overall_passed,
            validation_results=validation_results,
        )
        self.db.add(validation)
        await self.db.flush()
        return validation

    async def get_latest_passing_validation(
        self, assessment_id: uuid.UUID
    ) -> AssessmentPublishValidation | None:
        """
        Return the most recent validation row where overall_passed=True.
        Returns None if no passing validation exists.
        """
        result = await self.db.execute(
            select(AssessmentPublishValidation)
            .where(
                col(AssessmentPublishValidation.assessment_id) == assessment_id,
                col(AssessmentPublishValidation.overall_passed) == True,  # noqa: E712
                col(AssessmentPublishValidation.is_deleted) == False,  # noqa: E712
            )
            .order_by(col(AssessmentPublishValidation.checked_at).desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_validations(
        self, assessment_id: uuid.UUID
    ) -> list[AssessmentPublishValidation]:
        """Return all validation runs for an assessment, newest first."""
        result = await self.db.execute(
            select(AssessmentPublishValidation)
            .where(
                col(AssessmentPublishValidation.assessment_id) == assessment_id,
                col(AssessmentPublishValidation.is_deleted) == False,  # noqa: E712
            )
            .order_by(col(AssessmentPublishValidation.checked_at).desc())
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # AssessmentTargetSection — CRUD
    # -----------------------------------------------------------------------

    async def add_target_section(
        self,
        *,
        assessment_id: uuid.UUID,
        class_section_id: uuid.UUID,
        added_by_id: uuid.UUID | None = None,
    ) -> AssessmentTargetSection:
        target = AssessmentTargetSection(
            assessment_id=assessment_id,
            class_section_id=class_section_id,
            added_by_id=added_by_id,
        )
        self.db.add(target)
        await self.db.flush()
        return target

    async def remove_target_section(
        self, assessment_id: uuid.UUID, class_section_id: uuid.UUID
    ) -> None:
        await self.db.execute(
            delete(AssessmentTargetSection).where(
                col(AssessmentTargetSection.assessment_id) == assessment_id,
                col(AssessmentTargetSection.class_section_id) == class_section_id,
            )
        )

    async def list_target_sections(
        self, assessment_id: uuid.UUID
    ) -> list[AssessmentTargetSection]:
        result = await self.db.execute(
            select(AssessmentTargetSection).where(
                col(AssessmentTargetSection.assessment_id) == assessment_id,
                col(AssessmentTargetSection.is_deleted) == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def target_section_exists(
        self, assessment_id: uuid.UUID, class_section_id: uuid.UUID
    ) -> bool:
        result = await self.db.execute(
            select(col(AssessmentTargetSection.id)).where(
                col(AssessmentTargetSection.assessment_id) == assessment_id,
                col(AssessmentTargetSection.class_section_id) == class_section_id,
                col(AssessmentTargetSection.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none() is not None

    # -----------------------------------------------------------------------
    # AssessmentSupervisor — CRUD
    # -----------------------------------------------------------------------

    async def add_supervisor(
        self,
        *,
        assessment_id: uuid.UUID,
        supervisor_id: uuid.UUID,
        supervisor_role: str,
        assigned_by_id: uuid.UUID | None = None,
    ) -> AssessmentSupervisor:
        supervisor = AssessmentSupervisor(
            assessment_id=assessment_id,
            supervisor_id=supervisor_id,
            supervisor_role=supervisor_role,
            assigned_at=_utcnow(),
            assigned_by_id=assigned_by_id,
        )
        self.db.add(supervisor)
        await self.db.flush()
        return supervisor

    async def get_supervisor(
        self, assessment_id: uuid.UUID, supervisor_id: uuid.UUID
    ) -> AssessmentSupervisor | None:
        result = await self.db.execute(
            select(AssessmentSupervisor).where(
                col(AssessmentSupervisor.assessment_id) == assessment_id,
                col(AssessmentSupervisor.supervisor_id) == supervisor_id,
                col(AssessmentSupervisor.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def remove_supervisor(
        self, assessment_id: uuid.UUID, supervisor_id: uuid.UUID
    ) -> None:
        await self.db.execute(
            delete(AssessmentSupervisor).where(
                col(AssessmentSupervisor.assessment_id) == assessment_id,
                col(AssessmentSupervisor.supervisor_id) == supervisor_id,
            )
        )

    async def list_supervisors(
        self, assessment_id: uuid.UUID
    ) -> list[AssessmentSupervisor]:
        result = await self.db.execute(
            select(AssessmentSupervisor).where(
                col(AssessmentSupervisor.assessment_id) == assessment_id,
                col(AssessmentSupervisor.is_deleted) == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def is_supervisor(
        self, assessment_id: uuid.UUID, user_id: uuid.UUID
    ) -> bool:
        result = await self.db.execute(
            select(col(AssessmentSupervisor.id)).where(
                col(AssessmentSupervisor.assessment_id) == assessment_id,
                col(AssessmentSupervisor.supervisor_id) == user_id,
                col(AssessmentSupervisor.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none() is not None
