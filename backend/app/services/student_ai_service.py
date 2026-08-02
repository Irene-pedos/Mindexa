from __future__ import annotations

import re
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.student_support_agent import StudySupportAgent
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
# No need for separate RAGService import if Agent handles it, but let's see.

_BLOCKED_CONTEXT_PATTERN = re.compile(
    r"(?:answer[ _-]?key|marking[ _-]?(?:guide|scheme|rubric)|hidden[ _-]?rubric|exam[ _-]?(?:paper|solution))",
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

        # Validate question & injected context for safety against prohibited exam materials
        if _BLOCKED_CONTEXT_PATTERN.search(body.question):
            raise PermissionDeniedError(
                "Student AI support cannot process input containing prohibited materials (such as answer keys, marking schemes, or exam solutions).",
                code="AI_CONTEXT_NOT_ALLOWED",
            )

        if hasattr(body, "contexts") and body.contexts:
            await self._assert_contexts_are_safe(body.contexts)

        # 1. Build Gateway
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)

        # 2. Call Agent
        agent = StudySupportAgent(gateway)
        output = await agent.answer(
            question=body.question,
            student_id=current_user.id,
            conversation_history=body.conversation_history if hasattr(body, 'conversation_history') else [],
            selected_resource_id=body.selected_resource_id,
            selected_resource_ids=getattr(body, "selected_resource_ids", []),
            teaching_workspace_id=getattr(body, "teaching_workspace_id", None),
            thinking_mode=getattr(body, "thinking_mode", False),
            deep_search_mode=getattr(body, "deep_search_mode", False),
            db=self.db,
        )

        return StudentSupportResponse(
            explanation=output.answer,
            citations=[c.model_dump() for c in output.citations],
            fallback_used=output.fallback_used,
            model=chat_provider.default_model,
            provider=chat_provider.name,
        )

    async def get_chat_history(self, student_id: uuid.UUID) -> list[Any]:
        from app.db.models.study_support_session import StudySupportSession
        from app.schemas.student_ai import StudentChatHistoryItem
        stmt = (
            select(StudySupportSession)
            .where(
                StudySupportSession.student_id == student_id,
                StudySupportSession.is_deleted == False,
            )
            .order_by(StudySupportSession.created_at.desc())
            .limit(20)
        )
        res = await self.db.execute(stmt)
        sessions = list(res.scalars().all())
        sessions.reverse()
        return [
            StudentChatHistoryItem(
                id=s.id,
                question=s.question,
                answer=s.llm_response,
                citations=s.source_citations or [],
                created_at=s.created_at.isoformat(),
            )
            for s in sessions
        ]

    async def generate_revision_guide(
        self, body: Any, student_id: uuid.UUID
    ) -> Any:
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)
        agent = StudySupportAgent(gateway)
        return await agent.generate_revision_guide(
            topic=body.topic,
            student_id=student_id,
            teaching_workspace_id=body.teaching_workspace_id,
            db=self.db,
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
                or_(
                    Assessment.assessment_type.in_(
                        [AssessmentType.CAT, AssessmentType.SUMMATIVE]
                    ),
                    Assessment.is_supervised == True,
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
                "Student AI support is unavailable during an active CAT, summative, or supervised assessment attempt.",
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
        is_exam_style = (
            assessment.assessment_type in {
                AssessmentType.CAT,
                AssessmentType.SUMMATIVE,
            }
            or assessment.is_supervised
        )
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
                "Student AI support cannot use active CAT, summative, supervised, or locked assessment context.",
                code="AI_CONTEXT_NOT_ALLOWED",
            )
