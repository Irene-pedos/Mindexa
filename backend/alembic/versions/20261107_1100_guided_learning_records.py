"""Persist guided reflections, quiz drafts, and practice attempts.

Revision ID: 20261107_guided_records
Revises: 20261107_kc_count
Create Date: 2026-11-07 11:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20261107_guided_records"
down_revision: Union[str, None] = "20261107_kc_count"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "study_session",
        sa.Column("knowledge_check_draft_answers", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "study_session",
        sa.Column("knowledge_check_current_question_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "study_session",
        sa.Column("section_reflections_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "study_session",
        sa.Column("guided_practice_exercises_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "study_session",
        sa.Column("guided_practice_attempts_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("study_session", "guided_practice_attempts_json")
    op.drop_column("study_session", "guided_practice_exercises_json")
    op.drop_column("study_session", "section_reflections_json")
    op.drop_column("study_session", "knowledge_check_current_question_index")
    op.drop_column("study_session", "knowledge_check_draft_answers")
