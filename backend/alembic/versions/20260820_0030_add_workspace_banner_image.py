"""Add banner image URL to teaching workspaces.

Revision ID: 20260820_0030_workspace_banner
Revises: 20260819_1230_add_paused_at
Create Date: 2026-08-20 00:30:00
"""

import sqlalchemy as sa
from alembic import op

revision = "20260820_0030_workspace_banner"
down_revision = "20260819_1230_add_paused_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "teaching_workspace",
        sa.Column("banner_image_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("teaching_workspace", "banner_image_url")
