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
    UserDutyAssignment,
    ApprovalPolicy,
    AssessmentCollaborator,
    AuthorDelegation,
    AppealPolicy,
    Appeal,
    AbsenceExcusePolicy,
    AbsenceExcuseRequest,
    AcademicCalendarEvent,
    ExportTemplate,
    ExportJob,
)

# Autogenerate target — SQLModel metadata contains all registered models
target_metadata = SQLModel.metadata


def compare_server_default(
    context,
    inspected_column,
    metadata_column,
    rendered_column_default,
    metadata_column_default,
    rendered_metadata_default,
):
    """Compare only defaults the model explicitly owns.

    Legacy migrations install database defaults for compatibility with direct
    SQL writers. A Python-side ``Field(default=...)`` does not declare that
    those database defaults should be removed, so preserve them when the model
    has no ``server_default``. Explicit model server defaults remain checked.
    """
    if metadata_column_default is None:
        return False
    return None

# ---------------------------------------------------------------------------
# Database URL — pulled from app settings (never from alembic.ini)
...
# ---------------------------------------------------------------------------

def get_url() -> str:
    import os

    url = os.environ.get("DATABASE_URL")
    if not url:
        from app.core.config import settings

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
        compare_server_default=compare_server_default,
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
        compare_server_default=compare_server_default,
        # Render column-level defaults in autogenerate
        render_as_batch=False,
        # Include schemas
        include_schemas=False,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations through a sync adapter."""
    import os

    async_url = os.environ.get("DATABASE_ASYNC_URL")
    if not async_url:
        sync_url = os.environ.get("DATABASE_URL")
        if sync_url:
            if sync_url.startswith("postgresql://"):
                async_url = sync_url.replace("postgresql://", "postgresql+asyncpg://", 1)
            elif sync_url.startswith("postgres://"):
                async_url = sync_url.replace("postgres://", "postgresql+asyncpg://", 1)
            else:
                async_url = sync_url
        else:
            from app.core.config import settings

            async_url = settings.DATABASE_ASYNC_URL

    connectable = create_async_engine(
        async_url,
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
