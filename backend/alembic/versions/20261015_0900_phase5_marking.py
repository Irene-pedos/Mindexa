"""Phase 5: Marking schemes, partial credit, key points, AI review, and grading delegations

Revision ID: 20261015_p5_marking
Revises: 20261014_p4_authoring
Create Date: 2026-10-15 09:00:00

"""
from __future__ import annotations

import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261015_p5_marking"
down_revision: Union[str, None] = "20261014_p4_authoring"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Native PostgreSQL enums for Phase 5
    step_kind = postgresql.ENUM(
        "METHOD", "ACCURACY", "PRESENTATION", name="stepkind", create_type=False
    )
    step_kind.create(bind, checkfirst=True)

    key_point_importance = postgresql.ENUM(
        "CORE", "SUPPORTING", name="keypointimportance", create_type=False
    )
    key_point_importance.create(bind, checkfirst=True)

    sample_check_status = postgresql.ENUM(
        "PENDING", "VERIFIED", "REJECTED", name="samplecheckstatus", create_type=False
    )
    sample_check_status.create(bind, checkfirst=True)

    grading_delegation_scope = postgresql.ENUM(
        "WHOLE", "SECTION", "SELECTED_STUDENTS", name="gradingdelegationscope", create_type=False
    )
    grading_delegation_scope.create(bind, checkfirst=True)

    # Dialect-safe enum types for table creation
    step_kind_type = (
        step_kind if bind.dialect.name == "postgresql"
        else sa.Enum("METHOD", "ACCURACY", "PRESENTATION", name="stepkind")
    )
    key_point_importance_type = (
        key_point_importance if bind.dialect.name == "postgresql"
        else sa.Enum("CORE", "SUPPORTING", name="keypointimportance")
    )
    sample_check_status_type = (
        sample_check_status if bind.dialect.name == "postgresql"
        else sa.Enum("PENDING", "VERIFIED", "REJECTED", name="samplecheckstatus")
    )
    grading_delegation_scope_type = (
        grading_delegation_scope if bind.dialect.name == "postgresql"
        else sa.Enum("WHOLE", "SECTION", "SELECTED_STUDENTS", name="gradingdelegationscope")
    )
    delegation_status_type = (
        postgresql.ENUM("ACTIVE", "REVOKED", "EXPIRED", name="delegationstatus", create_type=False)
        if bind.dialect.name == "postgresql"
        else sa.Enum("ACTIVE", "REVOKED", "EXPIRED", name="delegationstatus")
    )

    # 2. Add anonymous_marking to assessment table
    op.add_column(
        "assessment",
        sa.Column(
            "anonymous_marking",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # 3. Create marking_scheme table
    op.create_table(
        "marking_scheme",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "question_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("question.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("model_answer", sa.Text(), nullable=False),
        sa.Column("allow_partial_credit", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "rubric_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rubric.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_marking_scheme_question_id", "marking_scheme", ["question_id"])
    op.create_index("ix_marking_scheme_created_by_id", "marking_scheme", ["created_by_id"])
    op.create_index("ix_marking_scheme_is_deleted", "marking_scheme", ["is_deleted"])

    # 4. Create question_mark_step table
    op.create_table(
        "question_mark_step",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "question_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("question.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_no", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("marks", sa.Float(), nullable=False),
        sa.Column("kind", step_kind_type, nullable=False, server_default="METHOD"),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("question_id", "step_no", name="uq_question_mark_step_question_step_no"),
    )
    op.create_index("ix_question_mark_step_question_id", "question_mark_step", ["question_id"])
    op.create_index("ix_question_mark_step_is_deleted", "question_mark_step", ["is_deleted"])

    # 5. Create material_key_point table
    op.create_table(
        "material_key_point",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "lecturer_material_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lecturer_material.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chunk_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lecturer_material_chunk.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("importance", key_point_importance_type, nullable=False, server_default="CORE"),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_material_key_point_lecturer_material_id", "material_key_point", ["lecturer_material_id"])
    op.create_index("ix_material_key_point_created_by_id", "material_key_point", ["created_by_id"])
    op.create_index("ix_material_key_point_is_deleted", "material_key_point", ["is_deleted"])

    # 6. Create question_key_point table
    op.create_table(
        "question_key_point",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "question_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("question.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "key_point_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("material_key_point.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("question_id", "key_point_id", name="uq_question_key_point_question_key_point"),
    )
    op.create_index("ix_question_key_point_question_id", "question_key_point", ["question_id"])
    op.create_index("ix_question_key_point_key_point_id", "question_key_point", ["key_point_id"])

    # 7. Create ai_grade_sample_check table
    op.create_table(
        "ai_grade_sample_check",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "assessment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "lecturer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("sample_size", sa.Integer(), nullable=False),
        sa.Column(
            "sampled_review_ids",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("checked_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("agreement_rate", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("status", sample_check_status_type, nullable=False, server_default="PENDING"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_grade_sample_check_assessment_id", "ai_grade_sample_check", ["assessment_id"])
    op.create_index("ix_ai_grade_sample_check_lecturer_id", "ai_grade_sample_check", ["lecturer_id"])
    op.create_index("ix_ai_grade_sample_check_status", "ai_grade_sample_check", ["status"])

    # 8. Create grading_delegation table
    op.create_table(
        "grading_delegation",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "assessment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "delegator_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "delegate_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("scope", grading_delegation_scope_type, nullable=False, server_default="WHOLE"),
        sa.Column(
            "target_section_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assessment_section.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("target_student_ids", postgresql.JSONB(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", delegation_status_type, nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_grading_delegation_assessment_id", "grading_delegation", ["assessment_id"])
    op.create_index("ix_grading_delegation_delegator_id", "grading_delegation", ["delegator_id"])
    op.create_index("ix_grading_delegation_delegate_id", "grading_delegation", ["delegate_id"])
    op.create_index("ix_grading_delegation_status", "grading_delegation", ["status"])

    # 9. Add graded_by_id and delegation_id to submission_grade
    op.add_column(
        "submission_grade",
        sa.Column(
            "graded_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_submission_grade_graded_by_id", "submission_grade", ["graded_by_id"])

    op.add_column(
        "submission_grade",
        sa.Column(
            "delegation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("grading_delegation.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_submission_grade_delegation_id", "submission_grade", ["delegation_id"])

    # 10. Add delegation_id to ai_grade_review
    op.add_column(
        "ai_grade_review",
        sa.Column(
            "delegation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("grading_delegation.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_ai_grade_review_delegation_id", "ai_grade_review", ["delegation_id"])

    # 11. Seed "Open Answer Standard" rubric preset idempotently (R-13)
    _seed_open_answer_rubric(bind)


def _seed_open_answer_rubric(bind) -> None:
    """Idempotently seed the Open Answer Standard rubric preset."""
    res = bind.execute(
        sa.text("SELECT id FROM rubric WHERE title = 'Open Answer Standard' LIMIT 1")
    ).fetchone()
    if res:
        return

    rubric_id = uuid.uuid4()
    now_res = bind.execute(sa.text("SELECT now()")).fetchone()
    now = now_res[0] if now_res else None

    bind.execute(
        sa.text(
            """
            INSERT INTO rubric (id, title, description, is_shared, is_deleted, created_at, updated_at)
            VALUES (:id, 'Open Answer Standard', 'Standard 4-criterion institutional rubric for open-ended answers (R-13).', true, false, :now, :now)
            """
        ),
        {"id": rubric_id, "now": now},
    )

    criteria_data = [
        (
            "Interpretation of the question",
            "Did the student understand what was asked",
            20,
            0,
            [
                ("Excellent", "Thorough and accurate interpretation of all aspects of the prompt", 20, 0),
                ("Good", "Clear understanding of the main question with minor omissions", 15, 1),
                ("Satisfactory", "Basic understanding; partially addresses core question", 10, 2),
                ("Weak", "Misunderstood or failed to address the central question", 5, 3),
            ],
        ),
        (
            "Quality of the answer",
            "Correctness, reasoning, clarity",
            40,
            1,
            [
                ("Excellent", "Rigorous reasoning, comprehensive correctness, and exceptional clarity", 40, 0),
                ("Good", "Sound arguments and generally accurate explanations with minor slips", 30, 1),
                ("Satisfactory", "Partially correct with moderate reasoning gaps or unclear expression", 20, 2),
                ("Weak", "Incorrect logic, factual errors, or very poor coherence", 10, 3),
            ],
        ),
        (
            "Use of course content",
            "Uses ideas/terms from the learning materials",
            20,
            2,
            [
                ("Excellent", "Extensive and precise application of course concepts, terminology, and models", 20, 0),
                ("Good", "Appropriate integration of course materials with occasional surface usage", 15, 1),
                ("Satisfactory", "Limited or superficial references to course content", 10, 2),
                ("Weak", "No discernible use of course ideas, terms, or materials", 5, 3),
            ],
        ),
        (
            "Key-point coverage",
            "Covers the lecturer's highlighted key points",
            20,
            3,
            [
                ("Excellent", "Addresses all highlighted core and supporting key points fully", 20, 0),
                ("Good", "Addresses most key points with sound elaboration", 15, 1),
                ("Satisfactory", "Addresses some key points superficially", 10, 2),
                ("Weak", "Misses almost all required key points", 5, 3),
            ],
        ),
    ]

    for crit_title, crit_desc, max_m, order_i, levels in criteria_data:
        crit_id = uuid.uuid4()
        bind.execute(
            sa.text(
                """
                INSERT INTO rubric_criterion (id, rubric_id, title, description, max_marks, order_index, is_deleted, created_at, updated_at)
                VALUES (:id, :rubric_id, :title, :desc, :max_m, :order_i, false, :now, :now)
                """
            ),
            {
                "id": crit_id,
                "rubric_id": rubric_id,
                "title": crit_title,
                "desc": crit_desc,
                "max_m": max_m,
                "order_i": order_i,
                "now": now,
            },
        )
        for lvl_label, lvl_desc, lvl_marks, lvl_order in levels:
            lvl_id = uuid.uuid4()
            bind.execute(
                sa.text(
                    """
                    INSERT INTO rubric_criterion_level (id, criterion_id, label, description, marks, order_index, is_deleted, created_at, updated_at)
                    VALUES (:id, :criterion_id, :label, :desc, :marks, :order_i, false, :now, :now)
                    """
                ),
                {
                    "id": lvl_id,
                    "criterion_id": crit_id,
                    "label": lvl_label,
                    "desc": lvl_desc,
                    "marks": lvl_marks,
                    "order_i": lvl_order,
                    "now": now,
                },
            )


def downgrade() -> None:
    bind = op.get_bind()

    # 1. Clean up seeded Open Answer Standard rubric
    res = bind.execute(
        sa.text("SELECT id FROM rubric WHERE title = 'Open Answer Standard'")
    ).fetchall()
    for row in res:
        r_id = row[0]
        # Delete dependent levels and criteria
        bind.execute(
            sa.text(
                "DELETE FROM rubric_criterion_level WHERE criterion_id IN (SELECT id FROM rubric_criterion WHERE rubric_id = :r_id)"
            ),
            {"r_id": r_id},
        )
        bind.execute(
            sa.text("DELETE FROM rubric_criterion WHERE rubric_id = :r_id"),
            {"r_id": r_id},
        )
        bind.execute(
            sa.text("DELETE FROM rubric WHERE id = :r_id"),
            {"r_id": r_id},
        )

    # 2. Drop columns from ai_grade_review and submission_grade
    op.drop_index("ix_ai_grade_review_delegation_id", table_name="ai_grade_review")
    op.drop_column("ai_grade_review", "delegation_id")

    op.drop_index("ix_submission_grade_delegation_id", table_name="submission_grade")
    op.drop_column("submission_grade", "delegation_id")

    op.drop_index("ix_submission_grade_graded_by_id", table_name="submission_grade")
    op.drop_column("submission_grade", "graded_by_id")

    # 3. Drop grading_delegation table
    op.drop_table("grading_delegation")

    # 4. Drop ai_grade_sample_check table
    op.drop_table("ai_grade_sample_check")

    # 5. Drop question_key_point table
    op.drop_table("question_key_point")

    # 6. Drop material_key_point table
    op.drop_table("material_key_point")

    # 7. Drop question_mark_step table
    op.drop_table("question_mark_step")

    # 8. Drop marking_scheme table
    op.drop_table("marking_scheme")

    # 9. Drop anonymous_marking column from assessment
    op.drop_column("assessment", "anonymous_marking")

    # 10. Drop PostgreSQL native enums
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS gradingdelegationscope")
        op.execute("DROP TYPE IF EXISTS samplecheckstatus")
        op.execute("DROP TYPE IF EXISTS keypointimportance")
        op.execute("DROP TYPE IF EXISTS stepkind")
