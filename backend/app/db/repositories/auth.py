"""
app/db/repositories/auth.py

Data access layer for authentication-related tables.

REPOSITORIES:
    UserRepository             — CRUD + lookup for the `user` table
    RefreshTokenRepository     — CRUD + revocation for `refresh_token`
    PasswordResetTokenRepository — Token lifecycle for `password_reset_token`

DESIGN RULES:
    1. No business logic here — only database access.
       Auth policy decisions (lockout, role checks, etc.) belong in auth_service.

    2. All methods are async (await db.execute / await db.get).

    3. SQLModel select() is used everywhere — never raw SQL strings.

    4. Boolean column comparisons use `is_(True)` / `is_(False)` instead of
       `== True` / `== False`. This avoids SQLAlchemy warnings about ambiguous
       truthiness of Column objects and generates correct SQL.

    5. Soft-deleted users (is_deleted = True) are excluded from all queries
       unless explicitly requested. Use `.where(User.is_deleted.is_(False))`.

    6. Repositories receive an `AsyncSession` — they do NOT manage transactions.
       The service layer (or route handler with `Depends(get_db)`) owns the
       transaction boundary.

    7. Hard deletes are used for RefreshToken and PasswordResetToken because
       they are consumed/revoked at the row level, not soft-deleted.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from app.db.models.auth import (PasswordResetToken, RefreshToken, User,
                                UserProfile)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

# ─────────────────────────────────────────────────────────────────────────────
# USER REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────


class UserRepository:
    """
    Data access methods for the `user` table.

    All queries exclude soft-deleted users unless stated otherwise.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Lookups ───────────────────────────────────────────────────────────────

    async def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        """
        Fetch an active (non-deleted) user by primary key.
        Returns None if not found or soft-deleted.
        """
        result = await self.db.execute(
            select(User).where(
                User.id == user_id,
                User.is_deleted == False,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id_include_deleted(self, user_id: uuid.UUID) -> Optional[User]:
        """
        Fetch a user by primary key regardless of soft-delete status.
        Used by admin endpoints that need to inspect deleted accounts.
        """
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        """
        Fetch an active user by email address (case-insensitive).
        Email must already be normalised (lowercased) before calling this.
        Returns None if not found or soft-deleted.
        """
        result = await self.db.execute(
            select(User).where(
                User.email == email,
                User.is_deleted == False,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_email_include_deleted(self, email: str) -> Optional[User]:
        """
        Fetch a user by email regardless of soft-delete status.
        Used during registration to prevent re-use of a deleted account's email.
        """
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    # ── Existence check ───────────────────────────────────────────────────────

    async def email_exists(self, email: str) -> bool:
        """
        Check whether an email is already registered (active accounts only).
        Used during registration to give a ConflictError before hashing the password.
        """
        result = await self.db.execute(
            select(User.id).where(
                User.email == email,
                User.is_deleted == False,
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    # ── Write operations ──────────────────────────────────────────────────────

    async def create(self, user: User) -> User:
        """
        Persist a new User row.
        The caller must have constructed the User object with all required fields.
        """
        self.db.add(user)
        await self.db.flush()   # assigns PK + timestamps from DB defaults
        await self.db.refresh(user)
        return user

    async def update(self, user: User) -> User:
        """
        Persist changes to an existing User row.
        Caller mutates the user object, then calls this.
        """
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def increment_failed_attempts(self, user: User) -> None:
        """
        Atomically increment failed_login_attempts on the user object.
        Call update() after this if you also need to set locked_until.
        """
        user.failed_login_attempts += 1
        self.db.add(user)
        await self.db.flush()

    async def reset_failed_attempts(self, user: User) -> None:
        """
        Reset failed_login_attempts to 0 and clear locked_until.
        Called on successful login.
        """
        user.failed_login_attempts = 0
        user.locked_until = None
        self.db.add(user)
        await self.db.flush()

    async def set_last_login(self, user: User) -> None:
        """Update last_login_at to now (UTC). Called on token issuance."""
        user.last_login_at = datetime.now(timezone.utc)
        self.db.add(user)
        await self.db.flush()

    async def soft_delete(self, user: User) -> None:
        """Soft-delete a user account (preserves academic records)."""
        user.soft_delete()
        self.db.add(user)
        await self.db.flush()


# ─────────────────────────────────────────────────────────────────────────────
# REFRESH TOKEN REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────


class RefreshTokenRepository:
    """
    Data access methods for the `refresh_token` table.

    Refresh tokens are HARD-DELETED on revocation — this table only contains
    currently active tokens. Revocation state is tracked in Redis for
    fast O(1) blocklist checks without a DB round trip.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Lookups ───────────────────────────────────────────────────────────────

    async def get_by_jti(self, jti: str) -> Optional[RefreshToken]:
        """
        Fetch an active (non-revoked, non-deleted) refresh token by JTI.
        Returns None if the JTI is not found or has been revoked.
        """
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.jti == jti,
                RefreshToken.revoked == False,
                RefreshToken.expires_at > now,
                RefreshToken.is_deleted == False,
            )
        )
        return result.scalar_one_or_none()

    async def get_active_by_user(self, user_id: uuid.UUID) -> List[RefreshToken]:
        """
        Fetch all active (non-revoked, non-expired) refresh tokens for a user.
        Used for the "active sessions" list and logout-all operations.
        """
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked == False,
                RefreshToken.expires_at > now,
                RefreshToken.is_deleted == False,
            )
        )
        return list(result.scalars().all())

    async def count_active_by_user(self, user_id: uuid.UUID) -> int:
        """
        Count active sessions for a user.
        Used for enforcing max-sessions-per-user limits if needed.
        """
        tokens = await self.get_active_by_user(user_id)
        return len(tokens)

    # ── Write operations ──────────────────────────────────────────────────────

    async def create(self, token: RefreshToken) -> RefreshToken:
        """Persist a new refresh token row."""
        self.db.add(token)
        await self.db.flush()
        await self.db.refresh(token)
        return token

    async def revoke(self, token: RefreshToken) -> None:
        """
        Mark a single refresh token as revoked (soft revocation within the row).
        Also hard-deletes the row since the table is meant to contain only active tokens.

        The caller is responsible for pushing the JTI to the Redis blocklist
        via security.cache_revoked_jti() before calling this, so there is no
        window between the DB update and the Redis update.
        """
        token.revoked = True
        token.revoked_at = datetime.now(timezone.utc)
        self.db.add(token)
        await self.db.flush()
        # Hard-delete after marking — the Redis blocklist is the authoritative store
        await self.db.delete(token)
        await self.db.flush()

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> List[str]:
        """
        Hard-delete all active refresh tokens for a user.
        Returns the list of revoked JTIs so the caller can push them to Redis.

        Used for:
            - logout-all-devices
            - replay attack detection (one revoked token → revoke all)
            - password change (invalidate all existing sessions)
        """
        tokens = await self.get_active_by_user(user_id)
        jtis: List[str] = []
        for token in tokens:
            jtis.append(token.jti)
            await self.db.delete(token)
        await self.db.flush()
        return jtis

    async def hard_delete(self, token: RefreshToken) -> None:
        """Hard-delete a specific refresh token row."""
        await self.db.delete(token)
        await self.db.flush()

    async def delete_expired_for_user(self, user_id: uuid.UUID) -> int:
        """
        Hard-delete expired tokens for a user.
        Called opportunistically to keep the table lean.
        Returns the count of deleted rows.
        """
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.expires_at <= now,
            )
        )
        expired = list(result.scalars().all())
        for token in expired:
            await self.db.delete(token)
        await self.db.flush()
        return len(expired)


# ─────────────────────────────────────────────────────────────────────────────
# PASSWORD RESET TOKEN REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────


class PasswordResetTokenRepository:
    """
    Data access methods for the `password_reset_token` table.

    Covers both password-reset and email-verification token types.
    The token_type field distinguishes them.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Lookups ───────────────────────────────────────────────────────────────

    async def get_by_hash(
        self,
        token_hash: str,
        token_type: str,
    ) -> Optional[PasswordResetToken]:
        """
        Fetch an unused, non-expired token by its SHA-256 hash and type.

        The caller hashes the raw submitted token with security.hash_token()
        before calling this. Returns None if not found, expired, or already used.
        """
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.token_type == token_type,
                PasswordResetToken.used == False,
                PasswordResetToken.expires_at > now,
                PasswordResetToken.is_deleted == False,
            )
        )
        return result.scalar_one_or_none()

    async def get_active_for_user(
        self,
        user_id: uuid.UUID,
        token_type: str,
    ) -> Optional[PasswordResetToken]:
        """
        Fetch the most recent unused, non-expired token of a given type for a user.
        Used to invalidate existing tokens before issuing a new one.
        """
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user_id,
                PasswordResetToken.token_type == token_type,
                PasswordResetToken.used == False,
                PasswordResetToken.expires_at > now,
                PasswordResetToken.is_deleted == False,
            ).order_by(col(PasswordResetToken.created_at).desc()).limit(1)
        )
        return result.scalar_one_or_none()

    # ── Write operations ──────────────────────────────────────────────────────

    async def create(self, token: PasswordResetToken) -> PasswordResetToken:
        """Persist a new reset/verification token row."""
        self.db.add(token)
        await self.db.flush()
        await self.db.refresh(token)
        return token

    async def mark_used(self, token: PasswordResetToken) -> None:
        """
        Mark a token as used. Called immediately on successful verification.
        After this, any subsequent submission of the same raw token will fail
        the used.is_(False) check.
        """
        token.used = True
        token.used_at = datetime.now(timezone.utc)
        self.db.add(token)
        await self.db.flush()

    async def invalidate_all_for_user(
        self,
        user_id: uuid.UUID,
        token_type: str,
    ) -> int:
        """
        Hard-delete all unused tokens of a given type for a user.
        Called before issuing a new token to ensure only one is active.
        Returns the count of deleted rows.
        """
        result = await self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user_id,
                PasswordResetToken.token_type == token_type,
                PasswordResetToken.used == False,
                PasswordResetToken.is_deleted == False,
            )
        )
        tokens = list(result.scalars().all())
        for token in tokens:
            await self.db.delete(token)
        await self.db.flush()
        return len(tokens)

    async def hard_delete(self, token: PasswordResetToken) -> None:
        """Hard-delete a specific token row (post-use cleanup)."""
        await self.db.delete(token)
        await self.db.flush()

    async def delete_expired(self, user_id: uuid.UUID, token_type: str) -> int:
        """
        Hard-delete expired tokens for a user + type combination.
        Called opportunistically on each new token issuance.
        Returns the count of deleted rows.
        """
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user_id,
                PasswordResetToken.token_type == token_type,
                PasswordResetToken.expires_at <= now,
            )
        )
        expired = list(result.scalars().all())
        for token in expired:
            await self.db.delete(token)
        await self.db.flush()
        return len(expired)


# ─────────────────────────────────────────────────────────────────────────────
# USER PROFILE REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────


class UserProfileRepository:
    """
    Data access methods for the `user_profile` table.

    Profile is always accessed through the user relationship in most contexts.
    This repository handles the cases where direct profile manipulation is needed.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_user_id(self, user_id: uuid.UUID) -> Optional[UserProfile]:
        """Fetch the profile for a given user_id."""
        result = await self.db.execute(
            select(UserProfile).where(
                UserProfile.user_id == user_id,
                UserProfile.is_deleted == False,
            )
        )
        return result.scalar_one_or_none()

    async def create(self, profile: UserProfile) -> UserProfile:
        """Persist a new UserProfile row."""
        self.db.add(profile)
        await self.db.flush()
        await self.db.refresh(profile)
        return profile

    async def update(self, profile: UserProfile) -> UserProfile:
        """Persist changes to an existing UserProfile."""
        self.db.add(profile)
        await self.db.flush()
        await self.db.refresh(profile)
        return profile
