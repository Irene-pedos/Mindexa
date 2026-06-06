"""add_missing_ai_action_types

Revision ID: 107bdd0aee24
Revises: c5e08d04f88b
Create Date: 2026-06-03 11:29:17.038942

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
revision: str = '107bdd0aee24'
down_revision: Union[str, None] = 'c5e08d04f88b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Manual enum update for aiactiontype
    # We use COMMIT because ALTER TYPE ... ADD VALUE cannot run inside a transaction block in some Postgres versions
    op.execute("COMMIT")
    for value in ["EMBEDDING", "FEEDBACK_DRAFT", "NARRATE_ANALYTICS", "DOCUMENT_SUMMARY", "STUDY_SUPPORT"]:
        try:
            op.execute(f"ALTER TYPE aiactiontype ADD VALUE '{value}'")
        except Exception:
            # Value might already exist
            pass


def downgrade() -> None:
    pass
