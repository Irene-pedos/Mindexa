"""
app/db/models/question.py

Question Bank models for Mindexa.

Tables defined here:
    question                     — A reusable question owned by a lecturer
    question_option              — Answer options for closed question types
    question_blank               — Blank definitions for fill-in-the-blank questions
    assessment_question           — Junction: question ↔ assessment (with per-assessment overrides)
    ai_question_generation_batch — A single AI generation request session
    ai_question_review           — Lecturer decision on each AI-generated candidate
    question_bank_entry           — The lecturer's question bank view

Import order safety:
    This file imports from:
        app.db.base    → BaseModel, AuditedBaseModel, utcnow
        app.db.enums   → QuestionType, DifficultyLevel, QuestionSourceType,
                         QuestionAddedVia, AIBatchStatus, AIQuestionDecision
        app.db.mixins  → fk_uuid, optional_fk_uuid, composite_index,
                         unique_composite_index, bool_field

    This file references via TYPE_CHECKING only:
        app.db.models.assessment → Assessment, AssessmentSection, Rubric
        app.db.models.auth       → User (lecturer)

    This file does NOT import from:
        app.db.models.attempt    → attempt imports question, never the reverse
        app.db.models.integrity  → no dependency here

Cascade rules:
    question_option    → CASCADE from question  (options have no meaning without question)
    question_blank     → CASCADE from question
    assessment_question → RESTRICT on question  (deleting a question used in a published
                          assessment must be blocked — academic record integrity)
                          CASCADE from assessment (if assessment is deleted, its question
                          links are removed — the question itself survives in the bank)
    ai_question_review → CASCADE from ai_question_generation_batch
    question_bank_entry → RESTRICT on question (entry references question; question
                            cannot be deleted while it has a bank entry)

JSONB fields:
    All JSONB fields use SQLAlchemy's JSONB type directly.
    Import: from sqlalchemy.dialects.postgresql import JSONB

Question source traceability matrix:
    source_type = manual
        → source_assessment_id: nullable (may have come from an assessment builder)
        → source_ai_batch_id: NULL always
        → is_approved: True always (no AI review needed)

    source_type = ai_generated
        → source_assessment_id: set if generated inside assessment builder
        → source_ai_batch_id: always set (links to the generation batch)
        → is_approved: False initially → True after ai_question_review accepted/modified

    source_type = assessment_auto_saved
        → source_assessment_id: always set (the assessment it came from)
        → source_ai_batch_id: NULL (it was a manual question in an assessment)
        → is_approved: True always

    source_type = imported
        → source_assessment_id: NULL
        → source_ai_batch_id: NULL
        → is_approved: False initially (requires lecturer approval)
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from app.db.base import BaseModel, utcnow
from app.db.enums import (AIBatchStatus, AIQuestionDecision, DifficultyLevel,
                          QuestionAddedVia, QuestionSourceType, QuestionType)
from app.db.mixins import bool_field, composite_index, unique_composite_index
from sqlalchemy import Column, ForeignKey, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.db.models.ai import AIActionLog
    from app.db.models.assessment import Assessment, AssessmentSection, Rubric
    from app.db.models.attempt import StudentResponse


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION
# ─────────────────────────────────────────────────────────────────────────────

class Question(BaseModel, table=True):
    """
    A reusable question owned by a lecturer.

    The question is the atomic unit of assessment content. It can exist:
        - In a lecturer's question bank (is_in_question_bank = True)
        - In one or more assessments (via assessment_question junction)
        - As a candidate in an AI generation batch (via ai_question_review)
        - As a private draft not yet in any bank (is_in_question_bank = False)

    source_type (QuestionSourceType enum):
        MANUAL               — Typed directly by a lecturer
        AI_GENERATED         — Created by AI; requires approval before use
        ASSESSMENT_AUTO_SAVED — Saved automatically when containing assessment published
        IMPORTED             — Future: batch import

    content:
        The question text. Stored as plain text / markdown.
        Rich text formatting is handled at the frontend layer.

    explanation:
        Optional explanation shown to students after the assessment window closes.
        Only shown when the assessment's result_release_mode allows it.

    subject_id:
        The academic subject this question belongs to.
        Drives the subject-filtered view in the question bank.
        NULL for questions not yet categorised.

    parent_question_id:
        Self-referential FK. When a lecturer modifies an AI-generated question,
        a NEW question row is created with parent_question_id pointing to the
        original AI candidate. This preserves the original for audit purposes.
        Maximum depth: 1 (enforced at service layer — no versions of versions).

    version:
        Increments when a question is modified. Starts at 1.
        Combined with parent_question_id this gives a complete lineage.

    is_approved:
        False for AI-generated and imported questions awaiting review.
        True for manual questions and approved AI questions.
        Unapproved questions cannot be added to published assessments.

    ai_action_log_id:
        Links to the raw AI call log that generated this question.
        NULL for non-AI-generated questions.

    is_shared:
        True → visible to all lecturers in the institution (shared bank).
        False → private to the creating lecturer.
    """

    __tablename__ = "question"

    __table_args__ = (
        # Fast subject-filtered bank queries
        composite_index("question", "subject_id", "question_type", "is_deleted"),
        composite_index("question", "subject_id", "difficulty", "is_deleted"),
        composite_index("question", "source_type", "is_approved", "is_deleted"),
        # Lecturer's own questions view
        composite_index("question", "created_by_id", "is_in_question_bank"),
        # Source traceability
        composite_index("question", "source_assessment_id", "source_type"),
        composite_index("question", "source_ai_batch_id"),
        # Parent-child lineage
        composite_index("question", "parent_question_id"),
    )


    # ── Ownership ─────────────────────────────────────────────────────────────

    # Plain UUID — validated at service layer (must be a user with role=lecturer)
    created_by_id: uuid.UUID = Field(
        nullable=False,
        index=True,
    )

    # ── Academic classification ───────────────────────────────────────────────

    subject_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("subject.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )

    # ── Content ───────────────────────────────────────────────────────────────

    question_type: QuestionType = Field(nullable=False, index=True)
    content: str = Field(nullable=False)
    explanation: Optional[str] = Field(default=None, nullable=True)

    # ── Scoring & difficulty ──────────────────────────────────────────────────

    marks: int = Field(default=1, nullable=False)
    difficulty: DifficultyLevel = Field(
        default=DifficultyLevel.MEDIUM,
        nullable=False,
        index=True,
    )
    topic_tag: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=100,
        index=True,
        # Supplementary free-text tag for search — subject_id is the primary
        # classification. topic_tag is an optional secondary label.
    )

    rubric_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("rubric.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )

    # ── Source traceability ───────────────────────────────────────────────────

    source_type: QuestionSourceType = Field(
        default=QuestionSourceType.MANUAL,
        nullable=False,
        index=True,
    )
    source_assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )
    source_ai_batch_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        # Forward reference — ai_question_generation_batch defined later in file
        # FK declared after AIQuestionGenerationBatch definition via __table_args__
        # to avoid ordering issues within the same file
        index=True,
    )
    ai_action_log_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        # Plain UUID reference to ai_action_log — avoids cross-module FK
        index=True,
    )

    # ── Approval & visibility ─────────────────────────────────────────────────

    is_approved: bool = Field(default=False, nullable=False, index=True)
    approved_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        # Plain UUID — validated at service layer
    )
    approved_at: Optional[datetime] = Field(default=None, nullable=True)
    is_shared: bool = Field(default=False, nullable=False, index=True)

    # ── Question bank membership ──────────────────────────────────────────────

    is_in_question_bank: bool = Field(default=False, nullable=False, index=True)
    bank_added_at: Optional[datetime] = Field(default=None, nullable=True)
    bank_added_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        # Plain UUID — validated at service layer
    )

    # ── Versioning & lineage ──────────────────────────────────────────────────

    version: int = Field(default=1, nullable=False)
    parent_question_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    rubric: Optional["Rubric"] = Relationship()

    options: List["QuestionOption"] = Relationship(
        back_populates="question",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "QuestionOption.order_index",
        },
    )
    blanks: List["QuestionBlank"] = Relationship(
        back_populates="question",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "QuestionBlank.blank_index",
        },
    )
    assessment_questions: List["AssessmentQuestion"] = Relationship(
        back_populates="question",
    )
    bank_entry: Optional["QuestionBankEntry"] = Relationship(
        back_populates="question",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    ai_reviews: List["AIQuestionReview"] = Relationship(
        back_populates="question",
    )
    responses: List["StudentResponse"] = Relationship(
        back_populates="question",
    )


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION OPTION
# ─────────────────────────────────────────────────────────────────────────────

class QuestionOption(BaseModel, table=True):
    """
    An answer option for closed question types.

    Used by:
        MCQ        → is_correct marks the right answer(s)
        TRUE_FALSE → exactly two options: "True" (is_correct=True) and "False"
        MATCHING   → match_key holds the left-side label, match_value the answer
        ORDERING   → order_index defines the correct sequence; is_correct is NULL

    is_correct:
        MCQ        → True on the correct option(s). Supports multi-select MCQ
                      if multiple options have is_correct=True.
        TRUE_FALSE → True on the correct answer only.
        MATCHING   → Not used (None). Match correctness is derived from
                      comparing match_key → match_value pairs.
        ORDERING   → Not used (None). Correct order is defined by order_index.

    match_key / match_value:
        Only populated for MATCHING question type.
        match_key   → the left-side term shown to the student (e.g. "Primary Key")
        match_value → the correct definition (e.g. "Uniquely identifies a record")

    order_index:
        For ORDERING questions: defines the correct sequence (1, 2, 3…).
        For all other types: defines display order only (no semantic meaning).

    content:
        The display text of this option. For MATCHING, this is the left-side label
        shown to the student (same as match_key for readability).
    """

    __tablename__ = "question_option"

    __table_args__ = (
        composite_index("question_option", "question_id", "order_index"),
        composite_index("question_option", "question_id", "is_correct"),
    )

    question_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    content: str = Field(nullable=False)
    is_correct: Optional[bool] = Field(default=None, nullable=True)
    match_key: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
    )
    match_value: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
    )
    order_index: int = Field(nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────

    question: Optional["Question"] = Relationship(back_populates="options")


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION BLANK
# ─────────────────────────────────────────────────────────────────────────────

class QuestionBlank(BaseModel, table=True):
    """
    Blank definition for FILL_BLANK question type.

    A fill-in-the-blank question may have multiple blanks. Each blank
    has its own row defining what acceptable answers look like.

    blank_index:
        Zero-based position of this blank in the question content.
        Example: "The capital of France is [0] and the currency is [1]."
        blank_index=0 → accepted_answers=["Paris"]
        blank_index=1 → accepted_answers=["Euro", "EUR", "euro"]

    accepted_answers:
        JSONB array of strings. All values are acceptable answers for this blank.
        The comparison logic (case-sensitive or not) is determined by case_sensitive.
        Example: ["Paris", "paris", "PARIS"] if case_sensitive=False is not sufficient
        and the lecturer wants to be explicit.

    case_sensitive:
        If False, the auto-grader normalises both the student response and each
        accepted answer to lowercase before comparing.
        If True, the comparison is exact.
    """

    __tablename__ = "question_blank"

    __table_args__ = (
        UniqueConstraint(
            "question_id", "blank_index",
            name="uq_question_blank_question_blank_index",
        ),
        composite_index("question_blank", "question_id"),
    )

    question_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    blank_index: int = Field(nullable=False)
    accepted_answers: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    )
    case_sensitive: bool = Field(default=False, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────

    question: Optional["Question"] = Relationship(back_populates="blanks")


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT QUESTION (junction)
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentQuestion(BaseModel, table=True):
    """
    Junction table: Question ↔ Assessment.

    Stores per-assessment overrides and provenance of how each question
    entered this specific assessment.

    A question can appear in many assessments. The same physical question
    row is reused — the assessment_question row holds any per-assessment
    customisation.

    marks_override:
        If NULL → use question.marks as the mark for this question.
        If set  → use this value instead. Allows the same question to carry
                  different marks in different assessments.

    added_via (QuestionAddedVia enum):
        MANUAL_WRITE           — Lecturer typed directly in assessment builder Step 4.
        BANK_INSERT            — Lecturer selected from question bank Step 4.
        AI_GENERATED_ACCEPTED  — AI candidate accepted without modification.
        AI_GENERATED_MODIFIED  — AI candidate accepted after modification.

    ai_review_id:
        Links to the AIQuestionReview row if this question came from AI generation.
        NULL for manual and bank-inserted questions.

    bank_entry_id:
        Links to the QuestionBankEntry row if this question came from the bank.
        NULL for manually written and AI-generated questions.

    order_index:
        Display position within the assessment (or within its section).
        Unique per (assessment_id, assessment_section_id) pair.

    Cascade rules:
        - question_id uses RESTRICT: deleting a question that is in any
          published assessment is blocked. Academic records must be preserved.
        - assessment_id uses CASCADE: if an assessment is deleted (admin action),
          its question links are removed. The question itself survives.
    """

    __tablename__ = "assessment_question"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "question_id",
            name="uq_assessment_question_assessment_question",
        ),
        UniqueConstraint(
            "assessment_id", "assessment_section_id", "order_index",
            name="uq_assessment_question_assessment_section_order",
        ),
        composite_index("assessment_question", "assessment_id", "order_index"),
        composite_index("assessment_question", "assessment_id", "added_via"),
        composite_index("assessment_question", "question_id"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    question_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    assessment_section_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_section.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )
    order_index: int = Field(nullable=False)
    marks_override: Optional[int] = Field(default=None, nullable=True)
    is_required: bool = Field(default=True, nullable=False)

    # ── Provenance tracking ───────────────────────────────────────────────────

    added_via: QuestionAddedVia = Field(
        default=QuestionAddedVia.MANUAL_WRITE,
        nullable=False,
        index=True,
    )
    ai_review_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("ai_question_review.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )
    bank_entry_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question_bank_entry.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    question: Optional["Question"] = Relationship(
        back_populates="assessment_questions"
    )
    assessment: Optional["Assessment"] = Relationship(
        back_populates="assessment_questions"
    )
    assessment_section: Optional["AssessmentSection"] = Relationship(
        back_populates="assessment_questions"
    )
    ai_review: Optional["AIQuestionReview"] = Relationship(
        back_populates="assessment_question"
    )
    bank_entry: Optional["QuestionBankEntry"] = Relationship(
        back_populates="assessment_questions"
    )


# ─────────────────────────────────────────────────────────────────────────────
# AI QUESTION GENERATION BATCH
# ─────────────────────────────────────────────────────────────────────────────

class AIQuestionGenerationBatch(BaseModel, table=True):
    """
    Represents a single AI question generation request session.

    When a lecturer clicks "Generate with AI" in Step 5 of the assessment
    builder, one batch row is created. The AI generates N candidate questions,
    each becoming an AIQuestionReview row linked to this batch.

    The lecturer then reviews each candidate (accept / modify / reject).
    When all candidates are reviewed, review_completed is set to True.

    Multiple batches can exist for the same assessment (lecturer may click
    "Generate more" after reviewing the first batch).

    prompt_used:
        The full prompt sent to the AI, including:
        - Subject context
        - Section instructions (ai_generation_prompt_hint)
        - Blueprint rules (question type, difficulty, count)
        - Any previous approved questions (to avoid duplication)
        Stored for full AI traceability.

    ai_action_log_id:
        Links to the raw AI API call log (tokens, latency, model, raw output).
        Plain UUID — ai_action_log is defined in a separate module.

    count_generated vs count_requested:
        The AI may return fewer questions than requested (model limits, refusals).
        Storing both values lets the UI show "Generated 7 of 10 requested."
    """

    __tablename__ = "ai_question_generation_batch"

    __table_args__ = (
        composite_index(
            "ai_question_generation_batch",
            "assessment_id", "status",
        ),
        composite_index(
            "ai_question_generation_batch",
            "assessment_id", "review_completed",
        ),
        composite_index(
            "ai_question_generation_batch",
            "initiated_by_id",
        ),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    assessment_section_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_section.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )
    # Plain UUID — lecturer who clicked Generate; validated at service layer
    initiated_by_id: uuid.UUID = Field(nullable=False, index=True)

    # Plain UUID — raw AI API call log
    ai_action_log_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Generation parameters ─────────────────────────────────────────────────

    prompt_used: str = Field(nullable=False)
    question_type_requested: Optional[QuestionType] = Field(
        default=None,
        nullable=True,
    )
    difficulty_requested: Optional[DifficultyLevel] = Field(
        default=None,
        nullable=True,
    )
    count_requested: int = Field(nullable=False)
    count_generated: int = Field(default=0, nullable=False)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    status: AIBatchStatus = Field(
        default=AIBatchStatus.PENDING,
        nullable=False,
        index=True,
    )
    review_completed: bool = Field(default=False, nullable=False, index=True)
    review_completed_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────

    assessment: Optional["Assessment"] = Relationship(
        back_populates="ai_generation_batches"
    )
    reviews: List["AIQuestionReview"] = Relationship(
        back_populates="batch",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "AIQuestionReview.candidate_order",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# AI QUESTION REVIEW
# ─────────────────────────────────────────────────────────────────────────────

class AIQuestionReview(BaseModel, table=True):
    """
    Lecturer decision record for a single AI-generated question candidate.

    One row per candidate per batch. Created by the AI agent when it
    produces a candidate question. Updated when the lecturer makes a decision.

    Lifecycle:
        1. AI generates candidate → question row created with is_approved=False,
            source_type=AI_GENERATED
        2. AIQuestionReview row created with lecturer_decision=PENDING
        3. Lecturer reviews:
            ACCEPTED  → question.is_approved=True, added_to_assessment and/or
                        added_to_bank set to True
            MODIFIED  → a new question row is created (child of original via
                        parent_question_id), new question.is_approved=True,
                        modification_summary records what changed
            REJECTED  → question remains is_approved=False, not added anywhere
        4. When all reviews in the batch have a non-PENDING decision,
           batch.review_completed is set to True

    ai_raw_output:
        The exact JSON the AI returned for this specific question candidate,
        extracted from the batch response. Preserved for full traceability
        even if the question is later modified or rejected.

    candidate_order:
        Position of this question in the AI's response (1-based).
        Used to display candidates in the order the AI returned them.

    added_to_assessment:
        True if this question (or its modified version) was inserted into
        the assessment via assessment_question. Set by the accept/modify flow.

    added_to_bank:
        True if this question was saved to the question bank.
        May be True even if added_to_assessment is False
        (lecturer may bank a question for future use without adding it now).
    """

    __tablename__ = "ai_question_review"

    __table_args__ = (
        UniqueConstraint(
            "batch_id", "question_id",
            name="uq_ai_question_review_batch_question",
        ),
        composite_index(
            "ai_question_review",
            "batch_id", "lecturer_decision",
        ),
        composite_index("ai_question_review", "question_id"),
        composite_index("ai_question_review", "lecturer_decision"),
    )

    batch_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("ai_question_generation_batch.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    question_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    ai_action_log_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        # Plain UUID — raw AI call log reference
        index=True,
    )
    candidate_order: int = Field(nullable=False)
    ai_raw_output: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )

    # ── Lecturer decision ─────────────────────────────────────────────────────

    lecturer_decision: AIQuestionDecision = Field(
        default=AIQuestionDecision.PENDING,
        nullable=False,
        index=True,
    )
    # Plain UUID — validated at service layer
    lecturer_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    modification_summary: Optional[str] = Field(default=None, nullable=True)
    decided_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Post-decision state ───────────────────────────────────────────────────

    added_to_assessment: bool = Field(default=False, nullable=False)
    added_to_bank: bool = Field(default=False, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────

    batch: Optional["AIQuestionGenerationBatch"] = Relationship(
        back_populates="reviews"
    )
    question: Optional["Question"] = Relationship(back_populates="ai_reviews")
    assessment_question: Optional["AssessmentQuestion"] = Relationship(
        back_populates="ai_review"
    )


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION BANK ENTRY
# ─────────────────────────────────────────────────────────────────────────────

class QuestionBankEntry(BaseModel, table=True):
    """
    The lecturer's question bank view — a curated index of available questions.

    A question is "in the bank" if and only if a QuestionBankEntry row exists
    for it. This separation allows questions to exist in the system (e.g. as
    AI candidates under review) without appearing in any lecturer's bank until
    they are explicitly approved and banked.

    Denormalised fields (subject_id, difficulty, source_type):
        These are copied from the question row at the time of bank entry creation.
        They are indexed for fast filtering in the bank UI without requiring a
        JOIN back to question on every list query.
        If the question is later modified, these fields are NOT automatically
        updated — the service layer must update them if they change.

    times_used:
        Incremented by the service layer each time this question is included
        in a newly published assessment. Used to surface "frequently used"
        questions and warn lecturers about overusing the same questions.

    added_by_id:
        The lecturer who owns this bank entry. Usually the same as
        question.created_by_id, but may differ if a shared question
        was explicitly added to another lecturer's bank.

    is_active:
        False → the entry is soft-hidden from the bank UI.
        The question still exists; it can be re-activated.
        Different from question.is_deleted which is a true soft-delete.

    One question → one bank entry (UNIQUE on question_id).
    A question cannot appear twice in the same bank.
    Different lecturers each have their own bank entry for a shared question.
    Note: the UNIQUE constraint below enforces one entry per (question_id, added_by_id)
    — each lecturer has at most one bank entry per question.
    """

    __tablename__ = "question_bank_entry"

    __table_args__ = (
        UniqueConstraint(
            "question_id", "added_by_id",
            name="uq_question_bank_entry_question_lecturer",
        ),
        # Primary bank browsing indexes
        composite_index(
            "question_bank_entry",
            "added_by_id", "subject_id", "is_active",
        ),
        composite_index(
            "question_bank_entry",
            "added_by_id", "source_type", "is_active",
        ),
        composite_index(
            "question_bank_entry",
            "added_by_id", "difficulty", "is_active",
        ),
        composite_index(
            "question_bank_entry",
            "added_by_id", "times_used",
        ),
    )

    question_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    # Plain UUID — the lecturer who owns this bank entry
    added_by_id: uuid.UUID = Field(nullable=False, index=True)

    # ── Denormalised from question (for fast filtering) ───────────────────────

    subject_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("subject.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )
    difficulty: Optional[DifficultyLevel] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    source_type: QuestionSourceType = Field(
        default=QuestionSourceType.MANUAL,
        nullable=False,
        index=True,
    )
    source_assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )

    # ── Usage tracking ────────────────────────────────────────────────────────

    times_used: int = Field(default=0, nullable=False)
    last_used_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Visibility ────────────────────────────────────────────────────────────

    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────

    question: Optional["Question"] = Relationship(back_populates="bank_entry")
    assessment_questions: List["AssessmentQuestion"] = Relationship(
        back_populates="bank_entry"
    )
