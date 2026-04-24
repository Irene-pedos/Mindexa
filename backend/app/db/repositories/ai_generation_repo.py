"""
app/db/repositories/ai_generation_repo.py

Repository for AI Generation data access.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.db.enums import AIBatchStatus, AIQuestionDecision
from app.db.models.question import AIGeneratedQuestion, AIGenerationBatch, AIQuestionReview


class AIGenerationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Batch ─────────────────────────────────────────────────────────────────

    async def create_batch(
        self,
        created_by_id: uuid.UUID,
        question_type: str,
        difficulty: str,
        total_requested: int,
        assessment_id: uuid.UUID | None = None,
        subject: str | None = None,
        topic: str | None = None,
        bloom_level: str | None = None,
        full_prompt: str | None = None,
        additional_context: str | None = None,
    ) -> AIGenerationBatch:
        batch = AIGenerationBatch(
            created_by_id=created_by_id,
            assessment_id=assessment_id,
            question_type=question_type,
            difficulty=difficulty,
            total_requested=total_requested,
            subject=subject,
            topic=topic,
            bloom_level=bloom_level,
            full_prompt=full_prompt,
            additional_context=additional_context,
            status=AIBatchStatus.PENDING,
            total_generated=0,
            total_failed=0,
        )
        self.db.add(batch)
        await self.db.flush()
        return batch

    async def get_batch_by_id(
        self, batch_id: uuid.UUID
    ) -> AIGenerationBatch | None:
        result = await self.db.execute(
            select(AIGenerationBatch)
            .where(col(AIGenerationBatch.id) == batch_id)
        )
        return result.scalar_one_or_none()

    async def list_batches_by_creator(
        self,
        created_by_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AIGenerationBatch], int]:
        count_q = await self.db.execute(
            select(func.count(col(AIGenerationBatch.id))).where(
                col(AIGenerationBatch.created_by_id) == created_by_id
            )
        )
        total = int(count_q.scalar_one() or 0)
        result = await self.db.execute(
            select(AIGenerationBatch)
            .where(col(AIGenerationBatch.created_by_id) == created_by_id)
            .order_by(col(AIGenerationBatch.created_at).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def update_batch_status(
        self,
        batch_id: uuid.UUID,
        status: str,
        total_generated: int | None = None,
        total_failed: int | None = None,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
        error_message: str | None = None,
        ai_model_used: str | None = None,
        ai_provider: str | None = None,
        total_tokens_used: int | None = None,
    ) -> None:
        values: dict[str, Any] = {"status": status}
        if total_generated is not None:
            values["total_generated"] = total_generated
        if total_failed is not None:
            values["total_failed"] = total_failed
        if started_at is not None:
            values["started_at"] = started_at
        if completed_at is not None:
            values["completed_at"] = completed_at
        if error_message is not None:
            values["error_message"] = error_message
        if ai_model_used is not None:
            values["ai_model_used"] = ai_model_used
        if ai_provider is not None:
            values["ai_provider"] = ai_provider
        if total_tokens_used is not None:
            values["total_tokens_used"] = total_tokens_used
        await self.db.execute(
            update(AIGenerationBatch)
            .where(col(AIGenerationBatch.id) == batch_id)
            .values(**values)
        )

    # ── Generated Question ────────────────────────────────────────────────────

    async def create_generated_question(
        self,
        batch_id: uuid.UUID,
        generated_content: str,
        question_type: str,
        difficulty: str,
        raw_prompt: str | None = None,
        parsed_successfully: bool = False,
        parsed_question_text: str | None = None,
        parsed_options_json: str | None = None,
        parsed_explanation: str | None = None,
        parse_error: str | None = None,
    ) -> AIGeneratedQuestion:
        q = AIGeneratedQuestion(
            batch_id=batch_id,
            generated_content=generated_content,
            question_type=question_type,
            difficulty=difficulty,
            raw_prompt=raw_prompt,
            parsed_successfully=parsed_successfully,
            parsed_question_text=parsed_question_text,
            parsed_options_json=parsed_options_json,
            parsed_explanation=parsed_explanation,
            parse_error=parse_error,
            review_status=AIQuestionDecision.PENDING,
        )
        self.db.add(q)
        await self.db.flush()
        return q

    async def get_generated_question(
        self, ai_question_id: uuid.UUID
    ) -> AIGeneratedQuestion | None:
        result = await self.db.execute(
            select(AIGeneratedQuestion)
            .where(col(AIGeneratedQuestion.id) == ai_question_id)
        )
        return result.scalar_one_or_none()

    async def update_generated_question(
        self, ai_question_id: uuid.UUID, **fields: Any
    ) -> None:
        await self.db.execute(
            update(AIGeneratedQuestion)
            .where(col(AIGeneratedQuestion.id) == ai_question_id)
            .values(**fields)
        )

    async def list_pending_for_batch(
        self, batch_id: uuid.UUID
    ) -> list[AIGeneratedQuestion]:
        result = await self.db.execute(
            select(AIGeneratedQuestion).where(
                and_(
                    col(AIGeneratedQuestion.batch_id) == batch_id,
                    col(AIGeneratedQuestion.review_status) == AIQuestionDecision.PENDING,
                    col(AIGeneratedQuestion.parsed_successfully).is_(True),
                )
            )
        )
        return list(result.scalars().all())

    # ── Review ────────────────────────────────────────────────────────────────

    async def create_review(
        self,
        ai_question_id: uuid.UUID,
        reviewer_id: uuid.UUID,
        decision: str,
        modified_question_text: str | None = None,
        modified_options_json: str | None = None,
        modified_explanation: str | None = None,
        reviewer_notes: str | None = None,
    ) -> AIQuestionReview:
        now = datetime.now(tz=UTC)
        review = AIQuestionReview(
            ai_question_id=ai_question_id,
            reviewer_id=reviewer_id,
            decision=decision,
            modified_question_text=modified_question_text,
            modified_options_json=modified_options_json,
            modified_explanation=modified_explanation,
            reviewer_notes=reviewer_notes,
            reviewed_at=now,
        )
        self.db.add(review)
        await self.db.flush()
        return review
