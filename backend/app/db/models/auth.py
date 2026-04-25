"""
app/db/models/auth.py

Authentication and user database models for Mindexa Platform.

Models:
    User                  — Core account record
    UserProfile           — Extended personal information
    RefreshToken          — Tracked refresh token sessions (JTI-based)
    PasswordResetToken    — Email verification + password reset tokens

DESIGN:
    - All models extend UUIDBase (from app/db/base.py) for UUID PKs + timestamps
    - Soft-delete is supported via is_deleted + deleted_at (from TimestampMixin)
    - No raw passwords stored — only bcrypt hashes
    - No raw reset/verification tokens — only SHA-256 hashes
    - Relationships use selectinload-friendly lazy loading
    - All columns have explicit names, nullable settings, and index hints
"""

import uuid
from datetime import datetime
from typing import List, Optional

from app.core.constants import (UserRole, UserStatus)
from app.db.base import Base
from app.db.mixins import SoftDeleteMixin, TimestampMixin
from sqlalchemy import (Boolean, DateTime, ForeignKey, Index, Integer, String,
                        Text)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

# ─── User ─────────────────────────────────────────────────────────────────────


class User(Base, TimestampMixin, SoftDeleteMixin):
    """
    Core user account record.

    Stores credentials, role, account state, and security fields.
    Personal information lives in UserProfile (1:1 relationship).

    SECURITY FIELDS:
        failed_login_attempts  — incremented on each failed login
        locked_until           — account login blocked until this datetime
        email_verified         — must be True for full platform access
        email_verified_at      — timestamp when email was verified
        last_login_at          — last successful login timestamp
    """

    __tablename__ = "user"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
        comment="Normalized (lowercase) email address",
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="bcrypt hash of the user password",
    )

    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=UserRole.STUDENT.value,
        index=True,
        comment="User role: student | lecturer | admin",
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=UserStatus.PENDING_VERIFICATION.value,
        index=True,
        comment="Account status: pending_verification | active | suspended | inactive",
    )

    # Email verification
    email_verified: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="True after email address has been verified",
    )
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when email was verified",
    )

    # Login tracking
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp of last successful login",
    )

    # Brute-force protection
    failed_login_attempts: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Number of consecutive failed login attempts",
    )
    locked_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Account login is blocked until this UTC datetime",
    )

    # ─── Relationships ────────────────────────────────────────────────────────

    profile: Mapped[Optional["UserProfile"]] = relationship(
        "UserProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    refresh_tokens: Mapped[List["RefreshToken"]] = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    password_reset_tokens: Mapped[List["PasswordResetToken"]] = relationship(
        "PasswordResetToken",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    # ─── Composite Indexes ────────────────────────────────────────────────────

    __table_args__ = (
        Index("ix_users_email_status", "email", "status"),
        Index("ix_users_role_status", "role", "status"),
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE.value

    @property
    def is_suspended(self) -> bool:
        return self.status == UserStatus.SUSPENDED.value

    @property
    def is_pending_verification(self) -> bool:
        return self.status == UserStatus.PENDING_VERIFICATION.value

    @property
    def role_enum(self) -> UserRole:
        return UserRole(self.role)

    @property
    def status_enum(self) -> UserStatus:
        return UserStatus(self.status)


# ─── UserProfile ──────────────────────────────────────────────────────────────


class UserProfile(Base, TimestampMixin, SoftDeleteMixin):
    """
    Extended user profile information.

    Separated from User to keep the auth model lean.
    Always created alongside User in the registration flow.

    Has a strict 1:1 relationship with User.
    """

    __tablename__ = "user_profile"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    first_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    last_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    display_name: Mapped[Optional[str]] = mapped_column(
        String(150),
        nullable=True,
        comment="Preferred display name (overrides first + last)",
    )

    phone_number: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
    )

    bio: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    avatar_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )

    # For students: student ID number (institution-assigned)
    student_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
        comment="Institution-assigned student ID (students only)",
    )

    # For lecturers: staff/employee ID
    staff_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
        comment="Institution-assigned staff ID (lecturers/admins)",
    )

    # Academic context
    department: Mapped[Optional[str]] = mapped_column(
        String(150),
        nullable=True,
    )

    # ─── Relationships ────────────────────────────────────────────────────────

    user: Mapped["User"] = relationship(
        "User",
        back_populates="profile",
    )

    def __repr__(self) -> str:
        return (
            f"<UserProfile user_id={self.user_id} "
            f"name={self.first_name} {self.last_name}>"
        )

    @property
    def full_name(self) -> str:
        if self.display_name:
            return self.display_name
        parts = [self.first_name, self.last_name]
        return " ".join(p for p in parts if p) or "Unknown"


