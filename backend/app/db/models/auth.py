"""
app/db/models/auth.py

Authentication and Identity models for Mindexa.

Tables defined here:
    user                  — Central identity record for every person on the platform
    user_profile          — Extended personal information (1:1 with user)
    refresh_token         — Active JWT refresh tokens (hard-deleted on revoke/logout)
    password_reset_token  — Short-lived single-use tokens for password reset flow

Design decisions:
    - User is the only table that all other domain tables reference.
      Import User carefully to avoid circular imports — other models should
      use plain UUID FK columns (via fk_uuid()) rather than importing User directly.

    - refresh_token and password_reset_token do NOT use SoftDeleteMixin.
      They are hard-deleted when consumed or revoked. Keeping revoked tokens
      as rows with is_deleted=True would mean the blocklist check must also
      check is_deleted — simpler and faster to hard-delete and use Redis for
      real-time blocklist checks.

    - user_profile is separated from user to keep the auth table lean.
      The auth table contains only what is needed for authentication and
      access control. Profile data is loaded lazily where needed.

    - failed_login_attempts and locked_until support brute-force protection
      at the DB layer as a fallback. Redis-based rate limiting is the primary
      defence — these fields are the durable record.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Index, UniqueConstraint
from sqlmodel import Field, Relationship

from app.db.base import BaseModel, utcnow
from app.db.enums import UserRole, UserStatus
from app.db.mixins import (
    bool_field,
    composite_index,
    fk_uuid,
    long_text,
    optional_fk_uuid,
    short_text,
    unique_composite_index,
)

# TYPE_CHECKING block avoids circular imports at runtime.
# These imports are only used for type annotations on Relationship() fields.
if TYPE_CHECKING:
    pass  # Forward references added per step as domain grows


# ─────────────────────────────────────────────────────────────────────────────
# USER
# ─────────────────────────────────────────────────────────────────────────────

class User(BaseModel, table=True):
    """
    Central identity record for every person on the platform.

    Security notes:
        - hashed_password stores a bcrypt hash — never a plain-text password.
        - failed_login_attempts increments on each failed attempt and is reset
          to 0 on successful login. Checked by the auth service.
        - locked_until is set to NOW() + lockout_duration when
          failed_login_attempts reaches the configured threshold.
        - email_verified must be True before a user can access any protected
          resource. The email verification flow sets email_verified_at.
        - last_login_at is updated on every successful token issuance.

    Soft delete behaviour:
        Soft-deleting a user sets is_deleted=True. Their academic records
        (attempts, grades, submissions) are never cascaded — they are
        permanent by design for academic integrity.
    """

    __tablename__ = "user"

    __table_args__ = (
        # Composite index for fast role-filtered queries (e.g. "all active lecturers")
        composite_index("user", "role", "status"),
        # Composite index for authentication flow — email lookup with status check
        composite_index("user", "email", "status"),
    )

    # ── Authentication fields ─────────────────────────────────────────────────

    email: str = Field(
        nullable=False,
        max_length=255,
        unique=True,
        index=True,
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
    # back_populates must match the relationship name on the other side.

    profile: Optional["UserProfile"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            # Load profile in the same query as user when explicitly requested
            "lazy": "select",
            # Cascade: if user is deleted (even soft), profile follows
            "cascade": "all, delete-orphan",
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
        Strictly 1:1 with User. Created when a user completes onboarding.
        The unique constraint on user_id enforces the 1:1 relationship at
        the database level — SQLAlchemy's Relationship alone is not enough.

    Design note:
        avatar_url stores a relative path or an object-storage key,
        not a full URL. The API layer resolves it to a full URL at response time.
        This allows storage backends to change without a DB migration.
    """

    __tablename__ = "user_profile"

    __table_args__ = (
        # Enforces 1:1 at DB level — cannot have two profiles for one user
        UniqueConstraint("user_id", name="uq_user_profile_user_id"),
    )

    # ── Foreign key ───────────────────────────────────────────────────────────

    user_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "CASCADE"},
    )

    # ── Personal information ──────────────────────────────────────────────────

    first_name: str = Field(nullable=False, max_length=100)
    last_name: str = Field(nullable=False, max_length=100)
    phone_number: Optional[str] = Field(default=None, nullable=True, max_length=30)
    avatar_url: Optional[str] = Field(default=None, nullable=True, max_length=500)
    date_of_birth: Optional[datetime] = Field(default=None, nullable=True)
    bio: Optional[str] = Field(default=None, nullable=True)

    # ── Localisation ─────────────────────────────────────────────────────────

    timezone: str = Field(
        default="UTC",
        nullable=False,
        max_length=64,
    )
    preferred_language: str = Field(
        default="en",
        nullable=False,
        max_length=10,
    )

    # ── Relationship ──────────────────────────────────────────────────────────

    user: Optional["User"] = Relationship(back_populates="profile")


