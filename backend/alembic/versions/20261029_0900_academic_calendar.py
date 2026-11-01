"""Academic years contain semesters, and calendar events can name who they apply to

Rwanda Polytechnic's 2026/2027 calendar is one academic year with two semesters, plus dated items
(registration, holidays, special exams, results, appeals) that apply to some groups only.

- academic_period.parent_id: a semester / term / quarter points at its academic year.
- academic_calendar_event.audience: "Year 3", "BTech"… (empty means everyone).
- calendareventtype gets REGISTRATION, HOLIDAY, RESULTS_PUBLICATION, PLACEMENT, DEFENSE.

Revision ID: 20261029_academic_calendar
Revises: 20261028_option_guidance_text
Create Date: 2026-10-29 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261029_academic_calendar"
down_revision: Union[str, None] = "20261028_option_guidance_text"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_KINDS = ("REGISTRATION", "HOLIDAY", "RESULTS_PUBLICATION", "PLACEMENT", "DEFENSE")


def upgrade() -> None:
    op.add_column(
        "academic_period",
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_academic_period_parent_id",
        "academic_period",
        "academic_period",
        ["parent_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_academic_period_parent_id", "academic_period", ["parent_id"])

    op.add_column("academic_calendar_event", sa.Column("audience", sa.String(length=120), nullable=True))

    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older PostgreSQL versions.
    with op.get_context().autocommit_block():
        for kind in NEW_KINDS:
            op.execute(f"ALTER TYPE calendareventtype ADD VALUE IF NOT EXISTS '{kind}'")


def downgrade() -> None:
    # PostgreSQL cannot remove enum values; the extra labels are harmless once unused.
    op.drop_column("academic_calendar_event", "audience")
    op.drop_index("ix_academic_period_parent_id", table_name="academic_period")
    op.drop_constraint("fk_academic_period_parent_id", "academic_period", type_="foreignkey")
    op.drop_column("academic_period", "parent_id")
