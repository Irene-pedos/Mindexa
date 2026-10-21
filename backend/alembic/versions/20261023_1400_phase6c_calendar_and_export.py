"""Phase 6C: Academic Calendar Events and Excel Export

Revision ID: 20261023_p6c_calendar_export
Revises: 20261023_p6b_appeals
Create Date: 2026-10-23 14:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261023_p6c_calendar_export"
down_revision: Union[str, None] = "20261023_p6b_appeals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # ── New Enums ─────────────────────────────────────────────────────────────

    calendar_event_type = postgresql.ENUM(
        "MARKS_DEADLINE", "DELIBERATION", "APPEAL_WINDOW",
        "REASSESSMENT_WINDOW", "EXAM_PERIOD", "OTHER",
        name="calendareventtype",
        create_type=False,
    )
    calendar_event_type.create(bind, checkfirst=True)

    export_job_status = postgresql.ENUM(
        "QUEUED", "RUNNING", "DONE", "FAILED",
        name="exportjobstatus",
        create_type=False,
    )
    export_job_status.create(bind, checkfirst=True)

    export_type = postgresql.ENUM(
        "ASSESSMENT_MARKSHEET", "COURSE_CONSOLIDATED",
        name="exporttype",
        create_type=False,
    )
    export_type.create(bind, checkfirst=True)

    # ── academic_calendar_event ───────────────────────────────────────────────
    op.create_table(
        "academic_calendar_event",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("institution.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_period_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("academic_period.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("department.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", postgresql.ENUM(name="calendareventtype", create_type=False),
                  nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=False),
    )
    op.create_index(
        "ix_academic_calendar_event_inst_period_type",
        "academic_calendar_event",
        ["institution_id", "academic_period_id", "event_type"],
    )
    op.create_index(
        "ix_academic_calendar_event_starts_at",
        "academic_calendar_event",
        ["starts_at"],
    )

    # ── export_template ───────────────────────────────────────────────────────
    op.create_table(
        "export_template",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("institution.id", ondelete="SET NULL"), nullable=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("config_json", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_unique_constraint("uq_export_template_code", "export_template", ["code"])

    # ── export_job ────────────────────────────────────────────────────────────
    op.create_table(
        "export_job",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_by_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("export_type", postgresql.ENUM(name="exporttype", create_type=False),
                  nullable=False),
        sa.Column("assessment_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("assessment.id", ondelete="SET NULL"), nullable=True),
        sa.Column("course_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("course.id", ondelete="SET NULL"), nullable=True),
        sa.Column("period_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("academic_period.id", ondelete="SET NULL"), nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("export_template.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", postgresql.ENUM(name="exportjobstatus", create_type=False),
                  nullable=False, server_default="QUEUED"),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_export_job_requested_by_id", "export_job", ["requested_by_id"])
    op.create_index("ix_export_job_status", "export_job", ["status"])

    # ── Seed default ExportTemplate rows ──────────────────────────────────────
    op.execute(
        sa.text(
            """
            INSERT INTO export_template (id, created_at, updated_at, is_deleted, code, name, config_json, is_default)
            VALUES
              (gen_random_uuid(), NOW(), NOW(), false,
               'default_marksheet', 'Default Assessment Mark Sheet', '{}', true),
              (gen_random_uuid(), NOW(), NOW(), false,
               'default_course_marksheet', 'Default Course Consolidated Mark Sheet', '{}', true)
            """
        )
    )


def downgrade() -> None:
    op.drop_table("export_job")
    op.drop_table("export_template")
    op.drop_table("academic_calendar_event")

    bind = op.get_bind()
    sa.Enum(name="exporttype").drop(bind, checkfirst=True)
    sa.Enum(name="exportjobstatus").drop(bind, checkfirst=True)
    sa.Enum(name="calendareventtype").drop(bind, checkfirst=True)
