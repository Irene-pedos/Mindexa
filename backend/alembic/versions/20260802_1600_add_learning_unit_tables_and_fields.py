"""add_learning_unit_tables_and_fields

Revision ID: 0a02e34b2c51
Revises: 0a02e34b2c50
Create Date: 2026-08-02 16:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic
revision: str = '0a02e34b2c51'
down_revision: Union[str, None] = '0a02e34b2c50'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    return table_name in inspector.get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    try:
        cols = [col["name"] for col in inspector.get_columns(table_name)]
    except Exception:
        return False
    return column_name in cols


def upgrade() -> None:
    # 1. Create learning_unit table
    if not _has_table('learning_unit'):
        op.create_table(
            'learning_unit',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('teaching_workspace_id', sa.UUID(), nullable=False),
            sa.Column('source_material_id', sa.UUID(), nullable=True),
            sa.Column('order_index', sa.Integer(), nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('summary', sa.Text(), nullable=True),
            sa.Column('source_chunk_ids', sa.JSON(), nullable=True),
            sa.Column('estimated_study_minutes', sa.Integer(), nullable=False, server_default='45'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
            sa.ForeignKeyConstraint(['teaching_workspace_id'], ['teaching_workspace.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['source_material_id'], ['lecturer_material.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('teaching_workspace_id', 'order_index', name='uq_lu_workspace_order'),
        )
        op.create_index('ix_learning_unit_teaching_workspace_id', 'learning_unit', ['teaching_workspace_id'])
        op.create_index('ix_learning_unit_order_index', 'learning_unit', ['order_index'])

    # 2. Create student_learning_unit_progress table
    if not _has_table('student_learning_unit_progress'):
        op.create_table(
            'student_learning_unit_progress',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('student_id', sa.UUID(), nullable=False),
            sa.Column('learning_unit_id', sa.UUID(), nullable=False),
            sa.Column('status', sa.String(length=30), nullable=False, server_default='NOT_STARTED'),
            sa.Column('confidence_score', sa.Integer(), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('linked_session_id', sa.UUID(), nullable=True),
            sa.ForeignKeyConstraint(['student_id'], ['user.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['learning_unit_id'], ['learning_unit.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['linked_session_id'], ['study_session.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('student_id', 'learning_unit_id', name='uq_student_lu'),
        )
        op.create_index('ix_student_learning_unit_progress_student_id', 'student_learning_unit_progress', ['student_id'])
        op.create_index('ix_student_learning_unit_progress_learning_unit_id', 'student_learning_unit_progress', ['learning_unit_id'])

    # 3. Create assessment_learning_unit_coverage table
    if not _has_table('assessment_learning_unit_coverage'):
        op.create_table(
            'assessment_learning_unit_coverage',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('assessment_id', sa.UUID(), nullable=False),
            sa.Column('learning_unit_id', sa.UUID(), nullable=False),
            sa.Column('weight_percent', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['assessment_id'], ['assessment.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['learning_unit_id'], ['learning_unit.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_assessment_learning_unit_coverage_assessment_id', 'assessment_learning_unit_coverage', ['assessment_id'])
        op.create_index('ix_assessment_learning_unit_coverage_learning_unit_id', 'assessment_learning_unit_coverage', ['learning_unit_id'])

    # 4. Add columns to study_plan
    if not _has_column('study_plan', 'target_mode'):
        op.add_column('study_plan', sa.Column('target_mode', sa.String(length=50), nullable=False, server_default='full_assessment_coverage'))

    if not _has_column('study_plan', 'target_learning_unit_id'):
        op.add_column('study_plan', sa.Column('target_learning_unit_id', sa.UUID(), nullable=True))
        op.create_foreign_key('fk_study_plan_target_learning_unit_id', 'study_plan', 'learning_unit', ['target_learning_unit_id'], ['id'], ondelete='SET NULL')

    # 5. Add columns to study_session
    if not _has_column('study_session', 'learning_unit_id'):
        op.add_column('study_session', sa.Column('learning_unit_id', sa.UUID(), nullable=True))
        op.create_foreign_key('fk_study_session_learning_unit_id', 'study_session', 'learning_unit', ['learning_unit_id'], ['id'], ondelete='SET NULL')
        op.create_index('ix_study_session_learning_unit_id', 'study_session', ['learning_unit_id'])

    if not _has_column('study_session', 'source_material_ids'):
        op.add_column('study_session', sa.Column('source_material_ids', sa.JSON(), nullable=True))
        op.execute(sa.text("UPDATE study_session SET source_material_ids = '[]' WHERE source_material_ids IS NULL"))


def downgrade() -> None:
    if _has_column('study_session', 'source_material_ids'):
        op.drop_column('study_session', 'source_material_ids')
    if _has_column('study_session', 'learning_unit_id'):
        op.drop_constraint('fk_study_session_learning_unit_id', 'study_session', type_='foreignkey')
        op.drop_index('ix_study_session_learning_unit_id', table_name='study_session')
        op.drop_column('study_session', 'learning_unit_id')

    if _has_column('study_plan', 'target_learning_unit_id'):
        op.drop_constraint('fk_study_plan_target_learning_unit_id', 'study_plan', type_='foreignkey')
        op.drop_column('study_plan', 'target_learning_unit_id')

    if _has_column('study_plan', 'target_mode'):
        op.drop_column('study_plan', 'target_mode')

    if _has_table('assessment_learning_unit_coverage'):
        op.drop_table('assessment_learning_unit_coverage')

    if _has_table('student_learning_unit_progress'):
        op.drop_table('student_learning_unit_progress')

    if _has_table('learning_unit'):
        op.drop_table('learning_unit')
