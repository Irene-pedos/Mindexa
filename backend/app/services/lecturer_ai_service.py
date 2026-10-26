from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.lecturer_support_agent import LecturerSupportAgent
from app.agents.question_enhancer_agent import QuestionEnhancerAgent
from app.schemas.question_ai import (
    EnhanceQuestionRequest,
    EnhanceQuestionResponse,
    ReviewPaperRequest,
    ReviewPaperResponse,
)
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

    async def _get_workspace_for_user(
        self, workspace_id: uuid.UUID, current_user: User
    ) -> TeachingWorkspace:
        """Return a live workspace the user may use: an admin, or a lecturer with an active assignment."""
        stmt = (
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
            stmt = stmt.where(
                TeachingAssignment.lecturer_id == current_user.id,
                TeachingAssignment.is_active == True,
            )
        workspace = (await self.db.execute(stmt)).scalar_one_or_none()
        if not workspace:
            raise PermissionDeniedError("Workspace not found or you do not have permission to access it.")
        return workspace

    async def _assert_question_access(self, question: Question, current_user: User) -> None:
        """The creator, an admin, or a lecturer actively teaching the question's course."""
        if question.created_by_id == current_user.id or current_user.role == UserRole.ADMIN:
            return
        if question.course_id:
            assignment_stmt = select(TeachingAssignment.id).where(
                TeachingAssignment.course_id == question.course_id,
                TeachingAssignment.lecturer_id == current_user.id,
                TeachingAssignment.is_active == True,
            ).limit(1)
            if (await self.db.execute(assignment_stmt)).scalar_one_or_none():
                return
        raise PermissionDeniedError("You do not have permission to modify this question.")

    async def _workspace_language(
        self, workspace_id: uuid.UUID | None, current_user: User
    ) -> str | None:
        """Language of a workspace the user is allowed to use; None when no workspace was given."""
        if not workspace_id:
            return None
        workspace = await self._get_workspace_for_user(workspace_id, current_user)
        return getattr(workspace, "language", None)

    async def enhance_question(self, body: EnhanceQuestionRequest, current_user: User) -> EnhanceQuestionResponse:
        """Propose an improved/completed version of one draft question (never saved here)."""
        assert_ai_allowed(
            await self._workspace_language(body.workspace_id, current_user),
            action="enhance_question",
            context={"action": body.action},
        )
        agent = QuestionEnhancerAgent(self._get_gateway())
        return await agent.enhance(
            lecturer_id=current_user.id,
            question=body.question,
            action=body.action,
            instructions=body.instructions,
            subject=body.subject,
            topic=body.topic,
        )

    async def review_paper(self, body: ReviewPaperRequest, current_user: User) -> ReviewPaperResponse:
        """Find gaps in a draft paper (coverage, difficulty balance, duplicates, ambiguity)."""
        assert_ai_allowed(
            await self._workspace_language(body.workspace_id, current_user),
            action="review_paper",
            context={"questions": len(body.questions)},
        )
        agent = QuestionEnhancerAgent(self._get_gateway())
        return await agent.review_paper(
            lecturer_id=current_user.id,
            questions=body.questions,
            blueprint=body.blueprint,
            assessment_type=body.assessment_type,
            policy_total=body.policy_total,
            subject=body.subject,
        )

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

        # 1. Verify workspace access and permission
        workspace = await self._get_workspace_for_user(body.workspace_id, current_user)

        # Language policy check for lecturer AI assistance
        assert_ai_allowed(
            getattr(workspace, "language", None),
            action="lecturer_support",
            context={"workspace_id": str(workspace.id)},
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
                    "question": body.question[:500],
                },
            )
            return LecturerSupportResponse(
                answer=LECTURER_META_IDENTITY_DEFLECTION,
                citations=[],
                fallback_used=False,
                selected_sources=[],
                mode=body.mode,
            )

        # 3. Call Agent via Gateway
        gateway = self._get_gateway()
        agent = LecturerSupportAgent(gateway)
        output = await agent.answer(
            question=body.question,
            workspace_id=body.workspace_id,
            mode=body.mode,
            selected_material_ids=body.selected_material_ids,
            conversation_history=[turn.model_dump() for turn in body.conversation_history],
            db=self.db,
        )

        # 4. Resolve displaying source names (only materials that belong to this workspace)
        selected_sources: List[str] = []
        if body.selected_material_ids:
            mat_stmt = select(
                LecturerMaterial.display_name, LecturerMaterial.original_filename
            ).where(
                LecturerMaterial.id.in_(body.selected_material_ids),
                LecturerMaterial.teaching_workspace_id == workspace.id,
                LecturerMaterial.is_deleted == False,
            )
            res = await self.db.execute(mat_stmt)
            for row in res.all():
                selected_sources.append(row[0] or row[1])

        return LecturerSupportResponse(
            answer=output.answer,
            conversation_id=body.conversation_id or uuid.uuid4(),
            citations=[c for c in output.citations],
            fallback_used=output.fallback_used,
            selected_sources=selected_sources,
            mode=body.mode,
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
        await self._get_workspace_for_user(workspace_id, current_user)

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
        lu = await self.db.get(LearningUnit, learning_unit_id)
        if not lu or not lu.is_active or lu.is_deleted:
            raise PermissionDeniedError("Learning Unit not found or access denied.")
        try:
            workspace = await self._get_workspace_for_user(lu.teaching_workspace_id, current_user)
        except PermissionDeniedError:
            raise PermissionDeniedError("Learning Unit not found or access denied.") from None

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
                chunk_stmt = select(ResourceChunk.id, ResourceChunk.content).where(
                    ResourceChunk.id.in_(chunk_uuids)
                )
                content_by_id = {
                    row.id: row.content for row in (await self.db.execute(chunk_stmt)).all()
                }
                # Keep the unit's own chunk order so truncation cuts the tail, not a random slice.
                chunk_texts = [content_by_id[c] for c in chunk_uuids if content_by_id.get(c)]

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

        await self._assert_question_access(question, current_user)

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

    @staticmethod
    def _validate_rubric_marks(body: RubricSaveRequest, question: Question) -> None:
        """Enforce the marks invariants the rubric tables document but do not check."""
        total = 0
        for criterion in body.criteria:
            over = [lvl for lvl in criterion.levels if lvl.marks > criterion.max_marks]
            if over:
                raise ValidationError(
                    f"Level marks for '{criterion.title}' cannot exceed the criterion maximum "
                    f"of {criterion.max_marks}.",
                    code="RUBRIC_LEVEL_MARKS_EXCEED_CRITERION",
                )
            total += criterion.max_marks
        if question.marks and total != question.marks:
            raise ValidationError(
                f"Criteria marks add up to {total} but the question is worth {question.marks}.",
                code="RUBRIC_MARKS_MISMATCH",
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

        await self._assert_question_access(question, current_user)
        self._validate_rubric_marks(body, question)

        # 2. Always write a NEW rubric. The question's previous rubric may be shared or already
        # referenced by graded attempts, so it is left untouched and simply detached below.
        rubric = Rubric(
            title=body.title,
            description=body.description,
            is_shared=False,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.db.add(rubric)
        await self.db.flush()

        # 3. Insert Criteria & Performance Levels (order is assigned here, never trusted from the client)
        for crit_idx, crit_data in enumerate(body.criteria):
            crit = RubricCriterion(
                rubric_id=rubric.id,
                title=crit_data.title,
                description=crit_data.description,
                max_marks=crit_data.max_marks,
                order_index=crit_idx + 1,
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
