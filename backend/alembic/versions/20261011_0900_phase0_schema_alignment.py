"""phase0 schema alignment

Revision ID: 20261011_p0_align
Revises: 20260828_2330_guided_ex_action
Create Date: 2026-10-11 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20261011_p0_align"
down_revision: Union[str, None] = "20260828_2330_guided_ex_action"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE question ADD COLUMN IF NOT EXISTS computational_type VARCHAR")
    else:
        op.add_column("question", sa.Column("computational_type", sa.String(), nullable=True))
    op.alter_column(
        "academic_period",
        "period_type",
        server_default=sa.text("'SEMESTER'"),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_institution_name ON institution (name)")
    op.execute("UPDATE course SET credit_hours = 3 WHERE credit_hours IS NULL")
    op.alter_column("course", "credit_hours", nullable=False)

    # Preserve the model's server-side defaults for direct SQL writers.
    for table in (
        "assessment_learning_unit_coverage",
        "learning_unit",
        "student_learning_unit_progress",
        "study_plan",
        "study_session",
    ):
        op.alter_column(table, "id", server_default=sa.text("gen_random_uuid()"))
        op.alter_column(
            table,
            "created_at",
            server_default=sa.text("TIMEZONE('utc', NOW())"),
        )
        op.alter_column(
            table,
            "updated_at",
            server_default=sa.text("TIMEZONE('utc', NOW())"),
        )
    op.alter_column("student_learning_profile", "id", server_default=sa.text("gen_random_uuid()"))

    # Normalize existing NULLs before enforcing the model's required fields.
    op.execute(
        "UPDATE student_learning_profile "
        "SET total_sessions_completed = 0 WHERE total_sessions_completed IS NULL"
    )
    op.execute(
        "UPDATE student_learning_profile "
        "SET current_streak_days = 0 WHERE current_streak_days IS NULL"
    )
    op.alter_column("student_learning_profile", "total_sessions_completed", nullable=False)
    op.alter_column("student_learning_profile", "current_streak_days", nullable=False)

    op.execute(
        "UPDATE study_session SET lesson_status = 'NOT_GENERATED' WHERE lesson_status IS NULL"
    )
    op.execute(
        "UPDATE study_session SET current_section_index = 0 WHERE current_section_index IS NULL"
    )
    op.execute(
        "UPDATE study_session SET tutor_chat_history = '[]'::json WHERE tutor_chat_history IS NULL"
    )
    op.alter_column("study_session", "lesson_status", nullable=False)
    op.alter_column("study_session", "current_section_index", nullable=False)
    op.alter_column("study_session", "tutor_chat_history", nullable=False)

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_assessment_learning_unit_coverage_is_deleted "
        "ON assessment_learning_unit_coverage (is_deleted)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_unit_is_deleted ON learning_unit (is_deleted)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_learning_unit_source_material_id "
        "ON learning_unit (source_material_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_student_learning_unit_progress_is_deleted "
        "ON student_learning_unit_progress (is_deleted)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_study_plan_assessment_id ON study_plan (assessment_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_study_plan_teaching_workspace_id "
        "ON study_plan (teaching_workspace_id)"
    )

    # Some deployed databases have legacy pluralized index names at the same
    # Alembic revision. Rename those indexes in place; fresh installs already
    # have the canonical singular names from the original migrations.
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('public.ix_study_plans_student_id') IS NOT NULL
               AND to_regclass('public.ix_study_plan_student_id') IS NULL THEN
                ALTER INDEX ix_study_plans_student_id RENAME TO ix_study_plan_student_id;
            END IF;
            IF to_regclass('public.ix_study_plans_course_id') IS NOT NULL
               AND to_regclass('public.ix_study_plan_course_id') IS NULL THEN
                ALTER INDEX ix_study_plans_course_id RENAME TO ix_study_plan_course_id;
            END IF;
            IF to_regclass('public.ix_study_sessions_student_id') IS NOT NULL
               AND to_regclass('public.ix_study_session_student_id') IS NULL THEN
                ALTER INDEX ix_study_sessions_student_id RENAME TO ix_study_session_student_id;
            END IF;
            IF to_regclass('public.ix_study_sessions_study_plan_id') IS NOT NULL
               AND to_regclass('public.ix_study_session_study_plan_id') IS NULL THEN
                ALTER INDEX ix_study_sessions_study_plan_id RENAME TO ix_study_session_study_plan_id;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.alter_column("course", "credit_hours", nullable=True)
    op.execute("DROP INDEX IF EXISTS ix_institution_name")
    op.alter_column("academic_period", "period_type", server_default=None)
    op.drop_column("question", "computational_type")

    op.execute("DROP INDEX IF EXISTS ix_study_plan_teaching_workspace_id")
    op.execute("DROP INDEX IF EXISTS ix_study_plan_assessment_id")
    op.execute("DROP INDEX IF EXISTS ix_student_learning_unit_progress_is_deleted")
    op.execute("DROP INDEX IF EXISTS ix_learning_unit_source_material_id")
    op.execute("DROP INDEX IF EXISTS ix_learning_unit_is_deleted")
    op.execute("DROP INDEX IF EXISTS ix_assessment_learning_unit_coverage_is_deleted")

    op.alter_column("study_session", "current_section_index", nullable=True)
    op.alter_column("study_session", "lesson_status", nullable=True)
    op.alter_column("study_session", "tutor_chat_history", nullable=True)
    op.alter_column("student_learning_profile", "current_streak_days", nullable=True)
    op.alter_column("student_learning_profile", "total_sessions_completed", nullable=True)

    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('public.ix_study_plan_student_id') IS NOT NULL
               AND to_regclass('public.ix_study_plans_student_id') IS NULL THEN
                ALTER INDEX ix_study_plan_student_id RENAME TO ix_study_plans_student_id;
            END IF;
            IF to_regclass('public.ix_study_plan_course_id') IS NOT NULL
               AND to_regclass('public.ix_study_plans_course_id') IS NULL THEN
                ALTER INDEX ix_study_plan_course_id RENAME TO ix_study_plans_course_id;
            END IF;
            IF to_regclass('public.ix_study_session_student_id') IS NOT NULL
               AND to_regclass('public.ix_study_sessions_student_id') IS NULL THEN
                ALTER INDEX ix_study_session_student_id RENAME TO ix_study_sessions_student_id;
            END IF;
            IF to_regclass('public.ix_study_session_study_plan_id') IS NOT NULL
               AND to_regclass('public.ix_study_sessions_study_plan_id') IS NULL THEN
                ALTER INDEX ix_study_session_study_plan_id RENAME TO ix_study_sessions_study_plan_id;
            END IF;
        END $$;
    """)

    op.alter_column("student_learning_profile", "id", server_default=None)
    for table in (
        "study_session",
        "study_plan",
        "student_learning_unit_progress",
        "learning_unit",
        "assessment_learning_unit_coverage",
    ):
        op.alter_column(table, "updated_at", server_default=None)
        op.alter_column(table, "created_at", server_default=None)
        op.alter_column(table, "id", server_default=None)
