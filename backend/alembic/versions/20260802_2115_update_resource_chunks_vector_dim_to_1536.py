"""update_resource_chunks_vector_dim_to_1536

Revision ID: 0a02e34b2c53
Revises: 0a02e34b2c52
Create Date: 2026-08-02 21:15:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic
revision: str = '0a02e34b2c53'
down_revision: Union[str, None] = '0a02e34b2c52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS resource_chunks_embedding_idx")
    op.execute("ALTER TABLE resource_chunks ALTER COLUMN embedding TYPE vector(1536) USING NULL")
    op.execute("CREATE INDEX IF NOT EXISTS resource_chunks_embedding_idx ON resource_chunks USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS resource_chunks_embedding_idx")
    op.execute("ALTER TABLE resource_chunks ALTER COLUMN embedding TYPE vector(768) USING NULL")
    op.execute("CREATE INDEX IF NOT EXISTS resource_chunks_embedding_idx ON resource_chunks USING hnsw (embedding vector_cosine_ops)")
