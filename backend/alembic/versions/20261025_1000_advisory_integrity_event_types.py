"""Add advisory integrity event types (AI tool / DevTools suspected)

The exam client detects possible AI browser extensions and open developer tools
with heuristics that produce false positives (docked side panels, resized
windows). They are recorded for supervisors but never trigger warnings or
penalties, so they get their own event types instead of reusing a penalised one.

Revision ID: 20261025_advisory_events
Revises: 20261025_optional_default
Create Date: 2026-10-25 10:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20261025_advisory_events"
down_revision: Union[str, None] = "20261025_optional_default"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_VALUES = ("AI_TOOL_SUSPECTED", "DEVTOOLS_SUSPECTED")


def upgrade() -> None:
    for value in NEW_VALUES:
        op.execute(f"ALTER TYPE integrityeventtype ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value without rebuilding the type;
    # the extra values are harmless when unused.
    pass
