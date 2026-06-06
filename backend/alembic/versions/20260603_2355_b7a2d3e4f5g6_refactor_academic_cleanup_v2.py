"""refactor_academic_cleanup_v2

Revision ID: b7a2d3e4f5g6
Revises: 66198628dbc3
Create Date: 2026-06-03 23:55:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
revision: str = 'b7a2d3e4f5g6'
down_revision: Union[str, None] = '66198628dbc3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Lecturer Course Assignment (Shared Teaching)
    # Check if table exists
    conn = op.get_bind()
    res = conn.execute(sa.text("SELECT to_regclass('public.lecturer_course_assignment')"))
    if not res.scalar():
        op.create_table('lecturer_course_assignment',
            sa.Column('lecturer_id', sa.UUID(), nullable=False),
            sa.Column('course_id', sa.UUID(), nullable=False),
            sa.Column('assignment_role', sa.String(length=50), nullable=False, server_default='PRIMARY'),
            sa.Column('assigned_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.ForeignKeyConstraint(['course_id'], ['course.id'], ),
            sa.ForeignKeyConstraint(['lecturer_id'], ['user.id'], ),
            sa.PrimaryKeyConstraint('lecturer_id', 'course_id')
        )

    # 2. Cleanup obsolete tables
    try:
        op.drop_table('lecturer_option')
    except: pass

    # 3. Handle Class Section constraints properly
    try:
        op.drop_constraint('uq_class_section_group_name', 'class_section', type_='unique')
    except: pass
    
    try:
        op.create_unique_constraint('uq_class_section_scope_year', 'class_section', ['class_group_id', 'name', 'academic_year'])
    except: pass

    # 4. Department Metadata
    try:
        op.drop_column('department', 'head_lecturer_id')
    except: pass

def downgrade() -> None:
    pass
