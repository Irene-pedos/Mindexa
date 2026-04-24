"""
app/dependencies/auth.py

FastAPI dependency functions for authentication and role-based access control.

DEPENDENCY CHAIN (bottom to top):
    get_token_from_header()       → extracts raw Bearer token string
        → get_current_user()      → validates token, loads user from DB
            → require_active_user() → blocks SUSPENDED / INACTIVE accounts
                → require_verified_email() → blocks unverified accounts
                    → require_student()   │
                    → require_lecturer()  │→ enforce specific role
                    → require_admin()     │
                    → require_lecturer_or_admin()

Adding require_admin to a route automatically applies ALL checks above it.
This is clean composable security — no repeated guard code in routes.

TYPE ALIASES for lean route signatures:
    CurrentUser          → Depends(get_current_user)
    ActiveUser           → Depends(require_active_user)
    VerifiedUser         → Depends(require_verified_email)
    StudentUser          → Depends(require_student)
    LecturerUser         → Depends(require_lecturer)
    AdminUser            → Depends(require_admin)
    LecturerOrAdminUser  → Depends(require_lecturer_or_admin)

USAGE IN ROUTES:
    from app.dependencies.auth import AdminUser, LecturerOrAdminUser

    @router.get("/admin/users")
    async def list_users(current_user: AdminUser) -> ...:
        ...

    @router.post("/assessments")
    async def create_assessment(current_user: LecturerOrAdminUser) -> ...:
        ...

PERFORMANCE NOTE:
    get_current_user makes ONE DB query per request (selectinload for profile).
    Role data comes from the DB — the role claim in the JWT is NEVER used for
    authorization decisions. It exists only for frontend convenience (e.g. to
    show the correct dashboard without a separate /me call after login).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from app.core.constants import TokenType, UserRole, UserStatus
from app.core.exceptions import (AuthenticationError, InvalidTokenError,
                                 PermissionDeniedError, RoleRequiredError,
                                 TokenExpiredError)
from app.core.logging import get_logger
from app.core.security import TokenPayload, decode_token
from app.db.models.auth import User
from app.db.session import get_db
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)

# HTTPBearer extracts the Authorization: Bearer <token> header.
# auto_error=False lets us control the error message ourselves.
_bearer_scheme = HTTPBearer(auto_error=False)


# ─────────────────────────────────────────────────────────────────────────────
# TOKEN EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

async def get_token_from_header(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer_scheme),
    ],
) -> str:
    """
    Extract the raw Bearer token string from the Authorization header.

    Raises AuthenticationError (401) if no token is present.
    This gives a better error message than FastAPI's default 403.
    """
    if credentials is None or not credentials.credentials:
        raise AuthenticationError(
            "Authentication credentials are required. "
            "Provide a Bearer token in the Authorization header."
        )
    return credentials.credentials


# ─────────────────────────────────────────────────────────────────────────────
# CORE USER RESOLUTION
# ─────────────────────────────────────────────────────────────────────────────

async def get_current_user(
    token: Annotated[str, Depends(get_token_from_header)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
) -> User:
    """
    Resolve the currently authenticated user from the JWT access token.

    FLOW:
        1. Decode and validate the JWT (signature, expiry, token type)
        2. Extract user_id from the `sub` claim
        3. Load the user from the database with their profile

    Does NOT enforce account status or role — those are handled by the
    guards below. This keeps the chain composable and each guard testable.

    Raises:
        AuthenticationError  → no token
        TokenExpiredError    → token past exp claim
        InvalidTokenError    → bad signature, malformed, wrong token type
        AuthenticationError  → user_id not a valid UUID
        AuthenticationError  → user not found in DB
    """
    # Decode JWT — raises TokenExpiredError or InvalidTokenError on failure
    try:
        payload: TokenPayload = decode_token(token, TokenType.ACCESS)
    except (TokenExpiredError, InvalidTokenError):
        raise
    except Exception as exc:
        raise InvalidTokenError() from exc

    # Extract and parse user ID
    try:
        user_id = uuid.UUID(payload.sub)
    except (ValueError, AttributeError):
        raise InvalidTokenError("Token contains an invalid user identifier.")

    # Load user from database — always re-reads from DB, never trusts JWT claims
    from app.services.auth_service import AuthService
    svc = AuthService(db)
    try:
        user = await svc.get_user_by_id(user_id)
    except Exception:
        raise AuthenticationError(
            "User account associated with this token was not found."
        )

    logger.debug(
        "request_authenticated",
        user_id=str(user_id),
        method=request.method,
        path=request.url.path,
    )

    return user


# ─────────────────────────────────────────────────────────────────────────────
# ACCOUNT STATUS GUARD
# ─────────────────────────────────────────────────────────────────────────────

async def require_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Enforce that the user's account is not suspended or inactive.

    PENDING_VERIFICATION users pass through here — they need to reach
    endpoints like /auth/resend-verification even when unverified.
    Use require_verified_email() for endpoints that need full verification.

    Raises:
        PermissionDeniedError → status is SUSPENDED or INACTIVE
    """
    if current_user.status == UserStatus.SUSPENDED:
        raise PermissionDeniedError(
            "Your account has been suspended. "
            "Please contact your institution administrator."
        )
    if current_user.status == UserStatus.INACTIVE:
        raise PermissionDeniedError(
            "Your account is inactive. "
            "Please contact your institution administrator."
        )
    return current_user


