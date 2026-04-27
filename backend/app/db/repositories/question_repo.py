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
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from app.db.enums import (
    AIBatchStatus,
    AIQuestionDecision,
    DifficultyLevel,
    QuestionSourceType,
    QuestionType,
)
from app.db.models.question import (
    AIGenerationBatch,
    AIQuestionReview,
    Question,
    QuestionBankEntry,
    QuestionBlank,
    QuestionOption,
)

# ---------------------------------------------------------------------------
# INTERNAL HELPERS
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(UTC)


def _escape_like(value: str) -> str:
    """
    Escape special LIKE metacharacters so they are treated literally.

    Escapes: %, _, \
    """
    value = value.replace("\\", "\\\\")
    value = value.replace("%", "\\%")
    value = value.replace("_", "\\_")
    return value


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
        explanation: str | None = None,
        subject_id: uuid.UUID | None = None,
        topic_tag: str | None = None,
        rubric_id: uuid.UUID | None = None,
        source_assessment_id: uuid.UUID | None = None,
        source_ai_batch_id: uuid.UUID | None = None,
        ai_action_log_id: uuid.UUID | None = None,
        is_shared: bool = False,
        is_in_question_bank: bool = False,
        bank_added_at: datetime | None = None,
        bank_added_by_id: uuid.UUID | None = None,
        version: int = 1,
        parent_question_id: uuid.UUID | None = None,
        approved_by_id: uuid.UUID | None = None,
        approved_at: datetime | None = None,
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
            question_type=QuestionType(question_type),
            content=content,
            difficulty=DifficultyLevel(difficulty),
            marks=marks,
            source_type=QuestionSourceType(source_type),
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

    async def get_by_id(self, question_id: uuid.UUID) -> Question | None:
        """
        Load a Question.

        Excludes soft-deleted questions. Does NOT filter by is_approved
        (service layer applies that check).
        """
        result = await self.db.execute(
            select(Question)
            .where(
                col(Question.id) == question_id,
                col(Question.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id_simple(
        self, question_id: uuid.UUID
    ) -> Question | None:
        """
        Lightweight load — scalar fields only, no relationships.
        Used for existence / permission checks and field updates.
        """
        result = await self.db.execute(
            select(Question).where(
                col(Question.id) == question_id,
                col(Question.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def search(
        self,
        *,
        q: str | None = None,
        question_type: str | None = None,
        difficulty: str | None = None,
        subject_id: uuid.UUID | None = None,
        topic_tag: str | None = None,
        source_type: str | None = None,
        created_by_id: uuid.UUID | None = None,
        is_approved: bool | None = True,
        is_in_question_bank: bool | None = None,
        is_shared: bool | None = None,
        include_deleted: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Question], int]:
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
            filters.append(col(Question.is_deleted) == False)  # noqa: E712

        if is_approved is not None:
            filters.append(col(Question.is_approved) == is_approved)

        if question_type is not None:
            filters.append(col(Question.question_type) == question_type)

        if difficulty is not None:
            filters.append(col(Question.difficulty) == difficulty)

        if subject_id is not None:
            filters.append(col(Question.subject_id) == subject_id)

        if topic_tag is not None:
            escaped_tag = _escape_like(topic_tag)
            filters.append(col(Question.topic_tag).ilike(f"%{escaped_tag}%", escape="\\"))

        if source_type is not None:
            filters.append(col(Question.source_type) == source_type)

        if created_by_id is not None:
            filters.append(col(Question.created_by_id) == created_by_id)

        if is_in_question_bank is not None:
            filters.append(col(Question.is_in_question_bank) == is_in_question_bank)

        if is_shared is not None:
            filters.append(col(Question.is_shared) == is_shared)

        if q is not None:
            escaped_q = _escape_like(q)
            filters.append(col(Question.content).ilike(f"%{escaped_q}%", escape="\\"))

        count_result = await self.db.execute(
            select(func.count(col(Question.id))).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(Question)
            .where(*filters)
            .order_by(col(Question.created_at).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def get_versions(
        self, parent_question_id: uuid.UUID
    ) -> list[Question]:
        """
        Return all child versions of a question, ordered oldest first.
        """
        result = await self.db.execute(
            select(Question)
            .where(
                col(Question.parent_question_id) == parent_question_id,
                col(Question.is_deleted) == False,  # noqa: E712
            )
            .order_by(col(Question.version).asc())
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
            .where(col(Question.id) == question_id)
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
            .where(col(Question.id) == question_id)
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
            .where(col(Question.id) == question_id)
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
            .where(col(Question.id) == question_id)
            .values(is_deleted=True, deleted_at=now, is_approved=False)
        )

    async def archive(self, question_id: uuid.UUID) -> None:
        """
        Archive a question (set is_active=False).
        Used when creating a new version.
        """
        await self.db.execute(
            update(Question)
            .where(col(Question.id) == question_id)
            .values(is_active=False)
        )

    async def list_tags(self) -> list[str]:
        """
        List all unique topic_tags currently in use.
        """
        result = await self.db.execute(
            select(col(Question.topic_tag))
            .where(col(Question.topic_tag).isnot(None), col(Question.is_deleted) == False)
            .distinct()
        )
        return [row[0] for row in result.fetchall()]

    # -----------------------------------------------------------------------
    # QuestionOption — CRUD
    # -----------------------------------------------------------------------

    async def add_option(
        self,
        *,
        question_id: uuid.UUID,
        content: str,
        order_index: int,
        is_correct: bool | None = None,
        match_key: str | None = None,
        match_value: str | None = None,
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

    async def list_options(self, question_id: uuid.UUID) -> list[QuestionOption]:
        """Return all options for a question ordered by order_index."""
        result = await self.db.execute(
            select(QuestionOption)
            .where(col(QuestionOption.question_id) == question_id)
            .order_by(col(QuestionOption.order_index))
        )
        return list(result.scalars().all())

    async def delete_all_options(self, question_id: uuid.UUID) -> None:
        """Hard-delete all options for a question (used when replacing options)."""
        await self.db.execute(
            delete(QuestionOption).where(
                col(QuestionOption.question_id) == question_id
            )
        )

    async def update_option(self, option_id: uuid.UUID, **fields) -> None:
        await self.db.execute(
            update(QuestionOption)
            .where(col(QuestionOption.id) == option_id)
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
        accepted_answers: list[str],
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

    async def list_blanks(self, question_id: uuid.UUID) -> list[QuestionBlank]:
        """Return all blanks for a question ordered by blank_index."""
        result = await self.db.execute(
            select(QuestionBlank)
            .where(col(QuestionBlank.question_id) == question_id)
            .order_by(col(QuestionBlank.blank_index))
        )
        return list(result.scalars().all())

    async def delete_all_blanks(self, question_id: uuid.UUID) -> None:
        """Hard-delete all blanks for a question (used when replacing blanks)."""
        await self.db.execute(
            delete(QuestionBlank).where(
                col(QuestionBlank.question_id) == question_id
            )
        )

    async def update_blank(self, blank_id: uuid.UUID, **fields) -> None:
        await self.db.execute(
            update(QuestionBlank)
            .where(col(QuestionBlank.id) == blank_id)
            .values(**fields)
        )

    # -----------------------------------------------------------------------
    # AIGenerationBatch — CRUD
    # -----------------------------------------------------------------------

    async def create_batch(
        self,
        *,
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
        """
        Create a new AI question generation batch.

        Initial state:
            status           -> PENDING
            total_generated  -> 0
            total_failed     -> 0
        """
        batch = AIGenerationBatch(
            created_by_id=created_by_id,
            question_type=question_type,
            difficulty=difficulty,
            total_requested=total_requested,
            assessment_id=assessment_id,
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

    async def get_batch(
        self, batch_id: uuid.UUID
    ) -> AIGenerationBatch | None:
        """Load a batch."""
        result = await self.db.execute(
            select(AIGenerationBatch)
            .where(
                col(AIGenerationBatch.id) == batch_id,
                col(AIGenerationBatch.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_batch_simple(
        self, batch_id: uuid.UUID
    ) -> AIGenerationBatch | None:
        result = await self.db.execute(
            select(AIGenerationBatch).where(
                col(AIGenerationBatch.id) == batch_id,
                col(AIGenerationBatch.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_batches_for_assessment(
        self, assessment_id: uuid.UUID, page: int = 1, page_size: int = 20
    ) -> list[AIGenerationBatch]:
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 20

        offset = (page - 1) * page_size
        result = await self.db.execute(
            select(AIGenerationBatch)
            .where(
                col(AIGenerationBatch.assessment_id) == assessment_id,
                col(AIGenerationBatch.is_deleted) == False,  # noqa: E712
            )
            .order_by(col(AIGenerationBatch.created_at).desc())
            .limit(page_size)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def list_batches_by_creator(
        self,
        created_by_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AIGenerationBatch], int]:
        filters = [
            col(AIGenerationBatch.created_by_id) == created_by_id,
            col(AIGenerationBatch.is_deleted) == False,  # noqa: E712
        ]
        count_result = await self.db.execute(
            select(func.count(col(AIGenerationBatch.id))).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(AIGenerationBatch)
            .where(*filters)
            .order_by(col(AIGenerationBatch.created_at).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def update_batch(
        self, batch_id: uuid.UUID, **fields
    ) -> None:
        """Update scalar fields on a batch row (status, total_generated, etc.)."""
        await self.db.execute(
            update(AIGenerationBatch)
            .where(col(AIGenerationBatch.id) == batch_id)
            .values(**fields)
        )

    async def mark_batch_completed(
        self, batch_id: uuid.UUID
    ) -> None:
        """
        Set completed_at=now when batch is finished.
        """
        now = _utcnow()
        await self.db.execute(
            update(AIGenerationBatch)
            .where(col(AIGenerationBatch.id) == batch_id)
            .values(completed_at=now)
        )

    async def count_pending_reviews_for_batch(
        self, batch_id: uuid.UUID
    ) -> int:
        """
        Count AIGeneratedQuestion rows still pending review for a batch.
        """
        from app.db.models.question import AIGeneratedQuestion
        result = await self.db.execute(
            select(func.count(col(AIGeneratedQuestion.id))).where(
                col(AIGeneratedQuestion.batch_id) == batch_id,
                col(AIGeneratedQuestion.review_status) == AIQuestionDecision.PENDING,
                col(AIGeneratedQuestion.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one()

    # -----------------------------------------------------------------------
    # AIQuestionReview — CRUD
    # -----------------------------------------------------------------------

    async def create_review(
        self,
        *,
        ai_question_id: uuid.UUID,
        reviewer_id: uuid.UUID,
        decision: str = AIQuestionDecision.PENDING,
        modified_question_text: str | None = None,
        modified_options_json: str | None = None,
        modified_explanation: str | None = None,
        reviewer_notes: str | None = None,
    ) -> AIQuestionReview:
        """
        Create an AIQuestionReview row for a generated question.

        Initial state:
            decision -> PENDING (or provided decision)
            reviewed_at -> current time
        """
        review = AIQuestionReview(
            ai_question_id=ai_question_id,
            reviewer_id=reviewer_id,
            decision=decision,
            modified_question_text=modified_question_text,
            modified_options_json=modified_options_json,
            modified_explanation=modified_explanation,
            reviewer_notes=reviewer_notes,
            reviewed_at=_utcnow(),
        )
        self.db.add(review)
        await self.db.flush()
        return review

    async def get_review(
        self, review_id: uuid.UUID
    ) -> AIQuestionReview | None:
        result = await self.db.execute(
            select(AIQuestionReview)
            .where(
                col(AIQuestionReview.id) == review_id,
                col(AIQuestionReview.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_review_by_ai_question(
        self, ai_question_id: uuid.UUID
    ) -> AIQuestionReview | None:
        """
        Fetch the review row for an AI-generated question.
        """
        result = await self.db.execute(
            select(AIQuestionReview).where(
                col(AIQuestionReview.ai_question_id) == ai_question_id,
                col(AIQuestionReview.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_reviews_for_batch(
        self,
        batch_id: uuid.UUID,
        decision_filter: str | None = None,
    ) -> list[AIQuestionReview]:
        """
        Return all reviews for a batch.

        decision_filter: if provided, only return reviews with that decision.
        """
        from app.db.models.question import AIGeneratedQuestion
        filters = [
            col(AIGeneratedQuestion.batch_id) == batch_id,
            col(AIGeneratedQuestion.is_deleted) == False,  # noqa: E712
            col(AIQuestionReview.is_deleted) == False,  # noqa: E712
        ]
        if decision_filter:
            filters.append(col(AIGeneratedQuestion.review_status) == decision_filter)

        result = await self.db.execute(
            select(AIQuestionReview)
            .join(AIGeneratedQuestion)
            .where(*filters)
        )
        return list(result.scalars().all())

    async def update_review(
        self, review_id: uuid.UUID, **fields
    ) -> None:
        """
        Update fields on an AIQuestionReview row.

        Used to record reviewer's modifications and decisions:
            decision, modified_question_text, modified_options_json,
            modified_explanation, reviewer_notes
        """
        await self.db.execute(
            update(AIQuestionReview)
            .where(col(AIQuestionReview.id) == review_id)
            .values(**fields)
        )

    async def record_decision(
        self,
        review_id: uuid.UUID,
        decision: str,
        modified_question_text: str | None = None,
        modified_options_json: str | None = None,
        modified_explanation: str | None = None,
        reviewer_notes: str | None = None,
    ) -> None:
        """
        Convenience method to stamp a reviewer's decision on a review.

        Sets:
            decision, modified_question_text, modified_options_json,
            modified_explanation, reviewer_notes, reviewed_at (now)
        """
        now = _utcnow()
        await self.db.execute(
            update(AIQuestionReview)
            .where(col(AIQuestionReview.id) == review_id)
            .values(
                decision=decision,
                modified_question_text=modified_question_text,
                modified_options_json=modified_options_json,
                modified_explanation=modified_explanation,
                reviewer_notes=reviewer_notes,
                reviewed_at=now,
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
        subject_id: uuid.UUID | None = None,
        difficulty: str | None = None,
        source_type: str = QuestionSourceType.MANUAL,
        source_assessment_id: uuid.UUID | None = None,
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
            difficulty=DifficultyLevel(difficulty) if difficulty else None,
            source_type=QuestionSourceType(source_type),
            source_assessment_id=source_assessment_id,
            times_used=0,
            is_active=True,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def get_bank_entry(
        self, question_id: uuid.UUID, added_by_id: uuid.UUID
    ) -> QuestionBankEntry | None:
        """
        Load the bank entry for a specific (question, lecturer) pair.
        Unique per the DB constraint uq_question_bank_entry_question_lecturer.
        """
        result = await self.db.execute(
            select(QuestionBankEntry).where(
                col(QuestionBankEntry.question_id) == question_id,
                col(QuestionBankEntry.added_by_id) == added_by_id,
                col(QuestionBankEntry.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_bank_entry_by_id(
        self, entry_id: uuid.UUID
    ) -> QuestionBankEntry | None:
        result = await self.db.execute(
            select(QuestionBankEntry).where(
                col(QuestionBankEntry.id) == entry_id,
                col(QuestionBankEntry.is_deleted) == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_bank_entries(
        self,
        *,
        added_by_id: uuid.UUID,
        subject_id: uuid.UUID | None = None,
        difficulty: str | None = None,
        source_type: str | None = None,
        is_active: bool = True,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[QuestionBankEntry], int]:
        """
        Paginated listing of a lecturer's question bank.

        Filtering is performed on the denormalised columns (subject_id,
        difficulty, source_type) for query efficiency — no JOIN to question
        required for the common bank browsing case.
        """
        filters = [
            col(QuestionBankEntry.added_by_id) == added_by_id,
            col(QuestionBankEntry.is_deleted) == False,  # noqa: E712
        ]
        if is_active is not None:
            filters.append(col(QuestionBankEntry.is_active) == is_active)
        if subject_id is not None:
            filters.append(col(QuestionBankEntry.subject_id) == subject_id)
        if difficulty is not None:
            filters.append(col(QuestionBankEntry.difficulty) == difficulty)
        if source_type is not None:
            filters.append(col(QuestionBankEntry.source_type) == source_type)

        count_result = await self.db.execute(
            select(func.count(col(QuestionBankEntry.id))).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(QuestionBankEntry)
            .where(*filters)
            .order_by(col(QuestionBankEntry.created_at).desc())
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
                col(QuestionBankEntry.question_id) == question_id,
                col(QuestionBankEntry.added_by_id) == added_by_id,
                col(QuestionBankEntry.is_deleted) == False,  # noqa: E712
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
                col(QuestionBankEntry.question_id) == question_id,
                col(QuestionBankEntry.added_by_id) == added_by_id,
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
                col(QuestionBankEntry.question_id) == question_id,
                col(QuestionBankEntry.added_by_id) == added_by_id,
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
                col(QuestionBankEntry.question_id) == question_id,
                col(QuestionBankEntry.added_by_id) == added_by_id,
            )
            .values(is_deleted=True, deleted_at=now, is_active=False)
        )

    async def update_bank_entry_denormalised(
        self,
        question_id: uuid.UUID,
        added_by_id: uuid.UUID,
        *,
        subject_id: uuid.UUID | None = None,
        difficulty: str | None = None,
        source_type: str | None = None,
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
                col(QuestionBankEntry.question_id) == question_id,
                col(QuestionBankEntry.added_by_id) == added_by_id,
            )
            .values(**fields)
        )
