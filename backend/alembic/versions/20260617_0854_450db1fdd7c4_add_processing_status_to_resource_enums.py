"""add_processing_status_to_resource_enums

Adds 'PROCESSING' as a distinct value to the resourceprocessingstatus PostgreSQL enum
(previously it was aliased to 'PENDING', causing the Celery task to always log
'PENDING' when it set PROCESSING). Also backfills parent resources stuck at PENDING
that already have a processed AcademicResource.

Revision ID: 450db1fdd7c4
Revises: 3948ad6282d3
Create Date: 2026-06-17 08:54:52.918430

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
revision: str = '450db1fdd7c4'
down_revision: Union[str, None] = '3948ad6282d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add 'PROCESSING' to the PostgreSQL ENUM type.
    # PostgreSQL ALTER TYPE ... ADD VALUE is not transactional, so we run it
    # outside any transaction block (commit_after_each used via raw connection).
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TYPE resourceprocessingstatus ADD VALUE IF NOT EXISTS 'PROCESSING';"
    ))

    # 2. Backfill: student_resource rows that are PENDING but whose AcademicResource
    #    is already PROCESSED (chunk_count > 0) → mark them PROCESSED too.
    conn.execute(sa.text("""
        UPDATE student_resource sr
        SET    processing_status = 'PROCESSED',
               chunk_count       = ar.chunk_count
        FROM   academic_resources ar
        WHERE  sr.academic_resource_id = ar.id
          AND  sr.processing_status = 'PENDING'
          AND  ar.processing_status = 'PROCESSED'
          AND  ar.chunk_count > 0
          AND  sr.is_deleted = FALSE;
    """))

    # 3. Backfill: lecturer_material rows with the same condition.
    conn.execute(sa.text("""
        UPDATE lecturer_material lm
        SET    processing_status = 'PROCESSED',
               chunk_count       = ar.chunk_count
        FROM   academic_resources ar
        WHERE  lm.academic_resource_id = ar.id
          AND  lm.processing_status = 'PENDING'
          AND  ar.processing_status = 'PROCESSED'
          AND  ar.chunk_count > 0
          AND  lm.is_deleted = FALSE;
    """))


def downgrade() -> None:
    # PostgreSQL does not support removing ENUM values once added.
    # We can only revert the backfill (best effort).
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE student_resource sr
        SET    processing_status = 'PENDING'
        FROM   academic_resources ar
        WHERE  sr.academic_resource_id = ar.id
          AND  sr.processing_status = 'PROCESSED'
          AND  sr.is_deleted = FALSE;
    """))
    conn.execute(sa.text("""
        UPDATE lecturer_material lm
        SET    processing_status = 'PENDING'
        FROM   academic_resources ar
        WHERE  lm.academic_resource_id = ar.id
          AND  lm.processing_status = 'PROCESSED'
          AND  lm.is_deleted = FALSE;
    """))
