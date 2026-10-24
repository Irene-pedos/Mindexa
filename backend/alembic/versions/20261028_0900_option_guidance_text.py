"""Let question_option.match_value hold long text

match_value stores the right-hand side of a matching pair and, for case studies, each
sub-question's answer guidance. It was VARCHAR(500), so accepting an AI case study whose
guidance ran past 500 characters failed with "value too long for type character varying(500)"
and a 500 error. Guidance is routinely longer than that.

Revision ID: 20261028_option_guidance_text
Revises: 20261027_compliance_rules
Create Date: 2026-10-28 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20261028_option_guidance_text"
down_revision: Union[str, None] = "20261027_compliance_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "question_option",
        "match_value",
        existing_type=sa.String(length=500),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    # Values longer than 500 characters would be cut off, so shorten them explicitly first.
    op.execute("UPDATE question_option SET match_value = LEFT(match_value, 500) WHERE char_length(match_value) > 500")
    op.alter_column(
        "question_option",
        "match_value",
        existing_type=sa.Text(),
        type_=sa.String(length=500),
        existing_nullable=True,
    )
