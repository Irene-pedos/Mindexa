"""
alembic/env.py

Alembic migration environment.
Uses the SYNC psycopg2 URL — Alembic does not support async natively.
As models are added in Phases 2-5, import them in the marked section below.
"""

from __future__ import annotations

import sys
# (add further model modules as they are created)
from logging.config import fileConfig
from pathlib import Path

import app.db.models.academic  # noqa: F401
import app.db.models.ai  # noqa: F401
import app.db.models.assessment  # noqa: F401
import app.db.models.attempt  # noqa: F401
import app.db.models.audit  # noqa: F401
import app.db.models.auth  # noqa: F401
import app.db.models.integrity  # noqa: F401
import app.db.models.notification  # noqa: F401
import app.db.models.question  # noqa: F401
import app.db.models.resource  # noqa: F401
from alembic import context
from sqlalchemy import create_engine, pool

# Must appear before target_metadata assignment



# Add project root to sys.path so app.* imports resolve correctly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
# ── Import all models here so Alembic autogenerate detects them ──────────────
from app.db.base import BaseModel  # noqa: F401
from sqlmodel import SQLModel

# Phase 2 — uncomment as you add models:
# from app.db.models.user import User                      # noqa: F401
# from app.db.models.token import RefreshToken             # noqa: F401

# Phase 3:
# from app.db.models.institution import Institution        # noqa: F401
# from app.db.models.course import Course                  # noqa: F401
# from app.db.models.enrollment import StudentEnrollment   # noqa: F401

# Phase 4:
# from app.db.models.assessment import Assessment          # noqa: F401
# from app.db.models.question import Question              # noqa: F401
# from app.db.models.attempt import AssessmentAttempt      # noqa: F401

# Phase 5:
# from app.db.models.integrity import IntegrityEvent       # noqa: F401


alembic_config = context.config
if alembic_config.config_file_name is not None:
    fileConfig(alembic_config.config_file_name)

alembic_config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)

target_metadata = SQLModel.metadata


def include_object(object, name, type_, reflected, compare_to):  # type: ignore[no-untyped-def]
    if type_ == "table" and name == "alembic_version":
        return False
    return True


def run_migrations_offline() -> None:
    url = alembic_config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(
        settings.DATABASE_URL_SYNC,
        poolclass=pool.NullPool,
        connect_args={"connect_timeout": 10},
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
