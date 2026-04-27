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

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel

from alembic import context

# Import all models in the correct dependency order
# This ensures SQLModel.metadata is fully populated before Alembic inspects it
from app.db.models import (  # noqa: F401
    AcademicPeriod,
    AIActionLog,
    AIGeneratedQuestion,
    AIGenerationBatch,
    AIGradeReview,
    AIQuestionReview,
    Assessment,
    AssessmentAttempt,
    AssessmentAutosave,
    AssessmentBlueprintRule,
    AssessmentDraftProgress,
    AssessmentPublishValidation,
    AssessmentQuestion,
    AssessmentResult,
    AssessmentSection,
    AssessmentSupervisor,
    AssessmentTargetSection,
    AuditLog,
    ClassSection,
    Course,
    CourseSubject,
    Department,
    Institution,
    IntegrityEvent,
    IntegrityFlag,
    IntegrityWarning,
    LecturerCourseAssignment,
    LecturerMaterial,
    Notification,
    PasswordResetToken,
    Question,
    QuestionBankEntry,
    QuestionBlank,
    QuestionOption,
    RefreshToken,
    Reminder,
    ResourceChunk,
    ResultAppeal,
    ResultBreakdown,
    Rubric,
    RubricCriterion,
    RubricCriterionLevel,
    RubricGrade,
    ScheduledEvent,
    SecurityEvent,
    StudentEnrollment,
    StudentGroup,
    StudentGroupMember,
    StudentResource,
    StudentResponse,
    Subject,
    SubmissionGrade,
    SupervisionSession,
    User,
    UserProfile,
)

# Autogenerate target — SQLModel metadata contains all registered models
target_metadata = SQLModel.metadata

# ---------------------------------------------------------------------------
# Database URL — pulled from app settings (never from alembic.ini)
...
# ---------------------------------------------------------------------------

def get_url() -> str:
    from app.core.config import settings

    # Use the sync URL for Alembic (asyncpg not supported by Alembic directly)
    url = settings.DATABASE_URL
    print(f"[alembic] Using URL: {url}")
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
