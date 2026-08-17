"""Add is_post_release_corrected and post_release_corrected_at to assessment_result

Revision ID: 20260817_1300_add_post_release_correction
Revises: 20260817_1100_unify_group_results
Create Date: 2026-08-17 13:00:00

Adds:
  - assessment_result.is_post_release_corrected (BOOLEAN, default False, not null)
  - assessment_result.post_release_corrected_at (TIMESTAMP WITH TIME ZONE, nullable)
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "20260817_1300_post_release"
down_revision = "20260817_1100_group_results"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assessment_result",
        sa.Column(
            "is_post_release_corrected",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "assessment_result",
        sa.Column(
            "post_release_corrected_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("assessment_result", "post_release_corrected_at")
    op.drop_column("assessment_result", "is_post_release_corrected")
