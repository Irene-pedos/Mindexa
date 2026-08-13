"""add_onboarding_tour_and_accessibility_accommodations

Revision ID: 0a02e34b2c54
Revises: 0a02e34b2c53
Create Date: 2026-08-12 17:30:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic
revision: str = '0a02e34b2c54'
down_revision: Union[str, None] = '0a02e34b2c53'
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


def _has_constraint(table_name: str, constraint_name: str) -> bool:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    try:
        checks = [ck["name"] for ck in inspector.get_check_constraints(table_name)]
    except Exception:
        return False
    return constraint_name in checks


def upgrade() -> None:
    # ── User table additions ──────────────────────────────────────────────────
    if not _has_column('user', 'onboarding_tour_completed'):
        op.add_column('user', sa.Column('onboarding_tour_completed', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    if not _has_column('user', 'onboarding_tour_step'):
        op.add_column('user', sa.Column('onboarding_tour_step', sa.Integer(), nullable=False, server_default=sa.text('0')))
    if not _has_column('user', 'onboarding_tour_variant'):
        op.add_column('user', sa.Column('onboarding_tour_variant', sa.String(length=50), nullable=True))

    # ── UserProfile table additions ───────────────────────────────────────────
    if not _has_column('user_profile', 'simple_mode_enabled'):
        op.add_column('user_profile', sa.Column('simple_mode_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    if not _has_column('user_profile', 'extra_time_percent'):
        op.add_column('user_profile', sa.Column('extra_time_percent', sa.Integer(), nullable=False, server_default=sa.text('0')))
    if not _has_column('user_profile', 'requires_screen_reader_mode'):
        op.add_column('user_profile', sa.Column('requires_screen_reader_mode', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    if not _has_column('user_profile', 'large_text_default'):
        op.add_column('user_profile', sa.Column('large_text_default', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    if not _has_column('user_profile', 'reduced_motion_default'):
        op.add_column('user_profile', sa.Column('reduced_motion_default', sa.Boolean(), nullable=False, server_default=sa.text('false')))

    # ── UserProfile check constraints ─────────────────────────────────────────
    if not _has_constraint('user_profile', 'ck_user_profile_extra_time_percent'):
        op.create_check_constraint(
            'ck_user_profile_extra_time_percent',
            'user_profile',
            'extra_time_percent >= 0 AND extra_time_percent <= 300',
        )


def downgrade() -> None:
    if _has_constraint('user_profile', 'ck_user_profile_extra_time_percent'):
        op.drop_constraint('ck_user_profile_extra_time_percent', 'user_profile', type_='check')

    if _has_column('user_profile', 'reduced_motion_default'):
        op.drop_column('user_profile', 'reduced_motion_default')
    if _has_column('user_profile', 'large_text_default'):
        op.drop_column('user_profile', 'large_text_default')
    if _has_column('user_profile', 'requires_screen_reader_mode'):
        op.drop_column('user_profile', 'requires_screen_reader_mode')
    if _has_column('user_profile', 'extra_time_percent'):
        op.drop_column('user_profile', 'extra_time_percent')
    if _has_column('user_profile', 'simple_mode_enabled'):
        op.drop_column('user_profile', 'simple_mode_enabled')

    if _has_column('user', 'onboarding_tour_variant'):
        op.drop_column('user', 'onboarding_tour_variant')
    if _has_column('user', 'onboarding_tour_step'):
        op.drop_column('user', 'onboarding_tour_step')
    if _has_column('user', 'onboarding_tour_completed'):
        op.drop_column('user', 'onboarding_tour_completed')
