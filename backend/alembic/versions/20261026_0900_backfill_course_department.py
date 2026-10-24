"""Backfill course.department_id from teaching assignments

Moderation, the exam office, appeals and eligibility all route by
course.department_id. Courses created without one made every paper for them
invisible to the department's moderators. Courses with no department take the
department of their earliest active teaching assignment.

Revision ID: 20261026_course_department
Revises: 20261025_advisory_events
Create Date: 2026-10-26 09:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20261026_course_department"
down_revision: Union[str, None] = "20261025_advisory_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE course
        SET department_id = (
            SELECT ta.department_id
            FROM teaching_assignment ta
            WHERE ta.course_id = course.id
              AND ta.is_active = TRUE
              AND ta.is_deleted = FALSE
              AND ta.department_id IS NOT NULL
            ORDER BY ta.created_at
            LIMIT 1
        )
        WHERE course.department_id IS NULL
          AND course.is_deleted = FALSE
        """
    )


def downgrade() -> None:
    # The backfilled values are indistinguishable from real ones; nothing to undo.
    pass
