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

import asyncio
import os
import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (AsyncSession, async_sessionmaker,
                                    create_async_engine)
from sqlmodel import SQLModel

# Force test environment before any app module imports
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("CELERY_TASK_ALWAYS_EAGER", "true")
# Provide a fallback SECRET_KEY so tests don't fail on missing env var
os.environ.setdefault("SECRET_KEY", "test-secret-key-minimum-32-characters-long-for-tests")
os.environ.setdefault("POSTGRES_PASSWORD", "mindexa_dev_password")

from app.core.config import settings
from app.db.session import get_db
from app.main import app

# ── Event Loop ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """Single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ── Test Database ─────────────────────────────────────────────────────────────

TEST_DATABASE_URL = settings.DATABASE_URL.replace(
    f"/{settings.POSTGRES_DB}",
    f"/{settings.POSTGRES_DB}_test",
)

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionFactory = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database():
    """Create all tables once before tests, drop all after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    """
    Per-test database session wrapped in a savepoint.
    All changes roll back after each test — no cleanup needed.
    """
    async with test_engine.connect() as connection:
        await connection.begin()
        await connection.begin_nested()

        session = AsyncSession(
            bind=connection,
            expire_on_commit=False,
            autoflush=False,
        )
        try:
            yield session
        finally:
            await session.close()
            await connection.rollback()


# ── HTTP Test Client ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP client that overrides the DB dependency with the test session.
    """
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ── Redis Mock ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_redis():
    """
    Auto-mocked Redis for all tests.
    Integration tests that need real Redis can override this fixture.
    """
    mock = AsyncMock()
    mock.ping.return_value = True
    mock.get.return_value = None
    mock.set.return_value = True
    mock.setex.return_value = True
    mock.delete.return_value = 1
    mock.exists.return_value = 0

    with patch("app.core.redis._redis_client", mock):
        yield mock


# ── Auth Header Factories ─────────────────────────────────────────────────────

@pytest.fixture
def make_auth_headers():
    """
    Factory for generating valid JWT auth headers in tests.

    Usage:
        headers = make_auth_headers(role=UserRole.LECTURER)
        response = await client.get("/api/v1/...", headers=headers)
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
    from app.core.constants import UserRole
    return make_auth_headers(role=UserRole.STUDENT)


@pytest.fixture
def lecturer_headers(make_auth_headers):
    from app.core.constants import UserRole
    return make_auth_headers(role=UserRole.LECTURER)


@pytest.fixture
def admin_headers(make_auth_headers):
    from app.core.constants import UserRole
    return make_auth_headers(role=UserRole.ADMIN)
