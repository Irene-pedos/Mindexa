"""Extend learning_unit table with outcomes and page ranges, update unique constraint, and add SEGMENT_LEARNING_UNITS to aiactiontype.

Revision ID: 20260827_2030_extend_lu
Revises: 20260827_1030_slide_deck_action
Create Date: 2026-08-27 20:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic
revision: str = '20260827_2030_extend_lu'
down_revision: Union[str, None] = '20260827_1030_slide_deck_action'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add SEGMENT_LEARNING_UNITS to aiactiontype enum if postgres enum
    op.execute("COMMIT")
    try:
        op.execute("ALTER TYPE aiactiontype ADD VALUE 'SEGMENT_LEARNING_UNITS'")
    except Exception:
        pass

    # 2. Add columns to learning_unit
    op.add_column('learning_unit', sa.Column('learning_outcomes', sa.JSON(), nullable=True, server_default='[]'))
    op.add_column('learning_unit', sa.Column('start_page', sa.Integer(), nullable=True))
    op.add_column('learning_unit', sa.Column('end_page', sa.Integer(), nullable=True))

    # 3. Update unique constraint
    try:
        op.drop_constraint('uq_lu_workspace_order', 'learning_unit', type_='unique')
    except Exception:
        pass

    try:
        op.create_unique_constraint(
            'uq_lu_workspace_material_order',
            'learning_unit',
            ['teaching_workspace_id', 'source_material_id', 'order_index']
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_constraint('uq_lu_workspace_material_order', 'learning_unit', type_='unique')
    except Exception:
        pass

    try:
        op.create_unique_constraint(
            'uq_lu_workspace_order',
            'learning_unit',
            ['teaching_workspace_id', 'order_index']
        )
    except Exception:
        pass

    op.drop_column('learning_unit', 'end_page')
    op.drop_column('learning_unit', 'start_page')
    op.drop_column('learning_unit', 'learning_outcomes')
