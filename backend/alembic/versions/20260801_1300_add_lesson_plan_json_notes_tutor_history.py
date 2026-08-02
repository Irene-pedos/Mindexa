"""add_lesson_plan_json_notes_tutor_history

Revision ID: 0a02e34b2c50
Revises: 0a02e34b2c49
Create Date: 2026-08-01 13:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic
revision: str = '0a02e34b2c50'
down_revision: Union[str, None] = '0a02e34b2c49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    try:
        cols = [col["name"] for col in inspector.get_columns(table_name)]
    except Exception:
        return False
    return column_name in cols


def upgrade() -> None:
    if not _has_column('study_session', 'lesson_plan_json'):
        op.add_column('study_session', sa.Column('lesson_plan_json', sa.JSON(), nullable=True))

    if not _has_column('study_session', 'student_notes'):
        op.add_column('study_session', sa.Column('student_notes', sa.Text(), nullable=True))

    if not _has_column('study_session', 'tutor_chat_history'):
        op.add_column('study_session', sa.Column('tutor_chat_history', sa.JSON(), nullable=True))

    op.execute(sa.text("UPDATE study_session SET tutor_chat_history = '[]' WHERE tutor_chat_history IS NULL"))
    op.alter_column(
        'study_session',
        'tutor_chat_history',
        existing_type=sa.JSON(),
        nullable=False,
    )


def downgrade() -> None:
    if _has_column('study_session', 'tutor_chat_history'):
        op.drop_column('study_session', 'tutor_chat_history')

    if _has_column('study_session', 'student_notes'):
        op.drop_column('study_session', 'student_notes')

    if _has_column('study_session', 'lesson_plan_json'):
        op.drop_column('study_session', 'lesson_plan_json')
