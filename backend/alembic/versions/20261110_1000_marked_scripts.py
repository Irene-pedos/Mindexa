"""Marked script archive: immutable, versioned snapshots of marked papers.

Revision ID: 20261110_marked_scripts
Revises: 20261107_guided_records
Create Date: 2026-11-10 10:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261110_marked_scripts"
down_revision: Union[str, None] = "20261107_guided_records"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "marked_script",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("assessment_result.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("assessment_attempt.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assessment_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("assessment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("trigger", sa.String(32), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("snapshot_hash", sa.String(64), nullable=False),
        sa.Column("verification_code", sa.String(32), nullable=False),
        sa.Column("total_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("retain_until", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("result_id", "version", name="uq_marked_script_result_version"),
    )
    op.create_index("ix_marked_script_is_deleted", "marked_script", ["is_deleted"])
    op.create_index("ix_marked_script_assessment_id", "marked_script", ["assessment_id"])
    op.create_index("ix_marked_script_attempt_id", "marked_script", ["attempt_id"])
    op.create_index("ix_marked_script_student_id", "marked_script", ["student_id"])
    op.create_index("ix_marked_script_verification_code", "marked_script",
                    ["verification_code"], unique=True)


def downgrade() -> None:
    op.drop_table("marked_script")
