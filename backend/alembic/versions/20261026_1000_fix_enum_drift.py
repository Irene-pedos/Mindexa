"""Add notification / AI action enum values that the code uses but the database lacked

The Phase 3-6 features added NotificationType members (moderation, sealing, print
jobs, retakes, appeals, excuses, schedule alerts) without a migration for the
PostgreSQL enum. Any notification of those types failed with "invalid input value
for enum", which rolled back the surrounding action - for example a moderator's
"request changes" decision, an approval, or a seal. Tests did not notice because
they build the schema from the Python enums instead of from migrations.

Revision ID: 20261026_enum_drift_fix
Revises: 20261026_course_department
Create Date: 2026-10-26 10:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20261026_enum_drift_fix"
down_revision: Union[str, None] = "20261026_course_department"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'APPEAL_DECIDED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'APPEAL_PAYMENT_CONFIRMED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'APPEAL_REVIEWER_ASSIGNED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ASSESSMENT_SEALED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'CAT_BLOCKED_REASSESSMENT'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'EXCUSE_DECIDED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'EXCUSE_SUBMITTED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'MARKS_DEADLINE_REMINDER'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'MARKS_OVERDUE'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'MODERATION_APPROVED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'MODERATION_CHANGES_REQUESTED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'MODERATION_STARTED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'MODERATION_SUBMITTED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'PRINT_JOB_UPDATED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'REASSESSMENT_ASSIGNED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'REASSESSMENT_REQUIRED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'RETAKE_ENROLLED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'RETAKE_FLAGGED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'RETAKE_PAYMENT_CONFIRMED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'SCHEDULE_AT_RISK'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'SCHEDULE_SHIFT_REQUIRED'")
    op.execute("ALTER TYPE aiactiontype ADD VALUE IF NOT EXISTS 'REVIEW_ASSESSMENT_WORDING'")


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value without rebuilding the type;
    # the extra values are harmless when unused.
    pass
