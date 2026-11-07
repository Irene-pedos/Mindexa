"""Track knowledge-check attempts for correct running averages.

Revision ID: 20261107_kc_count
Revises: 20261107_guided_stage
Create Date: 2026-11-07 10:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20261107_kc_count"
down_revision: Union[str, None] = "20261107_guided_stage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "student_learning_profile",
        sa.Column("knowledge_check_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        "UPDATE student_learning_profile "
        "SET knowledge_check_count = 1 "
        "WHERE average_knowledge_check_score IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("student_learning_profile", "knowledge_check_count")
