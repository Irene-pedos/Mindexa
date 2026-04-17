"""
app/api/v1/routes/auth.py

Authentication API route handlers for Mindexa Platform.

ENDPOINTS:
    POST /auth/register              → Register a new account
    POST /auth/login                 → Authenticate, receive access + refresh tokens
    POST /auth/refresh               → Rotate tokens using a valid refresh token
    POST /auth/logout                → Revoke the current session
    POST /auth/logout-all            → Revoke all sessions (all devices)
    POST /auth/forgot-password       → Request a password reset email
    POST /auth/reset-password        → Complete a password reset with token
    GET  /auth/verify-email          → Verify email address from link in email
    POST /auth/resend-verification   → Request a new verification email
    GET  /auth/me                    → Get current authenticated user
    PATCH /auth/me                   → Update current user's profile
    POST /auth/me/change-password    → Change password (authenticated)

DESIGN RULES:
    1. Routes are THIN — all business logic lives in AuthService
    2. Each route reads the request body, calls a service method, returns a response
    3. No database access in routes — dependency injection provides the session
    4. IP address is extracted from request and passed to service for audit logging
    5. Security-sensitive endpoints always return the same response shape
       regardless of whether the underlying operation succeeded or found nothing
       (prevents enumeration attacks)

IP ADDRESS EXTRACTION:
    We read from X-Forwarded-For (when behind a reverse proxy) with fallback
    to request.client.host. In production, configure your reverse proxy
    (nginx / Caddy) to set X-Real-IP or X-Forwarded-For correctly.

    WARNING: Do NOT trust X-Forwarded-For in environments where the reverse
    proxy is not under your control. Configure TRUSTED_HOSTS accordingly.

EMAIL SENDING:
    This module does NOT send emails directly. It calls AuthService methods
    that return raw tokens. The route then calls the email task (placeholder
    in Phase 3 — full implementation in the email/notification phase).
    This keeps auth logic decoupled from email delivery infrastructure.

RESPONSE PATTERNS:
    - 200 OK: successful operations with data
    - 201 Created: successful registration
    - 204 No Content: logout (no body)
    - 400 Bad Request: validation errors caught at service layer
    - 401 Unauthorized: bad credentials or token
    - 403 Forbidden: account suspended / inactive / wrong role
    - 422 Unprocessable Entity: Pydantic schema validation failure
"""

from __future__ import annotations

from typing import Optional

import structlog
from app.core.config import settings
from app.core.exceptions import AuthenticationError, InvalidTokenError
from app.db.schemas.auth import (AuthMessageResponse, ChangePasswordRequest,
                                 ForgotPasswordRequest, LoginResponse,
                                 LogoutRequest, RefreshRequest,
                                 ResendVerificationRequest,
                                 ResetPasswordRequest, TokenResponse,
                                 UserLoginRequest, UserProfileResponse,
                                 UserProfileUpdate, UserRegisterRequest,
                                 UserResponse)
from app.db.schemas.base import MessageResponse
from app.db.session import get_db
from app.dependencies.auth import (ActiveUser, CurrentUser, VerifiedUser,
                                   require_active_user, require_verified_email)
