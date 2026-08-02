"""add_lesson_plan_json_notes_tutor_history

Revision ID: 0a02e34b2c50
Revises: 0a02e34b2c49
Create Date: 2026-08-01 13:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic
revision: str = '0a02e34b2c50'
down_revision: Union[str, None] = '0a02e34b2c49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new study session columns if not existing
    try:
        op.add_column('study_session', sa.Column('lesson_plan_json', sa.JSON(), nullable=True))
    except Exception:
        pass

    try:
        op.add_column('study_session', sa.Column('student_notes', sa.Text(), nullable=True))
    except Exception:
        pass

    try:
        op.add_column('study_session', sa.Column('tutor_chat_history', sa.JSON(), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_column('study_session', 'tutor_chat_history')
    except Exception:
        pass

    try:
        op.drop_column('study_session', 'student_notes')
    except Exception:
        pass

    try:
        op.drop_column('study_session', 'lesson_plan_json')
    except Exception:
        pass
