"""Phase 3: Moderation and Exam Office workflows

Revision ID: 20261013_p3_moderation
Revises: 20261012_p2_choice_sections
Create Date: 2026-10-13 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261013_p3_moderation"
down_revision: Union[str, None] = "20261012_p2_choice_sections"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Add new enum values to existing assessmentstatus enum
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE assessmentstatus ADD VALUE IF NOT EXISTS 'PENDING_MODERATION'")
        op.execute("ALTER TYPE assessmentstatus ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED'")
        op.execute("ALTER TYPE assessmentstatus ADD VALUE IF NOT EXISTS 'APPROVED'")
        op.execute("ALTER TYPE assessmentstatus ADD VALUE IF NOT EXISTS 'SEALED'")

    # 2. Native PostgreSQL enums for Phase 3
    moderation_review_status = postgresql.ENUM(
        "OPEN", "CHANGES_REQUESTED", "APPROVED", name="moderationreviewstatus"
    )
    moderation_review_status.create(bind, checkfirst=True)

    moderation_comment_category = postgresql.ENUM(
        "MARKS", "DISTRIBUTION", "WORDING", "STRUCTURE", "OTHER", name="moderationcommentcategory"
    )
    moderation_comment_category.create(bind, checkfirst=True)

    moderation_comment_target = postgresql.ENUM(
        "ASSESSMENT", "SECTION", "QUESTION", name="moderationcommenttarget"
    )
    moderation_comment_target.create(bind, checkfirst=True)

    print_job_status = postgresql.ENUM(
        "REQUESTED", "PRINTED", "STORED", "DISTRIBUTED", name="printjobstatus"
    )
    print_job_status.create(bind, checkfirst=True)

    # 3. Table: assessment_version
    op.create_table(
        "assessment_version",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("assessment_id", sa.Uuid(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("content_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessment.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_id"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assessment_version_assessment_id", "assessment_version", ["assessment_id"])
    op.create_index("ix_assessment_version_assessment_id_version_no", "assessment_version", ["assessment_id", "version_no"])

    # 4. Table: moderation_review
    op.create_table(
        "moderation_review",
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("updated_by_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("assessment_id", sa.Uuid(), nullable=False),
        sa.Column("version_id", sa.Uuid(), nullable=True),
        sa.Column("round_no", sa.Integer(), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM("OPEN", "CHANGES_REQUESTED", "APPROVED", name="moderationreviewstatus", create_type=False),
            server_default="OPEN",
            nullable=False,
        ),
        sa.Column("checklist_result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessment.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["version_id"], ["assessment_version.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reviewer_id"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_moderation_review_assessment_id", "moderation_review", ["assessment_id"])
    op.create_index("ix_moderation_review_assessment_id_round_no", "moderation_review", ["assessment_id", "round_no"])
    op.create_index("ix_moderation_review_reviewer_id_status", "moderation_review", ["reviewer_id", "status"])
    op.create_index("ix_moderation_review_status", "moderation_review", ["status"])
    op.create_index("ix_moderation_review_created_by_id", "moderation_review", ["created_by_id"])
    op.create_index("ix_moderation_review_is_deleted", "moderation_review", ["is_deleted"])
    op.create_index("ix_moderation_review_reviewer_id", "moderation_review", ["reviewer_id"])
    op.create_index("ix_moderation_review_version_id", "moderation_review", ["version_id"])


    # 5. Table: moderation_comment
    op.create_table(
        "moderation_comment",
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("updated_by_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("review_id", sa.Uuid(), nullable=False),
        sa.Column(
            "target_type",
            postgresql.ENUM("ASSESSMENT", "SECTION", "QUESTION", name="moderationcommenttarget", create_type=False),
            nullable=False,
        ),
        sa.Column("target_id", sa.Uuid(), nullable=True),
        sa.Column(
            "category",
            postgresql.ENUM("MARKS", "DISTRIBUTION", "WORDING", "STRUCTURE", "OTHER", name="moderationcommentcategory", create_type=False),
            nullable=False,
        ),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("resolved", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("resolved_by_id", sa.Uuid(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["review_id"], ["moderation_review.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_moderation_comment_review_id", "moderation_comment", ["review_id"])
    op.create_index("ix_moderation_comment_review_id_resolved", "moderation_comment", ["review_id", "resolved"])
    op.create_index("ix_moderation_comment_created_by_id", "moderation_comment", ["created_by_id"])
    op.create_index("ix_moderation_comment_is_deleted", "moderation_comment", ["is_deleted"])


    # 6. Table: assessment_seal
    op.create_table(
        "assessment_seal",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("assessment_id", sa.Uuid(), nullable=False),
        sa.Column("version_id", sa.Uuid(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("sealed_by_id", sa.Uuid(), nullable=False),
        sa.Column("sealed_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("verification_code", sa.String(length=64), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_id", sa.Uuid(), nullable=True),
        sa.Column("revoke_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessment.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["version_id"], ["assessment_version.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sealed_by_id"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("verification_code", name="uq_assessment_seal_code"),
    )
    op.create_index("ix_assessment_seal_assessment_id", "assessment_seal", ["assessment_id"])
    op.create_index("ix_assessment_seal_revoked_at", "assessment_seal", ["revoked_at"])
    op.create_index("ix_assessment_seal_assessment_id_revoked_at", "assessment_seal", ["assessment_id", "revoked_at"])

    # 7. Table: exam_print_job
    op.create_table(
        "exam_print_job",
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("updated_by_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("assessment_id", sa.Uuid(), nullable=False),
        sa.Column("seal_id", sa.Uuid(), nullable=False),
        sa.Column("enrolled_count", sa.Integer(), nullable=False),
        sa.Column("spare_percent", sa.Integer(), server_default=sa.text("5"), nullable=False),
        sa.Column("copies_total", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("REQUESTED", "PRINTED", "STORED", "DISTRIBUTED", name="printjobstatus", create_type=False),
            server_default="REQUESTED",
            nullable=False,
        ),
        sa.Column("handled_by_id", sa.Uuid(), nullable=True),
        sa.Column("printed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("distributed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessment.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["seal_id"], ["assessment_seal.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exam_print_job_assessment_id", "exam_print_job", ["assessment_id"])
    op.create_index("ix_exam_print_job_status", "exam_print_job", ["status"])
    op.create_index("ix_exam_print_job_assessment_id_status", "exam_print_job", ["assessment_id", "status"])
    op.create_index("ix_exam_print_job_created_by_id", "exam_print_job", ["created_by_id"])
    op.create_index("ix_exam_print_job_is_deleted", "exam_print_job", ["is_deleted"])
    op.create_index("ix_exam_print_job_seal_id", "exam_print_job", ["seal_id"])



def downgrade() -> None:
    op.drop_table("exam_print_job")
    op.drop_table("assessment_seal")
    op.drop_table("moderation_comment")
    op.drop_table("moderation_review")
    op.drop_table("assessment_version")

    bind = op.get_bind()
    print_job_status = postgresql.ENUM("REQUESTED", "PRINTED", "STORED", "DISTRIBUTED", name="printjobstatus")
    print_job_status.drop(bind, checkfirst=True)

    moderation_comment_category = postgresql.ENUM("MARKS", "DISTRIBUTION", "WORDING", "STRUCTURE", "OTHER", name="moderationcommentcategory")
    moderation_comment_category.drop(bind, checkfirst=True)

    moderation_comment_target = postgresql.ENUM("ASSESSMENT", "SECTION", "QUESTION", name="moderationcommenttarget")
    moderation_comment_target.drop(bind, checkfirst=True)

    moderation_review_status = postgresql.ENUM("OPEN", "CHANGES_REQUESTED", "APPROVED", name="moderationreviewstatus")
    moderation_review_status.drop(bind, checkfirst=True)
