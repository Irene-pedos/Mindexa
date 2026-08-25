"""Add paused_at to assessment_attempt

Revision ID: 20260819_1230_add_paused_at
Revises: 20260817_1300_post_release
Create Date: 2026-08-19 12:30:00

Adds:
  - assessment_attempt.paused_at (TIMESTAMP WITH TIME ZONE, nullable)
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "20260819_1230_add_paused_at"
down_revision = "20260817_1300_post_release"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assessment_attempt",
        sa.Column(
            "paused_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    bind = op.get_bind()
    columns = sa.inspect(bind).get_columns("ai_action_log")
    action_column = next((column for column in columns if column["name"] == "action_type"), None)
    if action_column is not None and not isinstance(action_column["type"], sa.String):
        op.execute("ALTER TYPE aiactiontype ADD VALUE IF NOT EXISTS 'ASSESSMENT_AI_SUPPORT'")


def downgrade() -> None:
    op.drop_column("assessment_attempt", "paused_at")
