"""
alembic/env.py

Alembic migration environment — Mindexa Platform.
Updated for PostgreSQL 16 (Port 5433) stability.
"""

from __future__ import annotations

from logging.config import fileConfig
from typing import Any

from alembic import context
from app.core.config import settings
from app.db.models import (AcademicPeriod, AIActionLog,  # noqa: F401
                           AIGradeReview, AIQuestionGenerationBatch,
                           AIQuestionReview, Assessment, AssessmentAttempt,
                           AssessmentAutosave, AssessmentBlueprintRule,
                           AssessmentDraftProgress,
                           AssessmentPublishValidation, AssessmentQuestion,
                           AssessmentSection, AssessmentSupervisor,
                           AssessmentTargetSection, AuditLog, ClassSection,
                           Course, CourseSubject, Department, Institution,
                           IntegrityEvent, IntegrityFlag, IntegrityWarning,
                           LecturerCourseAssignment, LecturerMaterial,
                           Notification, PasswordResetToken, Question,
                           QuestionBankEntry, QuestionBlank, QuestionOption,
                           RefreshToken, Reminder, ResourceChunk, ResultAppeal,
                           Rubric, RubricCriterion, RubricCriterionLevel,
                           RubricGrade, ScheduledEvent, SecurityEvent,
                           StudentEnrollment, StudentGroup, StudentGroupMember,
                           StudentResource, StudentResponse, Subject,
                           SubmissionGrade, SupervisionSession, User,
                           UserProfile)
from sqlalchemy import engine_from_config, pool, text
from sqlalchemy.engine import Connection
from sqlmodel import SQLModel

# ─────────────────────────────────────────────────────────────────────────────
# Alembic config
# ─────────────────────────────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

naming_convention: dict[str, str] = {
    "ix":  "ix_%(table_name)s_%(column_0_N_name)s",
    "uq":  "uq_%(table_name)s_%(column_0_N_name)s",
    "ck":  "ck_%(table_name)s_%(constraint_name)s",
    "fk":  "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk":  "pk_%(table_name)s",
}

SQLModel.metadata.naming_convention = naming_convention  # type: ignore[assignment]
target_metadata = SQLModel.metadata

# ─────────────────────────────────────────────────────────────────────────────
# DB URL Override
# ─────────────────────────────────────────────────────────────────────────────
# We keep the %% escape to ensure any future special characters in passwords
# don't break the Alembic ConfigParser.
url = settings.DATABASE_URL_SYNC.replace("%", "%%")
config.set_main_option("sqlalchemy.url", url)

_EXCLUDE_TABLES: frozenset[str] = frozenset({})

def include_object(
    obj: Any,
    name: str | None,
    type_: str,
    reflected: bool,
    compare_to: Any,
) -> bool:
    if type_ == "table" and name in _EXCLUDE_TABLES:
        return False
    return True

# ─────────────────────────────────────────────────────────────────────────────
# OFFLINE MODE
# ─────────────────────────────────────────────────────────────────────────────
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()

# ─────────────────────────────────────────────────────────────────────────────
# ONLINE MODE
# ─────────────────────────────────────────────────────────────────────────────
def _do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        compare_type=True,
        compare_server_default=True,
        transaction_per_migration=True,
        include_schemas=False,
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    # Build the engine using the configuration with the updated 5433 port
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # CRITICAL: Set search path and explicitly commit before migrations
        # This solves the "tables not found in public" issue on some Postgres installs
        connection.execute(text("SET search_path TO public"))
        connection.execute(text("COMMIT"))

        connection.dialect.default_schema_name = "public"  # type: ignore[attr-defined]
        _do_run_migrations(connection)

    connectable.dispose()

# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
