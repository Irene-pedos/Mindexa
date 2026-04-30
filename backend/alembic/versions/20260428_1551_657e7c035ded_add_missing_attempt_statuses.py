"""add_missing_attempt_statuses

Revision ID: 657e7c035ded
Revises: 109338c360e1
Create Date: 2026-04-28 15:51:08.579538

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
revision: str = '657e7c035ded'
down_revision: Union[str, None] = '109338c360e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use op.execute to add values to the enum type.
    # PostgreSQL does not support adding enum values within a transaction block in older versions,
    # but Alembic usually handles this or we can use COMMIT.
    op.execute("ALTER TYPE attemptstatus ADD VALUE 'PAUSED'")
    op.execute("ALTER TYPE attemptstatus ADD VALUE 'TIMED_OUT'")
    op.execute("ALTER TYPE attemptstatus ADD VALUE 'FLAGGED'")


def downgrade() -> None:
    # PostgreSQL doesn't easily support removing enum values.
    pass
