"""add group_id to assessment_question

Revision ID: 3d2a1b4c5d6e
Revises: 7c3f9f4d1a2b
Create Date: 2026-05-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '3d2a1b4c5d6e'
down_revision: Union[str, None] = '7c3f9f4d1a2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assessment_question', sa.Column('group_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_assessment_question_group_id'), 'assessment_question', ['group_id'], unique=False)
    op.create_foreign_key(
        'fk_assessment_question_group_id_student_group',
        'assessment_question', 'student_group',
        ['group_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_assessment_question_group_id_student_group', 'assessment_question', type_='foreignkey')
    op.drop_index(op.f('ix_assessment_question_group_id'), table_name='assessment_question')
    op.drop_column('assessment_question', 'group_id')
