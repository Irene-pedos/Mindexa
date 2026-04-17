"""
alembic/env.py

Alembic migration environment — async-compatible.

Reads the database URL from app.core.config.settings so that
alembic.ini never contains credentials.

USAGE:
    alembic upgrade head
    alembic downgrade -1
    alembic revision --autogenerate -m "description"
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig
from typing import Any

from alembic import context
# Import Base FIRST (SQLAlchemy declarative base)
from app.db.base import Base  # noqa: F401
# Phase 4 — Assessment + Questions
from app.db.models.assessment import Assessment  # noqa: F401
from app.db.models.assessment import (AssessmentAutosave,
                                      AssessmentBlueprintRule,
                                      AssessmentDraftProgress,
                                      AssessmentPublishValidation,
                                      AssessmentSection, AssessmentSupervisor,
                                      AssessmentTargetSection)
# Phase 5 — Attempts, Submissions, Grading, Results, Integrity
from app.db.models.attempt import AssessmentAttempt  # noqa: F401
from app.db.models.attempt import GradingQueueItem  # noqa: F401
from app.db.models.attempt import (StudentResponse, StudentResponseLog,
                                   SubmissionGrade)
# Phase 3 — Auth models
from app.db.models.auth import (PasswordResetToken, RefreshToken,  # noqa: F401
                                SecurityEvent, User, UserProfile)
from app.db.models.integrity import IntegrityEvent  # noqa: F401
from app.db.models.integrity import (IntegrityFlag, IntegrityWarning,
                                     SupervisionSession)
from app.db.models.question import (AssessmentQuestion, Question,  # noqa: F401
                                    QuestionBankEntry, QuestionBlank,
                                    QuestionOption)
from app.db.models.result import AssessmentResult  # noqa: F401
from app.db.models.result import ResultBreakdown
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

# ---------------------------------------------------------------------------
# Import ALL models so Alembic can detect schema changes via autogenerate.
# Every model module must be imported here.
# ---------------------------------------------------------------------------





# ---------------------------------------------------------------------------
# Alembic Config
# ---------------------------------------------------------------------------

config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate target — all SQLModel/SQLAlchemy metadata
target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Database URL — pulled from app settings (never from alembic.ini)
# ---------------------------------------------------------------------------

def get_url() -> str:
    from app.core.config import settings

    # Use the sync URL for Alembic (asyncpg not supported by Alembic directly)
    url = settings.DATABASE_URL
    # Normalize postgres:// → postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


# ---------------------------------------------------------------------------
# Offline migrations (no live DB connection needed)
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """
    Run migrations without a live DB connection.
    Used for generating SQL scripts (e.g., for DBA review).
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online migrations (live DB connection via asyncpg)
# ---------------------------------------------------------------------------

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        # Render column-level defaults in autogenerate
        render_as_batch=False,
        # Include schemas
        include_schemas=False,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations through a sync adapter."""
    from app.core.config import settings

    # Use async URL for the engine
    connectable = create_async_engine(
        settings.DATABASE_ASYNC_URL,
        poolclass=pool.NullPool,
        echo=False,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online migrations."""
    asyncio.run(run_async_migrations())


# ---------------------------------------------------------------------------
# Entry point selection
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
