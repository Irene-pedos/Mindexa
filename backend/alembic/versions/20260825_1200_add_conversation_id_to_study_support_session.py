"""Add conversation_id to study_support_sessions.

Revision ID: 20260825_1200_study_support_conv
Revises: 20260824_1130_progress_layout
Create Date: 2026-08-25 12:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260825_1200_study_support_conv"
down_revision = "20260824_1130_progress_layout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_support_sessions",
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # Backfill existing rows: each row gets its own conversation_id (fallback to its own id)
    op.execute(
        "UPDATE study_support_sessions SET conversation_id = id WHERE conversation_id IS NULL"
    )
    op.alter_column(
        "study_support_sessions",
        "conversation_id",
        nullable=False,
    )
    op.create_index(
        "ix_study_support_sessions_conversation_id",
        "study_support_sessions",
        ["conversation_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_study_support_sessions_conversation_id",
        table_name="study_support_sessions",
    )
    op.drop_column("study_support_sessions", "conversation_id")
