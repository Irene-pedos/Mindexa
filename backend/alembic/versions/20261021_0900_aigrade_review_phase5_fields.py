"""Phase 5: Add ReviewAgent v2 persistence fields to ai_grade_review

Revision ID: 20261021_p5_aigrade_review
Revises: 20261015_p5_marking
Create Date: 2026-10-21 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261021_p5_aigrade_review"
down_revision: Union[str, None] = "20261015_p5_marking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_grade_review",
        sa.Column("suggested_score", sa.Float(), nullable=True),
    )
    op.add_column(
        "ai_grade_review",
        sa.Column("key_points_coverage", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "ai_grade_review",
        sa.Column("interpretation_note", sa.Text(), nullable=True),
    )
    op.add_column(
        "ai_grade_review",
        sa.Column("evidence_validation", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ai_grade_review", "evidence_validation")
    op.drop_column("ai_grade_review", "interpretation_note")
    op.drop_column("ai_grade_review", "key_points_coverage")
    op.drop_column("ai_grade_review", "suggested_score")
