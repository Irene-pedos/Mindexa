"""
app/db/models/auth.py

Authentication and user database models for Mindexa Platform.
Strictly SQLModel-based ORM pattern.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, Relationship

from app.core.constants import UserRole, UserStatus
from app.db.base import BaseModel

if TYPE_CHECKING:
    from app.db.models.notification import Notification


# ─── User ─────────────────────────────────────────────────────────────────────

class User(BaseModel, table=True):
    """Core user account record."""
    __tablename__ = "user"
    __table_args__ = (
        Index("ix_users_email_status", "email", "status"),
        Index("ix_users_role_status", "role", "status"),
    )

    email: str = Field(
        sa_column=Column(
            String(255),
            unique=True,
            nullable=False,
            comment="Normalized (lowercase) email address",
        )
    )
    hashed_password: str = Field(
        sa_column=Column(
            String(255),
            nullable=False,
            comment="bcrypt hash of the user password",
        )
    )
    role: str = Field(
        default=UserRole.STUDENT.value,
        sa_column=Column(
            String(20),
            nullable=False,
            comment="User role: STUDENT | LECTURER | ADMIN",
        )
    )
    status: str = Field(
        default=UserStatus.PENDING_VERIFICATION.value,
        sa_column=Column(
            String(30),
            nullable=False,
            comment="Account status",
        )
    )

    # Email verification
    email_verified: bool = Field(default=False, nullable=False)
    email_verified_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    # Login tracking
    last_login_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    # Brute-force protection
    failed_login_attempts: int = Field(default=0, nullable=False)
    locked_until: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    profile: Optional["UserProfile"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan", "lazy": "selectin"}
    )
    refresh_tokens: List["RefreshToken"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "lazy": "selectin"}
    )
    password_reset_tokens: List["PasswordResetToken"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "lazy": "selectin"}
    )
    notifications: List["Notification"] = Relationship(
        back_populates="recipient",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "lazy": "selectin"}
    )


# ─── UserProfile ──────────────────────────────────────────────────────────────

class UserProfile(BaseModel, table=True):
    """Extended user profile information."""
    __tablename__ = "user_profile"

    user_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        )
    )
    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    display_name: Optional[str] = Field(default=None, max_length=150)
    phone_number: Optional[str] = Field(default=None, max_length=30)
    bio: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    student_id: Optional[str] = Field(default=None, max_length=50, index=True, unique=True)
    staff_id: Optional[str] = Field(default=None, max_length=50, index=True)
    college: Optional[str] = Field(default=None, max_length=150)
    department: Optional[str] = Field(default=None, max_length=150)
    option: Optional[str] = Field(default=None, max_length=150)
    level: Optional[str] = Field(default=None, max_length=20)
    year: Optional[str] = Field(default=None, max_length=20)

    # ── Relationships ─────────────────────────────────────────────────────────
    user: Optional["User"] = Relationship(back_populates="profile")


# ─── RefreshToken ─────────────────────────────────────────────────────────────

class RefreshToken(BaseModel, table=True):
    """Tracked refresh token session."""
    __tablename__ = "refresh_token"
    __table_args__ = (
        Index("ix_refresh_tokens_user_revoked", "user_id", "revoked"),
        Index("ix_refresh_tokens_jti_revoked", "jti", "revoked"),
    )

    user_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    jti: str = Field(
        sa_column=Column(
            String(36),
            nullable=False,
            unique=True,
            index=True,
            comment="JWT ID claim",
        )
    )
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    revoked: bool = Field(default=False, nullable=False, index=True)
    revoked_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    device_hint: Optional[str] = Field(default=None, max_length=500)
    ip_address: Optional[str] = Field(default=None, max_length=45)

    # ── Relationships ─────────────────────────────────────────────────────────
    user: Optional["User"] = Relationship(back_populates="refresh_tokens")


# ─── PasswordResetToken ───────────────────────────────────────────────────────

class PasswordResetToken(BaseModel, table=True):
    """Single-use token for password reset AND email verification."""
    __tablename__ = "password_reset_token"
    __table_args__ = (
        Index("ix_password_reset_tokens_user_purpose_used", "user_id", "token_purpose", "used"),
    )

    user_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    token_hash: str = Field(
        sa_column=Column(
            String(64),
            nullable=False,
            unique=True,
            index=True,
        )
    )
    token_purpose: str = Field(
        default="PASSWORD_RESET",
        sa_column=Column(String(30), nullable=False)
    )
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    used: bool = Field(default=False, nullable=False, index=True)
    used_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    user: Optional["User"] = Relationship(back_populates="password_reset_tokens")
