"""Phase 2: Add choice-based sections, over-answer policy, structure template, and attempt question selections

Revision ID: 20261012_p2_choice_sections
Revises: 20261011_p1_duties_policies
Create Date: 2026-10-12 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261012_p2_choice_sections"
down_revision: Union[str, None] = "20261011_p1_duties_policies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Native PostgreSQL enums
    section_kind = postgresql.ENUM("CLOSED", "OPEN", "MIXED", name="section_kind")
    section_kind.create(bind, checkfirst=True)

    over_answer_policy = postgresql.ENUM("FIRST_N", "BEST_N", name="over_answer_policy")
    over_answer_policy.create(bind, checkfirst=True)

    schedule_state = postgresql.ENUM("ON_TRACK", "AT_RISK", "SHIFT_REQUIRED", name="schedule_state")
    schedule_state.create(bind, checkfirst=True)

    # 2. Table: exam_structure_template
    op.create_table(
        "exam_structure_template",
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rules_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_exam_structure_template_name"),
    )
    op.create_index("ix_exam_structure_template_name", "exam_structure_template", ["name"])
    op.create_index("ix_exam_structure_template_is_default", "exam_structure_template", ["is_default"])
    op.create_index("ix_exam_structure_template_is_active", "exam_structure_template", ["is_active"])
    op.create_index("ix_exam_structure_template_is_deleted", "exam_structure_template", ["is_deleted"])

    # 3. Assessment columns: over_answer_policy and schedule_state
    op.add_column(
        "assessment",
        sa.Column(
            "over_answer_policy",
            postgresql.ENUM("FIRST_N", "BEST_N", name="over_answer_policy", create_type=False),
            server_default="FIRST_N",
            nullable=False,
        ),
    )
    op.add_column(
        "assessment",
        sa.Column(
            "schedule_state",
            postgresql.ENUM("ON_TRACK", "AT_RISK", "SHIFT_REQUIRED", name="schedule_state", create_type=False),
            server_default="ON_TRACK",
            nullable=False,
        ),
    )
    op.create_index("ix_assessment_over_answer_policy", "assessment", ["over_answer_policy"])
    op.create_index("ix_assessment_schedule_state", "assessment", ["schedule_state"])

    # 4. AssessmentSection columns: section_kind and questions_to_answer
    op.add_column(
        "assessment_section",
        sa.Column(
            "section_kind",
            postgresql.ENUM("CLOSED", "OPEN", "MIXED", name="section_kind", create_type=False),
            server_default="MIXED",
            nullable=False,
        ),
    )
    op.add_column(
        "assessment_section",
        sa.Column("questions_to_answer", sa.Integer(), nullable=True),
    )
    op.create_index("ix_assessment_section_section_kind", "assessment_section", ["section_kind"])

    # 5. StudentResponse column: is_counted
    op.add_column(
        "student_response",
        sa.Column("is_counted", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_index("ix_student_response_is_counted", "student_response", ["is_counted"])

    # 6. SubmissionGrade column: is_counted
    op.add_column(
        "submission_grade",
        sa.Column("is_counted", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_index("ix_submission_grade_is_counted", "submission_grade", ["is_counted"])

    # 7. Table: attempt_section_selection
    op.create_table(
        "attempt_section_selection",
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("assessment_section_id", sa.Uuid(), nullable=False),
        sa.Column("question_id", sa.Uuid(), nullable=False),
        sa.Column("selected_order", sa.Integer(), nullable=False),
        sa.Column("selected_at", sa.DateTime(timezone=True), server_default=sa.text("TIMEZONE('utc', NOW())"), nullable=False),
        sa.ForeignKeyConstraint(["assessment_section_id"], ["assessment_section.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attempt_id"], ["assessment_attempt.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["question.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_id", "question_id", name="uq_attempt_section_selection_attempt_question"),
    )
    op.create_index("ix_attempt_section_selection_attempt_id", "attempt_section_selection", ["attempt_id"])
    op.create_index("ix_attempt_section_selection_assessment_section_id", "attempt_section_selection", ["assessment_section_id"])
    op.create_index("ix_attempt_section_selection_question_id", "attempt_section_selection", ["question_id"])
    op.create_index(
        "ix_attempt_section_selection_attempt_id_assessment_section_id",
        "attempt_section_selection",
        ["attempt_id", "assessment_section_id"],
    )
    op.create_index("ix_attempt_section_selection_is_deleted", "attempt_section_selection", ["is_deleted"])

    # 8. Seed default structure template idempotently
    op.execute(
        sa.text("""
        INSERT INTO exam_structure_template (
            id, name, description, rules_json, is_default, is_active, is_deleted, created_at, updated_at
        )
        VALUES (
            gen_random_uuid(),
            'RP Summative 3-Section',
            'Default RP summative assessment structure: 3 sections (A, B, C), total 100 marks, choice pools in B and C.',
            '{"total_required_marks": 100, "section_count": 3, "section_a_kind": "CLOSED", "section_c_kind": "OPEN", "sections_b_c_choice_pools": true}'::jsonb,
            true,
            true,
            false,
            TIMEZONE('utc', NOW()),
            TIMEZONE('utc', NOW())
        )
        ON CONFLICT (name) DO NOTHING;
        """)
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_attempt_section_selection_attempt_id_assessment_section_id", table_name="attempt_section_selection")
    op.drop_index("ix_attempt_section_selection_question_id", table_name="attempt_section_selection")
    op.drop_index("ix_attempt_section_selection_assessment_section_id", table_name="attempt_section_selection")
    op.drop_index("ix_attempt_section_selection_is_deleted", table_name="attempt_section_selection")
    op.drop_index("ix_attempt_section_selection_attempt_id", table_name="attempt_section_selection")
    op.drop_table("attempt_section_selection")

    op.drop_index("ix_submission_grade_is_counted", table_name="submission_grade")
    op.drop_column("submission_grade", "is_counted")

    op.drop_index("ix_student_response_is_counted", table_name="student_response")
    op.drop_column("student_response", "is_counted")

    op.drop_index("ix_assessment_section_section_kind", table_name="assessment_section")
    op.drop_column("assessment_section", "questions_to_answer")
    op.drop_column("assessment_section", "section_kind")

    op.drop_index("ix_assessment_schedule_state", table_name="assessment")
    op.drop_index("ix_assessment_over_answer_policy", table_name="assessment")
    op.drop_column("assessment", "schedule_state")
    op.drop_column("assessment", "over_answer_policy")

    op.drop_index("ix_exam_structure_template_is_deleted", table_name="exam_structure_template")
    op.drop_index("ix_exam_structure_template_is_active", table_name="exam_structure_template")
    op.drop_index("ix_exam_structure_template_is_default", table_name="exam_structure_template")
    op.drop_index("ix_exam_structure_template_name", table_name="exam_structure_template")
    op.drop_table("exam_structure_template")

    schedule_state = postgresql.ENUM(name="schedule_state")
    schedule_state.drop(bind, checkfirst=True)

    over_answer_policy = postgresql.ENUM(name="over_answer_policy")
    over_answer_policy.drop(bind, checkfirst=True)

    section_kind = postgresql.ENUM(name="section_kind")
    section_kind.drop(bind, checkfirst=True)
