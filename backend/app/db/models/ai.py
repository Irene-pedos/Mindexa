"""
app/db/models/ai.py

AI traceability models for Mindexa.

Tables defined here:
    ai_action_log    — Immutable record of every AI API call made by the platform
    ai_grade_review  — Per-submission grading decision record (lecturer vs AI)

Core principle: AI TRACEABILITY IS NON-NEGOTIABLE.

Every call to an AI model (OpenAI, LangChain agent, embedding API) must produce
an ai_action_log row. This is the permanent evidence that:
    - What was sent to the AI (prompt context)
    - What the AI returned (raw response)
    - Which user triggered it
    - Which academic object it affected
    - How long it took and how many tokens it used
    - Whether the output was accepted, modified, or rejected by a human

This table is the compliance backbone for any institution that needs to
answer: "Did AI influence this student's grade, and was a human in control?"

Import order safety:
    This file imports from:
        app.db.base    → AppendOnlyModel, BaseModel, utcnow
        app.db.enums   → AIActionType, AIActionStatus, AIGradeDecision
        app.db.mixins  → composite_index

    No TYPE_CHECKING references needed — all cross-model references
    use plain UUIDs to keep this module maximally import-safe.
    ai_action_log must be importable before all other model modules
    because question.py, attempt.py, and integrity.py all reference
    ai_action_log_id as a plain UUID field.

Cascade rules:
    ai_action_log   → AppendOnlyModel. NEVER deleted. NEVER updated.
    ai_grade_review → RESTRICT on submission_grade and assessment_attempt.
                      A grade review record cannot be orphaned.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from app.db.base import AppendOnlyModel, BaseModel, utcnow
from app.db.enums import AIActionStatus, AIActionType, AIGradeDecision
from app.db.mixins import composite_index
from sqlalchemy import Column, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field

# ─────────────────────────────────────────────────────────────────────────────
# AI ACTION LOG
# ─────────────────────────────────────────────────────────────────────────────

class AIActionLog(AppendOnlyModel, table=True):
    """
    Immutable record of every AI API call made by the platform.

    Inherits AppendOnlyModel:
        - id (UUID PK) and created_at ONLY
        - NO updated_at, NO is_deleted, NO audit fields
        - Rows are NEVER modified after insertion

    Every AI call in the platform — whether it's question generation,
    grading assistance, study support, or integrity analysis — writes
    one row here before the call is made (with status=INITIATED) and
    updates... wait — AppendOnlyModel means no updates.

    Correction: The pattern used is:
        1. Write the row with status=INITIATED and prompt context
        2. Make the AI call
        3. Write a SECOND row with status=COMPLETED (or FAILED)
            referencing the first row via parent_log_id

    This two-row pattern preserves the append-only guarantee while
    maintaining the full lifecycle trace. The service layer always
    writes both rows within the same Celery task or request context.

    action_type (AIActionType enum):
        QUESTION_GENERATION  → Lecturer Assessment Agent generating questions
        GRADING_SUGGESTION   → AI Grading Agent suggesting marks for a response
        RUBRIC_SUGGESTION    → AI suggesting a rubric for a question
        STUDY_SUPPORT        → Student Study Support Agent answering a question
        EMBEDDING            → Embedding a resource chunk (OpenAI embeddings API)
        INTEGRITY_ANALYSIS   → Integrity Analysis Agent processing events
        ASSESSMENT_DRAFT     → AI drafting an assessment structure
        FEEDBACK_DRAFT       → AI drafting feedback text for a lecturer to review

    actor_id:
        The user who triggered this AI action.
        NULL for system-triggered actions (e.g. Celery tasks with no user context).

    subject_entity_type / subject_entity_id:
        The academic object this AI action relates to.
        Polymorphic reference (same pattern as notification.reference_type).
        Examples:
            subject_entity_type = "assessment_attempt"
            subject_entity_id   = <attempt_uuid>
            (for a grading suggestion on a specific attempt)

            subject_entity_type = "student_resource"
            subject_entity_id   = <resource_uuid>
            (for an embedding call on a student's uploaded file)

    prompt_tokens / completion_tokens / total_tokens:
        Token counts from the OpenAI API response.
        NULL for embedding calls (no completion tokens).
        Used for cost monitoring and rate limit tracking.

    latency_ms:
        Wall-clock time of the AI API call in milliseconds.
        Used for SLA monitoring and performance optimisation.

    model_name:
        The exact model used for this call.
        Examples: "gpt-4o", "text-embedding-3-small", "gpt-4o-mini"

    status (AIActionStatus enum):
        INITIATED   → Row written; call about to be made (used with two-row pattern)
        COMPLETED   → Call succeeded; raw_output contains the response
        FAILED      → Call failed; error_message contains the reason
        RATE_LIMITED → API rate limit hit; task will be retried

    raw_output (JSONB):
        The complete AI API response, stored for full traceability.
        For chat completions: the full OpenAI response object.
        For embeddings: {"model": "...", "dimension": 1536, "object": "list"}
        For LangChain agents: the agent's final output dict.
        NULL for INITIATED rows (output not yet available).

    human_reviewed:
        True when a human has reviewed and acted on the output of this AI call.
        Set by the service layer when a lecturer approves, modifies, or rejects
        the AI output.
        NULL for actions where human review is not applicable (e.g. embeddings).

    parent_log_id:
        For the two-row pattern: the COMPLETED row references the INITIATED row.
        NULL for INITIATED rows.
    """

    __tablename__ = "ai_action_log"

    __table_args__ = (
        # Primary: all AI actions for a specific entity
        composite_index(
            "ai_action_log",
            "subject_entity_type", "subject_entity_id",
        ),
        # Actor history
        composite_index("ai_action_log", "actor_id", "action_type"),
        # Status monitoring
        composite_index("ai_action_log", "status", "action_type"),
        # Unreviewed AI outputs requiring human action
        composite_index(
            "ai_action_log",
            "human_reviewed", "action_type",
        ),
        # Cost analysis
        composite_index("ai_action_log", "model_name", "created_at"),
        # Two-row pattern lookup
        composite_index("ai_action_log", "parent_log_id"),
    )

    # ── Action identity ───────────────────────────────────────────────────────

    action_type: AIActionType = Field(nullable=False, index=True)
    status: AIActionStatus = Field(
        default=AIActionStatus.INITIATED,
        nullable=False,
        index=True,
    )

    # ── Actor ─────────────────────────────────────────────────────────────────

    # Plain UUID — NULL for system/Celery-triggered actions
    actor_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    actor_role: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=20,
        # Cached role string ("student", "lecturer", "admin", "system")
        # so reports can filter without joining user table.
    )

    # ── Subject (polymorphic) ─────────────────────────────────────────────────

    subject_entity_type: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=50,
        index=True,
    )
    subject_entity_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Model & performance ───────────────────────────────────────────────────

    model_name: str = Field(nullable=False, max_length=100, index=True)
    prompt_tokens: Optional[int] = Field(default=None, nullable=True)
    completion_tokens: Optional[int] = Field(default=None, nullable=True)
    total_tokens: Optional[int] = Field(default=None, nullable=True)
    latency_ms: Optional[int] = Field(default=None, nullable=True)

    # ── Input / Output ────────────────────────────────────────────────────────

    prompt_summary: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
        # A short human-readable description of what was sent.
        # Example: "Generate 5 MCQ questions on SQL normalization for CS301 CAT"
        # The full prompt is NOT stored here for storage efficiency.
        # Full prompts are reconstructed from the subject entity context
        # if needed for audit.
    )
    raw_output: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    error_message: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=2000,
    )

    # ── Human oversight ───────────────────────────────────────────────────────

    human_reviewed: Optional[bool] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    human_reviewed_at: Optional[datetime] = Field(default=None, nullable=True)
    # Plain UUID — the lecturer/admin who reviewed this output
    reviewed_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
    )

    # ── Two-row pattern ───────────────────────────────────────────────────────

    # Plain UUID — for COMPLETED rows, points to the INITIATED row
    parent_log_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# AI GRADE REVIEW
# ─────────────────────────────────────────────────────────────────────────────

class AIGradeReview(BaseModel, table=True):
    """
    Per-submission grading decision record.

    This table records the complete paper trail of how a student's grade
    was arrived at — specifically the interaction between AI suggestion
    and lecturer decision for each submission.

    One row per (assessment_attempt, grading workflow cycle).
    A new row is created each time a grading cycle begins (e.g. initial
    grading, re-grade after appeal).

    The distinction from ai_action_log:
        ai_action_log   → records the raw AI API call (technical trace)
        ai_grade_review → records the academic outcome (grade decision trace)

    Both exist for every AI-assisted grading event. They are linked via
    ai_action_log_id.

    grading_decision (AIGradeDecision enum):
        PENDING    → Awaiting lecturer review
        ACCEPTED   → Lecturer accepted AI suggestion without change
        MODIFIED   → Lecturer changed the AI-suggested score before finalising
        REJECTED   → Lecturer rejected AI suggestion and graded manually
        AUTO       → No AI involved; auto-graded by the system (MCQ etc.)

    ai_suggested_total:
        The total score the AI suggested for this attempt.
        NULL for non-AI-graded attempts.

    lecturer_final_total:
        The total score the lecturer finalised.
        May equal ai_suggested_total (if ACCEPTED) or differ (if MODIFIED/REJECTED).

    score_delta:
        lecturer_final_total - ai_suggested_total.
        Positive = lecturer increased the AI score.
        Negative = lecturer decreased the AI score.
        NULL for AUTO-graded or REJECTED (manual grading without prior AI suggestion).
        Used for AI calibration analysis.

    review_duration_seconds:
        Time from when the lecturer opened the grading interface to when
        they submitted the final grade. Computed by the frontend and submitted
        with the grade confirmation request. Used for UX and workload analytics.
    """

    __tablename__ = "ai_grade_review"

    __table_args__ = (
        # Primary: all grade reviews for an attempt
        composite_index("ai_grade_review", "attempt_id", "grading_decision"),
        # Assessment-level grading queue
        composite_index(
            "ai_grade_review",
            "assessment_id", "grading_decision",
        ),
        # AI calibration analysis
        composite_index("ai_grade_review", "grading_decision", "score_delta"),
    )

    # ── Core references ───────────────────────────────────────────────────────

    attempt_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    # Denormalised for fast assessment-level grading queue queries
    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    # Plain UUID — student who owns this attempt
    student_id: uuid.UUID = Field(nullable=False, index=True)

    # ── AI action traceability ────────────────────────────────────────────────

    # Plain UUID — the AIActionLog row for the grading API call
    ai_action_log_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Grading decision ──────────────────────────────────────────────────────

    grading_decision: AIGradeDecision = Field(
        default=AIGradeDecision.PENDING,
        nullable=False,
        index=True,
    )

    # ── Scores ────────────────────────────────────────────────────────────────

    ai_suggested_total: Optional[float] = Field(default=None, nullable=True)
    lecturer_final_total: Optional[float] = Field(default=None, nullable=True)
    score_delta: Optional[float] = Field(default=None, nullable=True)
    max_possible_score: Optional[float] = Field(
        default=None,
        nullable=True,
        # Cached from assessment.total_marks at grading time.
    )

    # ── Reviewer ──────────────────────────────────────────────────────────────

    # Plain UUID — the lecturer who made the final grading decision
    lecturer_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    review_started_at: Optional[datetime] = Field(default=None, nullable=True)
    review_completed_at: Optional[datetime] = Field(default=None, nullable=True)
    review_duration_seconds: Optional[int] = Field(default=None, nullable=True)
    lecturer_notes: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=2000,
        # Internal notes from the lecturer, not shown to the student.
    )
