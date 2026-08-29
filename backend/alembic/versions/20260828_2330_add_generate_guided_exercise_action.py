"""Add GENERATE_GUIDED_EXERCISE to aiactiontype enum.

Revision ID: 20260828_2330_guided_ex_action
Revises: 20260827_2030_extend_lu
Create Date: 2026-08-28 23:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic
revision: str = '20260828_2330_guided_ex_action'
down_revision: Union[str, None] = '20260827_2030_extend_lu'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # We use COMMIT because ALTER TYPE ... ADD VALUE cannot run inside a transaction block in Postgres
    op.execute("COMMIT")
    try:
        op.execute("ALTER TYPE aiactiontype ADD VALUE 'GENERATE_GUIDED_EXERCISE'")
    except Exception:
        # Value might already exist in some environments
        pass


def downgrade() -> None:
    pass
