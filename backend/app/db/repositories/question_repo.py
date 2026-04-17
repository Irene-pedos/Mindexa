"""
app/db/repositories/question_repo.py

Repository layer for the Question Bank domain.

Covers all tables defined in app/db/models/question.py:
    Question
    QuestionOption
    QuestionBlank
    AssessmentQuestion        (read-only from here; writes via AssessmentRepository)
    AIQuestionGenerationBatch
    AIQuestionReview
    QuestionBankEntry

DESIGN RULES:
    - Every query on Question filters is_deleted=False by default.
    - is_approved=True check is enforced on all public-facing queries
      (listing questions for lecturers/students always excludes unapproved questions
       unless explicitly requested by admin).
    - Repositories never contain business logic.
    - All methods are async; use SQLModel select() + AsyncSession.
    - selectinload() prevents N+1 queries on relationships.
    - Only flush() here; commit at the service layer.

FIELD MAPPING (model -> repo):

    Question:
        created_by_id, subject_id, question_type, content, explanation,
        marks, difficulty, topic_tag, rubric_id,
        source_type, source_assessment_id, source_ai_batch_id, ai_action_log_id,
        is_approved, approved_by_id, approved_at, is_shared,
        is_in_question_bank, bank_added_at, bank_added_by_id,
        version, parent_question_id,
        is_deleted, deleted_at

    QuestionOption:
        question_id, content, is_correct, match_key, match_value, order_index

    QuestionBlank:
        question_id, blank_index, accepted_answers (JSONB), case_sensitive

    AIQuestionGenerationBatch:
        assessment_id, assessment_section_id, initiated_by_id, ai_action_log_id,
        prompt_used, question_type_requested, difficulty_requested,
        count_requested, count_generated, status, review_completed,
        review_completed_at

    AIQuestionReview:
        batch_id, question_id, ai_action_log_id, candidate_order,
        ai_raw_output (JSONB), lecturer_decision, lecturer_id,
        modification_summary, decided_at, added_to_assessment, added_to_bank

    QuestionBankEntry:
        question_id, added_by_id, subject_id, difficulty, source_type,
        source_assessment_id, times_used, last_used_at, is_active
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from app.db.enums import (AIBatchStatus, AIQuestionDecision, DifficultyLevel,
                          QuestionSourceType, QuestionType)
from app.db.models.question import (AIQuestionGenerationBatch,
                                    AIQuestionReview, AssessmentQuestion,
                                    Question, QuestionBankEntry, QuestionBlank,
                                    QuestionOption)
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# ---------------------------------------------------------------------------
# INTERNAL HELPERS
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# QUESTION REPOSITORY
# ---------------------------------------------------------------------------


class QuestionRepository:
    """
    Data access for the Question aggregate and all related tables.

    Instantiated per-request — pass the AsyncSession from FastAPI DI.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # Question — create
    # -----------------------------------------------------------------------

    async def create(
        self,
        *,
        created_by_id: uuid.UUID,
        question_type: str,
        content: str,
        difficulty: str,
        marks: int = 1,
        source_type: str = QuestionSourceType.MANUAL,
        is_approved: bool = True,
        explanation: Optional[str] = None,
        subject_id: Optional[uuid.UUID] = None,
        topic_tag: Optional[str] = None,
        rubric_id: Optional[uuid.UUID] = None,
        source_assessment_id: Optional[uuid.UUID] = None,
        source_ai_batch_id: Optional[uuid.UUID] = None,
        ai_action_log_id: Optional[uuid.UUID] = None,
        is_shared: bool = False,
        is_in_question_bank: bool = False,
        bank_added_at: Optional[datetime] = None,
        bank_added_by_id: Optional[uuid.UUID] = None,
        version: int = 1,
        parent_question_id: Optional[uuid.UUID] = None,
        approved_by_id: Optional[uuid.UUID] = None,
        approved_at: Optional[datetime] = None,
    ) -> Question:
        """
        Insert a new Question row.

        Defaults:
            source_type     -> MANUAL
            is_approved     -> True  (manual questions are pre-approved)
                               False for AI_GENERATED / IMPORTED (set explicitly)
            version         -> 1
            is_shared       -> False (private to creating lecturer)
            is_in_question_bank -> False (must be explicitly banked)
        """
        question = Question(
            created_by_id=created_by_id,
            question_type=question_type,
            content=content,
            difficulty=difficulty,
            marks=marks,
            source_type=source_type,
            is_approved=is_approved,
            explanation=explanation,
            subject_id=subject_id,
            topic_tag=topic_tag,
            rubric_id=rubric_id,
            source_assessment_id=source_assessment_id,
            source_ai_batch_id=source_ai_batch_id,
            ai_action_log_id=ai_action_log_id,
            is_shared=is_shared,
            is_in_question_bank=is_in_question_bank,
            bank_added_at=bank_added_at,
            bank_added_by_id=bank_added_by_id,
            version=version,
            parent_question_id=parent_question_id,
            approved_by_id=approved_by_id,
            approved_at=approved_at,
        )
        self.db.add(question)
        await self.db.flush()
        return question

    # -----------------------------------------------------------------------
    # Question — reads
    # -----------------------------------------------------------------------

    async def get_by_id(self, question_id: uuid.UUID) -> Optional[Question]:
        """
        Load a Question with options and blanks selectin-loaded.

        Excludes soft-deleted questions. Does NOT filter by is_approved
        (service layer applies that check).
        """
        result = await self.db.execute(
            select(Question)
            .options(
                selectinload(Question.options),
                selectinload(Question.blanks),
                selectinload(Question.bank_entry),
            )
            .where(
                Question.id == question_id,
                Question.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id_simple(
        self, question_id: uuid.UUID
    ) -> Optional[Question]:
        """
        Lightweight load — scalar fields only, no relationships.
        Used for existence / permission checks and field updates.
        """
        result = await self.db.execute(
            select(Question).where(
                Question.id == question_id,
                Question.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def search(
        self,
        *,
        q: Optional[str] = None,
        question_type: Optional[str] = None,
        difficulty: Optional[str] = None,
        subject_id: Optional[uuid.UUID] = None,
        topic_tag: Optional[str] = None,
        source_type: Optional[str] = None,
        created_by_id: Optional[uuid.UUID] = None,
        is_approved: Optional[bool] = True,
        is_in_question_bank: Optional[bool] = None,
        is_shared: Optional[bool] = None,
        include_deleted: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[Question], int]:
        """
        Filtered, paginated question search.

        Filters:
            q             — case-insensitive LIKE search on content
            question_type — exact match on QuestionType enum value
            difficulty    — exact match on DifficultyLevel enum value
            subject_id    — exact UUID match
            topic_tag     — case-insensitive LIKE search
            source_type   — exact match on QuestionSourceType enum value
            created_by_id — filter to one lecturer's questions
            is_approved   — default True (exclude unapproved AI / imported)
            is_in_question_bank — filter by bank membership
            is_shared     — filter by sharing flag
            include_deleted — default False; True for admin audit queries only

        Returns (items, total_count).
        """
        filters = []

        if not include_deleted:
            filters.append(Question.is_deleted == False)  # noqa: E712

        if is_approved is not None:
            filters.append(Question.is_approved == is_approved)

        if question_type is not None:
            filters.append(Question.question_type == question_type)

        if difficulty is not None:
            filters.append(Question.difficulty == difficulty)

        if subject_id is not None:
            filters.append(Question.subject_id == subject_id)

        if topic_tag is not None:
            filters.append(Question.topic_tag.ilike(f"%{topic_tag}%"))

        if source_type is not None:
            filters.append(Question.source_type == source_type)

        if created_by_id is not None:
            filters.append(Question.created_by_id == created_by_id)

        if is_in_question_bank is not None:
            filters.append(Question.is_in_question_bank == is_in_question_bank)

        if is_shared is not None:
            filters.append(Question.is_shared == is_shared)

        if q is not None:
            filters.append(Question.content.ilike(f"%{q}%"))

        count_result = await self.db.execute(
            select(func.count(Question.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(Question)
            .where(*filters)
            .order_by(Question.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def get_versions(
        self, parent_question_id: uuid.UUID
    ) -> List[Question]:
        """
        Return all child versions of a question, ordered oldest first.
        """
        result = await self.db.execute(
            select(Question)
            .where(
                Question.parent_question_id == parent_question_id,
                Question.is_deleted == False,  # noqa: E712
            )
            .order_by(Question.version.asc())
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # Question — updates
    # -----------------------------------------------------------------------

    async def update_fields(
        self, question_id: uuid.UUID, **fields
    ) -> None:
        """Update arbitrary scalar fields on a Question row."""
        await self.db.execute(
            update(Question)
            .where(Question.id == question_id)
            .values(**fields)
        )

    async def approve(
        self,
        question_id: uuid.UUID,
        approved_by_id: uuid.UUID,
    ) -> None:
        """
        Approve an AI-generated or imported question.

        Sets is_approved=True, approved_by_id, approved_at.
        """
        now = _utcnow()
        await self.db.execute(
            update(Question)
            .where(Question.id == question_id)
            .values(
                is_approved=True,
                approved_by_id=approved_by_id,
                approved_at=now,
            )
        )

    async def add_to_bank(
        self,
        question_id: uuid.UUID,
        added_by_id: uuid.UUID,
    ) -> None:
        """
        Mark a question as being in the question bank.

        Also sets bank_added_at and bank_added_by_id.
        A QuestionBankEntry row must be created separately.
        """
        now = _utcnow()
        await self.db.execute(
            update(Question)
            .where(Question.id == question_id)
            .values(
                is_in_question_bank=True,
                bank_added_at=now,
                bank_added_by_id=added_by_id,
            )
        )

    async def soft_delete(self, question_id: uuid.UUID) -> None:
        """
        Soft-delete a question.

        NOTE: This will fail at the DB level (RESTRICT FK) if the question
        is referenced by any AssessmentQuestion row where the assessment has
        been published. The service layer must check this before calling.
        """
        now = _utcnow()
        await self.db.execute(
            update(Question)
            .where(Question.id == question_id)
            .values(is_deleted=True, deleted_at=now, is_approved=False)
        )

    # -----------------------------------------------------------------------
    # QuestionOption — CRUD
    # -----------------------------------------------------------------------

    async def add_option(
        self,
        *,
        question_id: uuid.UUID,
        content: str,
        order_index: int,
        is_correct: Optional[bool] = None,
        match_key: Optional[str] = None,
        match_value: Optional[str] = None,
    ) -> QuestionOption:
        """
        Add an answer option to a question.

        is_correct:
            MCQ / TRUE_FALSE -> True on correct option(s)
            MATCHING / ORDERING -> None (correctness is positional/structural)

        match_key / match_value:
            Only for MATCHING type. match_key is the left-side label,
            match_value is the correct right-side answer.
        """
        option = QuestionOption(
            question_id=question_id,
            content=content,
            order_index=order_index,
            is_correct=is_correct,
            match_key=match_key,
            match_value=match_value,
        )
        self.db.add(option)
        await self.db.flush()
        return option

    async def list_options(self, question_id: uuid.UUID) -> List[QuestionOption]:
        """Return all options for a question ordered by order_index."""
        result = await self.db.execute(
            select(QuestionOption)
            .where(QuestionOption.question_id == question_id)
            .order_by(QuestionOption.order_index)
        )
        return list(result.scalars().all())

    async def delete_all_options(self, question_id: uuid.UUID) -> None:
        """Hard-delete all options for a question (used when replacing options)."""
        await self.db.execute(
            delete(QuestionOption).where(
                QuestionOption.question_id == question_id
            )
        )

    async def update_option(self, option_id: uuid.UUID, **fields) -> None:
        await self.db.execute(
            update(QuestionOption)
            .where(QuestionOption.id == option_id)
            .values(**fields)
        )

    # -----------------------------------------------------------------------
    # QuestionBlank — CRUD
    # -----------------------------------------------------------------------

    async def add_blank(
        self,
        *,
        question_id: uuid.UUID,
        blank_index: int,
        accepted_answers: List[str],
        case_sensitive: bool = False,
    ) -> QuestionBlank:
        """
        Add a blank definition for a FILL_BLANK question.

        blank_index is zero-based and must be unique per question
        (enforced by DB unique constraint).
        """
        blank = QuestionBlank(
            question_id=question_id,
            blank_index=blank_index,
            accepted_answers=accepted_answers,
            case_sensitive=case_sensitive,
        )
        self.db.add(blank)
        await self.db.flush()
        return blank

    async def list_blanks(self, question_id: uuid.UUID) -> List[QuestionBlank]:
        """Return all blanks for a question ordered by blank_index."""
        result = await self.db.execute(
            select(QuestionBlank)
            .where(QuestionBlank.question_id == question_id)
            .order_by(QuestionBlank.blank_index)
        )
        return list(result.scalars().all())

    async def delete_all_blanks(self, question_id: uuid.UUID) -> None:
        """Hard-delete all blanks for a question (used when replacing blanks)."""
        await self.db.execute(
            delete(QuestionBlank).where(
                QuestionBlank.question_id == question_id
            )
        )

    async def update_blank(self, blank_id: uuid.UUID, **fields) -> None:
        await self.db.execute(
            update(QuestionBlank)
            .where(QuestionBlank.id == blank_id)
            .values(**fields)
        )

    # -----------------------------------------------------------------------
    # AIQuestionGenerationBatch — CRUD
    # -----------------------------------------------------------------------

    async def create_batch(
        self,
        *,
        assessment_id: uuid.UUID,
        initiated_by_id: uuid.UUID,
        prompt_used: str,
        count_requested: int,
        assessment_section_id: Optional[uuid.UUID] = None,
        question_type_requested: Optional[str] = None,
        difficulty_requested: Optional[str] = None,
        ai_action_log_id: Optional[uuid.UUID] = None,
    ) -> AIQuestionGenerationBatch:
        """
        Create a new AI question generation batch.

        Initial state:
            status           -> PENDING
            count_generated  -> 0
            review_completed -> False
        """
        batch = AIQuestionGenerationBatch(
            assessment_id=assessment_id,
            assessment_section_id=assessment_section_id,
            initiated_by_id=initiated_by_id,
            ai_action_log_id=ai_action_log_id,
            prompt_used=prompt_used,
            question_type_requested=question_type_requested,
            difficulty_requested=difficulty_requested,
            count_requested=count_requested,
            count_generated=0,
            status=AIBatchStatus.PENDING,
            review_completed=False,
        )
        self.db.add(batch)
        await self.db.flush()
        return batch

    async def get_batch(
        self, batch_id: uuid.UUID
    ) -> Optional[AIQuestionGenerationBatch]:
        """Load a batch with its reviews selectin-loaded."""
        result = await self.db.execute(
            select(AIQuestionGenerationBatch)
            .options(
                selectinload(AIQuestionGenerationBatch.reviews).selectinload(
                    AIQuestionReview.question
                )
            )
            .where(
                AIQuestionGenerationBatch.id == batch_id,
                AIQuestionGenerationBatch.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_batch_simple(
        self, batch_id: uuid.UUID
    ) -> Optional[AIQuestionGenerationBatch]:
        result = await self.db.execute(
            select(AIQuestionGenerationBatch).where(
                AIQuestionGenerationBatch.id == batch_id,
                AIQuestionGenerationBatch.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_batches_for_assessment(
        self, assessment_id: uuid.UUID
    ) -> List[AIQuestionGenerationBatch]:
        result = await self.db.execute(
            select(AIQuestionGenerationBatch)
            .where(
                AIQuestionGenerationBatch.assessment_id == assessment_id,
                AIQuestionGenerationBatch.is_deleted == False,  # noqa: E712
            )
            .order_by(AIQuestionGenerationBatch.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_batches_by_initiator(
        self,
        initiated_by_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[AIQuestionGenerationBatch], int]:
        filters = [
            AIQuestionGenerationBatch.initiated_by_id == initiated_by_id,
            AIQuestionGenerationBatch.is_deleted == False,  # noqa: E712
        ]
        count_result = await self.db.execute(
            select(func.count(AIQuestionGenerationBatch.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(AIQuestionGenerationBatch)
            .where(*filters)
            .order_by(AIQuestionGenerationBatch.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def update_batch(
        self, batch_id: uuid.UUID, **fields
    ) -> None:
        """Update scalar fields on a batch row (status, count_generated, etc.)."""
        await self.db.execute(
            update(AIQuestionGenerationBatch)
            .where(AIQuestionGenerationBatch.id == batch_id)
            .values(**fields)
        )

    async def mark_batch_review_complete(
        self, batch_id: uuid.UUID
    ) -> None:
        """
        Set review_completed=True and review_completed_at=now.

        Called when all candidates in the batch have a non-PENDING decision.
        """
        now = _utcnow()
        await self.db.execute(
            update(AIQuestionGenerationBatch)
            .where(AIQuestionGenerationBatch.id == batch_id)
            .values(review_completed=True, review_completed_at=now)
        )

    async def count_pending_reviews_in_batch(
        self, batch_id: uuid.UUID
    ) -> int:
        """
        Count AIQuestionReview rows still in PENDING state for a batch.
        Used to determine when review_completed should be set to True.
        """
        result = await self.db.execute(
            select(func.count(AIQuestionReview.id)).where(
                AIQuestionReview.batch_id == batch_id,
                AIQuestionReview.lecturer_decision == AIQuestionDecision.PENDING,
                AIQuestionReview.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one()

    # -----------------------------------------------------------------------
    # AIQuestionReview — CRUD
    # -----------------------------------------------------------------------

    async def create_review(
        self,
        *,
        batch_id: uuid.UUID,
        question_id: uuid.UUID,
        candidate_order: int,
        ai_raw_output: dict,
        ai_action_log_id: Optional[uuid.UUID] = None,
    ) -> AIQuestionReview:
        """
        Create an AIQuestionReview row for a generated candidate.

        Initial state:
            lecturer_decision -> PENDING
            added_to_assessment -> False
            added_to_bank -> False
        """
        review = AIQuestionReview(
            batch_id=batch_id,
            question_id=question_id,
            candidate_order=candidate_order,
            ai_raw_output=ai_raw_output,
            ai_action_log_id=ai_action_log_id,
            lecturer_decision=AIQuestionDecision.PENDING,
            added_to_assessment=False,
            added_to_bank=False,
        )
        self.db.add(review)
        await self.db.flush()
        return review

    async def get_review(
        self, review_id: uuid.UUID
    ) -> Optional[AIQuestionReview]:
        result = await self.db.execute(
            select(AIQuestionReview)
            .options(selectinload(AIQuestionReview.question))
            .where(
                AIQuestionReview.id == review_id,
                AIQuestionReview.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_review_for_question(
        self, batch_id: uuid.UUID, question_id: uuid.UUID
    ) -> Optional[AIQuestionReview]:
        """
        Fetch the unique review row for a (batch, question) pair.
        Enforced unique by DB constraint uq_ai_question_review_batch_question.
        """
        result = await self.db.execute(
            select(AIQuestionReview).where(
                AIQuestionReview.batch_id == batch_id,
                AIQuestionReview.question_id == question_id,
                AIQuestionReview.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_reviews_for_batch(
        self,
        batch_id: uuid.UUID,
        decision_filter: Optional[str] = None,
    ) -> List[AIQuestionReview]:
        """
        Return all reviews for a batch, ordered by candidate_order.

        decision_filter: if provided, only return reviews with that decision.
        """
        filters = [
            AIQuestionReview.batch_id == batch_id,
            AIQuestionReview.is_deleted == False,  # noqa: E712
        ]
        if decision_filter:
            filters.append(AIQuestionReview.lecturer_decision == decision_filter)

        result = await self.db.execute(
            select(AIQuestionReview)
            .options(selectinload(AIQuestionReview.question))
            .where(*filters)
            .order_by(AIQuestionReview.candidate_order)
        )
        return list(result.scalars().all())

    async def update_review(
        self, review_id: uuid.UUID, **fields
    ) -> None:
        """
        Update fields on an AIQuestionReview row.

        Used to record the lecturer's decision:
            lecturer_decision, lecturer_id, decided_at,
            modification_summary, added_to_assessment, added_to_bank
        """
        await self.db.execute(
            update(AIQuestionReview)
            .where(AIQuestionReview.id == review_id)
            .values(**fields)
        )

    async def record_decision(
        self,
        review_id: uuid.UUID,
        lecturer_id: uuid.UUID,
        decision: str,
        modification_summary: Optional[str] = None,
        added_to_assessment: bool = False,
        added_to_bank: bool = False,
    ) -> None:
        """
        Convenience method to stamp a lecturer decision on a review.

        Sets:
            lecturer_decision, lecturer_id, decided_at,
            modification_summary, added_to_assessment, added_to_bank
        """
        now = _utcnow()
        await self.db.execute(
            update(AIQuestionReview)
            .where(AIQuestionReview.id == review_id)
            .values(
                lecturer_decision=decision,
                lecturer_id=lecturer_id,
                decided_at=now,
                modification_summary=modification_summary,
                added_to_assessment=added_to_assessment,
                added_to_bank=added_to_bank,
            )
        )

    # -----------------------------------------------------------------------
    # QuestionBankEntry — CRUD
    # -----------------------------------------------------------------------

    async def create_bank_entry(
        self,
        *,
        question_id: uuid.UUID,
        added_by_id: uuid.UUID,
        subject_id: Optional[uuid.UUID] = None,
        difficulty: Optional[str] = None,
        source_type: str = QuestionSourceType.MANUAL,
        source_assessment_id: Optional[uuid.UUID] = None,
    ) -> QuestionBankEntry:
        """
        Add a question to a lecturer's question bank.

        Denormalised fields (subject_id, difficulty, source_type) are
        copied from the question at entry creation time for fast filtering.
        """
        entry = QuestionBankEntry(
            question_id=question_id,
            added_by_id=added_by_id,
            subject_id=subject_id,
            difficulty=difficulty,
            source_type=source_type,
            source_assessment_id=source_assessment_id,
            times_used=0,
            is_active=True,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def get_bank_entry(
        self, question_id: uuid.UUID, added_by_id: uuid.UUID
    ) -> Optional[QuestionBankEntry]:
        """
        Load the bank entry for a specific (question, lecturer) pair.
        Unique per the DB constraint uq_question_bank_entry_question_lecturer.
        """
        result = await self.db.execute(
            select(QuestionBankEntry).where(
                QuestionBankEntry.question_id == question_id,
                QuestionBankEntry.added_by_id == added_by_id,
                QuestionBankEntry.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_bank_entry_by_id(
        self, entry_id: uuid.UUID
    ) -> Optional[QuestionBankEntry]:
        result = await self.db.execute(
            select(QuestionBankEntry).where(
                QuestionBankEntry.id == entry_id,
                QuestionBankEntry.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_bank_entries(
        self,
        *,
        added_by_id: uuid.UUID,
        subject_id: Optional[uuid.UUID] = None,
        difficulty: Optional[str] = None,
        source_type: Optional[str] = None,
        is_active: bool = True,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[QuestionBankEntry], int]:
        """
        Paginated listing of a lecturer's question bank.

        Filtering is performed on the denormalised columns (subject_id,
        difficulty, source_type) for query efficiency — no JOIN to question
        required for the common bank browsing case.
        """
        filters = [
            QuestionBankEntry.added_by_id == added_by_id,
            QuestionBankEntry.is_deleted == False,  # noqa: E712
        ]
        if is_active is not None:
            filters.append(QuestionBankEntry.is_active == is_active)
        if subject_id is not None:
            filters.append(QuestionBankEntry.subject_id == subject_id)
        if difficulty is not None:
            filters.append(QuestionBankEntry.difficulty == difficulty)
        if source_type is not None:
            filters.append(QuestionBankEntry.source_type == source_type)

        count_result = await self.db.execute(
            select(func.count(QuestionBankEntry.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(QuestionBankEntry)
            .options(selectinload(QuestionBankEntry.question))
            .where(*filters)
            .order_by(QuestionBankEntry.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def bank_entry_exists(
        self, question_id: uuid.UUID, added_by_id: uuid.UUID
    ) -> bool:
        """Return True if the question is already in this lecturer's bank."""
        result = await self.db.execute(
            select(QuestionBankEntry.id).where(
                QuestionBankEntry.question_id == question_id,
                QuestionBankEntry.added_by_id == added_by_id,
                QuestionBankEntry.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none() is not None

    async def increment_times_used(
        self, question_id: uuid.UUID, added_by_id: uuid.UUID
    ) -> None:
        """
        Increment times_used on a bank entry and stamp last_used_at.

        Called when a question is included in a newly published assessment.
        """
        now = _utcnow()
        await self.db.execute(
            update(QuestionBankEntry)
            .where(
                QuestionBankEntry.question_id == question_id,
                QuestionBankEntry.added_by_id == added_by_id,
            )
            .values(
                times_used=QuestionBankEntry.times_used + 1,
                last_used_at=now,
            )
        )

    async def deactivate_bank_entry(
        self, question_id: uuid.UUID, added_by_id: uuid.UUID
    ) -> None:
        """
        Set is_active=False on a bank entry.

        The entry and question still exist but the question no longer
        appears in the bank UI. Different from soft-delete.
        """
        await self.db.execute(
            update(QuestionBankEntry)
            .where(
                QuestionBankEntry.question_id == question_id,
                QuestionBankEntry.added_by_id == added_by_id,
            )
            .values(is_active=False)
        )

    async def soft_delete_bank_entry(
        self, question_id: uuid.UUID, added_by_id: uuid.UUID
    ) -> None:
        now = _utcnow()
        await self.db.execute(
            update(QuestionBankEntry)
            .where(
                QuestionBankEntry.question_id == question_id,
                QuestionBankEntry.added_by_id == added_by_id,
            )
            .values(is_deleted=True, deleted_at=now, is_active=False)
        )

    async def update_bank_entry_denormalised(
        self,
        question_id: uuid.UUID,
        added_by_id: uuid.UUID,
        *,
        subject_id: Optional[uuid.UUID] = None,
        difficulty: Optional[str] = None,
        source_type: Optional[str] = None,
    ) -> None:
        """
        Sync denormalised fields on the bank entry after the parent
        question is modified. Only updates provided (non-None) fields.
        """
        fields: dict = {}
        if subject_id is not None:
            fields["subject_id"] = subject_id
        if difficulty is not None:
            fields["difficulty"] = difficulty
        if source_type is not None:
            fields["source_type"] = source_type
        if not fields:
            return
        await self.db.execute(
            update(QuestionBankEntry)
            .where(
                QuestionBankEntry.question_id == question_id,
                QuestionBankEntry.added_by_id == added_by_id,
            )
            .values(**fields)
        )
