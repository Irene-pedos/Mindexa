"""add_feedback_author_basis_to_result_breakdown

Revision ID: 43a7d2eedf5d
Revises: a3f7c91e2d84
Create Date: 2026-07-01 10:30:00.000000

Adds the feedback_author_basis column to the result_breakdown table so
result breakdown rows can track whether feedback came from a lecturer or AI.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic
revision: str = "43a7d2eedf5d"
down_revision: Union[str, None] = "a3f7c91e2d84"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "submission_grade",
        sa.Column(
            "feedback_author_basis",
            sa.String(),
            nullable=False,
            server_default=sa.text("'LECTURER'"),
        ),
    )
    op.add_column(
        "result_breakdown",
        sa.Column(
            "feedback_author_basis",
            sa.String(),
            nullable=True,
            server_default=sa.text("'LECTURER'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("result_breakdown", "feedback_author_basis")
    op.drop_column("submission_grade", "feedback_author_basis")
