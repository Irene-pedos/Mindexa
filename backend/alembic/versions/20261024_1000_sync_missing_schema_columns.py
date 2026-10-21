"""Sync missing schema columns across academic, assessment, and eligibility models

Revision ID: 20261024_sync_missing_schema_columns
Revises: 20261024_sync_class_section
Create Date: 2026-10-24 10:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261024_sync_schema"
down_revision: Union[str, None] = "20261024_sync_class_section"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── External IDs and Source Systems on Academic Hierarchy ─────────────────
    op.execute("ALTER TABLE institution ADD COLUMN IF NOT EXISTS external_id VARCHAR(100)")
    op.execute("ALTER TABLE institution ADD COLUMN IF NOT EXISTS source_system VARCHAR(50)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_institution_external_id ON institution (external_id)")

    op.execute("ALTER TABLE department ADD COLUMN IF NOT EXISTS external_id VARCHAR(100)")
    op.execute("ALTER TABLE department ADD COLUMN IF NOT EXISTS source_system VARCHAR(50)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_department_external_id ON department (external_id)")

    op.execute("ALTER TABLE option ADD COLUMN IF NOT EXISTS external_id VARCHAR(100)")
    op.execute("ALTER TABLE option ADD COLUMN IF NOT EXISTS source_system VARCHAR(50)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_option_external_id ON option (external_id)")

    # ── CourseSubject ─────────────────────────────────────────────────────────
    op.execute("ALTER TABLE course_subject ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false")

    # ── Audit Columns on Junction / Bridge Models ─────────────────────────────
    op.execute("ALTER TABLE student_enrollment ADD COLUMN IF NOT EXISTS created_by_id UUID")
    op.execute("ALTER TABLE student_enrollment ADD COLUMN IF NOT EXISTS updated_by_id UUID")

    op.execute("ALTER TABLE assessment_target_section ADD COLUMN IF NOT EXISTS created_by_id UUID")
    op.execute("ALTER TABLE assessment_target_section ADD COLUMN IF NOT EXISTS updated_by_id UUID")

    op.execute("ALTER TABLE assessment_collaborator ADD COLUMN IF NOT EXISTS created_by_id UUID")
    op.execute("ALTER TABLE assessment_collaborator ADD COLUMN IF NOT EXISTS updated_by_id UUID")
    op.execute("ALTER TABLE assessment_collaborator ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    op.execute("ALTER TABLE author_delegation ADD COLUMN IF NOT EXISTS updated_by_id UUID")
    op.execute("ALTER TABLE author_delegation ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    # ── Marking and Key Points Soft Delete / Timestamps ───────────────────────
    op.execute("ALTER TABLE marking_scheme ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE question_mark_step ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE material_key_point ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    op.execute("ALTER TABLE question_key_point ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE question_key_point ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    op.execute("ALTER TABLE ai_grade_sample_check ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE ai_grade_sample_check ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    op.execute("ALTER TABLE grading_delegation ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE grading_delegation ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    # ── Phase 6A Eligibility and Retakes Soft Delete ──────────────────────────
    op.execute("ALTER TABLE eligibility_policy ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE eligibility_policy ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    op.execute("ALTER TABLE reassessment_requirement ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE reassessment_requirement ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    op.execute("ALTER TABLE eligibility_decision ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE eligibility_decision ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    op.execute("ALTER TABLE attempt_eligibility_override ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE attempt_eligibility_override ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    op.execute("ALTER TABLE payment_reference ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE payment_reference ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")

    op.execute("ALTER TABLE retake_record ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE retake_record ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")


def downgrade() -> None:
    # Drop columns on downgrade if needed
    op.execute("ALTER TABLE retake_record DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS is_deleted")
    op.execute("ALTER TABLE payment_reference DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS is_deleted")
    op.execute("ALTER TABLE attempt_eligibility_override DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS is_deleted")
    op.execute("ALTER TABLE eligibility_decision DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS is_deleted")
    op.execute("ALTER TABLE reassessment_requirement DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS is_deleted")
    op.execute("ALTER TABLE eligibility_policy DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS is_deleted")
    op.execute("ALTER TABLE grading_delegation DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS is_deleted")
    op.execute("ALTER TABLE ai_grade_sample_check DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS is_deleted")
    op.execute("ALTER TABLE question_key_point DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS is_deleted")
    op.execute("ALTER TABLE material_key_point DROP COLUMN IF EXISTS deleted_at")
    op.execute("ALTER TABLE question_mark_step DROP COLUMN IF EXISTS deleted_at")
    op.execute("ALTER TABLE marking_scheme DROP COLUMN IF EXISTS deleted_at")
    op.execute("ALTER TABLE author_delegation DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS updated_by_id")
    op.execute("ALTER TABLE assessment_collaborator DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS updated_by_id, DROP COLUMN IF EXISTS created_by_id")
    op.execute("ALTER TABLE assessment_target_section DROP COLUMN IF EXISTS updated_by_id, DROP COLUMN IF EXISTS created_by_id")
    op.execute("ALTER TABLE student_enrollment DROP COLUMN IF EXISTS updated_by_id, DROP COLUMN IF EXISTS created_by_id")
    op.execute("ALTER TABLE course_subject DROP COLUMN IF EXISTS is_primary")
    op.execute("DROP INDEX IF EXISTS ix_option_external_id")
    op.execute("ALTER TABLE option DROP COLUMN IF EXISTS source_system, DROP COLUMN IF EXISTS external_id")
    op.execute("DROP INDEX IF EXISTS ix_department_external_id")
    op.execute("ALTER TABLE department DROP COLUMN IF EXISTS source_system, DROP COLUMN IF EXISTS external_id")
    op.execute("DROP INDEX IF EXISTS ix_institution_external_id")
    op.execute("ALTER TABLE institution DROP COLUMN IF EXISTS source_system, DROP COLUMN IF EXISTS external_id")
