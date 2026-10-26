from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from app.agents.student_support_agent import StudySupportAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.meta_identity import (
    STUDENT_META_IDENTITY_DEFLECTION,
    is_meta_identity_query,
)
from app.core.ai.provider_factory import (
    get_ai_provider,
    get_embedding_provider,
)
from app.core.exceptions import PermissionDeniedError, ValidationError
from app.db.enums import (
    AIActionType,
)
from typing import Any
from app.db.models.auth import User
from app.schemas.chat import strip_attached_files
from app.services.ai_exam_gate import assert_student_ai_allowed
from app.schemas.student_ai import (
    RevisionGuideOutput,
    RevisionGuideRequest,
    StudentChatHistoryItem,
    StudentConversationSummary,
    StudentSupportRequest,
    StudentSupportResponse,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

_BLOCKED_QUESTION_PATTERN = re.compile(
    r"(?:answer[ _-]?key|exam[ _-]?(?:paper|solution)|hidden[ _-]?rubric)",
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

        # Determine conversation_id (a client-supplied one must not belong to another student)
        conversation_id = body.conversation_id or uuid.uuid4()
        if body.conversation_id:
            await self._assert_conversation_not_foreign(body.conversation_id, current_user.id)

        # 1. Deterministic meta / identity question pre-filter (audit without calling LLM).
        # Only what the student typed is checked: attached-file text that merely mentions a
        # "system prompt" must not turn a normal question into a canned deflection.
        if is_meta_identity_query(strip_attached_files(body.question)):
            chat_provider = get_ai_provider()
            embed_provider = get_embedding_provider()
            gateway = AIGateway(self.db, chat_provider, embed_provider)
            await gateway.log_action(
                action_type=AIActionType.STUDY_SUPPORT,
                actor_id=current_user.id,
                actor_role="student",
                subject_entity_type="teaching_workspace"
                if getattr(body, "teaching_workspace_id", None)
                else None,
                subject_entity_id=getattr(body, "teaching_workspace_id", None),
                prompt_summary=f"Meta-identity deflection: {body.question[:100]}",
                prompt_version="v1",
                raw_output={
                    "category": "META_IDENTITY",
                    "deflected": True,
                    "question": body.question[:500],
                },
            )
            return StudentSupportResponse(
                explanation=STUDENT_META_IDENTITY_DEFLECTION,
                conversation_id=conversation_id,
                citations=[],
                fallback_used=False,
            )

        # Only block question text when it explicitly seeks answer keys, exam solutions, or hidden rubrics,
        # while allowing legitimate grading questions that are not trying to obtain prohibited content.
        if _BLOCKED_QUESTION_PATTERN.search(body.question):
            raise PermissionDeniedError(
                "Student AI support cannot process input containing prohibited materials (such as answer keys or exam solutions).",
                code="AI_CONTEXT_NOT_ALLOWED",
            )

        # Language policy check for student AI support
        target_ws_id = getattr(body, "teaching_workspace_id", None)
        if not target_ws_id and getattr(body, "selected_resource_id", None):
            from app.db.models.resource import LecturerMaterial
            stmt_mat = select(LecturerMaterial.teaching_workspace_id).where(
                LecturerMaterial.id == body.selected_resource_id,
                LecturerMaterial.is_deleted == False,
            )
            res_mat = await self.db.execute(stmt_mat)
            target_ws_id = res_mat.scalar_one_or_none()

        if target_ws_id:
            from app.db.models.academic import TeachingWorkspace
            ws = await self.db.get(TeachingWorkspace, target_ws_id)
            if ws:
                from app.core.ai.language_policy import assert_ai_allowed
                assert_ai_allowed(
                    getattr(ws, "language", None),
                    action="student_tutor",
                    context={
                        "workspace_id": str(target_ws_id),
                        "resource_id": str(body.selected_resource_id) if getattr(body, "selected_resource_id", None) else None,
                    },
                )

        source_surface = getattr(body, "source_surface", "study_tutor")
        is_in_assessment = bool(
            getattr(body, "is_in_assessment", False)
            or getattr(body, "attempt_id", None)
            or source_surface == "assessment_inline"
        )
        log_to_global_history = (source_surface == "study_tutor") and not is_in_assessment
        attempt = None
        if is_in_assessment:
            if not body.attempt_id:
                raise PermissionDeniedError(
                    "An attempt is required for in-assessment AI support.",
                    code="ATTEMPT_REQUIRED",
                )
            from app.db.repositories.attempt_repo import AttemptRepository
            att_repo = AttemptRepository(self.db)
            attempt = await att_repo.get_by_id(body.attempt_id)
            if not attempt or not attempt.assessment:
                raise PermissionDeniedError("Attempt not found.", code="ATTEMPT_NOT_FOUND")
            if attempt.student_id != current_user.id:
                raise PermissionDeniedError("Attempt ownership violation.", code="ATTEMPT_OWNERSHIP_VIOLATION")
            if not attempt.assessment.ai_assistance_allowed:
                raise PermissionDeniedError(
                    "AI assistance is disabled for this assessment.",
                    code="AI_ASSISTANCE_NOT_ALLOWED",
                )

        # 1. Build Gateway
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)

        # 2. Call Agent
        agent = StudySupportAgent(gateway)
        output = await agent.answer(
            question=body.question,
            student_id=current_user.id,
            conversation_history=[turn.model_dump() for turn in body.conversation_history],
            selected_resource_id=body.selected_resource_id,
            selected_resource_ids=getattr(body, "selected_resource_ids", []),
            teaching_workspace_id=getattr(body, "teaching_workspace_id", None),
            thinking_mode=getattr(body, "thinking_mode", False),
            deep_search_mode=getattr(body, "deep_search_mode", False),
            log_to_global_history=log_to_global_history,
            is_in_assessment=is_in_assessment,
            attempt_id=getattr(body, "attempt_id", None),
            question_id=getattr(body, "question_id", None),
            selected_text=getattr(body, "selected_text", None),
            current_page=getattr(body, "current_page", None),
            conversation_id=conversation_id,
            db=self.db,
        )

        return StudentSupportResponse(
            explanation=output.answer,
            conversation_id=conversation_id,
            citations=[c.model_dump() for c in output.citations],
            fallback_used=output.fallback_used,
        )

    async def get_conversations(
        self,
        student_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Any]:
        from app.db.models.study_support_session import StudySupportSession
        from sqlalchemy import func

        stmt = (
            select(
                StudySupportSession.conversation_id,
                func.max(StudySupportSession.created_at).label("last_activity_at"),
                func.min(StudySupportSession.created_at).label("first_activity_at"),
                func.count(StudySupportSession.id).label("turn_count"),
            )
            .where(
                StudySupportSession.student_id == student_id,
                StudySupportSession.is_deleted == False,
            )
            .group_by(StudySupportSession.conversation_id)
            .order_by(func.max(StudySupportSession.created_at).desc())
            .limit(limit)
            .offset(offset)
        )
        res = await self.db.execute(stmt)
        grouped_rows = res.all()

        if not grouped_rows:
            return []

        conv_ids = [row.conversation_id for row in grouped_rows]

        # Fetch first question for each conversation to use as preview/title
        first_turns_stmt = (
            select(StudySupportSession)
            .where(
                StudySupportSession.conversation_id.in_(conv_ids),
                StudySupportSession.student_id == student_id,
                StudySupportSession.is_deleted == False,
            )
            .order_by(StudySupportSession.created_at.asc())
        )
        first_turns_res = await self.db.execute(first_turns_stmt)
        all_turns = first_turns_res.scalars().all()

        first_questions: dict[uuid.UUID, str] = {}
        for turn in all_turns:
            if turn.conversation_id not in first_questions:
                first_questions[turn.conversation_id] = strip_attached_files(turn.question)

        summaries = []
        for row in grouped_rows:
            cid = row.conversation_id
            preview_text = first_questions.get(cid, "New Conversation")
            if len(preview_text) > 80:
                preview_text = preview_text[:77] + "..."

            created_str = (
                row.first_activity_at.isoformat()
                if row.first_activity_at
                else datetime.now(UTC).isoformat()
            )
            last_activity_str = (
                row.last_activity_at.isoformat()
                if row.last_activity_at
                else datetime.now(UTC).isoformat()
            )
            summaries.append(
                StudentConversationSummary(
                    conversation_id=cid,
                    preview=preview_text,
                    created_at=created_str,
                    last_activity_at=last_activity_str,
                    turn_count=row.turn_count,
                )
            )

        return summaries

    async def get_conversation(
        self,
        student_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> list[StudentChatHistoryItem]:
        from app.db.models.study_support_session import StudySupportSession

        stmt = (
            select(StudySupportSession)
            .where(
                StudySupportSession.student_id == student_id,
                StudySupportSession.conversation_id == conversation_id,
                StudySupportSession.is_deleted == False,
            )
            .order_by(StudySupportSession.created_at.asc())
        )
        res = await self.db.execute(stmt)
        sessions = list(res.scalars().all())

        return [
            StudentChatHistoryItem(
                id=s.id,
                conversation_id=s.conversation_id,
                question=s.question,
                answer=s.llm_response,
                citations=s.source_citations or [],
                created_at=s.created_at.isoformat() if s.created_at else datetime.now(UTC).isoformat(),
            )
            for s in sessions
        ]

    async def delete_conversation(self, student_id: uuid.UUID, conversation_id: uuid.UUID) -> bool:
        from app.db.models.study_support_session import StudySupportSession

        stmt = (
            select(StudySupportSession)
            .where(
                StudySupportSession.student_id == student_id,
                StudySupportSession.conversation_id == conversation_id,
                StudySupportSession.is_deleted == False,
            )
        )
        res = await self.db.execute(stmt)
        sessions = list(res.scalars().all())
        if not sessions:
            return False

        now = datetime.now(UTC)
        for s in sessions:
            s.is_deleted = True
            s.deleted_at = now
        await self.db.commit()
        return True

    async def get_chat_history(self, student_id: uuid.UUID) -> list[StudentChatHistoryItem]:
        from app.db.models.study_support_session import StudySupportSession
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
                conversation_id=s.conversation_id,
                question=s.question,
                answer=s.llm_response,
                citations=s.source_citations or [],
                created_at=s.created_at.isoformat() if s.created_at else datetime.now(UTC).isoformat(),
            )
            for s in sessions
        ]

    async def generate_revision_guide(
        self, body: RevisionGuideRequest, student_id: uuid.UUID
    ) -> RevisionGuideOutput:
        await self._assert_student_support_allowed(student_id)

        resolved_topic = body.topic
        workspace_id = getattr(body, "teaching_workspace_id", None)

        if getattr(body, "learning_unit_id", None):
            from app.db.models.learning_unit import LearningUnit
            lu = await self.db.get(LearningUnit, body.learning_unit_id)
            if lu and not lu.is_deleted:
                await self._assert_enrolled_in_workspace(student_id, lu.teaching_workspace_id)
                resolved_topic = lu.title
                workspace_id = workspace_id or lu.teaching_workspace_id

        if workspace_id:
            await self._assert_enrolled_in_workspace(student_id, workspace_id)
            from app.db.models.academic import TeachingWorkspace
            ws = await self.db.get(TeachingWorkspace, workspace_id)
            if ws and getattr(ws, "language", None) and str(ws.language).upper() == "RW":
                from app.core.exceptions import AILanguageBlockedError
                raise AILanguageBlockedError(
                    "AI revision is unavailable for Kinyarwanda courses.",
                    code="AI_BLOCKED_LANGUAGE_POLICY",
                )

        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)
        agent = StudySupportAgent(gateway)
        return await agent.generate_revision_guide(
            topic=resolved_topic,
            student_id=student_id,
            teaching_workspace_id=workspace_id,
            db=self.db,
        )

    async def _assert_enrolled_in_workspace(
        self, student_id: uuid.UUID, workspace_id: uuid.UUID
    ) -> None:
        from app.db.repositories.workspace_repo import WorkspaceRepository

        if not await WorkspaceRepository(self.db).is_student_enrolled(student_id, workspace_id):
            raise PermissionDeniedError(
                "You are not enrolled in this course workspace.",
                code="WORKSPACE_NOT_ENROLLED",
            )

    async def _assert_conversation_not_foreign(
        self, conversation_id: uuid.UUID, student_id: uuid.UUID
    ) -> None:
        from app.db.models.study_support_session import StudySupportSession

        stmt = (
            select(StudySupportSession.id)
            .where(
                StudySupportSession.conversation_id == conversation_id,
                StudySupportSession.student_id != student_id,
            )
            .limit(1)
        )
        if (await self.db.execute(stmt)).scalar_one_or_none():
            raise PermissionDeniedError(
                "This conversation does not belong to you.",
                code="CONVERSATION_OWNERSHIP_VIOLATION",
            )

    async def _assert_student_support_allowed(self, student_id) -> None:
        """Block student support while an open attempt forbids AI (see ``ai_exam_gate``)."""
        await assert_student_ai_allowed(self.db, student_id)