from app.services.auth_service import AuthService
from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = structlog.get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _get_client_ip(request: Request) -> str | None:
    """
    Extract the client's real IP address from the request.

    Checks X-Forwarded-For first (set by reverse proxies like nginx, Caddy).
    Falls back to the direct connection IP from request.client.

    NOTE: X-Forwarded-For can be spoofed if you're not behind a trusted proxy.
    In production, configure your ingress to set this header reliably and
    strip any user-supplied values.
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For can be a comma-separated list: "client, proxy1, proxy2"
        # The leftmost IP is the original client
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _build_user_response(user) -> UserResponse:
    """
    Build a UserResponse from a User ORM object with its loaded profile.
    Handles the case where profile may not be loaded (returns None profile).
    """
    profile_response = None
    if hasattr(user, "profile") and user.profile is not None:
        profile_response = UserProfileResponse(
            user_id=user.id,
            first_name=user.profile.first_name,
            last_name=user.profile.last_name,
            display_name=getattr(user.profile, "display_name", None),
            bio=getattr(user.profile, "bio", None),
            phone_number=getattr(user.profile, "phone_number", None),
            profile_picture_url=getattr(user.profile, "profile_picture_url", None),
            student_id=getattr(user.profile, "student_id", None),
            staff_id=getattr(user.profile, "staff_id", None),
        )

    return UserResponse(
        id=user.id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        email=user.email,
        role=user.role,
        status=user.status,
        email_verified=user.email_verified,
        email_verified_at=getattr(user, "email_verified_at", None),
        last_login_at=getattr(user, "last_login_at", None),
        profile=profile_response,
    )


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """
    Set the refresh token as an HttpOnly cookie on the response.

    SECURITY:
        HttpOnly    → JavaScript cannot read this cookie (XSS protection)
        SameSite    → Lax prevents CSRF on cross-site requests
        Secure      → Only sent over HTTPS (enforce in production)
        Max-Age     → Matches the refresh token DB lifetime
    """
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=settings.ACCESS_TOKEN_COOKIE_SECURE,
        max_age=settings.refresh_token_expire_seconds,
        path="/auth",  # Only sent to /auth/* endpoints — minimal cookie exposure
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Clear the refresh token cookie (used on logout)."""
    response.delete_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        path="/auth",
    )


def _get_refresh_token_from_request(
    body_token: str | None,
    cookie_token: str | None,
) -> str:
    """
    Resolve the refresh token from either the request body or the cookie.

    Priority: body > cookie.
    Raises AuthenticationError if neither source provides a token.
    """
    token = body_token or cookie_token
    if not token:
        raise AuthenticationError(
            detail="Refresh token is required. Provide it in the request body "
                   "or as the HttpOnly cookie."
        )
    return token


