"""
app/db/models/moderation.py

Phase 3: Moderation and Exam Office workflow models.

Tables defined here:
    assessment_version   — Immutable content snapshot with SHA-256 hash
    moderation_review    — One review round per assessment version
    moderation_comment   — Reviewer comments on review rounds
    assessment_seal      — Exam office seal with verification code
    exam_print_job       — Print job lifecycle tracking

Import order safety:
    This file imports from:
        app.db.base    → AuditedBaseModel, AppendOnlyModel, utcnow
        app.db.enums   → ModerationReviewStatus, ModerationCommentCategory,
                         ModerationCommentTarget, PrintJobStatus
        app.db.mixins  → fk_uuid, optional_fk_uuid, composite_index

    This file references (via TYPE_CHECKING only):
        app.db.models.auth        → User
        app.db.models.assessment  → Assessment

Cascade rules:
    moderation_review   → RESTRICT from assessment_version (reviews must be
                          explicitly cleaned up before version deletion, which
                          should never happen in practice since versions are
                          append-only compliance records)
    moderation_comment  → CASCADE from moderation_review
    assessment_seal     → RESTRICT from assessment_version
    exam_print_job      → CASCADE from assessment_seal
"""



import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint
from sqlalchemy import Enum as SA_Enum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

from app.db.base import AuditedBaseModel, AppendOnlyModel, utcnow
from app.db.enums import (
    ModerationCommentCategory,
    ModerationCommentTarget,
    ModerationReviewStatus,
    PrintJobStatus,
)
from app.db.mixins import composite_index

if TYPE_CHECKING:
    from app.db.models.assessment import Assessment
    from app.db.models.auth import User


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT VERSION
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentVersion(AppendOnlyModel, table=True):
    """
    Immutable snapshot of an assessment's content at a point in time.

    Created at:
        - submit for moderation
        - each resubmission
        - seal
        - each post-approval edit (Phase 4)

    content_hash is the SHA-256 of the canonical JSON (sorted keys, UTF-8,
    no whitespace). The seal's validity is verified by re-computing this hash
    and comparing it to what was sealed.

    Inherits AppendOnlyModel: id + created_at only; never updated or deleted.
    """

    __tablename__ = "assessment_version"

    __table_args__ = (
        composite_index("assessment_version", "assessment_id", "version_no"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    version_no: int = Field(nullable=False)

    # Full content snapshot: sections, questions, options, marks, instructions
    content_snapshot: dict = Field(
        sa_column=Column(JSONB, nullable=False)
    )

    # SHA-256 hex digest of canonical JSON
    content_hash: str = Field(nullable=False, max_length=64)

    created_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    reason: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    moderation_reviews: List["ModerationReview"] = Relationship(
        back_populates="version"
    )
    seal: Optional["AssessmentSeal"] = Relationship(
        back_populates="version"
    )


# ─────────────────────────────────────────────────────────────────────────────
# MODERATION REVIEW
# ─────────────────────────────────────────────────────────────────────────────

class ModerationReview(AuditedBaseModel, table=True):
    """
    One round of moderation for a specific assessment version.

    status transitions:
        OPEN → CHANGES_REQUESTED (reviewer requests changes)
        OPEN → APPROVED (reviewer approves)

    Multiple rounds are created as the assessment goes through the
    PENDING_MODERATION → CHANGES_REQUESTED → PENDING_MODERATION cycle.
    """

    __tablename__ = "moderation_review"

    __table_args__ = (
        composite_index("moderation_review", "assessment_id", "round_no"),
        composite_index("moderation_review", "reviewer_id", "status"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    version_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_version.id", ondelete="RESTRICT"),
            nullable=True,
            index=True,
        )
    )
    round_no: int = Field(nullable=False)

    # NULL until a moderator claims the review
    reviewer_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=True,
            index=True,
        )
    )

    status: ModerationReviewStatus = Field(
        default=ModerationReviewStatus.OPEN,
        sa_column=Column(
            SA_Enum(ModerationReviewStatus, name="moderationreviewstatus", create_type=True),
            nullable=False,
            server_default="OPEN",
            index=True,
        ),
    )

    # JSONB checklist result: list of {code, severity, passed, message}
    checklist_result: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )

    decision_note: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )

    started_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    claimed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    decided_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    version: Optional["AssessmentVersion"] = Relationship(
        back_populates="moderation_reviews"
    )
    comments: List["ModerationComment"] = Relationship(
        back_populates="review"
    )


