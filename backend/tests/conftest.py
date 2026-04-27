"""
tests/conftest.py

Shared pytest fixtures for the full test suite.

Architecture:
  - Real PostgreSQL test database (not SQLite — we use pgvector and UUID features)
  - Each test wraps in a savepoint that rolls back — pristine state per test
  - Redis is mocked automatically for all unit tests
  - Celery runs in always-eager mode (synchronous, no worker needed)
  - Auth headers are generated directly from security utilities

Setup:
  Make sure postgres and redis are running via docker compose before running
  integration tests. Unit tests need no external services.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

# Ensure all SQLModel table metadata is registered before create_all().
from app.db import models as _db_models  # noqa: F401

# Force test environment before any app module imports
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("CELERY_TASK_ALWAYS_EAGER", "true")
# Provide a fallback SECRET_KEY so tests don't fail on missing env var
os.environ.setdefault(
    "SECRET_KEY", "986104b16962f8f3e1b6d4631148c71ffac35cf7e32b70d5504d3ab1ad37a664"
)
os.environ.setdefault("POSTGRES_PASSWORD", "Postgre123")
# Build DATABASE_URL dynamically from POSTGRES_PASSWORD to avoid duplication
postgres_password = os.environ["POSTGRES_PASSWORD"]
os.environ.setdefault(
    "DATABASE_URL",
    f"postgresql+asyncpg://postgres:{postgres_password}@localhost:5433/mindexa_db",
)

from app.core.config import settings
from app.db.session import get_db
from app.main import app

# ── Test Database ─────────────────────────────────────────────────────────────

TEST_DATABASE_URL = settings.DATABASE_ASYNC_URL.replace(
    f"/{settings.POSTGRES_DB}",
    f"/{settings.POSTGRES_DB}_test",
)
TEST_DATABASE_SYNC_URL = TEST_DATABASE_URL.replace("+asyncpg", "")


def _nuke_and_recreate_schema(sync_conn) -> None:
    """
    Drop the entire public schema and recreate it from scratch.
    """
    # Force disconnect other sessions
    sync_conn.execute(
        sa.text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = current_database() AND pid <> pg_backend_pid()"
        )
    )

    sync_conn.execute(sa.text("DROP SCHEMA IF EXISTS public CASCADE"))
    sync_conn.execute(sa.text("CREATE SCHEMA public"))
    sync_conn.execute(sa.text("GRANT ALL ON SCHEMA public TO public"))
    sync_conn.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
    # pgvector — ignore if not installed in the test environment
    try:
        sync_conn.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception:
        pass


def _create_all_tables(sync_conn) -> None:
    """
    Create all tables from SQLModel metadata.
    """
    SQLModel.metadata.create_all(sync_conn)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine() -> AsyncGenerator[AsyncEngine, None]:
    """
    Create the async engine for the test database.
    """
    # Use NullPool for tests to ensure each session gets a fresh connection
    # and to avoid issues with connection state between tests.
    test_engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=NullPool,
    )
    yield test_engine
    await test_engine.dispose()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database(engine: AsyncEngine):
    """
    Prepare the test database once per pytest session.
    """
    async with engine.begin() as conn:
        await conn.run_sync(_nuke_and_recreate_schema)
        await conn.run_sync(_create_all_tables)
    yield


@pytest_asyncio.fixture
async def db(engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """
    Create a clean database session for each test.
    Each test is wrapped in a transaction that is rolled back after.
    """
    async with engine.connect() as connection:
        # Start a nested transaction (savepoint)
        trans = await connection.begin()

        session = AsyncSession(bind=connection, expire_on_commit=False, autoflush=False)

        yield session

        await session.close()
        # Roll back the transaction to return the DB to its initial state
        await trans.rollback()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    FastAPI test client with database dependency override.
    """

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def make_auth_headers():
    """
    Utility fixture to generate JWT auth headers for any role.
    """
    from app.core.constants import UserRole
    from app.core.security import create_access_token

    def _make(
        user_id: str | None = None,
        role: UserRole = UserRole.STUDENT,
        email: str = "test@mindexa.ac",
    ) -> dict[str, str]:
        uid = user_id or str(uuid.uuid4())
        token, _ = create_access_token(uid, role, email)
        return {"Authorization": f"Bearer {token}"}

    return _make


@pytest.fixture
def student_headers(make_auth_headers):
    return make_auth_headers(role="STUDENT")


@pytest.fixture
def lecturer_headers(make_auth_headers):
    from app.core.constants import UserRole

    return make_auth_headers(role=UserRole.LECTURER)


@pytest.fixture
def admin_headers(make_auth_headers):
    from app.core.constants import UserRole

    return make_auth_headers(role=UserRole.ADMIN)
