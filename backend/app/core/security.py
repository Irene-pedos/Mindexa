"""
app/core/security.py

Security utilities for Mindexa Platform.

RESPONSIBILITIES:
    1. Password hashing and verification (bcrypt)
    2. JWT access token creation and decoding
    3. Refresh token creation, decoding, and JTI extraction
    4. Secure random token generation (email verification, password reset)
    5. Token hashing (SHA-256 for safe DB storage of reset/verification tokens)
    6. Email normalisation
    7. Backward-compatible function aliases for older import sites

PUBLIC API (what other modules import from here):
    - hash_password(plain) → str
    - verify_password(plain, hashed) → bool
    - normalize_email(email) → str
    - generate_secure_token(nbytes) → str
    - hash_token(raw) → str
    - verify_token_hash(raw, stored) → bool
    - create_access_token(user_id, role, email) → (token_str, expires_at)
    - create_refresh_token(user_id) → (token_str, jti, expires_at)
    - decode_token(token, expected_type) → TokenPayload
    - TokenPayload  ← dataclass carrying decoded JWT fields

DESIGN DECISIONS:
    - bcrypt is used for passwords. Work factor is env-configurable (BCRYPT_ROUNDS).
    - JWTs use HS256 (symmetric). SECRET_KEY must be strong (≥64 chars).
    - Access tokens are stateless — NOT stored in the database.
    - Refresh tokens are tracked by JTI in PostgreSQL + Redis for fast revocation.
    - Reset / verification tokens: 32-byte URL-safe random → SHA-256 stored in DB.
    - Email is normalised (lowercased + stripped) before any storage or comparison.

IMPORTANT:
    This module has ZERO database access.
    All DB interaction belongs in repositories and services.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, overload

import bcrypt
from app.core.config import settings
from app.core.exceptions import InvalidTokenError, TokenExpiredError
from jose import JWTError, jwt

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# Literal values embedded in the JWT "type" claim.
# Using constants prevents typos and makes grep-ability easy.
TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"

# Redis key prefix for revoked JTIs (used by cache_revoked_jti / is_jti_revoked_in_cache)
_REVOKED_JTI_PREFIX = "revoked_jti:"


# ─────────────────────────────────────────────────────────────────────────────
# TokenPayload — decoded JWT claims as a typed dataclass
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class TokenPayload:
    """
    Typed representation of decoded JWT claims.

    Returned by decode_token(). All fields are strings because JWT claims
    are JSON (string values). UUIDs are kept as strings for performance —
    convert at the service layer when a uuid.UUID is needed.

    Fields:
        sub        — user_id (UUID string)
        jti        — unique token identifier (UUID string)
        token_type — "access" or "refresh"
        role       — user role string (DISPLAY ONLY — re-read from DB for auth)
        email      — user email (DISPLAY ONLY — never trusted for auth decisions)
    """

    sub: str         # user_id as string
    jti: str         # unique token id
    token_type: str  # "access" or "refresh"
    role: str = ""   # present on access tokens; empty string on refresh tokens
    email: str = ""  # present on access tokens; empty string on refresh tokens

    @property
    def user_id(self) -> str:
        """Backward-compatible alias for `sub`."""
        return self.sub

    @property
    def user_role(self) -> str:
        """Backward-compatible alias for `role`."""
        return self.role

    @property
    def type(self) -> str:
        """Backward-compatible alias for `token_type`."""
        return self.token_type


# ─────────────────────────────────────────────────────────────────────────────
# EMAIL NORMALISATION
# ─────────────────────────────────────────────────────────────────────────────


def normalize_email(email: str) -> str:
    """
    Normalise an email address to canonical form before storage or lookup.

    Rules applied (in order):
        1. Strip leading/trailing whitespace
        2. Lowercase the entire string

    We intentionally do NOT split on '+' or apply provider-specific rules
    because:
        - It risks locking out legitimate users
        - It creates unexpected behaviour across providers
        - Stricter rules can be added later without a migration

    This is the single point of truth for email normalisation.
    Call it before ANY email storage or comparison operation.
    """
    return email.strip().lower()


def mask_email(email: str) -> str:
    """
    Mask an email address for display in logs or UI.

    Examples:
        alex.rivera@mindexa.ac -> a***@mindexa.ac
        a@mindexa.ac           -> ***@mindexa.ac

    Returns the masked string.
    """
    if "@" not in email:
        return "***"

    local, domain = email.split("@", 1)
    if len(local) <= 1:
        return f"***@{domain}"

    return f"{local[0]}***@{domain}"


# ─────────────────────────────────────────────────────────────────────────────
# PASSWORD HASHING
# ─────────────────────────────────────────────────────────────────────────────


def hash_password(plain_password: str) -> str:
    """
    Hash a plain-text password using bcrypt.

    The work factor is controlled by settings.BCRYPT_ROUNDS (default 12).
    bcrypt automatically generates and embeds a random salt — the returned
    hash string is safe to store directly in the database.

    Returns the hashed password as a UTF-8 string.

    NEVER store the plain_password argument.
    Call this function and store ONLY the returned hash.
    """
    password_bytes = plain_password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain-text password against a bcrypt hash.

    bcrypt.checkpw performs a constant-time comparison internally.
    Returns True if the password matches, False otherwise.

    IMPORTANT: This function takes roughly constant time regardless of
    whether the password matches (bcrypt's timing-safe property).
    Do NOT add early-exit shortcuts around this call — that would
    re-introduce the timing side-channel that bcrypt prevents.
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        # Malformed hash — treat as non-match, never raise
        return False


def _dummy_bcrypt_verify() -> None:
    """
    Perform a fake bcrypt verification.

    Called when the requested email does not exist, so that the response
    time for "email not found" is indistinguishable from "wrong password".
    Without this, response time difference leaks whether an email is registered.

    The hash is a pre-computed bcrypt of a dummy password — it never matches
    any real password, so this operation is purely for timing parity.
    """
    _DUMMY_HASH = (
        "$2b$12$KIX/aP4.6/oA8DcFiALZKe"
        "Q2qW9.3VFkYT1b7PxB3Zq8X5mN1dAp2"
    )
    try:
        bcrypt.checkpw(b"dummy_timing_password", _DUMMY_HASH.encode("utf-8"))
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# SECURE TOKEN GENERATION  (for email verification & password reset)
# ─────────────────────────────────────────────────────────────────────────────


def generate_secure_token(nbytes: int = 32) -> str:
    """
    Generate a cryptographically secure URL-safe random token.

    Returns a URL-safe base64-encoded string of `nbytes` random bytes.
    For 32 bytes → ~43 characters.

    Use this for:
        - Email verification tokens
        - Password reset tokens

    The RAW token is what gets emailed (embedded in the URL link).
    The SHA-256 hash of the raw token is stored in the database.
    See hash_token() and verify_token_hash() below.
    """
    return secrets.token_urlsafe(nbytes)


def hash_token(raw_token: str) -> str:
    """
    Produce a SHA-256 hex digest of a raw token for safe DB storage.

    Why SHA-256 and not bcrypt?
        Reset/verification tokens are already high-entropy (32 random bytes).
        bcrypt's strength is in slowing down brute-force attacks on
        low-entropy inputs (like passwords). A 32-byte random token cannot
        be brute-forced regardless of hash speed.

        SHA-256 is fast, which matters when verifying tokens at high request
        volume. The one-way property is the only requirement here.

    Returns the hex digest string (64 characters).
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def verify_token_hash(raw_token: str, stored_hash: str) -> bool:
    """
    Constant-time comparison of a raw token against a stored SHA-256 hash.

    Uses hmac.compare_digest to prevent timing attacks where an attacker
    could infer partial hash matches from response time differences.

    Returns True if the raw_token hashes to stored_hash, False otherwise.
    """
    expected_hash = hash_token(raw_token)
    return hmac.compare_digest(expected_hash, stored_hash)


