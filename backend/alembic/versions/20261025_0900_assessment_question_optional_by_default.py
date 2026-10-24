"""Questions are optional unless the lecturer marks them required

`assessment_question.is_required` used to default to TRUE and the authoring UI always
sent TRUE, so the flag carried no author intent — and it was never sent to students,
who could therefore submit with unanswered questions. Lecturers can now mark a
question as required; this resets the meaningless defaults so existing assessments
keep behaving exactly as they did.

Revision ID: 20261025_optional_default
Revises: 20261024_sync_schema
Create Date: 2026-10-25 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20261025_optional_default"
down_revision: Union[str, None] = "20261024_sync_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE assessment_question SET is_required = FALSE")
    op.execute("ALTER TABLE assessment_question ALTER COLUMN is_required SET DEFAULT FALSE")


def downgrade() -> None:
    # The previous values were defaults, not choices, so there is nothing to restore
    # beyond the old column default.
    op.execute("ALTER TABLE assessment_question ALTER COLUMN is_required DROP DEFAULT")
