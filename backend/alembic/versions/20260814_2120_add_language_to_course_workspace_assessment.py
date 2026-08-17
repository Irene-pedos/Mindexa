"""Add language enum and column to course, teaching_workspace, and assessment

Revision ID: 20260814_2120_add_language
Revises: add_integrity_evt_types
Create Date: 2026-08-14 21:20:00

Adds LanguageEnum and language column (default EN) to:
  - course
  - teaching_workspace
  - assessment
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "20260814_2120_add_language"
down_revision = "add_integrity_evt_types"
branch_labels = None
depends_on = None

LANGUAGE_ENUM = postgresql.ENUM("EN", "RW", "FR", "SW", name="languageenum", create_type=False)


def upgrade() -> None:
    # 1. Create enum type safely in postgres
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'languageenum') THEN
                CREATE TYPE languageenum AS ENUM ('EN', 'RW', 'FR', 'SW');
            END IF;
        END$$;
        """
    )

    # 2. Add language to course
    op.add_column(
        "course",
        sa.Column("language", LANGUAGE_ENUM, nullable=False, server_default="EN"),
    )
    op.create_index("ix_course_language", "course", ["language"])

    # 3. Add language to teaching_workspace
    op.add_column(
        "teaching_workspace",
        sa.Column("language", LANGUAGE_ENUM, nullable=False, server_default="EN"),
    )
    op.create_index("ix_teaching_workspace_language", "teaching_workspace", ["language"])

    # 4. Add language to assessment
    op.add_column(
        "assessment",
        sa.Column("language", LANGUAGE_ENUM, nullable=False, server_default="EN"),
    )
    op.create_index("ix_assessment_language", "assessment", ["language"])


def downgrade() -> None:
    op.drop_index("ix_assessment_language", table_name="assessment")
    op.drop_column("assessment", "language")

    op.drop_index("ix_teaching_workspace_language", table_name="teaching_workspace")
    op.drop_column("teaching_workspace", "language")

    op.drop_index("ix_course_language", table_name="course")
    op.drop_column("course", "language")

    op.execute("DROP TYPE IF EXISTS languageenum;")
