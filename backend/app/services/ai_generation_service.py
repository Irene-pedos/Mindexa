"""
app/services/ai_generation_service.py

AI Question Generation Service for Mindexa Platform.

Responsibilities:
    - generate_questions_batch()  — Orchestrate AI generation, store results
    - review_ai_question()        — Apply lecturer review decision
    - promote_ai_question()       — Convert approved AI question to Question row
    - get_batch()                 — Load a generation batch
    - list_batches()              — Paginated batch listing

HUMAN OVERSIGHT RULE:
    AI-generated questions NEVER become Question rows without explicit
    lecturer review (decision=approved or decision=edited).
    The service enforces this — there is no bypass path.

GENERATION FLOW:
    1. Lecturer calls POST /ai/generate
    2. Service creates AIGenerationBatch (status=PENDING)
    3. Service calls question_generator.generate_questions() — synchronous for now
       (In production: dispatch to Celery, return batch_id immediately)
    4. For each generated question: store AIGeneratedQuestion row
    5. Update batch status to COMPLETED
    6. Return batch detail for lecturer review

REVIEW FLOW:
    1. Lecturer calls POST /ai/review/{ai_question_id}
    2. Service validates: AI question exists, is pending, parsed successfully
    3. Creates AIQuestionReview row
    4. If decision=approved or edited: promotes to Question table
    5. Sets promoted_question_id on AIGeneratedQuestion
    6. Returns review + promoted question (if applicable)
"""

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import UserRole
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.db.enums import AIBatchStatus, AIQuestionDecision
from app.db.models.auth import User
from app.db.repositories.ai_generation_repo import AIGenerationRepository
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.question_repo import QuestionRepository
from app.schemas.ai_generation import (
    AIGenerationBatchDetailResponse,
    AIGenerationBatchListResponse,
    AIGenerationBatchResponse,
    AIQuestionReviewResponse,
    GenerateQuestionsRequest,
    ReviewAIQuestionRequest,
)


class AIGenerationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._repo = AIGenerationRepository(db)
        self._question_repo = QuestionRepository(db)
        self._assessment_repo = AssessmentRepository(db)

    # ─── Generate ─────────────────────────────────────────────────────────────

    async def generate_questions_batch(
        self,
        data: GenerateQuestionsRequest,
        current_user: User,
    ) -> AIGenerationBatchDetailResponse:
        """
        Orchestrate AI question generation for a batch request.

        FLOW:
            1. Validate assessment exists (if assessment_id provided)
            2. Create AIGenerationBatch (PENDING)
            3. Build GenerationContext
            4. Call AI generator (synchronous mock)
            5. Store each generated question
            6. Update batch status
            7. Return full batch detail

        Access: Lecturers and Admins only.
        """
        if current_user.role == UserRole.STUDENT.value:
            raise AuthorizationError(
                "Students cannot access the AI generation service."
            )

        # Validate assessment if linked
        if data.assessment_id:
            assessment = await self._assessment_repo.get_by_id_simple(
                data.assessment_id
            )
            if not assessment:
                raise NotFoundError("Assessment not found.")
            if assessment.draft_is_complete:
                raise ConflictError(
                    "Cannot generate questions for a finalized assessment.",
                    code="ASSESSMENT_FINALIZED",
                )

        # Create batch
        batch = await self._repo.create_batch(
            created_by_id=current_user.id,
            assessment_id=data.assessment_id,
            question_type=data.question_type,
            difficulty=data.difficulty,
            total_requested=data.count,
            subject=data.subject,
            topic=data.topic,
            bloom_level=data.bloom_level,
            additional_context=data.additional_context,
        )

        # Ensure the batch is flushed to the DB before dispatching Celery.
        await self.db.flush()

        # Dispatch generation to Celery
        from app.workers.tasks import process_ai_generation_batch
        try:
            process_ai_generation_batch.delay(batch_id=str(batch.id))
        except Exception as exc:
            await self._repo.update_batch_status(
                batch_id=batch.id,
                status=AIBatchStatus.FAILED.value,
                error_message=str(exc),
                completed_at=datetime.now(UTC),
            )
            raise

        # Return the pending batch detail
        # Note: generated_questions will be empty at this point
        full_batch = await self._repo.get_batch_by_id(batch.id)
        return AIGenerationBatchDetailResponse.model_validate(full_batch)

    # ─── Review ───────────────────────────────────────────────────────────────

    async def review_ai_question(
        self,
        ai_question_id: uuid.UUID,
        data: ReviewAIQuestionRequest,
        current_user: User,
    ) -> tuple[AIQuestionReviewResponse, dict | None]:
        """
        Apply a lecturer review decision to an AI-generated question.

        FLOW:
            1. Load AI question (must exist, must be pending)
            2. Validate caller is the batch creator or admin
            3. Create AIQuestionReview row
            4. If approved or edited: promote to Question table
            5. Update AI question review_status + promoted_question_id
            6. If add_to_assessment_id: add promoted question to assessment
            7. Return (review_response, promoted_question or None)

        Raises:
            NotFoundError: AI question not found.
            ConflictError: Question has already been reviewed.
            ValidationError: Edited but no modified_question_text provided.
        """
        if current_user.role == UserRole.STUDENT.value:
            raise AuthorizationError(
                "Students cannot review AI-generated questions."
            )

        ai_question = await self._repo.get_generated_question(ai_question_id)
        if not ai_question:
            raise NotFoundError("AI-generated question not found.")

        if ai_question.review_status != AIQuestionDecision.PENDING:
            raise ConflictError(
                f"This question has already been reviewed (decision: {ai_question.review_status}).",
                code="ALREADY_REVIEWED",
            )

        # Validate edited decision has modified text
        if data.decision == AIQuestionDecision.EDITED:
            if not data.modified_question_text:
                raise ValidationError(
                    "modified_question_text is required when decision is 'edited'.",
                    code="MISSING_MODIFIED_CONTENT",
                )

        # Validate the question was parsed successfully before approving
        if data.decision in (AIQuestionDecision.APPROVED, AIQuestionDecision.EDITED):
            if not ai_question.parsed_successfully and not data.modified_question_text:
                raise ValidationError(
                    "This question failed parsing. Provide modified_question_text "
                    "with decision=edited to correct and approve it.",
                    code="UNPARSED_QUESTION",
                )

        # Create review record
        review = await self._repo.create_review(
            ai_question_id=ai_question_id,
            reviewer_id=current_user.id,
            decision=data.decision,
            modified_question_text=data.modified_question_text,
            modified_options_json=data.modified_options_json,
            modified_explanation=data.modified_explanation,
            reviewer_notes=data.reviewer_notes,
        )

        promoted_question = None

        # Promote if approved or edited
        if data.decision in (AIQuestionDecision.APPROVED, AIQuestionDecision.EDITED):
            promoted_question = await self._promote_to_question_bank(
                ai_question=ai_question,
                review_data=data,
                created_by=current_user,
            )

            # Update AI question with promotion reference
            await self._repo.update_generated_question(
                ai_question_id=ai_question_id,
                review_status=data.decision,
                promoted_question_id=promoted_question.id,
            )

            # Optionally add to assessment
            if data.add_to_assessment_id and promoted_question:
                assessment = await self._assessment_repo.get_by_id_simple(
                    data.add_to_assessment_id
                )
                if assessment and not assessment.draft_is_complete:
                    marks = data.marks_if_added or 1
                    existing_count = await self._assessment_repo.count_questions(
                        data.add_to_assessment_id
                    )
                    await self._assessment_repo.add_question(
                        assessment_id=data.add_to_assessment_id,
                        question_id=promoted_question.id,
                        marks_override=marks,
                        order_index=existing_count,
                        added_via="ai_generated",
                    )
        else:
            # Rejected or needs_revision
            await self._repo.update_generated_question(
                ai_question_id=ai_question_id,
                review_status=data.decision,
            )

        review_response = AIQuestionReviewResponse.model_validate(review)
        promoted_dict = None
        if promoted_question:
            promoted_dict = {
                "id": str(promoted_question.id),
                "content": promoted_question.content,
                "question_type": promoted_question.question_type,
            }

        return review_response, promoted_dict

    async def _promote_to_question_bank(
        self,
        ai_question,
        review_data: ReviewAIQuestionRequest,
        created_by: User,
    ):
        """
        Create a real Question row from an approved/edited AI question.

        Uses modified content if provided (edited), otherwise uses parsed content.
        """
        # Determine content to use
        question_text = (
            review_data.modified_question_text
            if review_data.modified_question_text
            else ai_question.parsed_question_text
        )
        explanation = (
            review_data.modified_explanation
            if review_data.modified_explanation is not None
            else ai_question.parsed_explanation
        )
        options_json = (
            review_data.modified_options_json
            if review_data.modified_options_json is not None
            else ai_question.parsed_options_json
        )

        question = await self._question_repo.create(
            content=question_text or "AI generated question",
            question_type=ai_question.question_type,
            difficulty=ai_question.difficulty,
            created_by_id=created_by.id,
            source_type="ai_generated",
            explanation=explanation,
        )

        # Create options if available
        if options_json:
            try:
                options = json.loads(options_json)
                for i, opt in enumerate(options):
                    await self._question_repo.add_option(
                        question_id=question.id,
                        content=opt.get("text", ""),
                        is_correct=bool(opt.get("is_correct", False)),
                        order_index=i,
                    )
            except (json.JSONDecodeError, TypeError, KeyError):
                pass  # Proceed without options if parsing fails

        return question

    # ─── Get / List ───────────────────────────────────────────────────────────

    async def get_batch(
        self,
        batch_id: uuid.UUID,
        current_user: User,
    ) -> AIGenerationBatchDetailResponse:
        batch = await self._repo.get_batch_by_id(batch_id)
        if not batch:
            raise NotFoundError("Generation batch not found.")

        if (
            str(batch.created_by_id) != str(current_user.id)
            and current_user.role != UserRole.ADMIN.value
        ):
            raise AuthorizationError("You do not have access to this batch.")

        return AIGenerationBatchDetailResponse.model_validate(batch)

    async def list_batches(
        self,
        current_user: User,
        page: int = 1,
        page_size: int = 20,
    ) -> AIGenerationBatchListResponse:
        if current_user.role == UserRole.STUDENT.value:
            raise AuthorizationError(
                "Students cannot access AI generation history."
            )

        items, total = await self._repo.list_batches_by_creator(
            created_by_id=current_user.id,
            page=page,
            page_size=page_size,
        )
        return AIGenerationBatchListResponse(
            items=[AIGenerationBatchResponse.model_validate(b) for b in items],
            total=total,
            page=page,
            page_size=page_size,
            has_next=(page * page_size) < total,
        )
