"""Add three notification types that existed only in hand-built databases

SYSTEM_ANNOUNCEMENT, ASSESSMENT_AVAILABLE and TEACHING_ASSIGNMENT_CREATED are used
by the code and present in the development database, but no migration created
them, so a database built purely from migrations rejected those notifications.

Revision ID: 20261026_enum_drift_fix2
Revises: 20261026_enum_drift_fix
Create Date: 2026-10-26 10:10:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20261026_enum_drift_fix2"
down_revision: Union[str, None] = "20261026_enum_drift_fix"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ASSESSMENT_AVAILABLE'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'SYSTEM_ANNOUNCEMENT'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'TEACHING_ASSIGNMENT_CREATED'")


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value without rebuilding the type.
    pass
