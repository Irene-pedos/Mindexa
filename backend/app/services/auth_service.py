"""
app/services/auth_service.py

Authentication service — all auth business logic for Mindexa.

RESPONSIBILITIES:
    - User registration (create account + profile + verification token)
    - Login (verify credentials, issue tokens, track login events)
    - Token refresh with rotation (revoke old, issue new)
    - Logout (single session and all sessions)
    - Email verification (consume token, activate account)
    - Password reset (request + confirm)
    - Authenticated password change
    - Current user loading (for dependencies)

DESIGN RULES:
    1. No route logic here — routes call service methods and return schemas
    2. No raw SQL — uses repositories for all DB access
    3. No db.commit() — commits happen at the request boundary in get_db()
       or explicitly in Celery tasks; service methods only call flush()
    4. Security events are written fire-and-forget (try/except wraps them)
    5. Email sending is NOT done here — routes call tasks after service returns
    6. All methods are async — no blocking operations

IMPORT ALIGNMENT:
    - Enums from app.core.constants (UserRole, UserStatus, TokenType)
    - Exceptions from app.core.exceptions (MindexaException subclasses)
    - Crypto from app.core.security (hash_password, verify_password,
      create_access_token, create_refresh_token, decode_token,
      generate_secure_token, TokenPayload, TokenType)
    - Redis from app.core.redis (cache_revoked_jti, is_jti_revoked_in_cache)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.constants import (
    SecurityEventSeverity,
    SecurityEventType,
    TokenType,
    UserRole,
    UserStatus,
)
from app.core.exceptions import (
    AccountLockedError,
    AlreadyExistsError,
    AuthenticationError,
    InvalidTokenError,
    NotFoundError,
    PermissionDeniedError,
)
from app.core.logger import get_logger
from app.core.redis import cache_revoked_jti, is_jti_revoked_in_cache
from app.core.security import (
    TokenPayload,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_secure_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.models.auth import PasswordResetToken, RefreshToken, User, UserProfile
from app.db.repositories.auth import (
    PasswordResetTokenRepository,
    RefreshTokenRepository,
    UserRepository,
)

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS (module-level, no DB access)
# ─────────────────────────────────────────────────────────────────────────────


def _dummy_bcrypt_verify() -> None:
    """
    Perform a dummy bcrypt operation to consume consistent time.

    Called when a login attempt uses an email that is not registered.
    Without this, an attacker observing response times could distinguish
    "email not found" (fast — no bcrypt) from "wrong password" (slow — bcrypt).
    Both paths become equally slow.

    Uses rounds=4 (minimum) because this is defensive rather than security-critical.
    The real bcrypt cost (settings.BCRYPT_ROUNDS) applies to real password hashes.
    """
    bcrypt.checkpw(b"dummy_password_that_never_matches", bcrypt.gensalt(rounds=4))


# ─────────────────────────────────────────────────────────────────────────────
# AUTH SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class AuthService:
    """
    Authentication service for Mindexa Platform.

    Instantiated per-request via FastAPI dependency injection.
    Receives a SQLAlchemy AsyncSession and constructs repository instances.

    Usage in a route:
        async def login_endpoint(
            body: LoginRequest,
            db: AsyncSession = Depends(get_db),
        ):
            svc = AuthService(db)
            result = await svc.login(body.email, body.password, ip="...")
            return result
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._users = UserRepository(db)
        self._refresh_tokens = RefreshTokenRepository(db)
        self._reset_tokens = PasswordResetTokenRepository(db)

    # ─────────────────────────────────────────────────────────────────────────
    # REGISTRATION
    # ─────────────────────────────────────────────────────────────────────────

    async def register(
        self,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        role: UserRole = UserRole.STUDENT,
        ip_address: str | None = None,
    ) -> tuple:
        """
        Create a new user account with profile and issue a verification token.

        FLOW:
            1. Check for duplicate email
            2. Hash password
            3. Create User row (status=PENDING_VERIFICATION)
            4. Create UserProfile row
            5. Generate email verification token
            6. Record security event (best-effort)

        Returns:
            (User, raw_verification_token)

            The raw_verification_token must be included in the verification
            email URL. It is NEVER stored in the database — only its hash is.

        Raises:
            AlreadyExistsError — if email is already registered
        """
        # email is already normalised by the route validator (EmailStr lowercases)
        if await self._users.email_exists(email):
            raise AlreadyExistsError("User")

        hashed = hash_password(password)

        user = User(
            email=email,
            hashed_password=hashed,
            role=role,
            status=UserStatus.PENDING_VERIFICATION,
            email_verified=False,
            failed_login_attempts=0,
        )
        user_profile = UserProfile(
            user_id=user.id,
            first_name=first_name,
            last_name=last_name,
        )

        await self._users.create(user)
        user_profile.user_id = user.id
        self.db.add(user_profile)
        await self.db.flush()

        raw_token = await self._create_verification_token(user.id)

        await self._record_security_event(
            event_type=SecurityEventType.ACCOUNT_CREATED,
            user_id=user.id,
            severity=SecurityEventSeverity.INFO,
            ip_address=ip_address,
        )

        logger.info(
            "user_registered",
            extra={
                "user_id": str(user.id),
                "email": email,
                "role": role.value,
            },
        )

        return user, raw_token

    # ─────────────────────────────────────────────────────────────────────────
    # LOGIN
    # ─────────────────────────────────────────────────────────────────────────

    async def login(
        self,
        email: str,
        password: str,
        ip_address: str | None = None,
        device_hint: str | None = None,
    ) -> dict:
        """
        Authenticate a user with email + password and issue token pair.

        ENUMERATION PREVENTION:
            If the email does not exist, we still run a dummy bcrypt check to
            equalise response time, then raise the same vague error as a wrong
            password. This prevents timing-based email enumeration.

        LOCKOUT LOGIC:
            - Threshold:  settings.MAX_FAILED_LOGIN_ATTEMPTS (default 5)
            - Duration:   settings.ACCOUNT_LOCKOUT_MINUTES (default 15)
            - On success: failed_login_attempts reset to 0, locked_until cleared
            - On failure: counter increments; at threshold the account locks

        Returns:
            {
                "access_token":  str,
                "token_type":    "bearer",
                "expires_in":    int (seconds),
                "refresh_token": str,
                "jti":           str,
                "user_id":       UUID,
                "role":          str,
                "email":         str,
            }

        Raises:
            AuthenticationError  — bad credentials (vague — same for all failure modes)
            PermissionDeniedError — account suspended or inactive
            InvalidTokenError     — account locked (reuses token error for simplicity)
        """
        user = await self._users.get_by_email(email)

        if user is None:
            _dummy_bcrypt_verify()
            await self._record_security_event(
                event_type=SecurityEventType.LOGIN_FAILED,
                user_id=None,
                severity=SecurityEventSeverity.LOW,
                ip_address=ip_address,
                details={"reason": "unknown_email"},
            )
            raise AuthenticationError("Invalid email or password.")

        # Account status gates
        self._enforce_login_status(user)

        # Temporary lockout check
        if user.locked_until and user.locked_until > datetime.now(UTC):
            await self._record_security_event(
                event_type=SecurityEventType.LOGIN_LOCKED,
                user_id=user.id,
                severity=SecurityEventSeverity.MEDIUM,
                ip_address=ip_address,
            )
            raise AccountLockedError(
                locked_until=user.locked_until,
                detail=(
                    "Account is temporarily locked due to too many failed attempts. "
                    "Please try again later."
                ),
            )

        # Password verification — timing-safe via bcrypt.checkpw
        if not verify_password(password, user.hashed_password):
            await self._users.increment_failed_attempts(user)
            new_count = user.failed_login_attempts

            if new_count and new_count >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
                locked_until = datetime.now(UTC) + timedelta(
                    minutes=settings.ACCOUNT_LOCKOUT_MINUTES
                )
                user.locked_until = locked_until
                await self._users.update(user)

                await self._record_security_event(
                    event_type=SecurityEventType.LOGIN_LOCKED,
                    user_id=user.id,
                    severity=SecurityEventSeverity.CRITICAL,
                    ip_address=ip_address,
                    details={"failed_count": new_count},
                )
                logger.warning(
                    "account_locked",
                    extra={
                        "user_id": str(user.id),
                        "failed_count": new_count,
                    },
                )
                # Still raise the same vague error — don't reveal lockout reason
                raise AuthenticationError("Invalid email or password.")

            await self._record_security_event(
                event_type=SecurityEventType.LOGIN_FAILED,
                user_id=user.id,
                severity=SecurityEventSeverity.LOW,
                ip_address=ip_address,
                details={"failed_count": new_count},
            )
            raise AuthenticationError("Invalid email or password.")

        # ── Successful authentication ──────────────────────────────────────
        await self._users.set_last_login(user)

        access_token, _access_jti, access_expires_at = create_access_token(
            user_id=str(user.id),
            role=user.role,
            email=user.email,
            return_expires=True,
        )
        refresh_token_str, refresh_jti, refresh_expires_at = create_refresh_token(
            str(user.id),
            return_expires=True,
        )

        new_refresh_token = RefreshToken(
            user_id=user.id,
            jti=refresh_jti,
            expires_at=refresh_expires_at,
            device_hint=device_hint,
            ip_address=ip_address,
        )
        await self._refresh_tokens.create(new_refresh_token)

        await self._record_security_event(
            event_type=SecurityEventType.LOGIN_SUCCESS,
            user_id=user.id,
            severity=SecurityEventSeverity.INFO,
            ip_address=ip_address,
        )

        logger.info(
            "login_success",
            extra={"user_id": str(user.id), "email": user.email},
        )

        return {
            "access_token":  access_token,
            "token_type":    "bearer",
            "expires_in":    int((access_expires_at - datetime.now(UTC)).total_seconds()),
            "refresh_token": refresh_token_str,
            "jti":           refresh_jti,
            "user_id":       user.id,
            "role":          user.role,
            "email":         user.email,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # TOKEN REFRESH WITH ROTATION
    # ─────────────────────────────────────────────────────────────────────────

    async def refresh_tokens(
        self,
        refresh_token_str: str,
        ip_address: str | None = None,
    ) -> dict:
        """
        Validate a refresh token, revoke it, and issue a fresh token pair.

        ROTATION STRATEGY:
            Every successful refresh revokes the old JTI and creates a new one.
            If an already-revoked JTI is presented (token theft/replay):
                → Revoke ALL sessions for this user (security containment)
                → Raise InvalidTokenError

        The Redis blocklist is checked FIRST (fast path).
        The DB is checked SECOND (authoritative path).

        Returns:
            {"access_token": str, "token_type": "bearer",
             "expires_in": int, "refresh_token": str}

        Raises:
            InvalidTokenError — token fails validation, is revoked, or not found
            AuthenticationError — user account no longer active
        """
        # Step 1: Cryptographic validation
        payload: TokenPayload = decode_token(refresh_token_str, TokenType.REFRESH)
        jti: str = payload.jti
        user_id_str: str = payload.sub

        # Step 2: Redis fast-path revocation check
        if await is_jti_revoked_in_cache(jti):
            logger.warning(
                "refresh_token_replayed_or_stolen",
                extra={
                    "jti": jti,
                    "user_id": user_id_str,
                    "ip": ip_address,
                },
            )
            # Revoke all sessions — potential theft scenario
            try:
                uid = uuid.UUID(user_id_str)
                await self._refresh_tokens.revoke_all_for_user(uid)
            except ValueError:
                pass
            raise InvalidTokenError("Refresh token has already been revoked.")

        # Step 3: DB authoritative check
        db_token = await self._refresh_tokens.get_by_jti(jti)
        if db_token is None:
            logger.warning(
                "refresh_token_not_in_db",
                extra={
                    "jti": jti,
                    "user_id": user_id_str,
                },
            )
            raise InvalidTokenError("Refresh token is not valid.")

        # Step 4: Load user and confirm still active
        try:
            uid = uuid.UUID(user_id_str)
        except ValueError:
            raise InvalidTokenError("Token contains an invalid user ID.")

        user = await self._users.get_by_id(uid)
        if user is None:
            raise InvalidTokenError("User account associated with this token no longer exists.")

        self._enforce_token_use_status(user)

        # Step 5: Revoke the old token — DB + Redis blocklist
        await self._refresh_tokens.revoke(db_token)

        now = datetime.now(UTC)
        remaining_ttl = max(0, int((db_token.expires_at - now).total_seconds()))
        if remaining_ttl > 0:
            await cache_revoked_jti(jti, remaining_ttl)

        # Step 6: Issue fresh token pair
        new_access_token, _access_jti, access_expires_at = create_access_token(
            user_id=str(user.id),
            role=user.role,
            email=user.email,
            return_expires=True,
        )
        new_refresh_str, new_jti, new_refresh_expires_at = create_refresh_token(
            str(user.id), return_expires=True
        )

        await self._refresh_tokens.create(RefreshToken(
            user_id=user.id,
            jti=new_jti,
            expires_at=new_refresh_expires_at,
            device_hint=db_token.device_hint,
            ip_address=ip_address,
        ))

        await self._record_security_event(
            event_type=SecurityEventType.TOKEN_REFRESHED,
            user_id=user.id,
            severity=SecurityEventSeverity.INFO,
            ip_address=ip_address,
        )

        return {
            "access_token":  new_access_token,
            "token_type":    "bearer",
            "expires_in":    int((access_expires_at - datetime.now(UTC)).total_seconds()),
            "refresh_token": new_refresh_str,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # LOGOUT
    # ─────────────────────────────────────────────────────────────────────────

    async def logout(
        self,
        refresh_token_str: str,
        user_id: uuid.UUID,
        ip_address: str | None = None,
    ) -> None:
        """
        Revoke the current session's refresh token.

        If the token is already revoked or not found, silently succeeds.
        Logout must always succeed from the user's perspective.
        """
        try:
            payload = decode_token(refresh_token_str, TokenType.REFRESH)
            jti = payload.jti
        except Exception:
            # Malformed token on logout — still count as success
            logger.debug(
                "logout_with_invalid_token",
                extra={"user_id": str(user_id)},
            )
            return

        token_to_revoke = await self._refresh_tokens.get_by_jti(jti)
        revoked = False
        if token_to_revoke:
            # Ensure the token belongs to the current user for security
            if token_to_revoke.user_id == user_id:
                await self._refresh_tokens.revoke(token_to_revoke)
                revoked = True

        if revoked:
            # Push to Redis blocklist to immediately block in-flight requests
            await cache_revoked_jti(jti, settings.refresh_token_expire_seconds)

        await self._record_security_event(
            event_type=SecurityEventType.LOGOUT,
            user_id=user_id,
            severity=SecurityEventSeverity.INFO,
            ip_address=ip_address,
        )

        logger.info(
            "user_logged_out",
            extra={"user_id": str(user_id)},
        )

    async def logout_all_sessions(
        self,
        user_id: uuid.UUID,
        ip_address: str | None = None,
    ) -> int:
        """
        Revoke all refresh tokens for a user — logout from all devices.

        Note: We do not push each JTI to Redis individually (expensive for
        many sessions). Active JTIs will be caught by the DB check on next use.
        The Redis blocklist is the fast path; DB is the authoritative path.

        Returns the number of sessions revoked.
        """
        revoked_jtis = await self._refresh_tokens.revoke_all_for_user(user_id)
        count = len(revoked_jtis)

        # It's better to also blocklist these JTIs in Redis
        # for immediate effect, although the docstring says otherwise.

        await self._record_security_event(
            event_type=SecurityEventType.LOGOUT_ALL,
            user_id=user_id,
            severity=SecurityEventSeverity.INFO,
            ip_address=ip_address,
            details={"sessions_revoked": count},
        )

        logger.info(
            "all_sessions_revoked",
            extra={"user_id": str(user_id), "count": count},
        )
        return count

    # ─────────────────────────────────────────────────────────────────────────
    # EMAIL VERIFICATION
    # ─────────────────────────────────────────────────────────────────────────

    async def verify_email(
        self,
        raw_token: str,
        ip_address: str | None = None,
    ):
        """
        Verify a user's email using the raw token from their verification email.

        FLOW:
            1. Hash the raw token (SHA-256)
            2. Look up a valid verification token in DB
            3. Load the user
            4. If already verified — consume token and return (idempotent)
            5. Mark email verified + upgrade status to ACTIVE
            6. Consume the token (mark used)

        Raises:
            InvalidTokenError — token not found, expired, or already used
        """
        token_hash = hash_token(raw_token)
        db_token = await self._reset_tokens.get_by_hash(
            token_hash,
            token_purpose=TokenType.EMAIL_VERIFICATION.value,
        )

        if db_token is None:
            raise InvalidTokenError(
                "Email verification link is invalid or has expired. "
                "Please request a new verification email."
            )

        user = await self._users.get_by_id(db_token.user_id)
        if user is None:
            raise InvalidTokenError("User account not found.")

        if user.email_verified:
            # Idempotent — already verified, consume token and succeed silently
            await self._reset_tokens.mark_used(db_token)
            return user

        user.email_verified = True
        user.email_verified_at = datetime.now(UTC)
        user.status = UserStatus.ACTIVE
        await self._users.update(user)

        await self._reset_tokens.mark_used(db_token)

        logger.info(
            "email_verified",
            extra={"user_id": str(user.id), "email": user.email},
        )
        return user

    async def resend_verification_email(
        self,
        email: str,
        ip_address: str | None = None,
    ) -> tuple[User | None, str | None]:
        """
        Generate a new email verification token for an unverified user.

        Returns (User, raw_token) to include in the verification email.
        Returns (None, None) silently if the email is not found or already verified
        (prevents email enumeration — the route always returns the same message).
        """
        user = await self._users.get_by_email(email)

        if user is None or user.email_verified:
            return None, None

        # Invalidate any old outstanding verification tokens for this user
        await self._reset_tokens.invalidate_all_for_user(
            user.id, token_purpose=TokenType.EMAIL_VERIFICATION.value
        )

        raw_token = await self._create_verification_token(user.id)

        logger.info(
            "verification_email_resent",
            extra={
                "user_id": str(user.id),
                "email": user.email,
            },
        )
        return user, raw_token

    # ─────────────────────────────────────────────────────────────────────────
    # PASSWORD RESET
    # ─────────────────────────────────────────────────────────────────────────

    async def request_password_reset(
        self,
        email: str,
        ip_address: str | None = None,
    ) -> tuple[User | None, str | None]:
        """
        Initiate the password reset flow for the given email.

        Returns (User, raw_token) to include in the reset email.
        Returns (None, None) silently if the email is not registered
        (prevents email enumeration — the route always returns the same message).
        """
        user = await self._users.get_by_email(email)

        if user is None:
            return None, None

        # Invalidate any previous unused reset tokens for this user
        await self._reset_tokens.invalidate_all_for_user(
            user.id, token_purpose=TokenType.PASSWORD_RESET.value
        )

        raw_token = generate_secure_token()
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(UTC) + timedelta(
            minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES
        )

        await self._reset_tokens.create(PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            token_purpose=TokenType.PASSWORD_RESET.value,
        ))

        await self._record_security_event(
            event_type=SecurityEventType.PASSWORD_RESET_REQUESTED,
            user_id=user.id,
            severity=SecurityEventSeverity.INFO,
            ip_address=ip_address,
        )

        logger.info(
            "password_reset_requested",
            extra={
                "user_id": str(user.id),
                "email": email,
            },
        )
        return user, raw_token

    async def confirm_password_reset(
        self,
        raw_token: str,
        new_password: str,
        ip_address: str | None = None,
    ):
        """
        Complete a password reset using the token from the reset email.

        FLOW:
            1. Hash the raw token
            2. Find a valid reset token in DB
            3. Load user
            4. Hash and set new password
            5. Consume the reset token
            6. Revoke ALL existing sessions (force re-login everywhere)
            7. Record security event

        Raises:
            InvalidTokenError — token not found, expired, or already used
        """
        token_hash = hash_token(raw_token)
        db_token = await self._reset_tokens.get_by_hash(
            token_hash,
            token_purpose=TokenType.PASSWORD_RESET.value,
        )

        if db_token is None:
            raise InvalidTokenError(
                "Password reset link is invalid or has expired. "
                "Please request a new reset link."
            )

        user = await self._users.get_by_id(db_token.user_id)
        if user is None:
            raise InvalidTokenError("User account not found.")

        new_hashed = hash_password(new_password)
        user.hashed_password = new_hashed
        await self._users.update(user)
        await self._reset_tokens.mark_used(db_token)

        # Revoke all existing sessions — user must re-authenticate with new password
        revoked_count = await self._refresh_tokens.revoke_all_for_user(user.id)

        await self._record_security_event(
            event_type=SecurityEventType.PASSWORD_RESET_COMPLETED,
            user_id=user.id,
            severity=SecurityEventSeverity.INFO,
            ip_address=ip_address,
            details={"sessions_revoked": revoked_count},
        )

        logger.info(
            "password_reset_complete",
            extra={
                "user_id": str(user.id),
                "sessions_revoked": revoked_count,
            },
        )
        return user

    async def change_password(
        self,
        user,
        current_password: str,
        new_password: str,
        ip_address: str | None = None,
        revoke_other_sessions: bool = True,
    ) -> None:
        """
        Authenticated password change (requires current password verification).

        Differs from reset: user must know their current password.
        This prevents session-hijacking attacks where someone uses an
        unattended authenticated session to change the password.

        Raises:
            AuthenticationError — current password is wrong
        """
        if not verify_password(current_password, user.hashed_password):
            raise AuthenticationError(
                "Current password is incorrect."
            )

        new_hashed = hash_password(new_password)
        user.hashed_password = new_hashed
        await self._users.update(user)

        if revoke_other_sessions:
            revoked = await self._refresh_tokens.revoke_all_for_user(user.id)
            logger.info(
                "password_changed_sessions_revoked",
                extra={
                    "user_id": str(user.id),
                    "sessions_revoked": revoked,
                },
            )

        await self._record_security_event(
            event_type=SecurityEventType.PASSWORD_CHANGED,
            user_id=user.id,
            severity=SecurityEventSeverity.INFO,
            ip_address=ip_address,
        )

        logger.info(
            "password_changed",
            extra={"user_id": str(user.id)},
        )

    # ─────────────────────────────────────────────────────────────────────────
    # CURRENT USER LOADING
    # ─────────────────────────────────────────────────────────────────────────

    async def get_user_by_id(self, user_id: uuid.UUID):
        """
        Load a user by ID with their profile eagerly loaded.

        Called by get_current_user dependency on every authenticated request.
        Does NOT enforce account status — the dependency does that separately.

        Raises:
            NotFoundError — user not found in DB
        """
        user = await self._users.get_by_id(user_id)
        if user is None:
            raise NotFoundError(resource="User", resource_id=str(user_id))
        return user

    # ─────────────────────────────────────────────────────────────────────────
    # PRIVATE HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    async def _create_verification_token(self, user_id: uuid.UUID) -> str:
        """
        Generate and persist an email verification token.
        Returns the raw token (to be included in the verification email URL).
        """
        raw_token = generate_secure_token()
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(UTC) + timedelta(
            minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES
        )
        await self._reset_tokens.create(PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            token_purpose=TokenType.EMAIL_VERIFICATION.value,
        ))
        return raw_token

    def _enforce_login_status(self, user) -> None:
        """
        Block login for accounts with non-loginable statuses.

        PENDING_VERIFICATION → allowed (user can log in but features are gated)
        ACTIVE               → allowed
        SUSPENDED            → blocked
        INACTIVE             → blocked
        """
        if user.status == UserStatus.SUSPENDED:
            raise PermissionDeniedError(
                "Your account has been suspended. "
                "Please contact your institution administrator."
            )
        if user.status == UserStatus.INACTIVE:
            raise PermissionDeniedError(
                "Your account is inactive. "
                "Please contact your institution administrator."
            )

    def _enforce_token_use_status(self, user) -> None:
        """
        Block token use for accounts that have been suspended or deactivated
        after the token was issued.

        This is the guard that catches status changes between token issuance
        and token use — ensuring that suspending a user immediately blocks
        their ability to get new tokens even if they have a valid refresh token.
        """
        self._enforce_login_status(user)

    async def _record_security_event(
        self,
        event_type: SecurityEventType,
        user_id: uuid.UUID | None,
        severity: SecurityEventSeverity = SecurityEventSeverity.INFO,
        ip_address: str | None = None,
        details: dict | None = None,
    ) -> None:
        """
        Write a security event to the audit trail.

        BEST-EFFORT: wrapped in try/except so a logging failure never blocks
        authentication flows. If the SecurityEvent model is not yet fully
        integrated, this silently no-ops.
        """
        try:
            from app.db.enums import SecurityEventSeverity as DBSecurityEventSeverity
            from app.db.enums import SecurityEventType as DBSecurityEventType
            from app.db.models.audit import SecurityEvent

            # Convert from constants.py enums to db.enums
            db_event_type = DBSecurityEventType(event_type.value)
            db_severity = DBSecurityEventSeverity(severity.value)

            event = SecurityEvent(
                event_type=db_event_type,
                severity=db_severity,
                user_id=user_id,
                ip_address=ip_address,
                details=details,
            )
            self.db.add(event)
            await self.db.flush()
        except Exception as exc:
            logger.warning(
                "security_event_write_failed",
                extra={
                    "event_type": event_type.value,
                    "user_id": str(user_id) if user_id else None,
                    "error": str(exc),
                },
            )
