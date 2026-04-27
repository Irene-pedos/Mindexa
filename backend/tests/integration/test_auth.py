"""
tests/integration/test_auth.py

Integration tests for the authentication API.
These tests use the real test database and the async test client.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from sqlmodel import SQLModel

from app.core.config import settings
from app.core.constants import UserRole
from app.core.security import create_access_token
from app.db.models import auth as _auth_models  # noqa: F401
from app.db.models.auth import User
from app.main import app


@pytest.fixture(autouse=True)
def mock_email_task():
    """Avoid Celery loop/retry side effects during auth route integration tests."""
    from unittest.mock import patch

    with patch("app.api.v1.routes.auth.send_email_notification.delay", return_value=None):
        yield


@pytest.mark.asyncio
class TestRegistration:

    async def test_register_student_success(self, client: AsyncClient):
        """Standard registration for a student."""
        payload = {
            "email": "student@mindexa.ac",
            "password": "SecurePassword123!",
            "first_name": "Test",
            "last_name": "Student",
            "role": "STUDENT"
        }
        response = await client.post("/api/v1/auth/register", json=payload)

        if response.status_code != 201:
            print(f"Registration failed: {response.json()}")
        assert response.status_code == 201

        data = response.json()
        assert data["success"] is True
        assert "account created successfully" in data["message"].lower()

    async def test_register_duplicate_email(self, client: AsyncClient):
        """Cannot register with an existing email."""
        payload = {
            "email": "duplicate@mindexa.ac",
            "password": "SecurePassword123!",
            "first_name": "First",
            "last_name": "User",
            "role": "STUDENT"
        }
        # First registration
        await client.post("/api/v1/auth/register", json=payload)
        
        # Second registration with same email
        response = await client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "already_exists"

    async def test_register_cannot_force_admin_role(self, client: AsyncClient, db: AsyncSession):
        """Self-registration as admin is downgraded to student."""
        payload = {
            "email": "sneaky_admin@mindexa.ac",
            "password": "SecurePassword123!",
            "first_name": "Sneaky",
            "last_name": "Admin",
            "role": "admin"
        }
        response = await client.post("/api/v1/auth/register", json=payload)

        if response.status_code != 201:
            print(f"Registration failed: {response.json()}")
        assert response.status_code == 201


        user = (
            await db.execute(select(User).where(User.email == "sneaky_admin@mindexa.ac"))
        ).scalar_one()
        assert user.role == "student"


@pytest.mark.asyncio
class TestLogin:

    async def test_login_success(self, client: AsyncClient):
        """Successful login returns tokens and user info."""
        # 1. Register
        reg_payload = {
            "email": "login_test@mindexa.ac",
            "password": "CorrectPassword123!",
            "first_name": "Login",
            "last_name": "Test",
        }
        await client.post("/api/v1/auth/register", json=reg_payload)
        
        # 2. Login
        login_payload = {
            "email": "login_test@mindexa.ac",
            "password": "CorrectPassword123!",
        }
        response = await client.post("/api/v1/auth/login", json=login_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "login_test@mindexa.ac"

    async def test_login_wrong_password(self, client: AsyncClient):
        """Login fails with incorrect password."""
        # 1. Register
        reg_payload = {
            "email": "wrong_pass@mindexa.ac",
            "password": "CorrectPassword123!",
            "first_name": "Wrong",
            "last_name": "Pass",
        }
        await client.post("/api/v1/auth/register", json=reg_payload)
        
        # 2. Login with wrong password
        login_payload = {
            "email": "wrong_pass@mindexa.ac",
            "password": "IncorrectPassword!",
        }
        response = await client.post("/api/v1/auth/login", json=login_payload)
        assert response.status_code == 401
        assert "invalid email or password" in response.json()["error"]["message"].lower()

    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Login fails for unregistered email."""
        login_payload = {
            "email": "nobody@mindexa.ac",
            "password": "SomePassword!",
        }
        response = await client.post("/api/v1/auth/login", json=login_payload)
        assert response.status_code == 401


@pytest.mark.asyncio
class TestMe:

    async def test_get_me_success(self, client: AsyncClient, db: AsyncSession, make_auth_headers):
        """Authenticated user can get their own profile."""
        # 1. Create a user in the database
        import uuid

        from app.db.enums import UserRole, UserStatus
        from app.db.models.auth import User, UserProfile

        user_id = uuid.uuid4()
        user = User(
            id=user_id,
            email="me@mindexa.ac",
            hashed_password="...",
            role=UserRole.STUDENT,
            status=UserStatus.ACTIVE,
            email_verified=True,
        )
        db.add(user)
        profile = UserProfile(user_id=user_id, first_name="Me", last_name="Test")
        db.add(profile)
        await db.commit()

        # 2. Generate headers for this user
        headers = make_auth_headers(user_id=str(user_id), email="me@mindexa.ac")

        # 3. Call /me
        response = await client.get("/api/v1/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "me@mindexa.ac"
        assert data["profile"]["first_name"] == "Me"

    async def test_get_me_unauthorized(self, client: AsyncClient):
        """Cannot get profile without token."""
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401
