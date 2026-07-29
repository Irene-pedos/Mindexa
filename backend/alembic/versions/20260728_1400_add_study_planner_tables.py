"""add_study_planner_tables

Revision ID: 0a02e34b2c48
Revises: e7029ae23c0b
Create Date: 2026-07-28 14:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision: str = '0a02e34b2c48'
down_revision: Union[str, None] = '0a02e34b2c47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'study_plans',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('study_type', sa.String(length=50), nullable=False, server_default="Assessment Preparation"),
        sa.Column('course_id', sa.UUID(), nullable=True),
        sa.Column('teaching_workspace_id', sa.UUID(), nullable=True),
        sa.Column('assessment_id', sa.UUID(), nullable=True),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('available_days', sa.JSON(), nullable=True),
        sa.Column('blackout_dates', sa.JSON(), nullable=True),
        sa.Column('preferred_time_start', sa.String(length=10), nullable=False, server_default="19:00"),
        sa.Column('preferred_time_end', sa.String(length=10), nullable=False, server_default="21:00"),
        sa.Column('session_duration_minutes', sa.Integer(), nullable=False, server_default="60"),
        sa.Column('daily_goal', sa.String(length=255), nullable=False, server_default="Study 1 topic per session"),
        sa.Column('preferred_difficulty', sa.String(length=30), nullable=False, server_default="Balanced"),
        sa.Column('reminder_preference_minutes', sa.Integer(), nullable=False, server_default="30"),
        sa.Column('reminder_channels', sa.JSON(), nullable=True),
        sa.Column('priority', sa.String(length=20), nullable=False, server_default="Medium"),
        sa.Column('status', sa.String(length=20), nullable=False, server_default="ACTIVE"),
        sa.Column('auto_generated', sa.Boolean(), nullable=False, server_default="false"),
        sa.Column('streak_count', sa.Integer(), nullable=False, server_default="0"),
        sa.Column('readiness_score', sa.Integer(), nullable=False, server_default="85"),
        sa.Column('readiness_history', sa.JSON(), nullable=True),
        sa.Column('covered_material_ids', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(['student_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['course_id'], ['course.id'], ),
        sa.ForeignKeyConstraint(['teaching_workspace_id'], ['teaching_workspace.id'], ),
        sa.ForeignKeyConstraint(['assessment_id'], ['assessment.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_study_plans_student_id'), 'study_plans', ['student_id'], unique=False)
    op.create_index(op.f('ix_study_plans_course_id'), 'study_plans', ['course_id'], unique=False)

    op.create_table(
        'study_sessions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('study_plan_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('topic', sa.String(length=255), nullable=False),
        sa.Column('session_type', sa.String(length=30), nullable=False, server_default="STUDY"),
        sa.Column('scheduled_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('scheduled_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False, server_default="60"),
        sa.Column('status', sa.String(length=20), nullable=False, server_default="SCHEDULED"),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('understanding_level', sa.String(length=20), nullable=True),
        sa.Column('difficulty_rating', sa.String(length=20), nullable=True),
        sa.Column('confidence_rating', sa.Integer(), nullable=True),
        sa.Column('feedback_notes', sa.Text(), nullable=True),
        sa.Column('checklist_items', sa.JSON(), nullable=True),
        sa.Column('quiz_questions', sa.JSON(), nullable=True),
        sa.Column('recommended_resource_ids', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(['study_plan_id'], ['study_plans.id'], ),
        sa.ForeignKeyConstraint(['student_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_study_sessions_study_plan_id'), 'study_sessions', ['study_plan_id'], unique=False)
    op.create_index(op.f('ix_study_sessions_student_id'), 'study_sessions', ['student_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_study_sessions_student_id'), table_name='study_sessions')
    op.drop_index(op.f('ix_study_sessions_study_plan_id'), table_name='study_sessions')
    op.drop_table('study_sessions')
    op.drop_index(op.f('ix_study_plans_course_id'), table_name='study_plans')
    op.drop_index(op.f('ix_study_plans_student_id'), table_name='study_plans')
    op.drop_table('study_plans')
