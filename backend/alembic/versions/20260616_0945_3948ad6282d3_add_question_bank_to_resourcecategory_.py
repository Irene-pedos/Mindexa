"""add_question_bank_to_resourcecategory_enum

Revision ID: 3948ad6282d3
Revises: 8d28b1ec0641
Create Date: 2026-06-16 09:45:19.670730

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
revision: str = '3948ad6282d3'
down_revision: Union[str, None] = '8d28b1ec0641'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new values to the resourcecategory ENUM in PostgreSQL
    op.execute("ALTER TYPE resourcecategory ADD VALUE IF NOT EXISTS 'QUESTION_BANK'")
    op.execute("ALTER TYPE resourcecategory ADD VALUE IF NOT EXISTS 'ANSWER_KEY'")


def downgrade() -> None:
    # Postgres does not support removing values from an ENUM type easily.
    pass
