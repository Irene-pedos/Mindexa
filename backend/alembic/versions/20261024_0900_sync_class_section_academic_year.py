"""Sync class_section academic_year and status fields

Revision ID: 20261024_sync_class_section
Revises: 20261023_p6c_calendar_export
Create Date: 2026-10-24 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261024_sync_class_section"
down_revision: Union[str, None] = "20261023_p6c_calendar_export"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Ensure enum classsectionstatus exists
    section_status_enum = postgresql.ENUM(
        "ACTIVE", "ARCHIVED", "GRADUATED", "SUSPENDED",
        name="classsectionstatus",
        create_type=False,
    )
    section_status_enum.create(bind, checkfirst=True)

    # 2. Add academic_year column if missing
    res = bind.execute(sa.text("SELECT 1 FROM information_schema.columns WHERE table_name='class_section' AND column_name='academic_year'"))
    if not res.first():
        op.add_column("class_section", sa.Column("academic_year", sa.String(length=100), nullable=True))
        op.execute("UPDATE class_section SET academic_year = '2026' WHERE academic_year IS NULL")
        op.alter_column("class_section", "academic_year", nullable=False, server_default="2026")

    # 3. Add status column if missing
    res = bind.execute(sa.text("SELECT 1 FROM information_schema.columns WHERE table_name='class_section' AND column_name='status'"))
    if not res.first():
        op.add_column(
            "class_section",
            sa.Column(
                "status",
                postgresql.ENUM(
                    "ACTIVE", "ARCHIVED", "GRADUATED", "SUSPENDED",
                    name="classsectionstatus",
                    create_type=False,
                ),
                server_default="ACTIVE",
                nullable=False,
            ),
        )

    # 4. Migrate unique constraint to include academic_year
    res = bind.execute(sa.text("SELECT 1 FROM pg_constraint WHERE conname = 'uq_class_section_scope_name'"))
    if res.first():
        op.drop_constraint("uq_class_section_scope_name", "class_section", type_="unique")

    res = bind.execute(sa.text("SELECT 1 FROM pg_constraint WHERE conname = 'uq_class_section_scope_year'"))
    if not res.first():
        op.create_unique_constraint("uq_class_section_scope_year", "class_section", ["class_group_id", "name", "academic_year"])


def downgrade() -> None:
    bind = op.get_bind()

    res = bind.execute(sa.text("SELECT 1 FROM pg_constraint WHERE conname = 'uq_class_section_scope_year'"))
    if res.first():
        op.drop_constraint("uq_class_section_scope_year", "class_section", type_="unique")

    res = bind.execute(sa.text("SELECT 1 FROM pg_constraint WHERE conname = 'uq_class_section_scope_name'"))
    if not res.first():
        op.create_unique_constraint("uq_class_section_scope_name", "class_section", ["class_group_id", "name"])

    res = bind.execute(sa.text("SELECT 1 FROM information_schema.columns WHERE table_name='class_section' AND column_name='status'"))
    if res.first():
        op.drop_column("class_section", "status")

    res = bind.execute(sa.text("SELECT 1 FROM information_schema.columns WHERE table_name='class_section' AND column_name='academic_year'"))
    if res.first():
        op.drop_column("class_section", "academic_year")
