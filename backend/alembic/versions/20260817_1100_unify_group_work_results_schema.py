"""Unify assessment_result schema for group work and individual results

Revision ID: 20260817_1100_unify_group_results
Revises: 20260814_2145_add_table_fields
Create Date: 2026-08-17 11:00:00

Adds:
  - assessment_result.group_submission_id (UUID, nullable, FK to group_submission.id)
  - assessment_result.is_group_result (BOOLEAN, default False, not null, indexed)
  - Modifies assessment_result.attempt_id to be nullable
  - Updates unique constraints with partial unique indexes:
    - uq_assessment_result_attempt_partial ON assessment_result(attempt_id) WHERE attempt_id IS NOT NULL
    - uq_assessment_result_group_member_partial ON assessment_result(assessment_id, student_id, group_submission_id) WHERE group_submission_id IS NOT NULL
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "20260817_1100_group_results"
down_revision = "20260814_2145_add_table_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Alter attempt_id to be nullable
    op.alter_column(
        "assessment_result",
        "attempt_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )

    # 2. Add group_submission_id column
    op.add_column(
        "assessment_result",
        sa.Column(
            "group_submission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("group_submission.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # 3. Add is_group_result column
    op.add_column(
        "assessment_result",
        sa.Column(
            "is_group_result",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )

    # 4. Create index on is_group_result and group_submission_id
    op.create_index(
        "ix_assessment_result_is_group_result",
        "assessment_result",
        ["is_group_result"],
        unique=False,
    )
    op.create_index(
        "ix_assessment_result_group_submission_id",
        "assessment_result",
        ["group_submission_id"],
        unique=False,
    )

    # 5. Drop old unique constraint on attempt_id if exists and replace with partial unique index
    try:
        op.drop_constraint("uq_assessment_result_attempt", "assessment_result", type_="unique")
    except Exception:
        pass

    op.create_index(
        "uq_assessment_result_attempt_partial",
        "assessment_result",
        ["attempt_id"],
        unique=True,
        postgresql_where=sa.text("attempt_id IS NOT NULL"),
    )

    # 6. Create partial unique index on (assessment_id, student_id, group_submission_id)
    op.create_index(
        "uq_assessment_result_group_member_partial",
        "assessment_result",
        ["assessment_id", "student_id", "group_submission_id"],
        unique=True,
        postgresql_where=sa.text("group_submission_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_assessment_result_group_member_partial", table_name="assessment_result")
    op.drop_index("uq_assessment_result_attempt_partial", table_name="assessment_result")
    op.drop_index("ix_assessment_result_group_submission_id", table_name="assessment_result")
    op.drop_index("ix_assessment_result_is_group_result", table_name="assessment_result")
    op.drop_column("assessment_result", "is_group_result")
    op.drop_column("assessment_result", "group_submission_id")
    op.create_unique_constraint("uq_assessment_result_attempt", "assessment_result", ["attempt_id"])
    op.alter_column(
        "assessment_result",
        "attempt_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
