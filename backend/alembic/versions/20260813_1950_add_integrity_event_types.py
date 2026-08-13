"""Add missing integrity event type enum values

Revision ID: 20260813_1950_add_integrity_event_types
Revises: 20260812_1730_0a02e34b2c54_add_onboarding_tour_and_accessibility_accommodations
Create Date: 2026-08-13 19:50:00

Adds the following values to the integrityeventtype PostgreSQL enum that were
present in the Python IntegrityEventType enum but missing from the DB:
  - SCREEN_BLURRING
  - BROWSER_ZOOM
  - BROWSER_REFRESH
  - CLOSING_BROWSER
  - MULTIPLE_DEVICES
  - MULTIPLE_SESSIONS
  - UNAUTHORIZED_SHARING
  - TIME_EXPIRED
  - IDLE_LONG_PERIOD
"""

from alembic import op

# revision identifiers
revision = "add_integrity_evt_types"
down_revision = "0a02e34b2c54"
branch_labels = None
depends_on = None

NEW_ENUM_VALUES = [
    "SCREEN_BLURRING",
    "BROWSER_ZOOM",
    "BROWSER_REFRESH",
    "CLOSING_BROWSER",
    "MULTIPLE_DEVICES",
    "MULTIPLE_SESSIONS",
    "UNAUTHORIZED_SHARING",
    "TIME_EXPIRED",
    "IDLE_LONG_PERIOD",
]


def upgrade() -> None:
    # PostgreSQL requires ALTER TYPE ... ADD VALUE for enum extensions.
    # IF NOT EXISTS prevents errors on re-runs.
    for value in NEW_ENUM_VALUES:
        op.execute(
            f"ALTER TYPE integrityeventtype ADD VALUE IF NOT EXISTS '{value}'"
        )


def downgrade() -> None:
    # PostgreSQL does not support removing individual enum values without
    # recreating the type. Downgrade is intentionally a no-op — the extra
    # values are harmless if unused.
    pass
