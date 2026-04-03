"""
app/core/security.py

Password hashing, JWT creation/verification, and token utilities.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings
from app.core.constants import TokenType, UserRole
from app.core.exceptions import InvalidTokenError, TokenExpiredError
from app.core.logging import get_logger
from jose import JWTError, jwt
from passlib.context import CryptContext

logger = get_logger(__name__)

_pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=settings.BCRYPT_ROUNDS,
)


def hash_password(plain_password: str) -> str:
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _pwd_context.verify(plain_password, hashed_password)


def needs_rehash(hashed_password: str) -> bool:
    return _pwd_context.needs_update(hashed_password)


def _build_token(
    subject: str,
    token_type: TokenType,
    expires_delta: timedelta,
    extra_claims: dict[str, Any] | None = None,
) -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    jti = str(uuid.uuid4())
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type.value,
        "jti": jti,
        "iat": now,
        "exp": now + expires_delta,
        "iss": settings.APP_NAME,
    }
    if extra_claims:
        payload.update(extra_claims)
    encoded = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded, jti


def create_access_token(user_id: str, role: UserRole, email: str) -> tuple[str, str]:
    return _build_token(
        subject=user_id,
        token_type=TokenType.ACCESS,
        expires_delta=timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        extra_claims={"role": role.value, "email": email},
    )


def create_refresh_token(user_id: str) -> tuple[str, str]:
    return _build_token(
        subject=user_id,
        token_type=TokenType.REFRESH,
        expires_delta=timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    )


def create_password_reset_token(user_id: str) -> tuple[str, str]:
    return _build_token(
        subject=user_id,
        token_type=TokenType.PASSWORD_RESET,
        expires_delta=timedelta(minutes=15),
    )


def create_email_verification_token(user_id: str) -> tuple[str, str]:
    return _build_token(
        subject=user_id,
        token_type=TokenType.EMAIL_VERIFICATION,
        expires_delta=timedelta(hours=24),
    )


class TokenPayload:
    __slots__ = ("sub", "type", "jti", "iat", "exp", "role", "email")

    def __init__(self, raw: dict[str, Any]) -> None:
        self.sub: str = raw["sub"]
        self.type: str = raw["type"]
        self.jti: str = raw["jti"]
        self.iat: datetime = datetime.fromtimestamp(raw["iat"], tz=timezone.utc)
        self.exp: datetime = datetime.fromtimestamp(raw["exp"], tz=timezone.utc)
        self.role: str | None = raw.get("role")
        self.email: str | None = raw.get("email")

    @property
    def user_id(self) -> str:
        return self.sub

    @property
    def user_role(self) -> UserRole | None:
        return UserRole(self.role) if self.role else None

    @property
    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) > self.exp


def decode_token(token: str, expected_type: TokenType) -> TokenPayload:
    try:
        raw = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": True},
        )
    except JWTError as exc:
        error_msg = str(exc).lower()
        if "expired" in error_msg or "exp" in error_msg:
            raise TokenExpiredError() from exc
        logger.warning("jwt_decode_failed", error=str(exc))
        raise InvalidTokenError() from exc

    payload = TokenPayload(raw)

    if payload.type != expected_type.value:
        logger.warning(
            "token_type_mismatch",
            expected=expected_type.value,
            got=payload.type,
        )
        raise InvalidTokenError(
            f"Expected a {expected_type.value} token, got {payload.type}."
        )

    return payload


def generate_secure_token(length: int = 32) -> str:
    import secrets
    return secrets.token_urlsafe(length)


def mask_email(email: str) -> str:
    local, domain = email.split("@", 1)
    masked_local = local[0] + "***" if len(local) > 1 else "***"
    return f"{masked_local}@{domain}"
