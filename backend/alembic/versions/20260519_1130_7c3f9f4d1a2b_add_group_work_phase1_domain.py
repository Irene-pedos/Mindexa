"""add_group_work_phase1_domain

Revision ID: 7c3f9f4d1a2b
Revises: 1f70f47a24bc
Create Date: 2026-05-19 11:30:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "7c3f9f4d1a2b"
down_revision: Union[str, None] = "1f70f47a24bc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


group_assignment_mode_enum = postgresql.ENUM(
    "MANUAL",
    "AUTOMATIC",
    name="groupassignmentmode",
    create_type=False,
)
question_distribution_mode_enum = postgresql.ENUM(
    "SHARED",
    "PER_GROUP",
    name="questiondistributionmode",
    create_type=False,
)
student_group_status_enum = postgresql.ENUM(
    "DRAFT",
    "READY",
    "LOCKED",
    "INVALIDATED",
    name="studentgroupstatus",
    create_type=False,
)
group_submission_status_enum = postgresql.ENUM(
    "DRAFT",
    "READY_FOR_APPROVAL",
    "APPROVED",
    "SUBMITTED",
    "GRADED",
    "APPEALED",
    "REASSESSMENT_ASSIGNED",
    name="groupsubmissionstatus",
    create_type=False,
)
group_approval_status_enum = postgresql.ENUM(
    "PENDING",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
    name="groupapprovalstatus",
    create_type=False,
)
group_appeal_status_enum = postgresql.ENUM(
    "DRAFT",
    "PENDING_MEMBER_APPROVAL",
    "SUBMITTED_TO_LECTURER",
    "UNDER_REVIEW",
    "APPROVED",
    "REJECTED",
    "RESOLVED",
    "CANCELLED",
    name="groupappealstatus",
    create_type=False,
)
group_activity_type_enum = postgresql.ENUM(
    "ANSWER_EDITED",
    "COMMENT_ADDED",
    "NOTE_ADDED",
    "APPROVAL_REQUESTED",
    "SUBMISSION_APPROVED",
    "SUBMISSION_REJECTED",
    "SUBMISSION_FINALIZED",
    "APPEAL_OPENED",
    "APPEAL_APPROVED",
    "APPEAL_REJECTED",
    "MATERIAL_ADDED",
    "MEMBERSHIP_INVALIDATED",
    name="groupactivitytype",
    create_type=False,
)


def upgrade() -> None:
    group_assignment_mode_enum.create(op.get_bind(), checkfirst=True)
    question_distribution_mode_enum.create(op.get_bind(), checkfirst=True)
    student_group_status_enum.create(op.get_bind(), checkfirst=True)
    group_submission_status_enum.create(op.get_bind(), checkfirst=True)
    group_approval_status_enum.create(op.get_bind(), checkfirst=True)
    group_appeal_status_enum.create(op.get_bind(), checkfirst=True)
    group_activity_type_enum.create(op.get_bind(), checkfirst=True)

    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'GROUP_WORK_ASSIGNED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'GROUP_APPROVAL_REQUEST'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'GROUP_RESULT_RELEASED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'GROUP_APPEAL_REQUEST'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'GROUP_REASSESSMENT_ASSIGNED'")

    op.add_column("assessment", sa.Column("group_assignment_mode", group_assignment_mode_enum, nullable=True))
    op.add_column("assessment", sa.Column("question_distribution_mode", question_distribution_mode_enum, nullable=True))
    op.add_column("assessment", sa.Column("require_all_member_approval", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("assessment", sa.Column("require_all_member_participation", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("assessment", sa.Column("appeal_window_days", sa.Integer(), nullable=True))
    op.add_column("assessment", sa.Column("group_invalidated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("assessment", sa.Column("group_membership_locked_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("student_group", sa.Column("status", student_group_status_enum, server_default="DRAFT", nullable=False))
    op.add_column("student_group", sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("student_group", sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_student_group_status", "student_group", ["status"], unique=False)

    op.create_table(
        "group_submission",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assessment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", group_submission_status_enum, nullable=False),
        sa.Column("requested_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("submitted_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("graded_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approval_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column("max_score", sa.Float(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessment.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["graded_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["group_id"], ["student_group.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["submitted_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assessment_id", "group_id", name="uq_group_submission_assessment_group"),
    )
    op.create_index("ix_group_submission_assessment_id", "group_submission", ["assessment_id"], unique=False)
    op.create_index("ix_group_submission_group_id", "group_submission", ["group_id"], unique=False)
    op.create_index("ix_group_submission_status", "group_submission", ["status"], unique=False)
    op.create_index("ix_group_submission_assessment_id_status", "group_submission", ["assessment_id", "status"], unique=False)
    op.create_index("ix_group_submission_group_id_status", "group_submission", ["group_id", "status"], unique=False)
    op.create_index("ix_group_submission_is_deleted", "group_submission", ["is_deleted"], unique=False)

    op.create_table(
        "group_submission_answer",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("last_edited_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("answer_content", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("notes_content", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("last_edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["last_edited_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["question_id"], ["question.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submission_id"], ["group_submission.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id", "question_id", name="uq_group_submission_answer_submission_question"),
    )
    op.create_index("ix_group_submission_answer_submission_id", "group_submission_answer", ["submission_id"], unique=False)
    op.create_index("ix_group_submission_answer_question_id", "group_submission_answer", ["question_id"], unique=False)
    op.create_index("ix_group_submission_answer_is_deleted", "group_submission_answer", ["is_deleted"], unique=False)

    op.create_table(
        "group_submission_comment",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["question_id"], ["question.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["submission_id"], ["group_submission.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_group_submission_comment_submission_id", "group_submission_comment", ["submission_id"], unique=False)
    op.create_index("ix_group_submission_comment_question_id", "group_submission_comment", ["question_id"], unique=False)
    op.create_index("ix_group_submission_comment_author_id", "group_submission_comment", ["author_id"], unique=False)
    op.create_index("ix_group_submission_comment_submission_id_created_at", "group_submission_comment", ["submission_id", "created_at"], unique=False)

    op.create_table(
        "group_submission_approval",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", group_approval_status_enum, nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.String(length=2000), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["submission_id"], ["group_submission.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id", "student_id", name="uq_group_submission_approval_submission_student"),
    )
    op.create_index("ix_group_submission_approval_submission_id", "group_submission_approval", ["submission_id"], unique=False)
    op.create_index("ix_group_submission_approval_student_id", "group_submission_approval", ["student_id"], unique=False)
    op.create_index("ix_group_submission_approval_status", "group_submission_approval", ["status"], unique=False)
    op.create_index("ix_group_submission_approval_submission_id_status", "group_submission_approval", ["submission_id", "status"], unique=False)
    op.create_index("ix_group_submission_approval_student_id_status", "group_submission_approval", ["student_id", "status"], unique=False)
    op.create_index("ix_group_submission_approval_is_deleted", "group_submission_approval", ["is_deleted"], unique=False)

    op.create_table(
        "group_activity_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("activity_type", group_activity_type_enum, nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["question_id"], ["question.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["student_id"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["submission_id"], ["group_submission.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_group_activity_log_submission_id", "group_activity_log", ["submission_id"], unique=False)
    op.create_index("ix_group_activity_log_student_id", "group_activity_log", ["student_id"], unique=False)
    op.create_index("ix_group_activity_log_activity_type", "group_activity_log", ["activity_type"], unique=False)
    op.create_index("ix_group_activity_log_question_id", "group_activity_log", ["question_id"], unique=False)
    op.create_index("ix_group_activity_log_submission_id_created_at", "group_activity_log", ["submission_id", "created_at"], unique=False)
    op.create_index("ix_group_activity_log_student_id_activity_type", "group_activity_log", ["student_id", "activity_type"], unique=False)

    op.create_table(
        "group_appeal",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("initiated_by_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", group_appeal_status_enum, nullable=False),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("lecturer_decision", sa.String(length=2000), nullable=True),
        sa.Column("submitted_to_lecturer_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["initiated_by_id"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["submission_id"], ["group_submission.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_group_appeal_submission_id", "group_appeal", ["submission_id"], unique=False)
    op.create_index("ix_group_appeal_initiated_by_id", "group_appeal", ["initiated_by_id"], unique=False)
    op.create_index("ix_group_appeal_status", "group_appeal", ["status"], unique=False)
    op.create_index("ix_group_appeal_submission_id_status", "group_appeal", ["submission_id", "status"], unique=False)
    op.create_index("ix_group_appeal_initiated_by_id_status", "group_appeal", ["initiated_by_id", "status"], unique=False)
    op.create_index("ix_group_appeal_is_deleted", "group_appeal", ["is_deleted"], unique=False)

    op.create_table(
        "group_appeal_approval",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("appeal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", group_approval_status_enum, nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.String(length=2000), nullable=True),
        sa.ForeignKeyConstraint(["appeal_id"], ["group_appeal.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("appeal_id", "student_id", name="uq_group_appeal_approval_appeal_student"),
    )
    op.create_index("ix_group_appeal_approval_appeal_id", "group_appeal_approval", ["appeal_id"], unique=False)
    op.create_index("ix_group_appeal_approval_student_id", "group_appeal_approval", ["student_id"], unique=False)
    op.create_index("ix_group_appeal_approval_status", "group_appeal_approval", ["status"], unique=False)
    op.create_index("ix_group_appeal_approval_appeal_id_status", "group_appeal_approval", ["appeal_id", "status"], unique=False)
    op.create_index("ix_group_appeal_approval_student_id_status", "group_appeal_approval", ["student_id", "status"], unique=False)
    op.create_index("ix_group_appeal_approval_is_deleted", "group_appeal_approval", ["is_deleted"], unique=False)

    op.create_table(
        "group_assessment_material",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assessment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("uploaded_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("file_url", sa.String(length=2000), nullable=False),
        sa.Column("is_required", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["student_group.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_group_assessment_material_assessment_id", "group_assessment_material", ["assessment_id"], unique=False)
    op.create_index("ix_group_assessment_material_group_id", "group_assessment_material", ["group_id"], unique=False)
    op.create_index("ix_group_assessment_material_is_deleted", "group_assessment_material", ["is_deleted"], unique=False)

    op.alter_column("assessment", "require_all_member_approval", server_default=None)
    op.alter_column("assessment", "require_all_member_participation", server_default=None)
    op.alter_column("student_group", "status", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_group_assessment_material_is_deleted", table_name="group_assessment_material")
    op.drop_index("ix_group_assessment_material_group_id", table_name="group_assessment_material")
    op.drop_index("ix_group_assessment_material_assessment_id", table_name="group_assessment_material")
    op.drop_table("group_assessment_material")

    op.drop_index("ix_group_appeal_approval_is_deleted", table_name="group_appeal_approval")
    op.drop_index("ix_group_appeal_approval_student_id_status", table_name="group_appeal_approval")
    op.drop_index("ix_group_appeal_approval_appeal_id_status", table_name="group_appeal_approval")
    op.drop_index("ix_group_appeal_approval_status", table_name="group_appeal_approval")
    op.drop_index("ix_group_appeal_approval_student_id", table_name="group_appeal_approval")
    op.drop_index("ix_group_appeal_approval_appeal_id", table_name="group_appeal_approval")
    op.drop_table("group_appeal_approval")

    op.drop_index("ix_group_appeal_is_deleted", table_name="group_appeal")
    op.drop_index("ix_group_appeal_initiated_by_id_status", table_name="group_appeal")
    op.drop_index("ix_group_appeal_submission_id_status", table_name="group_appeal")
    op.drop_index("ix_group_appeal_status", table_name="group_appeal")
    op.drop_index("ix_group_appeal_initiated_by_id", table_name="group_appeal")
    op.drop_index("ix_group_appeal_submission_id", table_name="group_appeal")
    op.drop_table("group_appeal")

    op.drop_index("ix_group_activity_log_student_id_activity_type", table_name="group_activity_log")
    op.drop_index("ix_group_activity_log_submission_id_created_at", table_name="group_activity_log")
    op.drop_index("ix_group_activity_log_question_id", table_name="group_activity_log")
    op.drop_index("ix_group_activity_log_activity_type", table_name="group_activity_log")
    op.drop_index("ix_group_activity_log_student_id", table_name="group_activity_log")
    op.drop_index("ix_group_activity_log_submission_id", table_name="group_activity_log")
    op.drop_table("group_activity_log")

    op.drop_index("ix_group_submission_approval_is_deleted", table_name="group_submission_approval")
    op.drop_index("ix_group_submission_approval_student_id_status", table_name="group_submission_approval")
    op.drop_index("ix_group_submission_approval_submission_id_status", table_name="group_submission_approval")
    op.drop_index("ix_group_submission_approval_status", table_name="group_submission_approval")
    op.drop_index("ix_group_submission_approval_student_id", table_name="group_submission_approval")
    op.drop_index("ix_group_submission_approval_submission_id", table_name="group_submission_approval")
    op.drop_table("group_submission_approval")

    op.drop_index("ix_group_submission_comment_submission_id_created_at", table_name="group_submission_comment")
    op.drop_index("ix_group_submission_comment_author_id", table_name="group_submission_comment")
    op.drop_index("ix_group_submission_comment_question_id", table_name="group_submission_comment")
    op.drop_index("ix_group_submission_comment_submission_id", table_name="group_submission_comment")
    op.drop_table("group_submission_comment")

    op.drop_index("ix_group_submission_answer_is_deleted", table_name="group_submission_answer")
    op.drop_index("ix_group_submission_answer_question_id", table_name="group_submission_answer")
    op.drop_index("ix_group_submission_answer_submission_id", table_name="group_submission_answer")
    op.drop_table("group_submission_answer")

    op.drop_index("ix_group_submission_is_deleted", table_name="group_submission")
    op.drop_index("ix_group_submission_group_id_status", table_name="group_submission")
    op.drop_index("ix_group_submission_assessment_id_status", table_name="group_submission")
    op.drop_index("ix_group_submission_status", table_name="group_submission")
    op.drop_index("ix_group_submission_group_id", table_name="group_submission")
    op.drop_index("ix_group_submission_assessment_id", table_name="group_submission")
    op.drop_table("group_submission")

    op.drop_index("ix_student_group_status", table_name="student_group")
    op.drop_column("student_group", "invalidated_at")
    op.drop_column("student_group", "locked_at")
    op.drop_column("student_group", "status")

    op.drop_column("assessment", "group_membership_locked_at")
    op.drop_column("assessment", "group_invalidated_at")
    op.drop_column("assessment", "appeal_window_days")
    op.drop_column("assessment", "require_all_member_participation")
    op.drop_column("assessment", "require_all_member_approval")
    op.drop_column("assessment", "question_distribution_mode")
    op.drop_column("assessment", "group_assignment_mode")

    group_activity_type_enum.drop(op.get_bind(), checkfirst=True)
    group_appeal_status_enum.drop(op.get_bind(), checkfirst=True)
    group_approval_status_enum.drop(op.get_bind(), checkfirst=True)
    group_submission_status_enum.drop(op.get_bind(), checkfirst=True)
    student_group_status_enum.drop(op.get_bind(), checkfirst=True)
    question_distribution_mode_enum.drop(op.get_bind(), checkfirst=True)
    group_assignment_mode_enum.drop(op.get_bind(), checkfirst=True)
