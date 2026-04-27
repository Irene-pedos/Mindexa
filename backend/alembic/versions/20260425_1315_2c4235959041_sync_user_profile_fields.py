"""sync_user_profile_fields

Revision ID: 2c4235959041
Revises: 1a4e32bbe1e5
Create Date: 2026-04-25 13:15:17.624679

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision: str = '2c4235959041'
down_revision: Union[str, None] = '1a4e32bbe1e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Define ENUMs ─────────────────────────────────────────────────────────
    # Using checkfirst=True ensures they are only created if they don't exist.
    result_letter_grade_enum = sa.Enum('A_PLUS', 'A', 'A_MINUS', 'B_PLUS', 'B', 'B_MINUS', 'C_PLUS', 'C', 'C_MINUS', 'D', 'F', name='resultlettergrade')
    supervision_status_enum = sa.Enum('ACTIVE', 'ENDED', name='supervisionsessionstatus')
    risk_level_enum = sa.Enum('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='risklevel')
    
    # ── Ensure ENUMs exist ──────────────────────────────────────────────────
    # For existing enums, add new values if they don't exist
    op.execute("ALTER TYPE aibatchstatus ADD VALUE IF NOT EXISTS 'PROCESSING'")
    op.execute("ALTER TYPE aibatchstatus ADD VALUE IF NOT EXISTS 'PARTIAL_FAILURE'")
    op.execute("ALTER TYPE aiquestiondecision ADD VALUE IF NOT EXISTS 'NEEDS_REVISION'")
    op.execute("ALTER TYPE integrityflagstatus ADD VALUE IF NOT EXISTS 'UNDER_REVIEW'")
    op.execute("ALTER TYPE integrityflagstatus ADD VALUE IF NOT EXISTS 'CONFIRMED'")

    # Create new enums
    result_letter_grade_enum.create(op.get_bind(), checkfirst=True)
    supervision_status_enum.create(op.get_bind(), checkfirst=True)
    risk_level_enum.create(op.get_bind(), checkfirst=True)

    # ── Table Definitions ───────────────────────────────────────────────────
    
    op.create_table('ai_generation_batch',
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_by_id', sa.UUID(), nullable=False),
    sa.Column('assessment_id', sa.UUID(), nullable=True),
    sa.Column('question_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('difficulty', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('total_requested', sa.Integer(), nullable=False),
    sa.Column('subject', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('topic', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('bloom_level', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('full_prompt', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('additional_context', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column(
        'status',
        postgresql.ENUM(
            'PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED',
            name='aibatchstatus', create_type=False,
        ),
        nullable=False,
    ),
    sa.Column('total_generated', sa.Integer(), nullable=False),
    sa.Column('total_failed', sa.Integer(), nullable=False),
    sa.Column('started_at', sa.DateTime(), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('error_message', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('ai_model_used', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('ai_provider', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('total_tokens_used', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['assessment_id'], ['assessment.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_generation_batch_assessment_id'), 'ai_generation_batch', ['assessment_id'], unique=False)
    op.create_index(op.f('ix_ai_generation_batch_created_by_id'), 'ai_generation_batch', ['created_by_id'], unique=False)
    op.create_index(op.f('ix_ai_generation_batch_is_deleted'), 'ai_generation_batch', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_ai_generation_batch_status'), 'ai_generation_batch', ['status'], unique=False)

    op.create_table('ai_generated_question',
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('batch_id', sa.UUID(), nullable=False),
    sa.Column('generated_content', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('question_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('difficulty', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('raw_prompt', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('parsed_successfully', sa.Boolean(), nullable=False),
    sa.Column('parsed_question_text', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('parsed_options_json', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('parsed_explanation', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('parse_error', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column(
        'review_status',
        postgresql.ENUM(
            'PENDING', 'ACCEPTED', 'MODIFIED', 'REJECTED', 'NEEDS_REVISION',
            name='aiquestiondecision', create_type=False,
        ),
        nullable=False,
    ),
    sa.ForeignKeyConstraint(['batch_id'], ['ai_generation_batch.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_generated_question_batch_id'), 'ai_generated_question', ['batch_id'], unique=False)
    op.create_index(op.f('ix_ai_generated_question_is_deleted'), 'ai_generated_question', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_ai_generated_question_review_status'), 'ai_generated_question', ['review_status'], unique=False)

    op.create_table('assessment_result',
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('attempt_id', sa.UUID(), nullable=False),
    sa.Column('student_id', sa.Uuid(), nullable=False),
    sa.Column('assessment_id', sa.Uuid(), nullable=False),
    sa.Column('total_score', sa.Float(), nullable=False),
    sa.Column('max_score', sa.Float(), nullable=False),
    sa.Column('percentage', sa.Float(), nullable=False),
    sa.Column('letter_grade', postgresql.ENUM(name='resultlettergrade', create_type=False), nullable=True),
    sa.Column('is_passing', sa.Boolean(), nullable=False),
    sa.Column('is_released', sa.Boolean(), nullable=False),
    sa.Column('released_at', sa.DateTime(), nullable=True),
    sa.Column('released_by_id', sa.Uuid(), nullable=True),
    sa.Column('integrity_hold', sa.Boolean(), nullable=False),
    sa.Column('calculated_at', sa.DateTime(), nullable=False),
    sa.Column('graded_question_count', sa.Integer(), nullable=False),
    sa.Column('total_question_count', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['attempt_id'], ['assessment_attempt.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('attempt_id', name='uq_assessment_result_attempt')
    )
    op.create_index(op.f('ix_assessment_result_assessment_id'), 'assessment_result', ['assessment_id'], unique=False)
    op.create_index(op.f('ix_assessment_result_attempt_id'), 'assessment_result', ['attempt_id'], unique=False)
    op.create_index(op.f('ix_assessment_result_integrity_hold'), 'assessment_result', ['integrity_hold'], unique=False)
    op.create_index(op.f('ix_assessment_result_is_deleted'), 'assessment_result', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_assessment_result_is_released'), 'assessment_result', ['is_released'], unique=False)
    op.create_index('ix_assessment_result_is_released_integrity_hold', 'assessment_result', ['is_released', 'integrity_hold'], unique=False)
    op.create_index(op.f('ix_assessment_result_student_id'), 'assessment_result', ['student_id'], unique=False)

    op.create_table('result_breakdown',
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('result_id', sa.UUID(), nullable=False),
    sa.Column('question_id', sa.Uuid(), nullable=False),
    sa.Column('attempt_id', sa.Uuid(), nullable=False),
    sa.Column('score', sa.Float(), nullable=True),
    sa.Column('max_score', sa.Float(), nullable=False),
    sa.Column('is_correct', sa.Boolean(), nullable=True),
    sa.Column('feedback', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('grading_mode', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('was_skipped', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['result_id'], ['assessment_result.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('result_id', 'question_id', name='uq_result_breakdown_result_question')
    )
    op.create_index(op.f('ix_result_breakdown_attempt_id'), 'result_breakdown', ['attempt_id'], unique=False)
    op.create_index(op.f('ix_result_breakdown_is_deleted'), 'result_breakdown', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_result_breakdown_question_id'), 'result_breakdown', ['question_id'], unique=False)
    op.create_index(op.f('ix_result_breakdown_result_id'), 'result_breakdown', ['result_id'], unique=False)
    op.create_index('ix_result_breakdown_result_id_question_id', 'result_breakdown', ['result_id', 'question_id'], unique=False)

    op.create_table('grading_queue_item',
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('response_id', sa.UUID(), nullable=False),
    sa.Column('attempt_id', sa.UUID(), nullable=False),
    sa.Column('assessment_id', sa.UUID(), nullable=False),
    sa.Column('question_id', sa.UUID(), nullable=False),
    sa.Column('student_id', sa.UUID(), nullable=False),
    sa.Column('grading_mode', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('priority', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('ai_pre_graded', sa.Boolean(), nullable=False),
    sa.Column('assigned_to_id', sa.UUID(), nullable=True),
    sa.Column('assigned_at', sa.DateTime(), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['assessment_id'], ['assessment.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['assigned_to_id'], ['user.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['attempt_id'], ['assessment_attempt.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['question_id'], ['question.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['response_id'], ['student_response.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['student_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_grading_queue_item_assessment_id'), 'grading_queue_item', ['assessment_id'], unique=False)
    op.create_index(op.f('ix_grading_queue_item_assigned_to_id'), 'grading_queue_item', ['assigned_to_id'], unique=False)
    op.create_index(op.f('ix_grading_queue_item_attempt_id'), 'grading_queue_item', ['attempt_id'], unique=False)
    op.create_index(op.f('ix_grading_queue_item_is_deleted'), 'grading_queue_item', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_grading_queue_item_question_id'), 'grading_queue_item', ['question_id'], unique=False)
    op.create_index(op.f('ix_grading_queue_item_response_id'), 'grading_queue_item', ['response_id'], unique=False)
    op.create_index(op.f('ix_grading_queue_item_status'), 'grading_queue_item', ['status'], unique=False)
    op.create_index(op.f('ix_grading_queue_item_student_id'), 'grading_queue_item', ['student_id'], unique=False)

    op.create_table('student_response_log',
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('response_id', sa.UUID(), nullable=False),
    sa.Column('attempt_id', sa.UUID(), nullable=False),
    sa.Column('question_id', sa.UUID(), nullable=False),
    sa.Column('change_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('previous_value', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('new_value', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['attempt_id'], ['assessment_attempt.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['question_id'], ['question.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['response_id'], ['student_response.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_student_response_log_attempt_id'), 'student_response_log', ['attempt_id'], unique=False)
    op.create_index(op.f('ix_student_response_log_is_deleted'), 'student_response_log', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_student_response_log_question_id'), 'student_response_log', ['question_id'], unique=False)
    op.create_index(op.f('ix_student_response_log_response_id'), 'student_response_log', ['response_id'], unique=False)

    # ── Drop old tables and indexes ───────────────────────────────────────────
    op.drop_index('ix_ai_question_generation_batch_ai_action_log_id', table_name='ai_question_generation_batch')
    op.drop_index('ix_ai_question_generation_batch_assessment_id', table_name='ai_question_generation_batch')
    op.drop_index('ix_ai_question_generation_batch_assessment_id_review_completed', table_name='ai_question_generation_batch')
    op.drop_index('ix_ai_question_generation_batch_assessment_id_status', table_name='ai_question_generation_batch')
    op.drop_index('ix_ai_question_generation_batch_assessment_section_id', table_name='ai_question_generation_batch')
    op.drop_index('ix_ai_question_generation_batch_initiated_by_id', table_name='ai_question_generation_batch')
    op.drop_index('ix_ai_question_generation_batch_is_deleted', table_name='ai_question_generation_batch')
    op.drop_index('ix_ai_question_generation_batch_review_completed', table_name='ai_question_generation_batch')
    op.drop_index('ix_ai_question_generation_batch_status', table_name='ai_question_generation_batch')
    op.drop_constraint('ai_question_review_batch_id_fkey', 'ai_question_review', type_='foreignkey')
    op.drop_table('ai_question_generation_batch')

    # ── Update ai_question_review ───────────────────────────────────────────
    op.add_column('ai_question_review', sa.Column('ai_question_id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False))
    op.add_column('ai_question_review', sa.Column('reviewer_id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False))
    op.add_column('ai_question_review', sa.Column('decision', sqlmodel.sql.sqltypes.AutoString(), server_default='', nullable=False))
    op.add_column('ai_question_review', sa.Column('modified_question_text', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ai_question_review', sa.Column('modified_options_json', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ai_question_review', sa.Column('modified_explanation', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ai_question_review', sa.Column('reviewer_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('ai_question_review', sa.Column('reviewed_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False))
    
    op.drop_index('ix_ai_question_review_ai_action_log_id', table_name='ai_question_review')
    op.drop_index('ix_ai_question_review_batch_id', table_name='ai_question_review')
    op.drop_index('ix_ai_question_review_batch_id_lecturer_decision', table_name='ai_question_review')
    op.drop_index('ix_ai_question_review_lecturer_decision', table_name='ai_question_review')
    op.drop_index('ix_ai_question_review_lecturer_id', table_name='ai_question_review')
    op.drop_index('ix_ai_question_review_question_id', table_name='ai_question_review')
    op.drop_constraint('uq_ai_question_review_batch_question', 'ai_question_review', type_='unique')
    
    op.create_index(op.f('ix_ai_question_review_ai_question_id'), 'ai_question_review', ['ai_question_id'], unique=False)
    op.create_index(op.f('ix_ai_question_review_decision'), 'ai_question_review', ['decision'], unique=False)
    op.create_index(op.f('ix_ai_question_review_reviewer_id'), 'ai_question_review', ['reviewer_id'], unique=False)
    
    op.drop_constraint('ai_question_review_question_id_fkey', 'ai_question_review', type_='foreignkey')
    op.create_foreign_key(None, 'ai_question_review', 'user', ['reviewer_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key(None, 'ai_question_review', 'ai_generated_question', ['ai_question_id'], ['id'], ondelete='CASCADE')
    
    op.drop_column('ai_question_review', 'ai_action_log_id')
    op.drop_column('ai_question_review', 'added_to_bank')
    op.drop_column('ai_question_review', 'decided_at')
    op.drop_column('ai_question_review', 'candidate_order')
    op.drop_column('ai_question_review', 'batch_id')
    op.drop_column('ai_question_review', 'lecturer_decision')
    op.drop_column('ai_question_review', 'ai_raw_output')
    op.drop_column('ai_question_review', 'added_to_assessment')
    op.drop_column('ai_question_review', 'modification_summary')
    op.drop_column('ai_question_review', 'lecturer_id')
    op.drop_column('ai_question_review', 'question_id')

    # ── Update assessment ───────────────────────────────────────────────────
    op.add_column('assessment', sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('assessment', sa.Column('subject', sqlmodel.sql.sqltypes.AutoString(length=200), nullable=True))
    op.add_column('assessment', sa.Column('target_class', sqlmodel.sql.sqltypes.AutoString(length=200), nullable=True))
    op.add_column('assessment', sa.Column('randomize_questions', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))
    op.add_column('assessment', sa.Column('randomize_options', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))
    op.add_column('assessment', sa.Column('is_ai_generation_enabled', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))
    op.add_column('assessment', sa.Column('show_marks_per_question', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')))
    op.add_column('assessment', sa.Column('show_feedback_after_submit', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')))
    
    op.alter_column('assessment', 'course_id', existing_type=sa.UUID(), nullable=True)
    op.drop_column('assessment', 'randomise_options')
    op.drop_column('assessment', 'randomise_questions')

    # ── Update assessment_attempt ───────────────────────────────────────────
    op.add_column('assessment_attempt', sa.Column('access_token', sa.UUID(), nullable=True))
    op.add_column('assessment_attempt', sa.Column('expires_at', sa.DateTime(), nullable=True))
    op.add_column('assessment_attempt', sa.Column('last_activity_at', sa.DateTime(), nullable=True))
    op.add_column('assessment_attempt', sa.Column('total_score', sa.Float(), nullable=True))
    op.add_column('assessment_attempt', sa.Column('total_integrity_warnings', sa.Integer(), nullable=False, server_default='0'))
    
    op.create_index(op.f('ix_assessment_attempt_access_token'), 'assessment_attempt', ['access_token'], unique=False)
    op.create_index(op.f('ix_assessment_attempt_expires_at'), 'assessment_attempt', ['expires_at'], unique=False)

    # ── Update assessment_blueprint_rule ────────────────────────────────────
    op.add_column('assessment_blueprint_rule', sa.Column('value_json', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('assessment_blueprint_rule', sa.Column('priority', sa.Integer(), nullable=False, server_default='100'))
    op.add_column('assessment_blueprint_rule', sa.Column('is_blocking', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')))
    op.add_column('assessment_blueprint_rule', sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    # ── Update integrity_event ──────────────────────────────────────────────
    op.alter_column('integrity_event', 'metadata_json',
               existing_type=sa.VARCHAR(),
               server_default=sa.text("'{}'::jsonb"),
               type_=postgresql.JSONB(astext_type=sa.Text()),
               existing_nullable=True,
               postgresql_using="metadata_json::jsonb")
               
    op.drop_index('ix_integrity_event_assessment_id_severity', table_name='integrity_event')
    op.drop_index('ix_integrity_event_is_processed_by_ai', table_name='integrity_event')
    op.drop_index('ix_integrity_event_is_processed_by_ai_severity', table_name='integrity_event')
    op.drop_index('ix_integrity_event_occurred_at', table_name='integrity_event')
    op.drop_index('ix_integrity_event_severity', table_name='integrity_event')
    
    op.drop_constraint('integrity_event_assessment_id_fkey', 'integrity_event', type_='foreignkey')
    
    op.drop_column('integrity_event', 'severity')
    op.drop_column('integrity_event', 'occurred_at')
    op.drop_column('integrity_event', 'risk_score_delta')
    op.drop_column('integrity_event', 'is_processed_by_ai')
    op.drop_column('integrity_event', 'question_id')

    # ── Update integrity_flag ───────────────────────────────────────────────
    op.add_column(
        'integrity_flag',
        sa.Column(
            'status',
            postgresql.ENUM(
                'OPEN', 'UNDER_REVIEW', 'CONFIRMED', 'DISMISSED', 'ESCALATED',
                name='integrityflagstatus', create_type=False,
            ),
            server_default='OPEN',
            nullable=False,
        ),
    )
    op.add_column('integrity_flag', sa.Column('risk_level', sa.Enum(name='risklevel', create_type=False), server_default='NONE', nullable=False))
    op.add_column('integrity_flag', sa.Column('raised_by_id', sa.Uuid(), nullable=True))
    op.add_column('integrity_flag', sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), server_default='', nullable=False))
    op.add_column('integrity_flag', sa.Column('evidence_event_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('integrity_flag', sa.Column('resolved_by_id', sa.Uuid(), nullable=True))
    op.add_column('integrity_flag', sa.Column('resolution_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    
    op.drop_index('ix_integrity_flag_assessment_id_flag_status', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_assessment_id_resolved_at', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_attempt_id_flag_status', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_flag_status', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_flag_status_raised_by', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_raised_at', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_raised_by', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_raised_by_lecturer_id', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_resolved_at', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_reviewer_id', table_name='integrity_flag')
    op.drop_index('ix_integrity_flag_triggering_warning_id', table_name='integrity_flag')
    
    op.create_index('ix_integrity_flag_assessment_id_status', 'integrity_flag', ['assessment_id', 'status'], unique=False)
    op.create_index('ix_integrity_flag_attempt_id_status', 'integrity_flag', ['attempt_id', 'status'], unique=False)
    op.create_index(op.f('ix_integrity_flag_risk_level'), 'integrity_flag', ['risk_level'], unique=False)
    op.create_index(op.f('ix_integrity_flag_status'), 'integrity_flag', ['status'], unique=False)
    
    op.drop_constraint('integrity_flag_assessment_id_fkey', 'integrity_flag', type_='foreignkey')
    op.drop_constraint('integrity_flag_attempt_id_fkey', 'integrity_flag', type_='foreignkey')
    create_fkey_flag_attempt = "ALTER TABLE integrity_flag ADD CONSTRAINT integrity_flag_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES assessment_attempt(id) ON DELETE CASCADE"
    op.execute(create_fkey_flag_attempt)
    
    op.drop_column('integrity_flag', 'reviewer_id')
    op.drop_column('integrity_flag', 'triggering_warning_id')
    op.drop_column('integrity_flag', 'summary')
    op.drop_column('integrity_flag', 'review_started_at')
    op.drop_column('integrity_flag', 'raised_at')
    op.drop_column('integrity_flag', 'flag_status')
    op.drop_column('integrity_flag', 'resolution_decision')
    op.drop_column('integrity_flag', 'raised_by_lecturer_id')
    op.drop_column('integrity_flag', 'grade_impact')

    # ── Update integrity_warning ────────────────────────────────────────────
    op.add_column('integrity_warning', sa.Column('issued_by_id', sa.Uuid(), nullable=True))
    op.add_column('integrity_warning', sa.Column('issued_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False))
    op.add_column('integrity_warning', sa.Column('trigger_event_id', sa.Uuid(), nullable=True))
    op.add_column('integrity_warning', sa.Column('raised_flag_id', sa.Uuid(), nullable=True))
    
    op.drop_index('ix_integrity_warning_acknowledged_at', table_name='integrity_warning')
    op.drop_index('ix_integrity_warning_assessment_id_warning_level', table_name='integrity_warning')
    op.drop_index('ix_integrity_warning_attempt_id_acknowledged_at', table_name='integrity_warning')
    op.drop_index('ix_integrity_warning_attempt_id_created_at', table_name='integrity_warning')
    op.drop_index('ix_integrity_warning_issued_by_lecturer_id', table_name='integrity_warning')
    op.drop_index('ix_integrity_warning_triggered_by_event_id', table_name='integrity_warning')
    
    op.create_index('ix_integrity_warning_attempt_id_warning_level', 'integrity_warning', ['attempt_id', 'warning_level'], unique=False)
    
    op.drop_constraint('integrity_warning_assessment_id_fkey', 'integrity_warning', type_='foreignkey')
    op.drop_constraint('integrity_warning_triggered_by_event_id_fkey', 'integrity_warning', type_='foreignkey')
    
    op.drop_column('integrity_warning', 'triggered_by_event_id')
    op.drop_column('integrity_warning', 'is_system_issued')
    op.drop_column('integrity_warning', 'warning_number')
    op.drop_column('integrity_warning', 'issued_by_lecturer_id')

    # ── Update password_reset_token ─────────────────────────────────────────
    op.add_column('password_reset_token', sa.Column('token_purpose', sa.String(length=30), nullable=False, server_default='password_reset'))
    op.alter_column('password_reset_token', 'id', existing_type=sa.UUID(), server_default=None, existing_nullable=False)
    op.alter_column('password_reset_token', 'token_hash', existing_type=sa.VARCHAR(length=255), type_=sa.String(length=64), existing_nullable=False)
    op.alter_column('password_reset_token', 'expires_at', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=False)
    op.alter_column('password_reset_token', 'used_at', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=True)
    
    op.drop_index('ix_password_reset_token_is_deleted', table_name='password_reset_token')
    op.drop_index('ix_password_reset_token_user_id_used', table_name='password_reset_token')
    op.drop_index('ix_password_reset_token_token_hash', table_name='password_reset_token')
    
    op.create_index(op.f('ix_password_reset_token_token_hash'), 'password_reset_token', ['token_hash'], unique=True)
    op.create_index('ix_password_reset_tokens_user_purpose_used', 'password_reset_token', ['user_id', 'token_purpose', 'used'], unique=False)
    
    op.drop_column('password_reset_token', 'is_deleted')
    op.drop_column('password_reset_token', 'deleted_at')

    # ── Update question ─────────────────────────────────────────────────────
    op.add_column('question', sa.Column('grading_mode', sqlmodel.sql.sqltypes.AutoString(), server_default='', nullable=False))
    op.add_column('question', sa.Column('is_active', sa.Boolean(), server_default=sa.text('TRUE'), nullable=False))
    
    op.create_index(op.f('ix_question_grading_mode'), 'question', ['grading_mode'], unique=False)
    op.create_index(op.f('ix_question_is_active'), 'question', ['is_active'], unique=False)

    # ── Update refresh_token ────────────────────────────────────────────────
    op.alter_column('refresh_token', 'id', existing_type=sa.UUID(), server_default=None, existing_nullable=False)
    op.alter_column('refresh_token', 'expires_at', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=False)
    op.alter_column('refresh_token', 'revoked_at', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=True)
    
    op.drop_index('ix_refresh_token_is_deleted', table_name='refresh_token')
    op.drop_index('ix_refresh_token_user_id_revoked', table_name='refresh_token')
    
    op.create_index('ix_refresh_tokens_jti_revoked', 'refresh_token', ['jti', 'revoked'], unique=False)
    op.create_index('ix_refresh_tokens_user_revoked', 'refresh_token', ['user_id', 'revoked'], unique=False)
    
    op.drop_column('refresh_token', 'is_deleted')
    op.drop_column('refresh_token', 'deleted_at')

    # ── Update security_event ───────────────────────────────────────────────
    op.add_column('security_event', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    op.alter_column('security_event', 'id', existing_type=sa.UUID(), server_default=None, existing_nullable=False)
    op.alter_column('security_event', 'event_type', existing_type=postgresql.ENUM(name='securityeventtype', create_type=False), type_=sa.String(length=60), existing_nullable=False)
    op.alter_column('security_event', 'severity', existing_type=postgresql.ENUM(name='securityeventseverity', create_type=False), type_=sa.String(length=20), existing_nullable=False)
    op.alter_column('security_event', 'details', existing_type=postgresql.JSONB(astext_type=sa.Text()), type_=sa.Text(), existing_nullable=True)
    op.alter_column('security_event', 'created_at', existing_type=postgresql.TIMESTAMP(), server_default=sa.text('now()'), type_=sa.DateTime(timezone=True), existing_nullable=False)
    
    op.drop_index('ix_security_event_event_type_created_at', table_name='security_event')
    op.drop_index('ix_security_event_ip_address', table_name='security_event')
    op.drop_index('ix_security_event_ip_address_event_type', table_name='security_event')
    op.drop_index('ix_security_event_severity_created_at', table_name='security_event')
    op.drop_index('ix_security_event_user_id_created_at', table_name='security_event')
    
    op.create_index('ix_security_events_severity_created', 'security_event', ['severity', 'created_at'], unique=False)
    op.create_index('ix_security_events_user_type', 'security_event', ['user_id', 'event_type'], unique=False)
    
    op.create_foreign_key(None, 'security_event', 'user', ['user_id'], ['id'], ondelete='SET NULL')
    
    op.drop_column('security_event', 'request_id')
    op.drop_column('security_event', 'description')

    # ── Update student_response ─────────────────────────────────────────────
    op.add_column('student_response', sa.Column('answer_type', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('student_response', sa.Column('answer_text', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('student_response', sa.Column('selected_option_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('student_response', sa.Column('ordered_option_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('student_response', sa.Column('match_pairs_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('student_response', sa.Column('fill_blank_answers', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('student_response', sa.Column('file_url', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('student_response', sa.Column('is_skipped', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))
    op.add_column('student_response', sa.Column('saved_at', sa.DateTime(), nullable=True))
    op.add_column('student_response', sa.Column('is_final', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))
    
    op.create_index(op.f('ix_student_response_is_final'), 'student_response', ['is_final'], unique=False)

    # ── Update submission_grade ─────────────────────────────────────────────
    op.add_column('submission_grade', sa.Column('response_id', sa.UUID(), nullable=True))
    op.add_column('submission_grade', sa.Column('question_id', sa.UUID(), nullable=True))
    op.add_column('submission_grade', sa.Column('max_score', sa.Float(), nullable=False, server_default='0'))
    op.add_column('submission_grade', sa.Column('score', sa.Float(), nullable=True))
    op.add_column('submission_grade', sa.Column('ai_suggested_score', sa.Float(), nullable=True))
    op.add_column('submission_grade', sa.Column('ai_rationale', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('submission_grade', sa.Column('ai_confidence', sa.Float(), nullable=True))
    op.add_column('submission_grade', sa.Column('internal_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('submission_grade', sa.Column('rubric_scores', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('submission_grade', sa.Column('is_final', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))
    op.add_column('submission_grade', sa.Column('graded_at', sa.DateTime(), nullable=True))
    op.add_column('submission_grade', sa.Column('lecturer_override', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')))
    
    op.alter_column('submission_grade', 'grading_mode', existing_type=postgresql.ENUM(name='submissiongradingmode', create_type=False), type_=sqlmodel.sql.sqltypes.AutoString(), existing_nullable=False)
    
    op.create_index(op.f('ix_submission_grade_is_final'), 'submission_grade', ['is_final'], unique=False)
    op.create_index(op.f('ix_submission_grade_question_id'), 'submission_grade', ['question_id'], unique=False)
    op.create_index(op.f('ix_submission_grade_response_id'), 'submission_grade', ['response_id'], unique=False)
    
    op.create_foreign_key(None, 'submission_grade', 'student_response', ['response_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key(None, 'submission_grade', 'question', ['question_id'], ['id'], ondelete='RESTRICT')

    # ── Update supervision_session ──────────────────────────────────────────
    op.add_column('supervision_session', sa.Column('supervisor_id', sa.UUID(), nullable=False))
    op.add_column('supervision_session', sa.Column('status', postgresql.ENUM(name='supervisionsessionstatus', create_type=False), nullable=False))
    
    op.drop_index('ix_supervision_session_assessment_id_is_active', table_name='supervision_session')
    op.drop_index('ix_supervision_session_is_active', table_name='supervision_session')
    op.drop_index('ix_supervision_session_lecturer_id', table_name='supervision_session')
    op.drop_index('ix_supervision_session_lecturer_id_is_active', table_name='supervision_session')
    op.drop_index('ix_supervision_session_session_token', table_name='supervision_session')
    op.drop_index('ix_supervision_session_session_token_is_active', table_name='supervision_session')
    op.drop_index('ix_supervision_session_started_at', table_name='supervision_session')
    
    op.create_index('ix_supervision_session_assessment_id_status', 'supervision_session', ['assessment_id', 'status'], unique=False)
    op.create_index('ix_supervision_session_assessment_id_supervisor_id', 'supervision_session', ['assessment_id', 'supervisor_id'], unique=False)
    op.create_index(op.f('ix_supervision_session_status'), 'supervision_session', ['status'], unique=False)
    op.create_index(op.f('ix_supervision_session_supervisor_id'), 'supervision_session', ['supervisor_id'], unique=False)
    
    op.drop_constraint('supervision_session_assessment_id_fkey', 'supervision_session', type_='foreignkey')
    op.create_foreign_key(None, 'supervision_session', 'user', ['supervisor_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key(None, 'supervision_session', 'assessment', ['assessment_id'], ['id'], ondelete='CASCADE')
    
    op.drop_column('supervision_session', 'warnings_issued_count')
    op.drop_column('supervision_session', 'session_token')
    op.drop_column('supervision_session', 'events_reviewed_count')
    op.drop_column('supervision_session', 'last_heartbeat_at')
    op.drop_column('supervision_session', 'is_active')
    op.drop_column('supervision_session', 'flags_raised_count')
    op.drop_column('supervision_session', 'lecturer_id')

    # ── Update user ─────────────────────────────────────────────────────────
    op.alter_column('user', 'id', existing_type=sa.UUID(), server_default=None, existing_nullable=False)
    op.alter_column('user', 'email_verified_at', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=True)
    op.alter_column('user', 'last_login_at', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=True)
    op.alter_column('user', 'locked_until', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=True)
    op.alter_column('user', 'created_at', existing_type=postgresql.TIMESTAMP(), server_default=sa.text('now()'), type_=sa.DateTime(timezone=True), existing_nullable=False)
    op.alter_column('user', 'updated_at', existing_type=postgresql.TIMESTAMP(), server_default=sa.text('now()'), type_=sa.DateTime(timezone=True), existing_nullable=False)
    op.alter_column('user', 'deleted_at', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=True)
    
    op.drop_index('ix_user_email_status', table_name='user')
    op.drop_index('ix_user_role_status', table_name='user')
    op.create_index('ix_users_email_status', 'user', ['email', 'status'], unique=False)
    op.create_index('ix_users_role_status', 'user', ['role', 'status'], unique=False)

    # ── Update user_profile ─────────────────────────────────────────────────
    op.add_column('user_profile', sa.Column('display_name', sa.String(length=150), nullable=True))
    op.add_column('user_profile', sa.Column('student_id', sa.String(length=50), nullable=True))
    op.add_column('user_profile', sa.Column('staff_id', sa.String(length=50), nullable=True))
    op.add_column('user_profile', sa.Column('department', sa.String(length=150), nullable=True))
    
    op.alter_column('user_profile', 'id', existing_type=sa.UUID(), server_default=None, existing_nullable=False)
    op.alter_column('user_profile', 'bio', existing_type=sa.VARCHAR(), type_=sa.Text(), existing_nullable=True)
    op.alter_column('user_profile', 'created_at', existing_type=postgresql.TIMESTAMP(), server_default=sa.text('now()'), type_=sa.DateTime(timezone=True), existing_nullable=False)
    op.alter_column('user_profile', 'updated_at', existing_type=postgresql.TIMESTAMP(), server_default=sa.text('now()'), type_=sa.DateTime(timezone=True), existing_nullable=False)
    op.alter_column('user_profile', 'deleted_at', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=True)
    
    op.drop_constraint('uq_user_profile_user_id', 'user_profile', type_='unique')
    op.drop_index('ix_user_profile_user_id', table_name='user_profile')
    op.create_index(op.f('ix_user_profile_user_id'), 'user_profile', ['user_id'], unique=True)
    op.create_index(op.f('ix_user_profile_staff_id'), 'user_profile', ['staff_id'], unique=False)
    op.create_index(op.f('ix_user_profile_student_id'), 'user_profile', ['student_id'], unique=False)
    
    op.drop_column('user_profile', 'date_of_birth')
    op.drop_column('user_profile', 'preferred_language')
    op.drop_column('user_profile', 'timezone')


def downgrade() -> None:
    pass
