"""
app/services/question_service.py

Question Bank service — business logic for the Question domain.

Responsibilities:
    - create_question()       — Create with options and tags
    - version_question()      — Archive old + create new version
    - search_questions()      — Filtered + paginated search
    - get_question()          — Load full question with options/tags
    - attach_tags()           — Add tags to a question
    - detach_tags()           — Remove tags from a question
    - soft_delete_question()  — Soft-delete (preserve audit trail)
    - infer_grading_mode()    — Determine grading mode from question type

VERSIONING RULE:
    When update is called with create_new_version=True (default):
        1. Archive the existing question (is_active=False)
        2. Create a new Question with parent_question_id = old question's id
        3. Increment version_number
    When create_new_version=False:
        - Update the existing row in place (no version history)
        - Use carefully — only for minor corrections (typos, etc.)
"""

import uuid
from typing import List, Optional, Tuple

from app.core.constants import GradingMode, QuestionType
from app.core.exceptions import (AuthorizationError, ConflictError,
                                 NotFoundError)
from app.db.models.auth import User
from app.db.models.question import Question
from app.db.repositories.question_repo import QuestionRepository
from app.schemas.question import (QuestionCreateRequest,
                                  QuestionDetailResponse, QuestionListResponse,
                                  QuestionOptionResponse, QuestionSearchParams,
                                  QuestionSummaryResponse, QuestionTagResponse,
                                  QuestionUpdateRequest)
from sqlalchemy.ext.asyncio import AsyncSession

# ─── Grading Mode Inference ───────────────────────────────────────────────────


def infer_grading_mode(question_type: str, override: Optional[str] = None) -> str:
    """
    Determine the appropriate grading mode for a question type.

    If the lecturer provides an explicit override, validate and use it.
    Otherwise, infer from the question type.
    """
    if override:
        return override

    type_to_mode = {
        QuestionType.MCQ.value: GradingMode.AUTO.value,
        QuestionType.TRUE_FALSE.value: GradingMode.AUTO.value,
        QuestionType.MATCHING.value: GradingMode.AUTO.value,
        QuestionType.ORDERING.value: GradingMode.AUTO.value,
        QuestionType.FILL_BLANK.value: GradingMode.AUTO.value,
        QuestionType.SHORT_ANSWER.value: GradingMode.SEMI_AUTO.value,
        QuestionType.COMPUTATIONAL.value: GradingMode.SEMI_AUTO.value,
        QuestionType.ESSAY.value: GradingMode.AI_ASSISTED.value,
        QuestionType.CASE_STUDY.value: GradingMode.AI_ASSISTED.value,
    }
    return type_to_mode.get(question_type, GradingMode.MANUAL.value)


class QuestionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._repo = QuestionRepository(db)

    # ─── Create ───────────────────────────────────────────────────────────────

    async def create_question(
        self,
        data: QuestionCreateRequest,
        created_by: User,
    ) -> Question:
        """
        Create a new question in the question bank.

        FLOW:
            1. Infer grading mode from question type
            2. Validate MCQ has at least one correct option
            3. Create Question row
            4. Create QuestionOption rows (if provided)
            5. Create/attach tags
            6. Return full question with options and tags

        Raises:
            ConflictError: If MCQ has no correct option.
        """
        grading_mode = infer_grading_mode(data.question_type, data.grading_mode)

        # Validate options for auto-gradable types
        if data.question_type in {
            QuestionType.MCQ.value,
            QuestionType.TRUE_FALSE.value,
        }:
            if not data.options:
                raise ConflictError(
                    f"{data.question_type.upper()} questions must have at least 2 options.",
                    code="MISSING_OPTIONS",
                )
            correct_count = sum(1 for opt in data.options if opt.is_correct)
            if correct_count < 1:
                raise ConflictError(
                    "At least one option must be marked as correct.",
                    code="NO_CORRECT_OPTION",
                )
            if data.question_type == QuestionType.TRUE_FALSE.value and len(data.options) != 2:
                raise ConflictError(
                    "True/False questions must have exactly 2 options.",
                    code="INVALID_OPTION_COUNT",
                )

        question = await self._repo.create(
            content=data.content,
            question_type=data.question_type,
            difficulty=data.difficulty,
            grading_mode=grading_mode,
            created_by_id=created_by.id,
            source_type="manual",
            explanation=data.explanation,
            hint=data.hint,
            subject=data.subject,
            topic=data.topic,
            bloom_level=data.bloom_level,
            suggested_marks=data.suggested_marks,
            estimated_time_minutes=data.estimated_time_minutes,
            fill_blank_template=data.fill_blank_template,
            correct_order_json=data.correct_order_json,
        )

        # Create options
        for opt in data.options:
            await self._repo.add_option(
                question_id=question.id,
                option_text=opt.option_text,
                is_correct=opt.is_correct,
                order_index=opt.order_index,
                option_text_right=opt.option_text_right,
                explanation=opt.explanation,
            )

        # Attach tags
        if data.tag_names:
            await self._attach_tag_names(question.id, data.tag_names)

        return question

    # ─── Version ──────────────────────────────────────────────────────────────

    async def version_question(
        self,
        question_id: uuid.UUID,
        data: QuestionUpdateRequest,
        updated_by: User,
    ) -> Question:
        """
        Update a question by creating a new version (default) or in-place.

        VERSIONING FLOW (create_new_version=True):
            1. Load existing question (must be owned by caller or caller is admin)
            2. Archive existing question (is_active=False, status=archived)
            3. Create new Question row with:
                - parent_question_id = old question's id
                - version_number = old.version_number + 1
                - All updated fields applied
            4. Recreate options on new question (if options provided)
            5. Copy/update tags on new question

        IN-PLACE FLOW (create_new_version=False):
            - Update the existing row directly
            - Options are replaced if provided

        Raises:
            NotFoundError: If question not found.
            AuthorizationError: If caller doesn't own the question (and is not admin).
        """
        from app.core.constants import UserRole

        existing = await self._repo.get_by_id(question_id)
        if not existing or not existing.is_active:
            raise NotFoundError("Question not found or no longer active.")

        # Ownership check
        if (
            str(existing.created_by_id) != str(updated_by.id)
            and updated_by.role != UserRole.ADMIN.value
        ):
            raise AuthorizationError(
                "You can only edit questions you created."
            )

        if data.create_new_version:
            # Archive old version
            await self._repo.archive(existing.id)

            # Determine fields for new version
            new_content = data.content if data.content is not None else existing.content
            new_grading_mode = infer_grading_mode(
                existing.question_type, data.grading_mode
            )

            new_question = await self._repo.create(
                content=new_content,
                question_type=existing.question_type,
                difficulty=data.difficulty or existing.difficulty,
                grading_mode=new_grading_mode,
                created_by_id=updated_by.id,
                source_type=existing.source_type,
                explanation=data.explanation if data.explanation is not None else existing.explanation,
                hint=data.hint if data.hint is not None else existing.hint,
                subject=data.subject if data.subject is not None else existing.subject,
                topic=data.topic if data.topic is not None else existing.topic,
                bloom_level=data.bloom_level if data.bloom_level is not None else existing.bloom_level,
                suggested_marks=data.suggested_marks if data.suggested_marks is not None else existing.suggested_marks,
                estimated_time_minutes=data.estimated_time_minutes if data.estimated_time_minutes is not None else existing.estimated_time_minutes,
                fill_blank_template=data.fill_blank_template if data.fill_blank_template is not None else existing.fill_blank_template,
                correct_order_json=data.correct_order_json if data.correct_order_json is not None else existing.correct_order_json,
                parent_question_id=existing.id,
                version_number=existing.version_number + 1,
            )

            # Options
            options_to_use = data.options if data.options is not None else []
            if data.options is None and existing.options:
                # Copy existing options
                for opt in existing.options:
                    await self._repo.add_option(
                        question_id=new_question.id,
                        option_text=opt.option_text,
                        is_correct=opt.is_correct,
                        order_index=opt.order_index,
                        option_text_right=opt.option_text_right,
                        explanation=opt.explanation,
                    )
            else:
                for opt in options_to_use:
                    await self._repo.add_option(
                        question_id=new_question.id,
                        option_text=opt.option_text,
                        is_correct=opt.is_correct,
                        order_index=opt.order_index,
                        option_text_right=opt.option_text_right,
                        explanation=opt.explanation,
                    )

            # Tags
            if data.tag_names is not None:
                await self._attach_tag_names(new_question.id, data.tag_names)
            elif existing.tag_links:
                for link in existing.tag_links:
                    await self._repo.attach_tag(new_question.id, link.tag_id)

            return new_question

        else:
            # In-place update (no new version)
            update_fields = {}
            if data.content is not None:
                update_fields["content"] = data.content
            if data.explanation is not None:
                update_fields["explanation"] = data.explanation
            if data.hint is not None:
                update_fields["hint"] = data.hint
            if data.difficulty is not None:
                update_fields["difficulty"] = data.difficulty
            if data.grading_mode is not None:
                update_fields["grading_mode"] = data.grading_mode
            if data.subject is not None:
                update_fields["subject"] = data.subject
            if data.topic is not None:
                update_fields["topic"] = data.topic
            if data.bloom_level is not None:
                update_fields["bloom_level"] = data.bloom_level
            if data.suggested_marks is not None:
                update_fields["suggested_marks"] = data.suggested_marks
            if data.estimated_time_minutes is not None:
                update_fields["estimated_time_minutes"] = data.estimated_time_minutes

            if update_fields:
                from app.db.models.question import Question as Q
                from sqlalchemy import update
                await self.db.execute(
                    update(Q).where(Q.id == existing.id).values(**update_fields)
                )

            if data.options is not None:
                await self._repo.delete_options_for_question(existing.id)
                for opt in data.options:
                    await self._repo.add_option(
                        question_id=existing.id,
                        option_text=opt.option_text,
                        is_correct=opt.is_correct,
                        order_index=opt.order_index,
                        option_text_right=opt.option_text_right,
                        explanation=opt.explanation,
                    )

            if data.tag_names is not None:
                await self._repo.detach_all_tags(existing.id)
                await self._attach_tag_names(existing.id, data.tag_names)

            return await self._repo.get_by_id(existing.id)  # type: ignore

    # ─── Search ───────────────────────────────────────────────────────────────

    async def search_questions(
        self,
        params: QuestionSearchParams,
        current_user: User,
    ) -> QuestionListResponse:
        """
        Paginated, filtered question search.

        Students cannot search the question bank.
        Lecturers see their own + active questions from other lecturers.
        Admins see all.
        """
        from app.core.constants import UserRole

        created_by_id = None
        if current_user.role == UserRole.STUDENT.value:
            raise AuthorizationError("Students cannot access the question bank.")

        items, total = await self._repo.search(
            q=params.q,
            question_type=params.question_type,
            difficulty=params.difficulty,
            subject=params.subject,
            topic=params.topic,
            bloom_level=params.bloom_level,
            source_type=params.source_type,
            tag_names=params.tag_names,
            is_active=params.is_active,
            created_by_id=created_by_id,
            page=params.page,
            page_size=params.page_size,
        )

        return QuestionListResponse(
            items=[QuestionSummaryResponse.model_validate(q) for q in items],
            total=total,
            page=params.page,
            page_size=params.page_size,
            has_next=(params.page * params.page_size) < total,
        )

    # ─── Get ──────────────────────────────────────────────────────────────────

    async def get_question(self, question_id: uuid.UUID) -> Question:
        question = await self._repo.get_by_id(question_id)
        if not question:
            raise NotFoundError("Question not found.")
        return question

    # ─── Tags ─────────────────────────────────────────────────────────────────

    async def attach_tags(
        self, question_id: uuid.UUID, tag_names: List[str]
    ) -> None:
        question = await self._repo.get_by_id_simple(question_id)
        if not question:
            raise NotFoundError("Question not found.")
        await self._attach_tag_names(question_id, tag_names)

    async def detach_tags(
        self, question_id: uuid.UUID, tag_names: List[str]
    ) -> None:
        for name in tag_names:
            tag = await self._repo.get_tag_by_name(name)
            if tag:
                await self._repo.detach_tag(question_id, tag.id)

    async def _attach_tag_names(
        self, question_id: uuid.UUID, tag_names: List[str]
    ) -> None:
        for name in tag_names:
            tag = await self._repo.get_or_create_tag(name)
            await self._repo.attach_tag(question_id, tag.id)

    # ─── Delete ───────────────────────────────────────────────────────────────

    async def soft_delete_question(
        self, question_id: uuid.UUID, current_user: User
    ) -> None:
        from app.core.constants import UserRole

        question = await self._repo.get_by_id_simple(question_id)
        if not question:
            raise NotFoundError("Question not found.")

        if (
            str(question.created_by_id) != str(current_user.id)
            and current_user.role != UserRole.ADMIN.value
        ):
            raise AuthorizationError("You can only delete questions you created.")

        await self._repo.soft_delete(question_id)
