"""Add question_table_context, requires_table_answer, answer_table_template to question table

Revision ID: 20260814_2145_add_table_fields
Revises: 20260814_2120_add_language
Create Date: 2026-08-14 21:45:00

Adds:
  - question.question_table_context (JSONB, nullable)
  - question.requires_table_answer (BOOLEAN, default False, not null)
  - question.answer_table_template (JSONB, nullable)
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "20260814_2145_add_table_fields"
down_revision = "20260814_2120_add_language"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "question",
        sa.Column("question_table_context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "question",
        sa.Column("requires_table_answer", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "question",
        sa.Column("answer_table_template", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("question", "answer_table_template")
    op.drop_column("question", "requires_table_answer")
    op.drop_column("question", "question_table_context")
