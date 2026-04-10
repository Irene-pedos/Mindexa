"""
app/db/models/auth.py

Authentication and Identity models for Mindexa.

Tables defined here:
    user                  — Central identity record for every person on the platform
    user_profile          — Extended personal information (1:1 with user)
    refresh_token         — Active JWT refresh tokens (hard-deleted on revoke/logout)
    password_reset_token  — Short-lived single-use tokens for password reset & email verification

Design decisions:

    ENUM SOURCE:
        All enum types (UserRole, UserStatus) come from app.core.constants —
        that is the single source of truth for enums across the entire backend.
        Never import from app.db.enums (that file should not exist).

    SOFT DELETE:
        User and UserProfile use soft-delete (is_deleted, deleted_at from BaseModel).
        RefreshToken and PasswordResetToken do NOT use soft-delete — they are
        hard-deleted when consumed or revoked.

    REFRESH TOKENS:
        Revoked tokens are tracked in Redis for fast O(1) blocklist checks.
        Once revoked, the row is hard-deleted to keep the table lean.
        The table only contains ACTIVE tokens.

    PASSWORD RESET / EMAIL VERIFICATION TOKENS:
        Dual-purpose table controlled by token_type field.
        The raw token is NEVER stored — only its SHA-256 hash.
        This means even with full DB read access, an attacker cannot
        use tokens extracted from this table.

    CIRCULAR IMPORT PREVENTION:
        User is the only model that all other domain tables reference.
        Other model modules should use plain uuid.UUID FK columns
        rather than importing User directly, to avoid circular imports.
        Relationships to other domain models are added via TYPE_CHECKING.

    SQLMODEL FIELD STYLE:
        We use Field(...) consistently without sa_column= for simple columns.
        sa_column=Column(...) is only used when we need ForeignKey, specific
        PostgreSQL types (UUID as_uuid), or index options not supported by
        Field's shorthand.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from app.core.constants import UserRole, UserStatus
from app.db.base import BaseModel
from sqlalchemy import Column, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import Field, Relationship

if TYPE_CHECKING:
    pass  # Forward references added as domain grows


# ─────────────────────────────────────────────────────────────────────────────
# USER
# ─────────────────────────────────────────────────────────────────────────────


class User(BaseModel, table=True):
    """
    Central identity record for every person on the platform.

    Security notes:
        hashed_password:
            Stores a bcrypt hash — NEVER a plain-text password.
            Use security.hash_password() to generate, security.verify_password() to check.

        failed_login_attempts:
            Increments on each failed login attempt.
            Reset to 0 on successful login.
            Checked by auth_service before allowing login.

        locked_until:
            Set to NOW() + lockout_duration when failed_login_attempts reaches
            the configured threshold (settings.MAX_FAILED_LOGIN_ATTEMPTS).
            Auth service checks this before processing credentials.

        email_verified:
            Must be True before a user can access any protected resource.
            Set to True (and email_verified_at recorded) by the email verification flow.

        last_login_at:
            Updated on every successful token issuance.
            Useful for security audits and inactive account detection.

    Soft delete:
        Soft-deleting a user sets is_deleted=True. Academic records
        (attempts, grades, submissions) are NEVER cascaded — they are
        permanent by design for academic integrity and audit compliance.
    """

    __tablename__ = "user"

    __table_args__ = (
        # Composite index: fast role-filtered queries ("all active lecturers")
        Index("ix_user_role_status", "role", "status"),
        # Composite index: auth flow — email lookup combined with status check
        Index("ix_user_email_status", "email", "status"),
    )

    # ── Authentication ────────────────────────────────────────────────────────

    email: str = Field(
        nullable=False,
        unique=True,
        index=True,
        max_length=255,
    )
    hashed_password: str = Field(
        nullable=False,
        max_length=255,
    )

    # ── Role & Status ─────────────────────────────────────────────────────────

    role: UserRole = Field(
        nullable=False,
        index=True,
    )
    status: UserStatus = Field(
        default=UserStatus.PENDING_VERIFICATION,
        nullable=False,
        index=True,
    )

    # ── Email verification ────────────────────────────────────────────────────

    email_verified: bool = Field(default=False, nullable=False)
    email_verified_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Session tracking ──────────────────────────────────────────────────────

    last_login_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Brute-force protection ────────────────────────────────────────────────

    failed_login_attempts: int = Field(default=0, nullable=False)
    locked_until: Optional[datetime] = Field(default=None, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────

    profile: Optional["UserProfile"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "lazy": "select",
            "cascade": "all, delete-orphan",
            "uselist": False,
        },
    )

    refresh_tokens: List["RefreshToken"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "lazy": "select",
            "cascade": "all, delete-orphan",
        },
    )

    password_reset_tokens: List["PasswordResetToken"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "lazy": "select",
            "cascade": "all, delete-orphan",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# USER PROFILE
# ─────────────────────────────────────────────────────────────────────────────


class UserProfile(BaseModel, table=True):
    """
    Extended personal information, separated from auth concerns.

    Relationship:
        Strictly 1:1 with User.
        - The UniqueConstraint on user_id enforces this at the DB level.
        - SQLAlchemy's uselist=False enforces it at the ORM level.
        - Created during user onboarding (after registration).

    avatar_url:
        Stores a relative path or object-storage key, NOT a full URL.
        The API layer resolves it to a full URL at response time.
        This allows storage backends to change without a DB migration.
    """

    __tablename__ = "user_profile"

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_profile_user_id"),
    )

    # ── Foreign key ───────────────────────────────────────────────────────────

    user_id: uuid.UUID = Field(
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )

    # ── Personal information ──────────────────────────────────────────────────

    first_name: str = Field(nullable=False, max_length=100)
    last_name: str = Field(nullable=False, max_length=100)
    phone_number: Optional[str] = Field(default=None, nullable=True, max_length=30)
    avatar_url: Optional[str] = Field(default=None, nullable=True, max_length=500)
    date_of_birth: Optional[datetime] = Field(default=None, nullable=True)
    bio: Optional[str] = Field(default=None, nullable=True)

    # ── Localisation ─────────────────────────────────────────────────────────

    timezone: str = Field(default="UTC", nullable=False, max_length=64)
    preferred_language: str = Field(default="en", nullable=False, max_length=10)

    # ── Relationship ──────────────────────────────────────────────────────────

    user: Optional["User"] = Relationship(back_populates="profile")


# ─────────────────────────────────────────────────────────────────────────────
# REFRESH TOKEN
# ─────────────────────────────────────────────────────────────────────────────


class RefreshToken(BaseModel, table=True):
    """
    Stores active refresh tokens for JWT rotation.

    Lifecycle:
        1. Created on successful login.
        2. Consumed (old row deleted, new one created) on /auth/refresh.
        3. Hard-deleted on logout or explicit revocation.

    Hard-delete rationale:
        Revoked tokens are tracked in Redis (fast blocklist check on every
        refresh request). Once revoked, the DB row is deleted.
        The table only contains ACTIVE tokens — "is this JTI valid?"
        is answered by Redis, not a full table scan.

    Replay attack protection:
        If a refresh token JTI that has been revoked is presented again,
        the auth service detects the replay and revokes ALL of that user's
        sessions (all RefreshToken rows deleted, all JTIs pushed to Redis).

    device_hint:
        Non-sensitive client-provided string (e.g. "Chrome on Windows").
        Used only for the "manage active sessions" UI. Never used for
        security decisions.

    ip_address:
        IP at token issuance time. Stored for security audit logs.
        If a user sees an unrecognised IP, they can revoke that session.
    """

    __tablename__ = "refresh_token"

    __table_args__ = (
        # Fast lookup for "list all active sessions for this user"
        Index("ix_refresh_token_user_id_revoked", "user_id", "revoked"),
    )

    # ── Foreign key ───────────────────────────────────────────────────────────

    user_id: uuid.UUID = Field(
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )

    # ── Token identity ────────────────────────────────────────────────────────

    jti: str = Field(
        nullable=False,
        max_length=36,    # UUID4 string length: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        unique=True,
        index=True,
    )

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    expires_at: datetime = Field(nullable=False)
    revoked: bool = Field(default=False, nullable=False, index=True)
    revoked_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Context metadata ──────────────────────────────────────────────────────

    device_hint: Optional[str] = Field(default=None, nullable=True, max_length=255)
    ip_address: Optional[str] = Field(default=None, nullable=True, max_length=45)

    # ── Relationship ──────────────────────────────────────────────────────────

    user: Optional["User"] = Relationship(back_populates="refresh_tokens")


# ─────────────────────────────────────────────────────────────────────────────
# PASSWORD RESET TOKEN  (also used for email verification)
# ─────────────────────────────────────────────────────────────────────────────


class PasswordResetToken(BaseModel, table=True):
    """
    Short-lived single-use tokens for password reset and email verification flows.

    Dual-purpose table:
        token_type = "password_reset"  → password reset flow
        token_type = "email_verification" → email verification flow

    Lifecycle:
        1. Created when a user requests a password reset or email verification.
        2. A hashed version of the raw token is stored here.
        3. The raw token is emailed to the user (embedded in a link).
        4. When the user clicks the link, the backend:
               a. Looks up the record by token_hash (SHA-256 of submitted raw token)
               b. Verifies it is not expired (expires_at > NOW())
               c. Verifies it has not been used (used = False)
               d. Sets used = True, used_at = NOW()
        5. Hard-deleted after use (Celery cleanup job or on next request).

    Security guarantees:
        - Raw token is NEVER stored — only its SHA-256 hash.
        - Even with full DB read access, tokens cannot be replayed.
        - Timing-safe comparison (hmac.compare_digest) used at verification.
        - expires_at enforces short validity window (15 min for password reset,
          24 hours for email verification — configurable in settings).
        - used = True prevents replay even within the validity window.

    One active token per user per type:
        The service layer deletes any existing unused token of the same
        token_type before issuing a new one. This is a service-layer rule,
        not a DB constraint, to avoid partial-index complexity.
    """

    __tablename__ = "password_reset_token"

    __table_args__ = (
        # Fast lookup: find unused tokens for a user (for invalidation before re-issue)
        Index("ix_password_reset_token_user_id_used", "user_id", "used"),
    )

    # ── Foreign key ───────────────────────────────────────────────────────────

    user_id: uuid.UUID = Field(
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )

    # ── Token type ────────────────────────────────────────────────────────────

    token_type: str = Field(
        nullable=False,
        max_length=50,
        # Valid values: "password_reset" | "email_verification"
        # Enforced at the service layer, not as a DB CHECK constraint
        # (Alembic does not autogenerate CHECK constraints).
    )

    # ── Token ─────────────────────────────────────────────────────────────────

    token_hash: str = Field(
        nullable=False,
        max_length=255,   # SHA-256 hex digest = 64 chars; padded for safety
        index=True,
    )

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    expires_at: datetime = Field(nullable=False)
    used: bool = Field(default=False, nullable=False, index=True)
    used_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Relationship ──────────────────────────────────────────────────────────

    user: Optional["User"] = Relationship(back_populates="password_reset_tokens")