# ─────────────────────────────────────────────────────────────────────────────
# REFRESH TOKEN
# ─────────────────────────────────────────────────────────────────────────────

class RefreshToken(BaseModel, table=True):
    """
    Stores active refresh tokens for JWT rotation.

    Lifecycle:
        1. Created when a user successfully logs in.
        2. Consumed (and a new one issued) when the client calls /auth/refresh.
        3. Hard-deleted on logout or explicit revocation.

    Hard delete rationale:
        Revoked tokens are tracked in Redis (fast blocklist check on every
        request). Once a token is revoked, its row is deleted from this table.
        This keeps the table lean — it only contains active tokens, and
        the query "is this JTI still valid?" is answered by Redis, not this table.

    The is_deleted / deleted_at fields inherited from BaseModel are kept
    for structural consistency but will rarely be used — the primary deletion
    path is a real DELETE, not a soft delete.

    device_hint:
        A non-sensitive string set by the client (e.g. "Chrome on Windows")
        to help the user identify active sessions. Never used for security decisions.

    ip_address:
        The IP address at the time the token was issued. Stored for
        security review purposes — if a user sees an unrecognised IP
        in their active sessions, they can revoke that token.
    """

    __tablename__ = "refresh_token"

    __table_args__ = (
        # Fast lookup by user when listing or revoking sessions
        composite_index("refresh_token", "user_id", "revoked"),
        # Partial index for active (non-revoked) tokens only
        # Note: Alembic cannot generate partial indexes from __table_args__ alone.
        # The migration will include a raw SQL statement for this.
        # Index("ix_refresh_token_active", "user_id",
        #       postgresql_where=text("revoked = false"))
    )

    # ── Foreign key ───────────────────────────────────────────────────────────

    user_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "CASCADE"},
    )

    # ── Token identity ────────────────────────────────────────────────────────

    jti: str = Field(
        nullable=False,
        max_length=36,   # UUID string length
        unique=True,
        index=True,
    )

    # ── Lifecycle ────────────────────────────────────────────────────────────

    expires_at: datetime = Field(nullable=False)
    revoked: bool = Field(default=False, nullable=False, index=True)
    revoked_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Context ───────────────────────────────────────────────────────────────

    device_hint: Optional[str] = Field(default=None, nullable=True, max_length=255)
    ip_address: Optional[str] = Field(default=None, nullable=True, max_length=45)

    # ── Relationship ──────────────────────────────────────────────────────────

    user: Optional["User"] = Relationship(back_populates="refresh_tokens")


# ─────────────────────────────────────────────────────────────────────────────
# PASSWORD RESET TOKEN
# ─────────────────────────────────────────────────────────────────────────────

class PasswordResetToken(BaseModel, table=True):
    """
    Short-lived single-use tokens for the password reset flow.

    Lifecycle:
        1. Created when a user requests a password reset.
        2. A hashed version of the token is emailed to the user.
        3. When the user submits the reset form, the backend hashes the
           submitted token and compares it to token_hash (timing-safe compare).
        4. On successful use: used=True, used_at=NOW(). Row is then
           hard-deleted after a short grace period (handled by Celery).

    Security:
        The raw token is NEVER stored — only its hash. This means
        even with full DB read access, an attacker cannot use tokens
        from this table without the original email link.

        expires_at is set to NOW() + 15 minutes on creation.
        used tokens are treated as expired regardless of expires_at.

    One active token per user:
        The service layer invalidates (hard-deletes) any existing
        unused token for a user before issuing a new one.
        This is not enforced at the DB level to avoid a partial index
        complexity — it is a service-layer rule.
    """

    __tablename__ = "password_reset_token"

    __table_args__ = (
        # Fast lookup by user to invalidate existing tokens before issuing new ones
        composite_index("password_reset_token", "user_id", "used"),
    )

    # ── Foreign key ───────────────────────────────────────────────────────────

    user_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "CASCADE"},
    )

    # ── Token ─────────────────────────────────────────────────────────────────

    token_hash: str = Field(
        nullable=False,
        max_length=255,
        index=True,
    )

    # ── Lifecycle ────────────────────────────────────────────────────────────

    expires_at: datetime = Field(nullable=False)
    used: bool = Field(default=False, nullable=False, index=True)
    used_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Relationship ──────────────────────────────────────────────────────────

    user: Optional["User"] = Relationship(back_populates="password_reset_tokens")
