from __future__ import annotations

import uuid
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.lecturer_support_agent import LecturerSupportAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.provider_factory import get_ai_provider, get_embedding_provider
from app.core.exceptions import PermissionDeniedError, ValidationError
from app.db.models.academic import TeachingAssignment, TeachingWorkspace
from app.db.models.auth import User
from app.db.models.resource import LecturerMaterial
from app.schemas.lecturer_ai import LecturerSupportRequest, LecturerSupportResponse


class LecturerAIService:
    """Service layer for lecturer-scoped AI workflows."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def support(
        self,
        body: LecturerSupportRequest,
        current_user: User,
    ) -> LecturerSupportResponse:
        if not body.question.strip():
            raise ValidationError("Question cannot be empty.", code="EMPTY_AI_QUESTION")

        # 1. Verify workspace access and permission in a single query
        stmt = (
            select(TeachingWorkspace)
            .join(
                TeachingAssignment,
                TeachingWorkspace.teaching_assignment_id == TeachingAssignment.id,
            )
            .where(
                TeachingWorkspace.id == body.workspace_id,
                TeachingAssignment.lecturer_id == current_user.id,
                TeachingWorkspace.is_deleted == False,
            )
        )
        workspace = (await self.db.execute(stmt)).scalar_one_or_none()
        if not workspace:
            raise PermissionDeniedError(
                "Workspace not found or you do not have permission to access it."
            )

        # Language policy check for lecturer AI assistance
        from app.core.ai.language_policy import assert_ai_allowed
        assert_ai_allowed(
            getattr(workspace, "language", None),
            action="lecturer_support",
            context={"workspace_id": str(workspace.id)},
        )

        from app.db.enums import AIActionType
        from app.core.ai.meta_identity import (
            _META_IDENTITY_PATTERN,
            LECTURER_META_IDENTITY_DEFLECTION,
        )

        # 2. Deterministic meta / identity question pre-filter (audit without calling LLM)
        if _META_IDENTITY_PATTERN.search(body.question):
            chat_provider = get_ai_provider()
            embed_provider = get_embedding_provider()
            gateway = AIGateway(self.db, chat_provider, embed_provider)
            await gateway.log_action(
                action_type=AIActionType.STUDY_SUPPORT,
                actor_id=current_user.id,
                actor_role="lecturer",
                subject_entity_type="teaching_workspace",
                subject_entity_id=body.workspace_id,
                prompt_summary=f"Meta-identity deflection: {body.question[:100]}",
                prompt_version="v1",
                raw_output={
                    "category": "META_IDENTITY",
                    "deflected": True,
                    "question": body.question,
                },
            )
            return LecturerSupportResponse(
                answer=LECTURER_META_IDENTITY_DEFLECTION,
                citations=[],
                fallback_used=False,
                selected_sources=[],
                mode=body.mode,
                model="deterministic_evaluator",
                provider="deterministic_rule_engine",
            )

        # 3. Build Gateway
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)

        # 4. Call Agent
        agent = LecturerSupportAgent(gateway)
        output = await agent.answer(
            question=body.question,
            workspace_id=body.workspace_id,
            mode=body.mode,
            selected_material_ids=body.selected_material_ids,
            conversation_history=body.conversation_history,
            db=self.db,
        )

        # 4. Resolve displaying source names
        selected_sources: List[str] = []
        if body.selected_material_ids:
            mat_stmt = select(
                LecturerMaterial.display_name, LecturerMaterial.original_filename
            ).where(LecturerMaterial.id.in_(body.selected_material_ids))
            res = await self.db.execute(mat_stmt)
            for row in res.all():
                selected_sources.append(row[0] or row[1])

        return LecturerSupportResponse(
            answer=output.answer,
            citations=[c for c in output.citations],
            fallback_used=output.fallback_used,
            selected_sources=selected_sources,
            mode=body.mode,
            model=chat_provider.default_model,
            provider=chat_provider.name,
        )
