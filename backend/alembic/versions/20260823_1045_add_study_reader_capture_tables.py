"""Add study reader capture tables (progress, annotations, key points).

Revision ID: 20260823_1045_study_reader
Revises: 20260820_0030_workspace_banner
Create Date: 2026-08-23 10:45:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260823_1045_study_reader"
down_revision = "20260820_0030_workspace_banner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. student_reading_progress ──────────────────────────────────────────
    op.create_table(
        "student_reading_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, default=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_kind", sa.String(length=50), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("last_page", sa.Integer(), nullable=False, default=1),
        sa.Column("last_scale", sa.Float(), nullable=False, default=100.0),
        sa.Column("page_count_seen", sa.Integer(), nullable=False, default=1),
        sa.ForeignKeyConstraint(["student_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "source_kind", "source_id", name="uq_student_reading_progress_source"),
    )
    op.create_index("ix_student_reading_progress_is_deleted", "student_reading_progress", ["is_deleted"])
    op.create_index("ix_student_reading_progress_source_id", "student_reading_progress", ["source_id"])
    op.create_index("idx_srp_student_source", "student_reading_progress", ["student_id", "source_kind", "source_id"])
    op.create_index("idx_srp_student_updated", "student_reading_progress", ["student_id", "updated_at"])

    # ── 2. student_material_annotation ───────────────────────────────────────
    op.create_table(
        "student_material_annotation",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, default=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_kind", sa.String(length=50), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("color", sa.String(length=30), nullable=False, default="key_idea"),
        sa.Column("selected_text", sa.Text(), nullable=False),
        sa.Column("rects_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("note_text", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_student_material_annotation_is_deleted", "student_material_annotation", ["is_deleted"])
    op.create_index("ix_student_material_annotation_source_id", "student_material_annotation", ["source_id"])
    op.create_index("idx_sma_student_source", "student_material_annotation", ["student_id", "source_kind", "source_id"])
    op.create_index("idx_sma_source_page", "student_material_annotation", ["source_id", "page_number"])
    op.create_index("idx_sma_student_created", "student_material_annotation", ["student_id", "created_at"])

    # ── 3. student_material_key_point ────────────────────────────────────────
    op.create_table(
        "student_material_key_point",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, default=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_kind", sa.String(length=50), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("quote", sa.Text(), nullable=True),
        sa.Column("page_number", sa.Integer(), nullable=False, default=1),
        sa.Column("tag", sa.String(length=50), nullable=False, default="other"),
        sa.Column("confidence", sa.String(length=30), nullable=False, default="got_it"),
        sa.Column("annotation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["annotation_id"], ["student_material_annotation.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_student_material_key_point_is_deleted", "student_material_key_point", ["is_deleted"])
    op.create_index("ix_student_material_key_point_source_id", "student_material_key_point", ["source_id"])
    op.create_index("idx_smkp_student_source", "student_material_key_point", ["student_id", "source_kind", "source_id"])
    op.create_index("idx_smkp_student_tag", "student_material_key_point", ["student_id", "tag"])
    op.create_index("idx_smkp_student_confidence", "student_material_key_point", ["student_id", "confidence"])
    op.create_index("idx_smkp_next_review_at", "student_material_key_point", ["next_review_at"])


def downgrade() -> None:
    op.drop_table("student_material_key_point")
    op.drop_table("student_material_annotation")
    op.drop_table("student_reading_progress")
