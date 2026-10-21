"""Phase 6A: Eligibility, Reassessment, and Retake Engine

Revision ID: 20261022_p6a_eligibility
Revises: 20261021_p5_aigrade_review
Create Date: 2026-10-22 10:00:00

"""
from __future__ import annotations

import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261022_p6a_eligibility"
down_revision: Union[str, None] = "20261021_p5_aigrade_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Native PostgreSQL enums for Phase 6A
    formative_scope = postgresql.ENUM(
        "PER_FORMATIVE", name="formativescope", create_type=False
    )
    formative_scope.create(bind, checkfirst=True)

    reassessment_block_scope = postgresql.ENUM(
        "COURSE", "ALL_COURSES", name="reassessmentblockscope", create_type=False
    )
    reassessment_block_scope.create(bind, checkfirst=True)

    pending_marks_behavior = postgresql.ENUM(
        "BLOCK", "MANUAL_REVIEW", "EXCLUDE", name="pendingmarksbehavior", create_type=False
    )
    pending_marks_behavior.create(bind, checkfirst=True)

    no_coursework_behavior = postgresql.ENUM(
        "MANUAL_REVIEW", "BLOCK", "ALLOW", name="nocourseworkbehavior", create_type=False
    )
    no_coursework_behavior.create(bind, checkfirst=True)

    reassessment_requirement_status = postgresql.ENUM(
        "REQUIRED", "ASSIGNED", "SUBMITTED", "GRADED", "EXCUSED", "WAIVED",
        name="reassessmentrequirementstatus",
        create_type=False,
    )
    reassessment_requirement_status.create(bind, checkfirst=True)

    eligibility_decision_type = postgresql.ENUM(
        "CAT_GATE", "SUMMATIVE_ENTRY", "COURSE_OUTCOME",
        name="eligibilitydecisiontype",
        create_type=False,
    )
    eligibility_decision_type.create(bind, checkfirst=True)

    eligibility_result = postgresql.ENUM(
        "ELIGIBLE", "BLOCKED", "PASS", "RETAKE_REQUIRED", "MANUAL_REVIEW",
        name="eligibilityresult",
        create_type=False,
    )
    eligibility_result.create(bind, checkfirst=True)

    override_source = postgresql.ENUM(
        "EXCUSE", "HOD_OVERRIDE", name="overridesource", create_type=False
    )
    override_source.create(bind, checkfirst=True)

    payment_purpose = postgresql.ENUM(
        "RETAKE", "APPEAL", name="paymentpurpose", create_type=False
    )
    payment_purpose.create(bind, checkfirst=True)

    payment_status = postgresql.ENUM(
        "PENDING", "CONFIRMED", "REJECTED", name="paymentstatus", create_type=False
    )
    payment_status.create(bind, checkfirst=True)

    retake_trigger = postgresql.ENUM(
        "ENTRY_THRESHOLD_NOT_MET", "SUMMATIVE_FAILED",
        name="retaketrigger",
        create_type=False,
    )
    retake_trigger.create(bind, checkfirst=True)

    retake_status = postgresql.ENUM(
        "FLAGGED", "PAYMENT_PENDING", "PAID", "ENROLLED", "CANCELLED",
        name="retakestatus",
        create_type=False,
    )
    retake_status.create(bind, checkfirst=True)

    # Dialect-safe enum types
    is_pg = bind.dialect.name == "postgresql"
    formative_scope_t = formative_scope if is_pg else sa.Enum("PER_FORMATIVE", name="formativescope")
    reassessment_block_scope_t = reassessment_block_scope if is_pg else sa.Enum("COURSE", "ALL_COURSES", name="reassessmentblockscope")
    pending_marks_behavior_t = pending_marks_behavior if is_pg else sa.Enum("BLOCK", "MANUAL_REVIEW", "EXCLUDE", name="pendingmarksbehavior")
    no_coursework_behavior_t = no_coursework_behavior if is_pg else sa.Enum("MANUAL_REVIEW", "BLOCK", "ALLOW", name="nocourseworkbehavior")
    reassessment_requirement_status_t = reassessment_requirement_status if is_pg else sa.Enum("REQUIRED", "ASSIGNED", "SUBMITTED", "GRADED", "EXCUSED", "WAIVED", name="reassessmentrequirementstatus")
    eligibility_decision_type_t = eligibility_decision_type if is_pg else sa.Enum("CAT_GATE", "SUMMATIVE_ENTRY", "COURSE_OUTCOME", name="eligibilitydecisiontype")
    eligibility_result_t = eligibility_result if is_pg else sa.Enum("ELIGIBLE", "BLOCKED", "PASS", "RETAKE_REQUIRED", "MANUAL_REVIEW", name="eligibilityresult")
    override_source_t = override_source if is_pg else sa.Enum("EXCUSE", "HOD_OVERRIDE", name="overridesource")
    payment_purpose_t = payment_purpose if is_pg else sa.Enum("RETAKE", "APPEAL", name="paymentpurpose")
    payment_status_t = payment_status if is_pg else sa.Enum("PENDING", "CONFIRMED", "REJECTED", name="paymentstatus")
    retake_trigger_t = retake_trigger if is_pg else sa.Enum("ENTRY_THRESHOLD_NOT_MET", "SUMMATIVE_FAILED", name="retaketrigger")
    retake_status_t = retake_status if is_pg else sa.Enum("FLAGGED", "PAYMENT_PENDING", "PAID", "ENROLLED", "CANCELLED", name="retakestatus")

    # 2. Create eligibility_policy
    op.create_table(
        "eligibility_policy",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("institution.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("department.id", ondelete="CASCADE"), nullable=True),
        sa.Column("formative_exempt_pct", sa.Float(), nullable=False, server_default=sa.text("70.0")),
        sa.Column("summative_entry_pct", sa.Float(), nullable=False, server_default=sa.text("50.0")),
        sa.Column("summative_pass_pct", sa.Float(), nullable=False, server_default=sa.text("50.0")),
        sa.Column("formative_scope", formative_scope_t, nullable=False, server_default="PER_FORMATIVE"),
        sa.Column("reassessment_block_scope", reassessment_block_scope_t, nullable=False, server_default="COURSE"),
        sa.Column("pending_marks_behavior", pending_marks_behavior_t, nullable=False, server_default="BLOCK"),
        sa.Column("no_coursework_behavior", no_coursework_behavior_t, nullable=False, server_default="MANUAL_REVIEW"),
        sa.Column("allow_hod_override", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("institution_id", "department_id", name="uq_eligibility_policy_inst_dept"),
    )
    op.create_index("ix_eligibility_policy_institution_id", "eligibility_policy", ["institution_id"])
    op.create_index("ix_eligibility_policy_department_id", "eligibility_policy", ["department_id"])

    # 3. Create reassessment_requirement
    op.create_table(
        "reassessment_requirement",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("course.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("academic_period.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_assessment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assessment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_percentage", sa.Float(), nullable=False),
        sa.Column("status", reassessment_requirement_status_t, nullable=False, server_default="REQUIRED"),
        sa.Column("reassessment_assessment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assessment.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reassessment_attempt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assessment_attempt.id", ondelete="SET NULL"), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("student_id", "source_assessment_id", name="uq_reassessment_requirement_student_source"),
    )
    op.create_index("ix_reassessment_req_student_course", "reassessment_requirement", ["student_id", "course_id"])
    op.create_index("ix_reassessment_req_status", "reassessment_requirement", ["status"])

    # 4. Create eligibility_decision
    op.create_table(
        "eligibility_decision",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("course.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assessment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assessment.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decision_type", eligibility_decision_type_t, nullable=False),
        sa.Column("result", eligibility_result_t, nullable=False),
        sa.Column("reason_code", sa.String(length=100), nullable=False),
        sa.Column("inputs_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("policy_snapshot_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("computed_by", sa.String(length=100), nullable=False, server_default="system"),
    )
    op.create_index("ix_eligibility_decision_student_course", "eligibility_decision", ["student_id", "course_id"])
    op.create_index("ix_eligibility_decision_assessment_id", "eligibility_decision", ["assessment_id"])
    op.create_index("ix_eligibility_decision_decision_type", "eligibility_decision", ["decision_type"])

    # 5. Create attempt_eligibility_override
    op.create_table(
        "attempt_eligibility_override",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assessment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assessment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", override_source_t, nullable=False),
        sa.Column("allowed_window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("allowed_window_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("granted_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("excuse_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_eligibility_override_student_assessment", "attempt_eligibility_override", ["student_id", "assessment_id"])

    # 6. Create payment_reference
    op.create_table(
        "payment_reference",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("purpose", payment_purpose_t, nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_reference", sa.String(length=255), nullable=True),
        sa.Column("amount_text", sa.String(length=100), nullable=True),
        sa.Column("status", payment_status_t, nullable=False, server_default="PENDING"),
        sa.Column("confirmed_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_payment_reference_student", "payment_reference", ["student_id"])
    op.create_index("ix_payment_reference_status", "payment_reference", ["status"])

    # 7. Create retake_record
    op.create_table(
        "retake_record",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("course.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("academic_period.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("academic_period.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("course.id", ondelete="SET NULL"), nullable=True),
        sa.Column("trigger", retake_trigger_t, nullable=False),
        sa.Column("status", retake_status_t, nullable=False, server_default="FLAGGED"),
        sa.Column("payment_reference_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payment_reference.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_decision_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eligibility_decision.id", ondelete="SET NULL"), nullable=True),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_retake_record_student_course", "retake_record", ["student_id", "course_id"])
    op.create_index("ix_retake_record_status", "retake_record", ["status"])

    # 8. Add columns to student_enrollment
    op.add_column(
        "student_enrollment",
        sa.Column("is_retake", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "student_enrollment",
        sa.Column("retake_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("retake_record.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()

    # 8. Drop columns from student_enrollment
    op.drop_column("student_enrollment", "retake_record_id")
    op.drop_column("student_enrollment", "is_retake")

    # 7. Drop retake_record
    op.drop_index("ix_retake_record_status", table_name="retake_record")
    op.drop_index("ix_retake_record_student_course", table_name="retake_record")
    op.drop_table("retake_record")

    # 6. Drop payment_reference
    op.drop_index("ix_payment_reference_status", table_name="payment_reference")
    op.drop_index("ix_payment_reference_student", table_name="payment_reference")
    op.drop_table("payment_reference")

    # 5. Drop attempt_eligibility_override
    op.drop_index("ix_eligibility_override_student_assessment", table_name="attempt_eligibility_override")
    op.drop_table("attempt_eligibility_override")

    # 4. Drop eligibility_decision
    op.drop_index("ix_eligibility_decision_decision_type", table_name="eligibility_decision")
    op.drop_index("ix_eligibility_decision_assessment_id", table_name="eligibility_decision")
    op.drop_index("ix_eligibility_decision_student_course", table_name="eligibility_decision")
    op.drop_table("eligibility_decision")

    # 3. Drop reassessment_requirement
    op.drop_index("ix_reassessment_req_status", table_name="reassessment_requirement")
    op.drop_index("ix_reassessment_req_student_course", table_name="reassessment_requirement")
    op.drop_table("reassessment_requirement")

    # 2. Drop eligibility_policy
    op.drop_index("ix_eligibility_policy_department_id", table_name="eligibility_policy")
    op.drop_index("ix_eligibility_policy_institution_id", table_name="eligibility_policy")
    op.drop_table("eligibility_policy")

    # 1. Drop Enums (PostgreSQL only)
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS retakestatus")
        op.execute("DROP TYPE IF EXISTS retaketrigger")
        op.execute("DROP TYPE IF EXISTS paymentstatus")
        op.execute("DROP TYPE IF EXISTS paymentpurpose")
        op.execute("DROP TYPE IF EXISTS overridesource")
        op.execute("DROP TYPE IF EXISTS eligibilityresult")
        op.execute("DROP TYPE IF EXISTS eligibilitydecisiontype")
        op.execute("DROP TYPE IF EXISTS reassessmentrequirementstatus")
        op.execute("DROP TYPE IF EXISTS nocourseworkbehavior")
        op.execute("DROP TYPE IF EXISTS pendingmarksbehavior")
        op.execute("DROP TYPE IF EXISTS reassessmentblockscope")
        op.execute("DROP TYPE IF EXISTS formativescope")
