from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.lecturer_support_agent import LecturerSupportAgent
from app.agents.rubric_agent import RubricAgent
from app.agents.slide_deck_agent import SlideDeckAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.language_policy import assert_ai_allowed
from app.core.ai.meta_identity import (
    _META_IDENTITY_PATTERN,
    LECTURER_META_IDENTITY_DEFLECTION,
)
from app.core.ai.provider_factory import get_ai_provider, get_embedding_provider
from app.core.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.db.enums import AIActionType, UserRole
from app.db.models.academic import Course, TeachingAssignment, TeachingWorkspace
from app.db.models.assessment import Rubric, RubricCriterion, RubricCriterionLevel
from app.db.models.auth import User
from app.db.models.learning_unit import LearningUnit
from app.db.models.question import Question
from app.db.models.resource import LecturerMaterial
from app.db.models.resource_chunk import ResourceChunk
from app.schemas.lecturer_ai import (
    LearningUnitItemResponse,
    LecturerSupportRequest,
    LecturerSupportResponse,
    RubricDraftRequest,
    RubricDraftResponse,
    RubricSaveRequest,
    RubricSaveResponse,
    SlideDeckGenerateResponse,
)


class LecturerAIService:
    """Service layer for lecturer-scoped AI workflows."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _get_gateway(self) -> AIGateway:
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        return AIGateway(self.db, chat_provider, embed_provider)

    # ─── 1. General Assistant Chat ────────────────────────────────────────────

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
        if not workspace and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedError(
                "Workspace not found or you do not have permission to access it."
            )

        # Fallback if admin
        if not workspace and current_user.role == UserRole.ADMIN:
            workspace = await self.db.get(TeachingWorkspace, body.workspace_id)
            if not workspace:
                raise NotFoundError("Teaching workspace not found.")

        # Language policy check for lecturer AI assistance
        assert_ai_allowed(
            getattr(workspace, "language", None),
            action="lecturer_support",
            context={"workspace_id": str(workspace.id) if workspace else None},
        )

        # 2. Deterministic meta / identity question pre-filter (audit without calling LLM)
        if _META_IDENTITY_PATTERN.search(body.question):
            gateway = self._get_gateway()
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

        # 3. Call Agent via Gateway
        gateway = self._get_gateway()
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

        resolved_conv_id = body.conversation_id or uuid.uuid4()
        chat_provider = get_ai_provider()
        return LecturerSupportResponse(
            answer=output.answer,
            conversation_id=resolved_conv_id,
            citations=[c for c in output.citations],
            fallback_used=output.fallback_used,
            selected_sources=selected_sources,
            mode=body.mode,
            model=chat_provider.default_model,
            provider=chat_provider.name,
        )

    # ─── 2. Learning Units Fetch & Fallback Segmentation ──────────────────────

    async def get_workspace_learning_units(
        self,
        workspace_id: uuid.UUID,
        current_user: User,
    ) -> List[LearningUnitItemResponse]:
        """
        Fetch ordered Learning Units for a workspace (pure read-only from single stored background result).
        """
        # Permission check
        ws_stmt = (
            select(TeachingWorkspace)
            .outerjoin(
                TeachingAssignment,
                TeachingWorkspace.teaching_assignment_id == TeachingAssignment.id,
            )
            .where(
                TeachingWorkspace.id == workspace_id,
                TeachingWorkspace.is_deleted == False,
            )
        )
        if current_user.role != UserRole.ADMIN:
            ws_stmt = ws_stmt.where(TeachingAssignment.lecturer_id == current_user.id)

        workspace = (await self.db.execute(ws_stmt)).scalar_one_or_none()
        if not workspace:
            raise PermissionDeniedError("Workspace not found or access denied.")

        # Query existing learning units
        lu_stmt = select(LearningUnit).where(
            LearningUnit.teaching_workspace_id == workspace_id,
            LearningUnit.is_active == True,
            LearningUnit.is_deleted == False,
        ).order_by(LearningUnit.order_index.asc())

        units = list((await self.db.execute(lu_stmt)).scalars().all())

        return [
            LearningUnitItemResponse(
                id=u.id,
                order_index=u.order_index,
                title=u.title,
                summary=u.summary,
                learning_outcomes=u.learning_outcomes or [],
                start_page=u.start_page,
                end_page=u.end_page,
                source_material_id=u.source_material_id,
                estimated_study_minutes=u.estimated_study_minutes,
                chunk_count=len(u.source_chunk_ids or []),
            )
            for u in units
        ]

    # ─── 3. Slide Deck Generation from Learning Unit ──────────────────────────

    async def generate_slide_deck(
        self,
        learning_unit_id: uuid.UUID,
        current_user: User,
        estimated_minutes: int = 45,
        selected_outcomes: Optional[List[str]] = None,
    ) -> SlideDeckGenerateResponse:
        """
        Generate a structured 8–15 slide presentation outline grounded in a single Learning Unit.
        """
        # 1. Fetch LearningUnit & verify workspace assignment
        stmt = (
            select(LearningUnit, TeachingWorkspace)
            .join(TeachingWorkspace, LearningUnit.teaching_workspace_id == TeachingWorkspace.id)
            .outerjoin(TeachingAssignment, TeachingWorkspace.teaching_assignment_id == TeachingAssignment.id)
            .where(
                LearningUnit.id == learning_unit_id,
                LearningUnit.is_active == True,
                LearningUnit.is_deleted == False,
            )
        )
        if current_user.role != UserRole.ADMIN:
            stmt = stmt.where(TeachingAssignment.lecturer_id == current_user.id)

        res = (await self.db.execute(stmt)).first()
        if not res:
            raise PermissionDeniedError("Learning Unit not found or access denied.")

        lu, workspace = res

        # 2. Hard Language Policy Enforcement (Must not be RW)
        assert_ai_allowed(
            getattr(workspace, "language", None),
            action="generate_slide_deck",
            context={"learning_unit_id": str(lu.id), "workspace_id": str(workspace.id)},
        )

        # 3. Retrieve source chunk text from ResourceChunk (hard RAG scoping)
        chunk_texts: List[str] = []
        if lu.source_chunk_ids:
            chunk_uuids: List[uuid.UUID] = []
            for cid in lu.source_chunk_ids:
                try:
                    chunk_uuids.append(uuid.UUID(str(cid)))
                except (ValueError, TypeError):
                    continue

            if chunk_uuids:
                chunk_stmt = select(ResourceChunk.content).where(
                    ResourceChunk.id.in_(chunk_uuids)
                )
                chunk_rows = (await self.db.execute(chunk_stmt)).scalars().all()
                chunk_texts = [c for c in chunk_rows if c]

        # 4. Input Chunk Truncation to guarantee cost bounds (max 4000 characters)
        raw_combined = "\n\n".join(chunk_texts) if chunk_texts else (lu.summary or lu.title)
        bounded_chunk_content = raw_combined[:4000]

        # 5. Execute SlideDeckAgent via Gateway
        gateway = self._get_gateway()
        agent = SlideDeckAgent(gateway)
        deck = await agent.generate(
            lecturer_id=current_user.id,
            learning_unit_id=lu.id,
            unit_title=lu.title,
            chunk_content=bounded_chunk_content,
            estimated_minutes=estimated_minutes,
            selected_outcomes=selected_outcomes,
        )

        return SlideDeckGenerateResponse(
            learning_unit_id=lu.id,
            unit_title=lu.title,
            deck=deck,
        )

    # ─── 4. Rubric Assistant: Draft & Save ────────────────────────────────────

    async def draft_rubric(
        self,
        body: RubricDraftRequest,
        current_user: User,
    ) -> RubricDraftResponse:
        """
        Draft or improve rubric criteria grounded to a specific Question entity.
        """
        # 1. Fetch Question and verify ownership
        q_stmt = select(Question).where(
            Question.id == body.question_id,
            Question.is_deleted == False,
        )
        question = (await self.db.execute(q_stmt)).scalar_one_or_none()
        if not question:
            raise NotFoundError("Question not found.")

        if question.created_by_id != current_user.id and current_user.role != UserRole.ADMIN:
            # Check if lecturer teaches the associated course
            if question.course_id:
                asgn_stmt = (
                    select(TeachingAssignment)
                    .where(
                        TeachingAssignment.course_id == question.course_id,
                        TeachingAssignment.lecturer_id == current_user.id,
                    )
                )
                asgn = (await self.db.execute(asgn_stmt)).scalar_one_or_none()
                if not asgn:
                    raise PermissionDeniedError("You do not have permission to modify this question.")
            else:
                raise PermissionDeniedError("You do not have permission to modify this question.")

        # 2. Language policy check
        lang = None
        if question.course_id:
            course = await self.db.get(Course, question.course_id)
            if course and hasattr(course, "language"):
                lang = course.language

        assert_ai_allowed(
            lang,
            action="draft_rubric",
            context={"question_id": str(question.id)},
        )

        # 3. Call RubricAgent via Gateway
        gateway = self._get_gateway()
        agent = RubricAgent(gateway)
        target_marks = body.total_marks or question.marks or 10
        rubric_output = await agent.draft_or_improve(
            lecturer_id=current_user.id,
            question_id=question.id,
            question_content=question.content,
            question_type=str(question.question_type),
            max_marks=target_marks,
            existing_rubric=body.existing_rubric,
        )

        return RubricDraftResponse(
            question_id=question.id,
            rubric=rubric_output,
        )

    async def save_rubric_to_question(
        self,
        body: RubricSaveRequest,
        current_user: User,
    ) -> RubricSaveResponse:
        """
        Save edited rubric criteria directly to the database and attach to the target Question.
        """
        # 1. Fetch Question and verify ownership
        question = await self.db.get(Question, body.question_id)
        if not question or question.is_deleted:
            raise NotFoundError("Question not found.")

        if question.created_by_id != current_user.id and current_user.role != UserRole.ADMIN:
            raise PermissionDeniedError("You do not have permission to attach a rubric to this question.")

        # 2. If question already has a Rubric, reuse or replace criteria
        rubric: Optional[Rubric] = None
        if question.rubric_id:
            rubric = await self.db.get(Rubric, question.rubric_id)
            if rubric:
                rubric.title = body.title
                rubric.description = body.description
                rubric.updated_by_id = current_user.id
                # Delete existing criteria and levels
                del_stmt = delete(RubricCriterion).where(RubricCriterion.rubric_id == rubric.id)
                await self.db.execute(del_stmt)

        if not rubric:
            rubric = Rubric(
                title=body.title,
                description=body.description,
                is_shared=False,
                created_by_id=current_user.id,
                updated_by_id=current_user.id,
            )
            self.db.add(rubric)
            await self.db.flush()

        # 3. Insert Criteria & Performance Levels
        for crit_idx, crit_data in enumerate(body.criteria):
            crit = RubricCriterion(
                rubric_id=rubric.id,
                title=crit_data.title,
                description=crit_data.description,
                max_marks=crit_data.max_marks,
                order_index=crit_data.order_index or (crit_idx + 1),
            )
            self.db.add(crit)
            await self.db.flush()

            for lvl_idx, lvl_data in enumerate(crit_data.levels):
                lvl = RubricCriterionLevel(
                    criterion_id=crit.id,
                    label=lvl_data.label,
                    description=lvl_data.description,
                    marks=lvl_data.marks,
                    order_index=lvl_idx + 1,
                )
                self.db.add(lvl)

        # 4. Attach rubric to question
        question.rubric_id = rubric.id
        await self.db.commit()

        return RubricSaveResponse(
            question_id=question.id,
            rubric_id=rubric.id,
            title=rubric.title,
            criteria_count=len(body.criteria),
            message="Rubric saved and successfully attached to question.",
        )
