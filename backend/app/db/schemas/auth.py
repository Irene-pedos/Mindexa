"""
app/db/schemas/auth.py

Pydantic request and response schemas for the authentication API.

DESIGN PRINCIPLES:
    - Request schemas validate and constrain all incoming data
    - Response schemas never expose sensitive fields (no hashed_password, no raw tokens)
    - Passwords are validated for minimum strength at schema level
    - Emails are accepted as-is — normalisation happens in the service layer
    - All schemas inherit from MindexaSchema (from_attributes=True, strip whitespace)

SCHEMA CATALOGUE:
    Requests:
        UserRegisterRequest          → POST /auth/register
        UserLoginRequest             → POST /auth/login
        RefreshRequest               → POST /auth/refresh
        LogoutRequest                → POST /auth/logout
        ForgotPasswordRequest        → POST /auth/forgot-password
        ResetPasswordRequest         → POST /auth/reset-password
        ResendVerificationRequest    → POST /auth/resend-verification
        ChangePasswordRequest        → POST /auth/me/change-password
        UserProfileUpdate            → PATCH /auth/me

    Responses:
        TokenResponse                → login + refresh responses
        UserResponse                 → full user object (for /auth/me)
        UserSummaryResponse          → lightweight user info embedded in tokens
        UserProfileResponse          → public-safe profile view
        AuthMessageResponse          → simple success message for flows that don't return data
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from app.core.config import settings
from app.db.enums import UserRole, UserStatus
from app.db.schemas.base import BaseAuditedResponse, MindexaSchema
from pydantic import EmailStr, Field, field_validator, model_validator

# ─────────────────────────────────────────────────────────────────────────────
# REQUEST SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────


class UserRegisterRequest(MindexaSchema):
    """
    Registration request body.

    Password is validated for minimum length here.
    Email normalisation (lowercase + strip) happens in the service, not here,
    so we accept any valid email format.
    """

    email: EmailStr = Field(description="User email address.")
    password: str = Field(
        min_length=settings.PASSWORD_MIN_LENGTH,
        max_length=128,
        description=f"Password (minimum {settings.PASSWORD_MIN_LENGTH} characters).",
    )
    first_name: str = Field(
        min_length=1,
        max_length=100,
        description="User's first name.",
    )
    last_name: str = Field(
        min_length=1,
        max_length=100,
        description="User's last name.",
    )
    role: UserRole = Field(
        default=UserRole.STUDENT,
        description=(
            "Requested role. For security, only STUDENT is accepted via public registration. "
            "LECTURER and ADMIN roles are assigned by system administrators."
        ),
    )

    @field_validator("role")
    @classmethod
    def restrict_self_registration_roles(cls, v: UserRole) -> UserRole:
        """
        Prevent self-registration as LECTURER or ADMIN.

        A user cannot register themselves as a lecturer or admin via the
        public API. These roles are assigned by administrators through
        the admin management API, not through registration.

        This validator enforces a hard security boundary: even if someone
        sends role=admin in the JSON body, it is silently corrected to STUDENT.
        We do not raise an error here (better UX) — the admin must assign the role.
        """
        if v in (UserRole.LECTURER, UserRole.ADMIN):
            return UserRole.STUDENT
        return v

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Strip and validate names do not contain only whitespace."""
        stripped = v.strip()
        if not stripped:
            raise ValueError("Name cannot be empty or whitespace only.")
        return stripped


class UserLoginRequest(MindexaSchema):
    """Login request body — email + password only."""

    email: EmailStr = Field(description="Registered email address.")
    password: str = Field(
        min_length=1,
        max_length=256,
        description="Account password.",
    )


class RefreshRequest(MindexaSchema):
    """
    Token refresh request.

    The refresh token can be delivered two ways:
        1. In the request body (JSON) — this schema handles this case
        2. Via HttpOnly cookie — the route reads it directly from the cookie

    Both modes are supported at the route level.
    """

    refresh_token: str = Field(description="Valid JWT refresh token.")


class LogoutRequest(MindexaSchema):
    """
    Logout request.

    The refresh token identifies which session to revoke.
    If refresh_token is omitted, the route will attempt to read it from
    the HttpOnly cookie (if cookie mode is enabled).
    """

    refresh_token: Optional[str] = Field(
        default=None,
        description="The refresh token for the session to revoke.",
    )


class ForgotPasswordRequest(MindexaSchema):
    """Forgot password — request a reset email."""

    email: EmailStr = Field(description="Email address of the account to reset.")


PasswordResetRequestBody = ForgotPasswordRequest


class ResetPasswordRequest(MindexaSchema):
    """
    Confirm a password reset.

    The raw token comes from the URL query parameter or the email link body.
    The new password replaces the current one if the token is valid.
    """

    token: str = Field(
        min_length=1,
        description="Raw reset token from the password reset email.",
    )
    new_password: str = Field(
        min_length=settings.PASSWORD_MIN_LENGTH,
        max_length=128,
        description=f"New password (minimum {settings.PASSWORD_MIN_LENGTH} characters).",
    )
    confirm_password: str = Field(
        min_length=settings.PASSWORD_MIN_LENGTH,
        max_length=128,
        description="Must match new_password exactly.",
    )

    @model_validator(mode="after")
    def passwords_must_match(self) -> "ResetPasswordRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("new_password and confirm_password do not match.")
        return self


