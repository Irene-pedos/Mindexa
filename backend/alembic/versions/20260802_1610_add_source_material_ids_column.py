"""add_source_material_ids_column

Revision ID: 0a02e34b2c52
Revises: 0a02e34b2c51
Create Date: 2026-08-02 16:10:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic
revision: str = '0a02e34b2c52'
down_revision: Union[str, None] = '0a02e34b2c51'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    try:
        cols = [col["name"] for col in inspector.get_columns(table_name)]
    except Exception:
        return False
    return column_name in cols


def upgrade() -> None:
    if not _has_column('study_session', 'source_material_ids'):
        op.add_column('study_session', sa.Column('source_material_ids', sa.JSON(), nullable=True))
        op.execute(sa.text("UPDATE study_session SET source_material_ids = '[]' WHERE source_material_ids IS NULL"))


def downgrade() -> None:
    if _has_column('study_session', 'source_material_ids'):
        op.drop_column('study_session', 'source_material_ids')
