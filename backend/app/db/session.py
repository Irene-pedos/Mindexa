"""
app/db/session.py

Async SQLAlchemy engine, session factory, and FastAPI dependency.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from sqlalchemy.ext.asyncio import (AsyncEngine, AsyncSession,
                                    async_sessionmaker, create_async_engine)
from sqlalchemy.pool import AsyncAdaptedQueuePool

logger = get_logger(__name__)


def _build_engine() -> AsyncEngine:
    return create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG and settings.is_development,
        future=True,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_timeout=30,
        pool_recycle=1800,
        poolclass=AsyncAdaptedQueuePool,
        connect_args={
            "server_settings": {
                "application_name": settings.APP_NAME,
                "jit": "off",
            },
            "command_timeout": 60,
        },
    )


engine: AsyncEngine = _build_engine()

AsyncSessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


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