# ─────────────────────────────────────────────────────────────────────────────
# MODERATION COMMENT
# ─────────────────────────────────────────────────────────────────────────────

class ModerationComment(AuditedBaseModel, table=True):
    """
    A reviewer comment attached to a moderation review round.

    target_type + target_id identify the object being commented on:
        ASSESSMENT → assessment_id (same as review's assessment_id)
        SECTION    → assessment_section.id
        QUESTION   → assessment_question.id (junction table)

    resolved is set by the author when they acknowledge and fix the issue.
    Soft-deleted records are excluded from active comment counts.
    """

    __tablename__ = "moderation_comment"

    __table_args__ = (
        composite_index("moderation_comment", "review_id", "resolved"),
    )

    review_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("moderation_review.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )

    target_type: ModerationCommentTarget = Field(
        sa_column=Column(
            SA_Enum(ModerationCommentTarget, name="moderationcommenttarget", create_type=True),
            nullable=False,
        )
    )
    target_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True),
    )

    category: ModerationCommentCategory = Field(
        sa_column=Column(
            SA_Enum(ModerationCommentCategory, name="moderationcommentcategory", create_type=True),
            nullable=False,
        )
    )

    comment: str = Field(
        sa_column=Column(Text, nullable=False)
    )

    resolved: bool = Field(default=False, nullable=False)
    resolved_by_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True),
    )
    resolved_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    review: Optional["ModerationReview"] = Relationship(
        back_populates="comments"
    )


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT SEAL
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentSeal(AppendOnlyModel, table=True):
    """
    Exam office seal applied to an APPROVED assessment.

    A seal binds a specific assessment version (via content_hash) to an
    unguessable verification code. The code can be used via the public
    verification endpoint to confirm the paper's authenticity.

    Only one active seal per assessment is allowed (revoked_at IS NULL).
    Revoked seals remain in the table for audit; they must not verify.

    Inherits AppendOnlyModel: no updated_at, no soft-delete. The seal itself
    is never mutated after creation. Revocation is recorded via revoked_at.
    """

    __tablename__ = "assessment_seal"

    __table_args__ = (
        UniqueConstraint("verification_code", name="uq_assessment_seal_code"),
        composite_index("assessment_seal", "assessment_id", "revoked_at"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    version_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_version.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )

    # SHA-256 hash of the content at sealing time (for later integrity check)
    content_hash: str = Field(nullable=False, max_length=64)

    sealed_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    sealed_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    # Random 16+ char unguessable code; used by the public verification endpoint
    verification_code: str = Field(nullable=False, max_length=64)

    # Set when seal is revoked; NULL means the seal is active
    revoked_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )
    revoked_by_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True),
    )
    revoke_reason: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )

    # Phase 4: Post-approval edit superseding
    is_superseded: bool = Field(default=False, nullable=False)
    superseded_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )
    superseded_by_version_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True),
    )
    reprint_required: Optional[bool] = Field(
        default=None,
        nullable=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    version: Optional["AssessmentVersion"] = Relationship(
        back_populates="seal"
    )
    print_jobs: List["ExamPrintJob"] = Relationship(
        back_populates="seal"
    )


# ─────────────────────────────────────────────────────────────────────────────
# EXAM PRINT JOB
# ─────────────────────────────────────────────────────────────────────────────

class ExamPrintJob(AuditedBaseModel, table=True):
    """
    Print job created when an exam officer seals an assessment.

    copies_total = enrolled_count + ceil(enrolled_count * spare_percent / 100)
    This matches A-13 (5% spare copies by default).

    Status transitions:
        REQUESTED → PRINTED → STORED → DISTRIBUTED

    Soft-delete is supported (is_deleted) for cancelled jobs.
    Never physically deleted.
    """

    __tablename__ = "exam_print_job"

    __table_args__ = (
        composite_index("exam_print_job", "assessment_id", "status"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    seal_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_seal.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )

    enrolled_count: int = Field(nullable=False)
    spare_percent: int = Field(default=5, nullable=False)
    copies_total: int = Field(nullable=False)

    status: PrintJobStatus = Field(
        default=PrintJobStatus.REQUESTED,
        sa_column=Column(
            SA_Enum(PrintJobStatus, name="printjobstatus", create_type=True),
            nullable=False,
            server_default="REQUESTED",
            index=True,
        ),
    )

    handled_by_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True),
    )

    # Status timestamps
    printed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    stored_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    distributed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    notes: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    seal: Optional["AssessmentSeal"] = Relationship(
        back_populates="print_jobs"
    )
