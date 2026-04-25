"""
app/services/question_service.py

Question Bank service - business logic for the Question domain.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import GradingMode, QuestionType, UserRole
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError
from app.db.models.auth import User
from app.db.models.question import Question
from app.db.repositories.question_repo import QuestionRepository
from app.schemas.question import (
    QuestionCreateRequest,
    QuestionListResponse,
    QuestionSearchParams,
    QuestionSummaryResponse,
    QuestionUpdateRequest,
)


def infer_grading_mode(question_type: str, override: str | None = None) -> str:
    """Determine grading mode from question type unless explicitly overridden."""
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

    @staticmethod
    def _role_value(role: Any) -> str:
        return role.value if hasattr(role, "value") else str(role)

    async def create_question(self, data: QuestionCreateRequest, created_by: User) -> Question:
        grading_mode = infer_grading_mode(data.question_type, data.grading_mode)

        if data.question_type in {QuestionType.MCQ.value, QuestionType.TRUE_FALSE.value}:
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
            marks=(1 if data.suggested_marks is None else data.suggested_marks),
            created_by_id=created_by.id,
            source_type="manual",
            explanation=data.explanation,
            topic_tag=data.topic,
        )
        await self._repo.update_fields(question.id, grading_mode=grading_mode)

        for opt in data.options or []:
            await self._repo.add_option(
                question_id=question.id,
                content=opt.option_text,
                is_correct=opt.is_correct,
                order_index=opt.order_index,
                match_key=getattr(opt, "match_key", None),
                match_value=getattr(opt, "match_value", None),
            )

        return question

    async def version_question(
        self,
        question_id: uuid.UUID,
        data: QuestionUpdateRequest,
        updated_by: User,
    ) -> Question:
        existing = await self._repo.get_by_id(question_id)
        if not existing or not existing.is_active:
            raise NotFoundError("Question not found or no longer active.")

        user_role = self._role_value(updated_by.role)
        is_owner = str(existing.created_by_id) == str(updated_by.id)
        if not is_owner and user_role != UserRole.ADMIN.value:
            raise AuthorizationError("You can only edit questions you created.")

        if data.create_new_version:
            await self._repo.archive(existing.id)

            new_content = data.content if data.content is not None else existing.content
            existing_qtype = (
                existing.question_type.value
                if hasattr(existing.question_type, "value")
                else str(existing.question_type)
            )
            new_grading_mode = infer_grading_mode(existing_qtype, data.grading_mode)

            new_question = await self._repo.create(
                content=new_content,
                question_type=existing_qtype,
                difficulty=(
                    data.difficulty if data.difficulty is not None else existing.difficulty
                ),
                marks=(
                    data.suggested_marks if data.suggested_marks is not None else existing.marks
                ),
                created_by_id=existing.created_by_id,
                source_type=(
                    existing.source_type.value
                    if hasattr(existing.source_type, "value")
                    else str(existing.source_type)
                ),
                explanation=(
                    data.explanation if data.explanation is not None else existing.explanation
                ),
                subject_id=existing.subject_id,
                topic_tag=data.topic if data.topic is not None else existing.topic_tag,
                parent_question_id=existing.id,
                version=existing.version + 1,
            )
            await self._repo.update_fields(new_question.id, grading_mode=new_grading_mode)

            if data.options is None and existing.options:
                for opt in existing.options:
                    await self._repo.add_option(
                        question_id=new_question.id,
                        content=opt.content,
                        is_correct=opt.is_correct,
                        order_index=opt.order_index,
                        match_key=opt.match_key,
                        match_value=opt.match_value,
                    )
            else:
                for new_opt in data.options or []:
                    await self._repo.add_option(
                        question_id=new_question.id,
                        content=new_opt.option_text,
                        is_correct=new_opt.is_correct,
                        order_index=new_opt.order_index,
                        match_key=getattr(new_opt, "match_key", None),
                        match_value=getattr(new_opt, "match_value", None),
                    )

            return new_question

        update_fields: dict[str, Any] = {}
        if data.content is not None:
            update_fields["content"] = data.content
        if data.explanation is not None:
            update_fields["explanation"] = data.explanation
        if data.difficulty is not None:
            update_fields["difficulty"] = data.difficulty
        if data.grading_mode is not None:
            update_fields["grading_mode"] = data.grading_mode
        if data.suggested_marks is not None:
            update_fields["marks"] = data.suggested_marks
        if data.topic is not None:
            update_fields["topic_tag"] = data.topic

        if update_fields:
            await self._repo.update_fields(existing.id, **update_fields)

        if data.options is not None:
            await self._repo.delete_all_options(existing.id)
            for update_opt in data.options:
                await self._repo.add_option(
                    question_id=existing.id,
                    content=update_opt.option_text,
                    is_correct=update_opt.is_correct,
                    order_index=update_opt.order_index,
                    match_key=getattr(update_opt, "match_key", None),
                    match_value=getattr(update_opt, "match_value", None),
                )

        updated = await self._repo.get_by_id(existing.id)
        if not updated:
            raise NotFoundError("Question not found after update.")
        return updated

    async def search_questions(
        self,
        params: QuestionSearchParams,
        current_user: User,
    ) -> QuestionListResponse:
        user_role = self._role_value(current_user.role)
        if user_role == UserRole.STUDENT.value:
            raise AuthorizationError("Students cannot access the question bank.")

        items, total = await self._repo.search(
            q=params.q,
            question_type=params.question_type,
            difficulty=params.difficulty,
            topic_tag=params.topic,
            source_type=params.source_type,
            created_by_id=None,
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

    async def get_question(self, question_id: uuid.UUID) -> Question:
        question = await self._repo.get_by_id(question_id)
        if not question:
            raise NotFoundError("Question not found.")
        return question

    async def attach_tags(self, question_id: uuid.UUID, tag_names: list[str]) -> None:
        question = await self._repo.get_by_id_simple(question_id)
        if not question:
            raise NotFoundError("Question not found.")

        new_tags = [t.strip().lower() for t in tag_names if t and t.strip()]
        if not new_tags:
            return

        existing_tags = (
            [t.strip().lower() for t in question.topic_tag.split(",")] if question.topic_tag else []
        )
        for tag in new_tags:
            if tag not in existing_tags:
                existing_tags.append(tag)

        await self._repo.update_fields(question_id, topic_tag=",".join(existing_tags))

    async def detach_tags(self, question_id: uuid.UUID, tag_names: list[str]) -> None:
        question = await self._repo.get_by_id_simple(question_id)
        if not question:
            raise NotFoundError("Question not found.")
        if not question.topic_tag:
            return

        tags_to_remove = {t.strip().lower() for t in tag_names if t and t.strip()}
        existing_tags = [t.strip().lower() for t in question.topic_tag.split(",") if t.strip()]
        remaining_tags = [t for t in existing_tags if t not in tags_to_remove]

        if remaining_tags:
            await self._repo.update_fields(question_id, topic_tag=",".join(remaining_tags))
        else:
            await self._repo.update_fields(question_id, topic_tag=None)

    async def soft_delete_question(self, question_id: uuid.UUID, current_user: User) -> None:
        question = await self._repo.get_by_id_simple(question_id)
        if not question:
            raise NotFoundError("Question not found.")

        user_role = self._role_value(current_user.role)
        is_owner = str(question.created_by_id) == str(current_user.id)
        if not is_owner and user_role != UserRole.ADMIN.value:
            raise AuthorizationError("You can only delete questions you created.")

        await self._repo.soft_delete(question_id)
