"""Phase 6A patch: add MANUAL_REVIEW to eligibilityresult enum

Revision ID: 20261022_p6a_patch_enum
Revises: 20261022_p6a_eligibility
Create Date: 2026-10-22 15:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20261022_p6a_patch_enum"
down_revision: Union[str, None] = "20261022_p6a_eligibility"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE is not transactional in PostgreSQL; must run outside a transaction.
    op.execute("COMMIT")
    op.execute("ALTER TYPE eligibilityresult ADD VALUE IF NOT EXISTS 'MANUAL_REVIEW'")
    # Also fix pendingmarksbehavior: add MANUAL_REVIEW and EXCLUDE if not present
    op.execute("ALTER TYPE pendingmarksbehavior ADD VALUE IF NOT EXISTS 'MANUAL_REVIEW'")
    op.execute("ALTER TYPE pendingmarksbehavior ADD VALUE IF NOT EXISTS 'EXCLUDE'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values natively.
    # A full enum recreation would be required; skip for safety.
    pass
