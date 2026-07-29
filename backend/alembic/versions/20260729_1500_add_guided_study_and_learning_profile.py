"""add_guided_study_and_learning_profile

Revision ID: 0a02e34b2c49
Revises: 0a02e34b2c48
Create Date: 2026-07-29 15:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic
revision: str = '0a02e34b2c49'
down_revision: Union[str, None] = '0a02e34b2c48'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. Add new enum values to aiactiontype
    op.execute("COMMIT")
    for value in ["GENERATE_STUDY_PLAN", "GENERATE_STUDY_LESSON", "GENERATE_KNOWLEDGE_CHECK", "GRADE_KNOWLEDGE_CHECK", "GENERATE_SESSION_SUMMARY"]:
        try:
            op.execute(f"ALTER TYPE aiactiontype ADD VALUE IF NOT EXISTS '{value}'")
        except Exception:
            pass

    # 1. Add guided study columns to study_session
    op.add_column('study_session', sa.Column('lesson_sections_json', sa.JSON(), nullable=True))
    op.add_column('study_session', sa.Column('lesson_status', sa.String(length=20), nullable=False, server_default="NOT_GENERATED"))
    op.add_column('study_session', sa.Column('current_section_index', sa.Integer(), nullable=False, server_default="0"))
    op.add_column('study_session', sa.Column('lesson_generated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('study_session', sa.Column('knowledge_check_answers', sa.JSON(), nullable=True))
    op.add_column('study_session', sa.Column('knowledge_check_score', sa.Float(), nullable=True))
    op.add_column('study_session', sa.Column('knowledge_check_report', sa.JSON(), nullable=True))
    op.add_column('study_session', sa.Column('session_summary_text', sa.Text(), nullable=True))

    # 2. Create student_learning_profile table
    op.create_table(
        'student_learning_profile',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('course_id', sa.UUID(), nullable=True),
        sa.Column('topic_confidence', sa.JSON(), nullable=True),
        sa.Column('weak_topics', sa.JSON(), nullable=True),
        sa.Column('total_sessions_completed', sa.Integer(), nullable=False, server_default="0"),
        sa.Column('average_knowledge_check_score', sa.Float(), nullable=True),
        sa.Column('current_streak_days', sa.Integer(), nullable=False, server_default="0"),
        sa.Column('last_studied_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default="false"),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['student_id'], ['user.id']),
        sa.ForeignKeyConstraint(['course_id'], ['course.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('student_id', 'course_id', name='uq_learning_profile_student_course')
    )
    op.create_index(op.f('ix_student_learning_profile_student_id'), 'student_learning_profile', ['student_id'], unique=False)
    op.create_index(op.f('ix_student_learning_profile_course_id'), 'student_learning_profile', ['course_id'], unique=False)
    op.create_index(op.f('ix_student_learning_profile_is_deleted'), 'student_learning_profile', ['is_deleted'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_student_learning_profile_is_deleted'), table_name='student_learning_profile')
    op.drop_index(op.f('ix_student_learning_profile_course_id'), table_name='student_learning_profile')
    op.drop_index(op.f('ix_student_learning_profile_student_id'), table_name='student_learning_profile')
    op.drop_table('student_learning_profile')

    op.drop_column('study_session', 'session_summary_text')
    op.drop_column('study_session', 'knowledge_check_report')
    op.drop_column('study_session', 'knowledge_check_score')
    op.drop_column('study_session', 'knowledge_check_answers')
    op.drop_column('study_session', 'lesson_generated_at')
    op.drop_column('study_session', 'current_section_index')
    op.drop_column('study_session', 'lesson_status')
    op.drop_column('study_session', 'lesson_sections_json')
