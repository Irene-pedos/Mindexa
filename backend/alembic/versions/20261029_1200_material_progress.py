"""Live progress of document indexing on lecturer materials and student resources

Indexing a file (reading, splitting, embedding) can take a minute or more. These columns let the
screen show a real progress bar and the current step instead of a spinner.

Revision ID: 20261029_material_progress
Revises: 20261029_academic_calendar
Create Date: 2026-10-29 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261029_material_progress"
down_revision: Union[str, None] = "20261029_academic_calendar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("lecturer_material", "student_resource")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column("processing_progress", sa.Integer(), nullable=False, server_default="0"),
        )
        op.add_column(table, sa.Column("processing_stage", sa.String(length=30), nullable=True))
        # Files that were already indexed show as finished instead of 0%.
        op.execute(f"UPDATE {table} SET processing_progress = 100 WHERE processing_status = 'PROCESSED'")


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, "processing_stage")
        op.drop_column(table, "processing_progress")
