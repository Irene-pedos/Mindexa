"""restore academic_year to course

Revision ID: fb8da3c60ba0
Revises: b7a2d3e4f5g6
Create Date: 2026-06-04 11:11:04.997974

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
revision: str = 'fb8da3c60ba0'
down_revision: Union[str, None] = 'b7a2d3e4f5g6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('course', sa.Column('academic_year', sa.String(length=100), nullable=True))
    op.execute("UPDATE course SET academic_year = '2026' WHERE academic_year IS NULL")
    op.alter_column('course', 'academic_year', nullable=False)


def downgrade() -> None:
    op.drop_column('course', 'academic_year')
