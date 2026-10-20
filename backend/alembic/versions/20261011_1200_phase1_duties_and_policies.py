"""Phase 1: Add user duty assignments and institutional approval policies

Revision ID: 20261011_p1_duties_policies
Revises: 20261011_p0_align
Create Date: 2026-10-11 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261011_p1_duties_policies"
down_revision: Union[str, None] = "20261011_p0_align"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Native PostgreSQL enums
    duty_type = postgresql.ENUM("MODERATOR", "EXAM_OFFICER", "DEPARTMENT_HEAD", name="duty_type")
    duty_type.create(op.get_bind(), checkfirst=True)

    post_approval_edit_mode = postgresql.ENUM("NOTIFY", "REQUIRE_REAPPROVAL", name="post_approval_edit_mode")
    post_approval_edit_mode.create(op.get_bind(), checkfirst=True)

    post_start_edit_mode = postgresql.ENUM("BLOCK", "ALLOW_WITH_NOTICE", name="post_start_edit_mode")
    post_start_edit_mode.create(op.get_bind(), checkfirst=True)

    # 2. Table: user_duty_assignment
    op.create_table(
        "user_duty_assignment",
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("duty", postgresql.ENUM("MODERATOR", "EXAM_OFFICER", "DEPARTMENT_HEAD", name="duty_type", create_type=False), nullable=False),
        sa.Column("institution_id", sa.Uuid(), nullable=False),
        sa.Column("campus_id", sa.Uuid(), nullable=True),
        sa.Column("department_id", sa.Uuid(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_by_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["assigned_by_id"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["campus_id"], ["campus.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["department_id"], ["department.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["institution_id"], ["institution.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_user_duty_assignment_user_id", "user_duty_assignment", ["user_id"])
    op.create_index("ix_user_duty_assignment_duty", "user_duty_assignment", ["duty"])
    op.create_index("ix_user_duty_assignment_institution_id", "user_duty_assignment", ["institution_id"])
    op.create_index("ix_user_duty_assignment_campus_id", "user_duty_assignment", ["campus_id"])
    op.create_index("ix_user_duty_assignment_department_id", "user_duty_assignment", ["department_id"])
    op.create_index("ix_user_duty_assignment_is_active", "user_duty_assignment", ["is_active"])
    op.create_index("ix_user_duty_assignment_is_deleted", "user_duty_assignment", ["is_deleted"])
    op.create_index("ix_user_duty_assignment_active_dates", "user_duty_assignment", ["is_active", "valid_from", "valid_to"])

    # Partial unique indexes for active assignments
    op.create_index(
        "uq_duty_assignment_dept_active",
        "user_duty_assignment",
        ["user_id", "duty", "institution_id", "department_id"],
        unique=True,
        postgresql_where=sa.text("is_active = TRUE AND is_deleted = FALSE AND department_id IS NOT NULL"),
    )
    op.create_index(
        "uq_duty_assignment_campus_active",
        "user_duty_assignment",
        ["user_id", "duty", "institution_id", "campus_id"],
        unique=True,
        postgresql_where=sa.text("is_active = TRUE AND is_deleted = FALSE AND department_id IS NULL AND campus_id IS NOT NULL"),
    )
    op.create_index(
        "uq_duty_assignment_inst_active",
        "user_duty_assignment",
        ["user_id", "duty", "institution_id"],
        unique=True,
        postgresql_where=sa.text("is_active = TRUE AND is_deleted = FALSE AND department_id IS NULL AND campus_id IS NULL"),
    )

    # 3. Table: approval_policy
    op.create_table(
        "approval_policy",
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("institution_id", sa.Uuid(), nullable=False),
        sa.Column(
            "assessment_type",
            postgresql.ENUM("FORMATIVE", "CAT", "SUMMATIVE", "HOMEWORK", "GROUP_WORK", "REASSESSMENT", name="assessmenttype", create_type=False),
            nullable=False,
        ),
        sa.Column("requires_moderation", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("enforce_structure_template", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("summative_total_marks", sa.Integer(), nullable=True),
        sa.Column(
            "post_approval_edit_mode",
            postgresql.ENUM("NOTIFY", "REQUIRE_REAPPROVAL", name="post_approval_edit_mode", create_type=False),
            server_default=sa.text("'NOTIFY'"),
            nullable=False,
        ),
        sa.Column(
            "post_start_edit_mode",
            postgresql.ENUM("BLOCK", "ALLOW_WITH_NOTICE", name="post_start_edit_mode", create_type=False),
            server_default=sa.text("'BLOCK'"),
            nullable=False,
        ),
        sa.Column("sealing_warning_days", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.ForeignKeyConstraint(["institution_id"], ["institution.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("institution_id", "assessment_type", name="uq_approval_policy_inst_type"),
    )

    op.create_index("ix_approval_policy_institution_id", "approval_policy", ["institution_id"])
    op.create_index("ix_approval_policy_assessment_type", "approval_policy", ["assessment_type"])
    op.create_index("ix_approval_policy_is_deleted", "approval_policy", ["is_deleted"])

    # 4. Idempotently seed default policies for all existing institutions
    op.execute(
        sa.text("""
        INSERT INTO approval_policy (
            id, institution_id, assessment_type, requires_moderation,
            enforce_structure_template, summative_total_marks,
            post_approval_edit_mode, post_start_edit_mode, sealing_warning_days,
            is_active, is_deleted, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            inst.id,
            types.t::assessmenttype,
            CASE WHEN types.t = 'SUMMATIVE' THEN true ELSE false END,
            CASE WHEN types.t = 'SUMMATIVE' THEN true ELSE false END,
            CASE WHEN types.t = 'SUMMATIVE' THEN 100 ELSE NULL END,
            'NOTIFY'::post_approval_edit_mode,
            'BLOCK'::post_start_edit_mode,
            NULL,
            true,
            false,
            TIMEZONE('utc', NOW()),
            TIMEZONE('utc', NOW())
        FROM institution inst
        CROSS JOIN (
            VALUES ('SUMMATIVE'), ('FORMATIVE'), ('CAT'), ('HOMEWORK'), ('GROUP_WORK'), ('REASSESSMENT')
        ) AS types(t)
        WHERE NOT EXISTS (
            SELECT 1 FROM approval_policy ap
            WHERE ap.institution_id = inst.id
              AND ap.assessment_type = types.t::assessmenttype
        );
        """)
    )


def downgrade() -> None:
    op.drop_table("approval_policy")
    op.drop_table("user_duty_assignment")

    post_start_edit_mode = postgresql.ENUM(name="post_start_edit_mode")
    post_start_edit_mode.drop(op.get_bind(), checkfirst=True)

    post_approval_edit_mode = postgresql.ENUM(name="post_approval_edit_mode")
    post_approval_edit_mode.drop(op.get_bind(), checkfirst=True)

    duty_type = postgresql.ENUM(name="duty_type")
    duty_type.drop(op.get_bind(), checkfirst=True)
