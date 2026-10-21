"""Phase 6B: Appeals and Absence Excuses

Revision ID: 20261023_p6b_appeals
Revises: 20261022_p6a_patch_enum
Create Date: 2026-10-23 09:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261023_p6b_appeals"
down_revision: Union[str, None] = "20261022_p6a_patch_enum"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # ── New Enums ─────────────────────────────────────────────────────────────

    individual_appeal_status = postgresql.ENUM(
        "SUBMITTED", "PAYMENT_PENDING", "PAID", "ASSIGNED",
        "UNDER_REVIEW", "DECIDED", "CLOSED", "REJECTED_INVALID", "WITHDRAWN",
        name="individualappealstatus",
        create_type=False,
    )
    individual_appeal_status.create(bind, checkfirst=True)

    appeal_outcome = postgresql.ENUM(
        "MARK_CONFIRMED", "MARK_INCREASED", "MARK_DECREASED",
        name="appealoutcome",
        create_type=False,
    )
    appeal_outcome.create(bind, checkfirst=True)

    absence_excuse_status = postgresql.ENUM(
        "SUBMITTED", "APPROVED", "REJECTED", "WITHDRAWN",
        name="absenceexcusestatus",
        create_type=False,
    )
    absence_excuse_status.create(bind, checkfirst=True)

    # ── appeal_policy ─────────────────────────────────────────────────────────
    op.create_table(
        "appeal_policy",
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
        sa.Column("window_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("allow_mark_decrease", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("require_payment", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("anonymize_for_reviewer", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_appeal_policy_institution_id", "appeal_policy", ["institution_id"])
    op.create_unique_constraint("uq_appeal_policy_institution", "appeal_policy", ["institution_id"])

    # ── appeal ────────────────────────────────────────────────────────────────
    op.create_table(
        "appeal",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("assessment_attempt.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assessment_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("assessment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("course.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("items", postgresql.JSONB(), nullable=True),
        sa.Column("status", postgresql.ENUM(name="individualappealstatus", create_type=False),
                  nullable=False, server_default="SUBMITTED"),
        sa.Column("payment_reference_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("payment_reference.id", ondelete="SET NULL"), nullable=True),
        sa.Column("original_total", sa.Float(), nullable=False),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_by_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assignment_justification", sa.Text(), nullable=True),
        sa.Column("reviewer_total", sa.Float(), nullable=True),
        sa.Column("final_total", sa.Float(), nullable=True),
        sa.Column("outcome", postgresql.ENUM(name="appealoutcome", create_type=False), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_appeal_student_id", "appeal", ["student_id"])
    op.create_index("ix_appeal_assessment_id", "appeal", ["assessment_id"])
    op.create_index("ix_appeal_status", "appeal", ["status"])
    op.create_index("ix_appeal_reviewer_id", "appeal", ["reviewer_id"])

    # ── absence_excuse_policy ─────────────────────────────────────────────────
    op.create_table(
        "absence_excuse_policy",
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
        sa.Column("submit_days_after", sa.Integer(), nullable=False, server_default="7"),
    )
    op.create_unique_constraint(
        "uq_absence_excuse_policy_institution", "absence_excuse_policy", ["institution_id"]
    )

    # ── absence_excuse_request ────────────────────────────────────────────────
    op.create_table(
        "absence_excuse_request",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("TIMEZONE('utc', NOW())")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assessment_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("assessment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("course.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("evidence_file_ids", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", postgresql.ENUM(name="absenceexcusestatus", create_type=False),
                  nullable=False, server_default="SUBMITTED"),
        sa.Column("decided_by_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("granted_window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("granted_window_end", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_absence_excuse_student_id", "absence_excuse_request", ["student_id"])
    op.create_index("ix_absence_excuse_assessment_id", "absence_excuse_request", ["assessment_id"])
    op.create_index("ix_absence_excuse_status", "absence_excuse_request", ["status"])


def downgrade() -> None:
    op.drop_table("absence_excuse_request")
    op.drop_table("absence_excuse_policy")
    op.drop_table("appeal")
    op.drop_table("appeal_policy")

    bind = op.get_bind()
    sa.Enum(name="absenceexcusestatus").drop(bind, checkfirst=True)
    sa.Enum(name="appealoutcome").drop(bind, checkfirst=True)
    sa.Enum(name="individualappealstatus").drop(bind, checkfirst=True)
