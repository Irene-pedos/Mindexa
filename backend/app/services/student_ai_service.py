from __future__ import annotations

import re
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.student_support_agent import StudentSupportAgent, StudentSupportContext
from app.core.ai.gateway import AIGateway
from app.core.ai.provider_factory import get_ai_provider, get_embedding_provider
from app.core.exceptions import PermissionDeniedError, ValidationError
from app.db.enums import AssessmentStatus, AssessmentType, AttemptStatus
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.auth import User
from app.schemas.student_ai import (
    StudentSupportContextRequest,
    StudentSupportRequest,
    StudentSupportResponse,
)
from app.services.rag_service import RAGService


_BLOCKED_CONTEXT_PATTERN = re.compile(
    r"\b("
    r"answer\s*key|marking\s*guide|model\s*answer|hidden\s*rubric|"
    r"official\s*rubric|active\s*cat|active\s*summative|exam\s*paper|"
    r"locked\s*assessment|unpublished\s*assessment"
    r")\b",
    re.IGNORECASE,
)


class StudentAIService:
    """Service layer for student-scoped AI workflows."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def support(
        self,
        body: StudentSupportRequest,
        current_user: User,
    ) -> StudentSupportResponse:
        if not body.question.strip():
            raise ValidationError("Question cannot be empty.", code="EMPTY_AI_QUESTION")

        await self._assert_student_support_allowed(current_user.id)
        await self._assert_contexts_are_safe(body.contexts)

        # 1. Build Gateway with separate chat and embedding providers
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)

        # 2. Retrieve RAG context
        rag_service = RAGService(self.db, gateway)
        rag_chunks = await rag_service.retrieve_context_for_student(
            student_id=current_user.id,
            institution_id=current_user.institution_id if hasattr(current_user, 'institution_id') else None,
            query_text=body.question,
        )

        # 3. Combine user-provided context with RAG context
        contexts = [
            StudentSupportContext(title=context.title, content=context.content)
            for context in body.contexts
        ]
        for chunk in rag_chunks:
            contexts.append(
                StudentSupportContext(
                    title=f"Source: {chunk['source']}",
                    content=chunk['content']
                )
            )

        # 4. Call Agent
        agent = StudentSupportAgent(gateway)
        output = await agent.answer(
            student_id=current_user.id,
            actor_role=str(current_user.role.value if hasattr(current_user.role, "value") else current_user.role),
            question=body.question,
            contexts=contexts,
        )
        return StudentSupportResponse(
            explanation=output.explanation,
            revision_plan=output.revision_plan,
            follow_up_questions=output.follow_up_questions,
            safety_notice=output.safety_notice,
            model=chat_provider.default_model,
            provider=chat_provider.name,
        )

    async def _assert_student_support_allowed(self, student_id) -> None:
        """Block student support while the student has an active exam-style attempt."""

        now = datetime.now(UTC)
        stmt = (
            select(AssessmentAttempt.id)
            .join(Assessment, AssessmentAttempt.assessment_id == Assessment.id)
            .where(
                AssessmentAttempt.student_id == student_id,
                AssessmentAttempt.is_deleted == False,
                AssessmentAttempt.status.in_(
                    [AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED]
                ),
                Assessment.assessment_type.in_(
                    [AssessmentType.CAT, AssessmentType.SUMMATIVE]
                ),
                Assessment.status.in_(
                    [AssessmentStatus.PUBLISHED, AssessmentStatus.ACTIVE]
                ),
                or_(Assessment.window_end.is_(None), Assessment.window_end >= now),
            )
            .limit(1)
        )
        active_attempt_id = (await self.db.execute(stmt)).scalar_one_or_none()
        if active_attempt_id:
            raise PermissionDeniedError(
                "Student AI support is unavailable during an active CAT or summative assessment attempt.",
                code="AI_BLOCKED_DURING_ACTIVE_ASSESSMENT",
            )

    async def _assert_contexts_are_safe(
        self,
        contexts: list[StudentSupportContextRequest],
    ) -> None:
        for context in contexts:
            haystack = f"{context.title}\n{context.content}"
            if _BLOCKED_CONTEXT_PATTERN.search(haystack):
                raise PermissionDeniedError(
                    "Student AI support cannot use assessment answers, answer keys, hidden rubrics, or active exam content.",
                    code="AI_CONTEXT_NOT_ALLOWED",
                )
            if context.assessment_id:
                await self._assert_assessment_context_is_safe(context.assessment_id)

    async def _assert_assessment_context_is_safe(self, assessment_id) -> None:
        assessment = await self.db.get(Assessment, assessment_id)
        if not assessment or assessment.is_deleted:
            raise PermissionDeniedError(
                "Student AI support cannot use unknown assessment context.",
                code="AI_CONTEXT_NOT_ALLOWED",
            )

        now = datetime.now(UTC)
        is_exam_style = assessment.assessment_type in {
            AssessmentType.CAT,
            AssessmentType.SUMMATIVE,
        }
        window_is_open = (
            assessment.window_start is not None
            and assessment.window_start <= now
            and (assessment.window_end is None or assessment.window_end >= now)
        )
        is_locked = assessment.status == AssessmentStatus.ACTIVE
        if is_exam_style and (
            assessment.status in {AssessmentStatus.PUBLISHED, AssessmentStatus.ACTIVE}
            or window_is_open
            or is_locked
        ):
            raise PermissionDeniedError(
                "Student AI support cannot use active CAT, summative, or locked assessment context.",
                code="AI_CONTEXT_NOT_ALLOWED",
            )