PasswordResetConfirmRequest = ResetPasswordRequest


class ResendVerificationRequest(MindexaSchema):
    """Request a new email verification link."""

    email: EmailStr = Field(description="Email address to resend verification to.")


class ChangePasswordRequest(MindexaSchema):
    """
    Authenticated password change (requires current password verification).

    Different from password reset: the user must know their current password.
    """

    current_password: str = Field(
        min_length=1,
        max_length=256,
        description="Current account password for verification.",
    )
    new_password: str = Field(
        min_length=settings.PASSWORD_MIN_LENGTH,
        max_length=128,
        description=f"New password (minimum {settings.PASSWORD_MIN_LENGTH} characters).",
    )
    confirm_password: str = Field(
        min_length=settings.PASSWORD_MIN_LENGTH,
        max_length=128,
        description="Must match new_password exactly.",
    )

    @model_validator(mode="after")
    def passwords_must_match(self) -> "ChangePasswordRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("new_password and confirm_password do not match.")
        return self


PasswordChangeRequest = ChangePasswordRequest


class UserProfileUpdate(MindexaSchema):
    """
    Self-service profile update.

    Only fields the user can safely update themselves are included.
    Role, status, email — these are NOT updatable by the user directly.
    """

    first_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="Updated first name.",
    )
    last_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="Updated last name.",
    )
    bio: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Short biography or about text.",
    )
    phone_number: Optional[str] = Field(
        default=None,
        max_length=30,
        description="Contact phone number.",
    )

    @model_validator(mode="after")
    def at_least_one_field(self) -> "UserProfileUpdate":
        values = {
            k: v for k, v in self.model_dump().items() if v is not None
        }
        if not values:
            raise ValueError("At least one field must be provided for profile update.")
        return self


# ─────────────────────────────────────────────────────────────────────────────
# RESPONSE SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────


class AuthMessageResponse(MindexaSchema):
    """
    Generic message response for auth endpoints that don't return data.

    Used by: forgot-password, resend-verification, logout, change-password.
    Always returns a message even when the underlying operation found nothing
    (prevents user enumeration via response shape differences).
    """

    message: str
    success: bool = True


class TokenResponse(MindexaSchema):
    """
    Token pair response — returned by login and refresh endpoints.

    FIELDS:
        access_token  → Short-lived JWT, put in Authorization: Bearer header
        token_type    → Always "bearer" (OAuth2 convention)
        expires_in    → Seconds until access_token expires (for frontend timer)
        refresh_token → Longer-lived JWT for session continuation

    SECURITY NOTE:
        The refresh_token in this response should be stored in an HttpOnly
        cookie by the frontend (if cookie mode is supported) rather than
        localStorage. This prevents XSS access to the refresh token.
        If the frontend cannot use cookies, it must store the refresh token
        securely and never in localStorage.

        The access_token can be stored in memory (JavaScript variable) —
        it has a short lifetime (30 minutes) so the risk is acceptable.
    """

    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Access token lifetime in seconds.")
    refresh_token: str


class UserProfileResponse(MindexaSchema):
    """
    Public-safe user profile data.

    Never exposes: hashed_password, failed_login_attempts, locked_until,
    security event data, or any other sensitive fields.
    """

    user_id: uuid.UUID
    first_name: str
    last_name: str
    display_name: Optional[str] = None
    bio: Optional[str] = None
    phone_number: Optional[str] = None
    profile_picture_url: Optional[str] = None
    student_id: Optional[str] = None
    staff_id: Optional[str] = None


class UserResponse(BaseAuditedResponse):
    """
    Full user response — returned by /auth/me.

    This is the most information-rich user view available via the API.
    Even this view does NOT expose: hashed_password, failed_login_attempts,
    locked_until, or raw token data.

    The `profile` field is optional because in rare edge cases the profile
    row may not yet exist (creation race condition). The route handles this.
    """

    email: str
    role: UserRole
    status: UserStatus
    email_verified: bool
    email_verified_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    profile: Optional[UserProfileResponse] = None

    @property
    def full_name(self) -> str:
        """Convenience accessor used in serialised responses."""
        if self.profile:
            return f"{self.profile.first_name} {self.profile.last_name}".strip()
        return self.email


class UserSummaryResponse(MindexaSchema):
    """
    Lightweight user summary — embedded in other responses.

    Used when we need to reference who performed an action (e.g. in
    assessment creation responses, grading responses, etc.) without
    returning the full user object.
    """

    id: uuid.UUID
    email: str
    role: UserRole
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    @property
    def display_name(self) -> str:
        parts = [self.first_name, self.last_name]
        name = " ".join(p for p in parts if p)
        return name if name else self.email


class LoginResponse(MindexaSchema):
    """
    Extended login response that combines tokens + user info.

    The frontend uses this to set up the session immediately after login
    without needing a separate /me call.
    """

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str
    user: UserResponse
