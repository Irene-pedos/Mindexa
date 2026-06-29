"""add_grounded_by_rag_to_ai_generated_question

Revision ID: a3f7c91e2d84
Revises: f11032db97ba
Create Date: 2026-06-26 16:45:00.000000

Adds a boolean column ``grounded_by_rag`` to ``ai_generated_question``.
- TRUE  → question was generated with RAG context from the lecturer's
          uploaded course materials.
- FALSE → question was generated from the AI model's general knowledge
          (no matching lecture materials were found in the vector store).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic
revision: str = 'a3f7c91e2d84'
down_revision: Union[str, None] = 'f11032db97ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'ai_generated_question',
        sa.Column(
            'grounded_by_rag',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )


def downgrade() -> None:
    op.drop_column('ai_generated_question', 'grounded_by_rag')
