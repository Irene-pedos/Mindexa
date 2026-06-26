"""add_hnsw_index_to_resource_chunks

Revision ID: 4a703d518af9
Revises: 16ebb70a261d
Create Date: 2026-06-16 08:41:15.900415

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
revision: str = '4a703d518af9'
down_revision: Union[str, None] = '16ebb70a261d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add HNSW index for cosine similarity search performance
    op.execute("CREATE INDEX ON resource_chunks USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS resource_chunks_embedding_idx")
