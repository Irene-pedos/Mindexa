"""
app/db/session.py

Async SQLAlchemy engine, session factory, and FastAPI dependency.
"""

from __future__ import annotations

import json
import os
import uuid
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import AsyncAdaptedQueuePool, NullPool

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _custom_json_serializer(obj):
    """Handle non-standard types for JSONB columns."""
    if isinstance(obj, uuid.UUID):
        return str(obj)
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def _json_dumps(obj):
    return json.dumps(obj, default=_custom_json_serializer)


def _build_engine() -> AsyncEngine:
    # Check if we are running inside a Celery worker.
    # If so, we MUST use NullPool. Celery spins up and tears down asyncio event loops
    # for each task. Connection pools (like QueuePool) are bound to the loop that created them.
    # If a pooled connection is used across loops, or if the pool tries to close a connection
    # after the task's loop has died, it results in "Event loop is closed" errors.
    is_celery = (
        os.environ.get("MINDEXA_RUNTIME") == "celery"
        or any("celery" in arg.lower() for arg in sys.argv)
        or ("celery" in sys.modules and any("worker" in arg.lower() or "beat" in arg.lower() for arg in sys.argv))
    )
    is_pytest = "pytest" in sys.modules or any("pytest" in arg.lower() for arg in sys.argv)

    if is_celery or is_pytest:
        logger.info("Initializing AsyncEngine with NullPool for Celery worker or test runner")
        return create_async_engine(
            settings.DATABASE_ASYNC_URL,
            echo=getattr(settings, "SQLALCHEMY_ECHO", False),
            future=True,
            poolclass=NullPool,
            json_serializer=_json_dumps,
            connect_args={
                "server_settings": {
                    "application_name": f"{settings.APP_NAME}_celery" if is_celery else f"{settings.APP_NAME}_pytest",
                    "jit": "off",
                },
                "command_timeout": 60,
            },
        )
    else:
        logger.info("Initializing AsyncEngine with AsyncAdaptedQueuePool for API server")
        return create_async_engine(
            settings.DATABASE_ASYNC_URL,
            echo=getattr(settings, "SQLALCHEMY_ECHO", False),
            future=True,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            pool_timeout=30,
            pool_recycle=1800,
            poolclass=AsyncAdaptedQueuePool,
            json_serializer=_json_dumps,
            connect_args={
                "server_settings": {
                    "application_name": settings.APP_NAME,
                    "jit": "off",
                },
                "command_timeout": 60,
            },
        )


engine: AsyncEngine = _build_engine()
async_engine = engine  # Alias for compatibility

AsyncSessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)
AsyncSessionLocal = AsyncSessionFactory  # Alias for compatibility


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency. Commits on success, rolls back on exception.

    Usage:
        @router.get("/")
        async def route(db: AsyncSession = Depends(get_db)):
    """
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for Celery tasks and AI agents (outside request context)."""
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            logger.error("db_context_rollback", exc_info=True)
            raise
        finally:
            await session.close()


async def check_db_health() -> bool:
    from sqlalchemy import text
    try:
        async with AsyncSessionFactory() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.error("db_health_check_failed", error=str(exc))
        return False


async def dispose_engine() -> None:
    await engine.dispose()
    logger.info("database_engine_disposed")


async def close_db_engine() -> None:
    await dispose_engine()