# ─── RefreshToken ─────────────────────────────────────────────────────────────


class RefreshToken(Base, TimestampMixin):
    """
    Tracked refresh token session.

    Stores the JTI (JWT ID) of each issued refresh token.
    Revocation is done by setting revoked=True and revoked_at.

    ROTATION:
        Each refresh call creates a new row and revokes the old one.
        This enables detecting token theft (a revoked token being used again
        triggers all-session revocation).

    CLEANUP:
        Expired + revoked tokens should be periodically purged by a Celery task.
        The is_valid property reflects current usability.
    """

    __tablename__ = "refresh_token"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    jti: Mapped[str] = mapped_column(
        String(36),  # UUID format
        nullable=False,
        unique=True,
        index=True,
        comment="JWT ID claim — unique identifier for this token",
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        comment="Token expiry — after this the token is invalid regardless of revocation",
    )

    revoked: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
        comment="True if this token has been explicitly revoked",
    )

    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when this token was revoked",
    )

    # Optional session context (helps with security event context)
    device_hint: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="User-Agent or device identifier (for display purposes only)",
    )

    ip_address: Mapped[Optional[str]] = mapped_column(
        String(45),  # Max IPv6 length
        nullable=True,
        comment="Client IP at token issuance",
    )

    # ─── Relationships ────────────────────────────────────────────────────────

    user: Mapped["User"] = relationship(
        "User",
        back_populates="refresh_tokens",
    )

    # ─── Composite Indexes ────────────────────────────────────────────────────

    __table_args__ = (
        Index("ix_refresh_tokens_user_revoked", "user_id", "revoked"),
        Index("ix_refresh_tokens_jti_revoked", "jti", "revoked"),
    )

    def __repr__(self) -> str:
        return (
            f"<RefreshToken jti={self.jti} user_id={self.user_id} "
            f"revoked={self.revoked}>"
        )

    @property
    def is_valid(self) -> bool:
        """Check if this token is currently usable (not revoked, not expired)."""
        from datetime import timezone
        now = datetime.now(tz=timezone.utc)
        return not self.revoked and self.expires_at > now


# ─── PasswordResetToken ───────────────────────────────────────────────────────


class PasswordResetToken(Base, TimestampMixin):
    """
    Single-use token for password reset AND email verification.

    The same table serves both use cases, differentiated by the
    `token_purpose` field.

    SECURITY:
        - Only the SHA-256 hash of the token is stored
        - Raw tokens are sent to the user by email and never persisted
        - Tokens are single-use (used=True after consumption)
        - Tokens expire after a configurable period
        - Old unused tokens are invalidated when a new one is issued

    CLEANUP:
        Expired tokens should be purged by a periodic Celery task.
    """

    __tablename__ = "password_reset_token"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    token_hash: Mapped[str] = mapped_column(
        String(64),  # SHA-256 hex = 64 chars
        nullable=False,
        unique=True,
        index=True,
        comment="SHA-256 hash of the raw token sent to the user",
    )

    token_purpose: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="password_reset",
        comment="password_reset | email_verification",
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    used: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
    )

    used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ─── Relationships ────────────────────────────────────────────────────────

    user: Mapped["User"] = relationship(
        "User",
        back_populates="password_reset_tokens",
    )

    # ─── Composite Indexes ────────────────────────────────────────────────────

    __table_args__ = (
        Index(
            "ix_password_reset_tokens_user_purpose_used",
            "user_id",
            "token_purpose",
            "used",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<PasswordResetToken user_id={self.user_id} "
            f"purpose={self.token_purpose} used={self.used}>"
        )

    @property
    def is_valid(self) -> bool:
        """Check if this token is currently usable."""
        from datetime import timezone
        now = datetime.now(tz=timezone.utc)
        return not self.used and self.expires_at > now
