"""Add layout preferences and furthest_page_reached to student_reading_progress.

Revision ID: 20260824_1130_progress_layout
Revises: 20260823_1045_study_reader
Create Date: 2026-08-24 11:30:00
"""

from alembic import op
import sqlalchemy as sa

revision = "20260824_1130_progress_layout"
down_revision = "20260823_1045_study_reader"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_reading_progress",
        sa.Column("rotation", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "student_reading_progress",
        sa.Column("zoom_mode", sa.String(length=30), nullable=False, server_default="fit-width"),
    )
    op.add_column(
        "student_reading_progress",
        sa.Column("two_page_view", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "student_reading_progress",
        sa.Column("furthest_page_reached", sa.Integer(), nullable=False, server_default="1"),
    )
    # Backfill furthest_page_reached from existing page_count_seen values
    op.execute(
        "UPDATE student_reading_progress SET furthest_page_reached = page_count_seen WHERE furthest_page_reached IS NULL OR furthest_page_reached = 1"
    )


def downgrade() -> None:
    op.drop_column("student_reading_progress", "furthest_page_reached")
    op.drop_column("student_reading_progress", "two_page_view")
    op.drop_column("student_reading_progress", "zoom_mode")
    op.drop_column("student_reading_progress", "rotation")