# ─────────────────────────────────────────────────────────────────────────────
# JWT ACCESS TOKENS
# ─────────────────────────────────────────────────────────────────────────────


@overload
def create_access_token(
    user_id: str | uuid.UUID,
    role: str,
    email: str,
    *,
    expires_delta: timedelta | None = None,
    return_expires: Literal[False] = False,
) -> tuple[str, str]: ...


@overload
def create_access_token(
    user_id: str | uuid.UUID,
    role: str,
    email: str,
    *,
    expires_delta: timedelta | None = None,
    return_expires: Literal[True],
) -> tuple[str, str, datetime]: ...


def create_access_token(
    user_id: str | uuid.UUID,
    role: str,
    email: str,
    *,
    expires_delta: timedelta | None = None,
    return_expires: bool = False,
) -> tuple[str, str] | tuple[str, str, datetime]:
    """
    Create a signed JWT access token.

    JWT CLAIMS:
        sub   → user ID (UUID string) — the primary identity claim
        role  → user role (CONVENIENCE / DISPLAY ONLY — backend re-reads DB)
        email → user email (for UI display — not for auth decisions)
        type  → "access" (differentiates from refresh tokens)
        jti   → unique token ID (UUID4) — for future per-token revocation
        iat   → issued-at (UTC unix timestamp)
        exp   → expiry (UTC unix timestamp)

    ROLE IN JWT:
        Included so the frontend can render role-based UI without an extra
        /me call after login. The backend NEVER trusts the role claim from
        an incoming JWT for authorization decisions. Every protected route
        re-loads the user's role from the database via get_current_user().

    Returns:
        Default: (encoded_token_string, jti_string)
        If return_expires=True: (encoded_token_string, jti_string, expiry_datetime_utc)
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    now = datetime.now(timezone.utc)
    expires_at = now + expires_delta
    role_value = role.value if hasattr(role, "value") else str(role)
    jti = str(uuid.uuid4())

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role_value,
        "email": str(email),
        "type": TOKEN_TYPE_ACCESS,
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }

    encoded = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    if return_expires:
        return encoded, jti, expires_at
    return encoded, jti


@overload
def create_refresh_token(
    user_id: str | uuid.UUID,
    *,
    expires_delta: timedelta | None = None,
    return_expires: Literal[False] = False,
) -> tuple[str, str]: ...


@overload
def create_refresh_token(
    user_id: str | uuid.UUID,
    *,
    expires_delta: timedelta | None = None,
    return_expires: Literal[True],
) -> tuple[str, str, datetime]: ...


def create_refresh_token(
    user_id: str | uuid.UUID,
    *,
    expires_delta: timedelta | None = None,
    return_expires: bool = False,
) -> tuple[str, str] | tuple[str, str, datetime]:
    """
    Create a signed JWT refresh token.

    The refresh token is also a JWT so it can be cryptographically
    validated without a DB lookup (fast path for obviously invalid tokens).
    The JTI is stored in the refresh_token table for revocation tracking.

    CLAIMS:
        sub  → user ID
        type → "refresh"
        jti  → unique identifier (stored in DB, cached in Redis on revocation)
        iat  → issued at
        exp  → expiry

    Returns:
        Default: (encoded_token_string, jti_string)
        If return_expires=True: (encoded_token_string, jti_string, expiry_datetime_utc)
    """
    if expires_delta is None:
        expires_delta = timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

    now = datetime.now(timezone.utc)
    expires_at = now + expires_delta
    jti = str(uuid.uuid4())

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": TOKEN_TYPE_REFRESH,
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }

    encoded = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    if return_expires:
        return encoded, jti, expires_at
    return encoded, jti


def decode_token(token: str, expected_type: str | Any) -> TokenPayload:
    """
    Decode and validate a JWT token (access or refresh).

    This is the SINGLE decode function for all token types. Pass
    TOKEN_TYPE_ACCESS or TOKEN_TYPE_REFRESH as expected_type.

    Validates:
        - Cryptographic signature (using settings.SECRET_KEY)
        - Expiry (exp claim)
        - Required claims presence (sub, exp, iat, jti, type)
        - Token type matches expected_type

    Raises:
        TokenExpiredError   — if the token has passed its exp timestamp
        InvalidTokenError   — if signature is bad, payload is malformed,
                              required claims are missing, or type mismatches

    Returns a TokenPayload dataclass on success.

    Usage:
        payload = decode_token(token_str, TOKEN_TYPE_ACCESS)
        payload = decode_token(token_str, TOKEN_TYPE_REFRESH)
    """
    try:
        raw = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat", "jti", "type"]},
        )
    except JWTError as exc:
        exc_str = str(exc).lower()
        if "expired" in exc_str or "exp" in exc_str:
            raise TokenExpiredError() from exc
        raise InvalidTokenError() from exc

    # Enforce token type — prevents refresh tokens being used as access tokens
    expected_type_value = (
        expected_type.value if hasattr(expected_type, "value") else str(expected_type)
    )
    if raw.get("type") != expected_type_value:
        raise InvalidTokenError(
            detail=f"Invalid token type. '{expected_type_value}' token required."
        )

    return TokenPayload(
        sub=str(raw.get("sub", "")),
        jti=str(raw.get("jti", "")),
        token_type=str(raw.get("type", "")),
        role=str(raw.get("role", "")),
        email=str(raw.get("email", "")),
    )


# ─────────────────────────────────────────────────────────────────────────────
# BACKWARD-COMPATIBLE ALIASES
# Some earlier modules were written against older function signatures.
# These aliases preserve those call sites without requiring rewrites.
# ─────────────────────────────────────────────────────────────────────────────


def decode_access_token(token: str) -> TokenPayload:
    """
    Alias for decode_token(token, TOKEN_TYPE_ACCESS).
    Kept for backward compatibility with any code using the older name.
    """
    return decode_token(token, TOKEN_TYPE_ACCESS)


def decode_refresh_token(token: str) -> TokenPayload:
    """
    Alias for decode_token(token, TOKEN_TYPE_REFRESH).
    Kept for backward compatibility with any code using the older name.
    """
    return decode_token(token, TOKEN_TYPE_REFRESH)


def create_refresh_token_payload(
    user_id: str | uuid.UUID,
    *,
    expires_delta: timedelta | None = None,
) -> tuple[str, str, datetime]:
    """
    Alias for create_refresh_token().
    Kept for backward compatibility with any code using the older name.
    """
    return create_refresh_token(
        user_id, expires_delta=expires_delta, return_expires=True
    )


# ─────────────────────────────────────────────────────────────────────────────
# REFRESH TOKEN REVOCATION CACHE  (Redis)
# ─────────────────────────────────────────────────────────────────────────────


async def cache_revoked_jti(jti: str, expires_in_seconds: int) -> None:
    """
    Push a revoked refresh token JTI to Redis with a TTL.

    The TTL matches the token's remaining lifetime — once the token would
    have expired anyway, the Redis entry auto-expires, keeping the cache lean.

    This is the FAST path for revocation checks. Redis avoids a DB hit on
    the hot token validation path. The DB (refresh_token.revoked column)
    is the authoritative source.
    """
    from app.core.redis import get_redis

    redis = await get_redis()
    key = f"{_REVOKED_JTI_PREFIX}{jti}"
    await redis.setex(key, expires_in_seconds, "1")


async def is_jti_revoked_in_cache(jti: str) -> bool:
    """
    Check whether a JTI has been marked as revoked in Redis.

    Returns True  → JTI is definitely revoked (fast path — skip DB check)
    Returns False → JTI not in revocation cache
                    (caller must still check DB for the authoritative answer)
    """
    from app.core.redis import get_redis

    redis = await get_redis()
    key = f"{_REVOKED_JTI_PREFIX}{jti}"
    result = await redis.exists(key)
    return bool(result)
