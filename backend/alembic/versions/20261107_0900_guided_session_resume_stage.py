"""Persist the active guided study stage for session resume.

Revision ID: 20261107_guided_stage
Revises: 20261029_material_progress
Create Date: 2026-11-07 09:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20261107_guided_stage"
down_revision: Union[str, None] = "20261029_material_progress"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "study_session",
        sa.Column(
            "guided_stage",
            sa.String(length=24),
            nullable=False,
            server_default=sa.text("'intro'"),
        ),
    )
    op.execute(
        "UPDATE study_session SET guided_stage = 'summary' "
        "WHERE lesson_status = 'COMPLETED'"
    )


def downgrade() -> None:
    op.drop_column("study_session", "guided_stage")
