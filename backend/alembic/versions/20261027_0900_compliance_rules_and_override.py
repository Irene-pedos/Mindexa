"""Institution-configurable compliance rules and moderator waivers

approval_policy.compliance_rules   - how strictly each pre-moderation check applies per institution
moderation_review.compliance_override - the checks a moderator waived when approving, with the reason

Revision ID: 20261027_compliance_rules
Revises: 20261026_enum_drift_fix2
Create Date: 2026-10-27 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20261027_compliance_rules"
down_revision: Union[str, None] = "20261026_enum_drift_fix2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "approval_policy",
        sa.Column("compliance_rules", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "moderation_review",
        sa.Column("compliance_override", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("moderation_review", "compliance_override")
    op.drop_column("approval_policy", "compliance_rules")