# ─────────────────────────────────────────────────────────────────────────────
# REGISTRATION
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=AuthMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
    description=(
        "Create a new student account. After registration, an email verification "
        "link is sent to the provided address. The account must be verified before "
        "accessing most platform features."
    ),
)
async def register(
    body: UserRegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthMessageResponse:
    """
    Register a new user account.

    PUBLIC ENDPOINT — no authentication required.

    After registration:
        - User is created with status=PENDING_VERIFICATION
        - A verification token is generated and emailed
        - The user can log in immediately but some features are gated
          behind email verification

    ENUMERATION PROTECTION:
        If the email is already registered, EmailAlreadyRegisteredError is raised
        (HTTP 409). This reveals that the email exists — this is acceptable for
        registration UX but NOT for login (where we must not reveal existence).
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    user, raw_verification_token = await service.register(
        email=str(body.email),
        password=body.password,
        first_name=body.first_name,
        last_name=body.last_name,
        role=body.role,
        ip_address=ip,
    )

    # ── EMAIL SENDING HOOK ────────────────────────────────────────────────────
    # TODO (Email Phase): Send verification email here.
    # The raw_verification_token should be included as a URL query parameter:
    #   https://app.mindexa.ac/verify-email?token={raw_verification_token}
    #
    # Example Celery task call (when email tasks are implemented):
    #   from app.workers.tasks.email import send_verification_email
    #   send_verification_email.delay(
    #       recipient_email=user.email,
    #       token=raw_verification_token,
    #       user_name=body.first_name,
    #   )
    #
    # For now, log the token in development so you can test manually:
    if settings.is_development:
        logger.debug(
            "dev_verification_token",
            user_id=str(user.id),
            token=raw_verification_token,
        )
    # ── END EMAIL HOOK ────────────────────────────────────────────────────────

    await db.commit()

    return AuthMessageResponse(
        message=(
            "Account created successfully. "
            "Please check your email and verify your address to activate your account."
        ),
        success=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate and receive tokens",
    description=(
        "Authenticate with email and password. Returns an access token and a "
        "refresh token. The refresh token is also set as an HttpOnly cookie "
        "for frontend security. Use the access token as a Bearer token in the "
        "Authorization header for all protected endpoints."
    ),
)
async def login(
    body: UserLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Login with email + password.

    PUBLIC ENDPOINT — no authentication required.

    On success:
        - Returns access token (short-lived, use in Authorization header)
        - Returns refresh token (long-lived, use to get new access tokens)
        - Sets refresh token as HttpOnly cookie (security best practice)
        - Updates last_login_at and resets failed_login_attempts

    On failure:
        - Returns 401 with a vague error (does NOT reveal if email exists)
        - Increments failed_login_attempts
        - Locks account temporarily after threshold is hit
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    result = await service.login(
        email=str(body.email),
        password=body.password,
        ip_address=ip,
        device_hint=request.headers.get("User-Agent"),
    )

    # Load the full user for the response (login service returns tokens + basic info)
    user = await service.get_user_by_id(result["user_id"])
    user_response = _build_user_response(user)

    # Set refresh token as HttpOnly cookie
    _set_refresh_cookie(response, result["refresh_token"])

    await db.commit()

    return LoginResponse(
        access_token=result["access_token"],
        token_type="bearer",
        expires_in=result["expires_in"],
        refresh_token=result["refresh_token"],
        user=user_response,
    )


# ─────────────────────────────────────────────────────────────────────────────
# TOKEN REFRESH
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate tokens using a refresh token",
    description=(
        "Exchange a valid refresh token for a new access token + refresh token pair. "
        "The old refresh token is immediately invalidated (rotation). "
        "Provide the refresh token in the request body OR via the HttpOnly cookie."
    ),
)
async def refresh_tokens(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    body: RefreshRequest | None = None,
    # Also accept from HttpOnly cookie (cookie name matches settings)
    refresh_cookie: Optional[str] = Cookie(
        default=None,
        alias=settings.REFRESH_TOKEN_COOKIE_NAME,
    ),
) -> TokenResponse:
    """
    Rotate the token pair.

    ACCEPTS REFRESH TOKEN FROM:
        1. Request body: {"refresh_token": "..."}
        2. HttpOnly cookie: mindexa_refresh=...

    Body takes priority over cookie if both are provided.

    ROTATION BEHAVIOUR:
        The old refresh token is revoked atomically before the new one is issued.
        If someone presents an already-revoked token (replay attack or stolen token),
        ALL sessions for that user are revoked as a security measure.
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    body_token = body.refresh_token if body else None
    token = _get_refresh_token_from_request(body_token, refresh_cookie)

    result = await service.refresh_tokens(
        refresh_token_str=token,
        ip_address=ip,
    )

    # Update the cookie with the new refresh token
    _set_refresh_cookie(response, result["refresh_token"])

    await db.commit()

    return TokenResponse(
        access_token=result["access_token"],
        token_type="bearer",
        expires_in=result["expires_in"],
        refresh_token=result["refresh_token"],
    )


# ─────────────────────────────────────────────────────────────────────────────
# LOGOUT
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the current session",
    description=(
        "Invalidate the current refresh token, ending this session. "
        "The access token remains valid until it expires naturally — "
        "clients should discard it immediately on logout."
    ),
)
async def logout(
    request: Request,
    response: Response,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
    body: LogoutRequest | None = None,
    refresh_cookie: Optional[str] = Cookie(
        default=None,
        alias=settings.REFRESH_TOKEN_COOKIE_NAME,
    ),
) -> Response:
    """
    Logout the current session.

    AUTHENTICATED — requires a valid access token (even for logout).
    This ensures only the authenticated user can revoke their own session.

    The refresh token is read from body or cookie. If neither is present,
    the logout still succeeds silently (idempotent).

    Returns 204 No Content on success.
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    body_token = body.refresh_token if body else None
    token = body_token or refresh_cookie

    if token:
        await service.logout(
            refresh_token_str=token,
            user_id=current_user.id,
            ip_address=ip,
        )

    # Clear the refresh token cookie
    _clear_refresh_cookie(response)

    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/logout-all",
    response_model=AuthMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Revoke all sessions",
    description=(
        "Revoke all active refresh tokens for this account, logging out from all "
        "devices simultaneously. Use this if you suspect account compromise."
    ),
)
async def logout_all_sessions(
    request: Request,
    response: Response,
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> AuthMessageResponse:
    """
    Logout from all devices.

    AUTHENTICATED — requires a valid access token.
    Revokes all refresh tokens for the user. Each device will need to
    re-authenticate on next access token expiry.
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    count = await service.logout_all_sessions(
        user_id=current_user.id,
        ip_address=ip,
    )

    # Clear cookie on this device
    _clear_refresh_cookie(response)

    await db.commit()

    return AuthMessageResponse(
        message=f"Successfully logged out from {count} active session(s).",
        success=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# EMAIL VERIFICATION
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/verify-email",
    response_model=AuthMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify email address",
    description=(
        "Verify a user's email address using the token from the verification email. "
        "The token is passed as a query parameter. "
        "On success, the account is activated and the user can access all features."
    ),
)
async def verify_email(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthMessageResponse:
    """
    Verify email from verification link.

    PUBLIC ENDPOINT — accessible without authentication.

    The verification link sent in the email looks like:
        https://app.mindexa.ac/verify-email?token=<raw_token>

    The frontend calls this endpoint with the token from the URL.

    Returns success even if the token is invalid — prevents confirming
    whether an email address is registered.

    ACTUALLY: we do raise errors for invalid tokens since:
        1. The token is high-entropy (not guessable)
        2. Users need clear feedback to know if the link expired
        3. The email address isn't revealed by the error
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    await service.verify_email(raw_token=token, ip_address=ip)

    await db.commit()

    return AuthMessageResponse(
        message=(
            "Email address verified successfully. "
            "Your account is now fully active."
        ),
        success=True,
    )


@router.post(
    "/resend-verification",
    response_model=AuthMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Resend email verification",
    description=(
        "Request a new email verification link. "
        "Rate limited — apply frontend throttling. "
        "Returns the same response whether or not the email is registered "
        "to prevent enumeration."
    ),
)
async def resend_verification(
    body: ResendVerificationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthMessageResponse:
    """
    Resend verification email.

    PUBLIC ENDPOINT — no authentication required.

    Always returns the same success message regardless of whether the email
    exists or is already verified. This prevents email enumeration.

    RATE LIMITING:
        This endpoint should be rate-limited at the infrastructure level
        (nginx, API gateway, or a middleware layer). Without rate limiting,
        it could be abused to spam email addresses.
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    raw_token = await service.resend_verification_email(
        email=str(body.email),
        ip_address=ip,
    )

    if raw_token:
        # ── EMAIL SENDING HOOK ────────────────────────────────────────────────
        # TODO (Email Phase): Send new verification email.
        # from app.workers.tasks.email import send_verification_email
        # send_verification_email.delay(
        #     recipient_email=str(body.email),
        #     token=raw_token,
        # )
        if settings.is_development:
            logger.debug(
                "dev_resend_verification_token",
                email=str(body.email),
                token=raw_token,
            )
        # ── END EMAIL HOOK ────────────────────────────────────────────────────

    await db.commit()

    # Always return the same message (prevents enumeration)
    return AuthMessageResponse(
        message=(
            "If an unverified account with that email exists, "
            "a new verification link has been sent."
        ),
        success=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# PASSWORD RESET
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/forgot-password",
    response_model=AuthMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Request a password reset email",
    description=(
        "Request a password reset link for the given email. "
        "Returns the same response whether or not the email is registered "
        "to prevent enumeration attacks."
    ),
)
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthMessageResponse:
    """
    Initiate password reset flow.

    PUBLIC ENDPOINT — no authentication required.

    Always returns the same success message regardless of whether the email
    exists in the system. This is an explicit security decision to prevent
    attackers from using this endpoint to enumerate registered email addresses.
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    raw_token = await service.request_password_reset(
        email=str(body.email),
        ip_address=ip,
    )

    if raw_token:
        # ── EMAIL SENDING HOOK ────────────────────────────────────────────────
        # TODO (Email Phase): Send password reset email.
        # The reset link should look like:
        #   https://app.mindexa.ac/reset-password?token={raw_token}
        #
        # from app.workers.tasks.email import send_password_reset_email
        # send_password_reset_email.delay(
        #     recipient_email=str(body.email),
        #     token=raw_token,
        # )
        if settings.is_development:
            logger.debug(
                "dev_password_reset_token",
                email=str(body.email),
                token=raw_token,
            )
        # ── END EMAIL HOOK ────────────────────────────────────────────────────

    await db.commit()

    # Always the same message — prevents email enumeration
    return AuthMessageResponse(
        message=(
            "If an account with that email exists, "
            "a password reset link has been sent. "
            "The link expires in "
            f"{settings.PASSWORD_RESET_EXPIRE_MINUTES} minutes."
        ),
        success=True,
    )


@router.post(
    "/reset-password",
    response_model=AuthMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Complete a password reset",
    description=(
        "Reset the account password using the token from the reset email. "
        "All existing sessions are revoked after a successful reset — "
        "the user must log in again on all devices."
    ),
)
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthMessageResponse:
    """
    Complete password reset with token.

    PUBLIC ENDPOINT — no authentication required.

    On success:
        - User's password is updated
        - All existing refresh tokens (sessions) are revoked
        - The reset token is consumed (cannot be reused)

    On failure:
        - Returns 401 with a vague error (expired, used, or not found)
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    await service.confirm_password_reset(
        raw_token=body.token,
        new_password=body.new_password,
        ip_address=ip,
    )

    await db.commit()

    return AuthMessageResponse(
        message=(
            "Password reset successfully. "
            "All active sessions have been ended — please log in again."
        ),
        success=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# CURRENT USER (ME)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current authenticated user",
    description=(
        "Retrieve the full profile of the currently authenticated user. "
        "Requires a valid, non-expired access token. "
        "The user's profile, role, verification status, and account status "
        "are all included in the response."
    ),
)
async def get_me(
    current_user: CurrentUser,
) -> UserResponse:
    """
    Get the authenticated user's own profile.

    AUTHENTICATED — requires a valid access token.
    Does NOT require email verification — the user needs to be able to
    check their status even if unverified (to know they need to verify).

    Note: `current_user` is injected by `get_current_user` which already
    loads the user with their profile (selectinload). No extra DB call here.
    """
    return _build_user_response(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Update current user's profile",
    description=(
        "Update the authenticated user's profile information. "
        "Only editable profile fields (name, bio, phone) can be changed here. "
        "Role, email, and status changes require administrator action."
    ),
)
async def update_me(
    body: UserProfileUpdate,
    current_user: VerifiedUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Update profile fields for the authenticated user.

    AUTHENTICATED + VERIFIED — requires email verification.
    Only profile data (first_name, last_name, bio, phone_number) can be changed.
    Role, email, and account status are NOT changeable through this endpoint.
    """
    # Apply updates to profile
    profile = current_user.profile
    if profile is None:
        # Edge case: profile doesn't exist (creation race) — skip gracefully
        return _build_user_response(current_user)

    update_fields = body.model_dump(exclude_none=True)
    for field, value in update_fields.items():
        if hasattr(profile, field):
            setattr(profile, field, value)

    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    await db.commit()

    return _build_user_response(current_user)


@router.post(
    "/me/change-password",
    response_model=AuthMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Change password (authenticated)",
    description=(
        "Change the account password. Requires the current password for verification. "
        "All other active sessions are revoked after a successful password change."
    ),
)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    response: Response,
    current_user: VerifiedUser,
    db: AsyncSession = Depends(get_db),
) -> AuthMessageResponse:
    """
    Authenticated password change.

    AUTHENTICATED + VERIFIED — requires email verification.
    Requires the current password to verify identity (prevents session hijacking
    attacks where someone uses an unattended authenticated session to change the password).

    After success:
        - Password is updated
        - All OTHER sessions are revoked (current session's cookie is updated)
        - Returns success message
    """
    ip = _get_client_ip(request)
    service = AuthService(db)

    await service.change_password(
        user=current_user,
        current_password=body.current_password,
        new_password=body.new_password,
        ip_address=ip,
        revoke_other_sessions=True,
    )

    # Clear the refresh token cookie on this device too
    # (user will need to log in again with new password on all devices)
    _clear_refresh_cookie(response)

    await db.commit()

    return AuthMessageResponse(
        message=(
            "Password changed successfully. "
            "All active sessions have been ended — please log in again."
        ),
        success=True,
    )