# ─────────────────────────────────────────────────────────────────────────────
# EMAIL VERIFICATION GUARD
# ─────────────────────────────────────────────────────────────────────────────

async def require_verified_email(
    current_user: Annotated[User, Depends(require_active_user)],
) -> User:
    """
    Enforce that the user has verified their email address.

    This is the gate between unverified (can log in, see status) and
    verified (can use the full platform).

    Endpoints that should NOT require verification:
        GET  /auth/me           → user needs to see their own status
        POST /auth/resend-verification → needs access to re-verify
        POST /auth/logout       → always allow logout
        POST /auth/logout-all   → always allow logout

    Raises:
        PermissionDeniedError → email_verified is False
    """
    if not current_user.email_verified:
        raise PermissionDeniedError(
            "Email verification is required. "
            "Please verify your email address to access this resource. "
            "Check your inbox or use /auth/resend-verification to get a new link."
        )
    return current_user


# ─────────────────────────────────────────────────────────────────────────────
# ROLE GUARDS
# ─────────────────────────────────────────────────────────────────────────────

async def require_student(
    current_user: Annotated[User, Depends(require_verified_email)],
) -> User:
    """
    Allow only users with role=STUDENT.

    Note: Lecturers and admins are deliberately excluded from student-only
    endpoints. If a lecturer needs to preview a student view, use a separate
    role-flexible endpoint with require_roles([STUDENT, LECTURER]).
    """
    if current_user.role != UserRole.STUDENT:
        raise RoleRequiredError(["student"])
    return current_user


async def require_lecturer(
    current_user: Annotated[User, Depends(require_verified_email)],
) -> User:
    """Allow only users with role=LECTURER."""
    if current_user.role != UserRole.LECTURER:
        raise RoleRequiredError(["lecturer"])
    return current_user


async def require_admin(
    current_user: Annotated[User, Depends(require_verified_email)],
) -> User:
    """Allow only users with role=ADMIN."""
    if current_user.role != UserRole.ADMIN:
        raise RoleRequiredError(["admin"])
    return current_user


async def require_lecturer_or_admin(
    current_user: Annotated[User, Depends(require_verified_email)],
) -> User:
    """Allow users with role=LECTURER or role=ADMIN."""
    if current_user.role not in (UserRole.LECTURER, UserRole.ADMIN):
        raise RoleRequiredError(["lecturer", "admin"])
    return current_user


def require_roles(allowed_roles: list[UserRole]):
    """
    Factory that creates a dynamic multi-role guard.

    Use when standard single-role guards don't fit.

    Usage:
        @router.get("/path")
        async def endpoint(
            user = Depends(require_roles([UserRole.ADMIN, UserRole.LECTURER]))
        ):
            ...
    """
    async def _guard(
        current_user: Annotated[User, Depends(require_verified_email)],
    ) -> User:
        if current_user.role not in allowed_roles:
            role_names = [r.value for r in allowed_roles]
            raise RoleRequiredError(role_names)
        return current_user

    # Give it a meaningful name for OpenAPI operation grouping
    _guard.__name__ = (
        f"require_roles_{'_or_'.join(r.value for r in allowed_roles)}"
    )
    return _guard


# ─────────────────────────────────────────────────────────────────────────────
# OPTIONAL AUTH (for public endpoints that enhance response for auth users)
# ─────────────────────────────────────────────────────────────────────────────

async def get_optional_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer_scheme),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User | None:
    """
    Optional authentication — returns the User if a valid token is provided,
    returns None if no token or an invalid token is present.

    Use for endpoints that serve both anonymous and authenticated users
    with different response shapes (e.g. public assessment listing that
    shows enrollment status for authenticated students).

    Does NOT raise on invalid/missing tokens — just returns None.
    """
    if credentials is None or not credentials.credentials:
        return None

    try:
        payload = decode_token(credentials.credentials, TokenType.ACCESS)
        user_id = uuid.UUID(payload.sub)
        from app.services.auth_service import AuthService
        svc = AuthService(db)
        return await svc.get_user_by_id(user_id)
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# TYPE ALIASES — import these in route files for clean function signatures
# ─────────────────────────────────────────────────────────────────────────────

CurrentUser         = Annotated[User, Depends(get_current_user)]
ActiveUser          = Annotated[User, Depends(require_active_user)]
VerifiedUser        = Annotated[User, Depends(require_verified_email)]
StudentUser         = Annotated[User, Depends(require_student)]
LecturerUser        = Annotated[User, Depends(require_lecturer)]
AdminUser           = Annotated[User, Depends(require_admin)]
LecturerOrAdminUser = Annotated[User, Depends(require_lecturer_or_admin)]
