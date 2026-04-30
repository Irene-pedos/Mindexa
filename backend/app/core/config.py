"""
app/core/config.py

Central settings module for Mindexa Platform.

All configuration is driven by environment variables.
Never hardcode secrets. Use .env for local development.

USAGE:
    from app.core.config import settings

    jwt_secret = settings.SECRET_KEY
    max_attempts = settings.MAX_FAILED_LOGIN_ATTEMPTS
"""

from functools import lru_cache
from typing import Literal
from urllib.parse import quote

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings resolved from environment variables.

    All fields with defaults are safe to use without explicit env config.
    Fields without defaults MUST be set in the environment or .env file.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ─── Application ──────────────────────────────────────────────────────────
    APP_NAME: str = "Mindexa Platform"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["development", "staging", "production", "test"] = "development"
    DEBUG: bool = False

    # ─── Server ───────────────────────────────────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1
    docs_enabled: bool = True

    # ─── Security / Secrets ───────────────────────────────────────────────────
    SECRET_KEY: str | None = None
    # For future RS256 support, add PUBLIC_KEY / PRIVATE_KEY here.

    # ─── Monitoring ───────────────────────────────────────────────────────────
    SENTRY_DSN: str | None = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1
    METRICS_ENABLED: bool = False
    METRICS_API_KEY: str = ""

    # ─── JWT Configuration ────────────────────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ─── Auth / Account Security ──────────────────────────────────────────────
    EMAIL_VERIFICATION_EXPIRE_MINUTES: int = 1440  # 24 hours
    PASSWORD_RESET_EXPIRE_MINUTES: int = 60
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    ACCOUNT_LOCKOUT_MINUTES: int = 15
    RATE_LIMIT_LOGIN_PER_MINUTE: int = 5
    RATE_LIMIT_REFRESH_PER_MINUTE: int = 20
    RATE_LIMIT_DEFAULT_PER_MINUTE: int = 120

    # ─── Password Policy ──────────────────────────────────────────────────────
    BCRYPT_ROUNDS: int = 12
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_MAX_LENGTH: int = 128

    # ─── Refresh Token Cookie ─────────────────────────────────────────────────
    REFRESH_TOKEN_COOKIE_NAME: str = "mindexa_refresh"
    # MUST be True in production (requires HTTPS)
    ACCESS_TOKEN_COOKIE_SECURE: bool = False

    # ─── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    FRONTEND_URL: str = "http://localhost:3000"

    # ─── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = ""
    DATABASE_ASYNC_URL: str = ""
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_PRE_PING: bool = True
    DATABASE_ECHO: bool = False  # Set True for SQL query logging in dev
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = ""
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "mindexa_db"

    # ─── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 20
    REDIS_CACHE_DEFAULT_TTL: int = 300
    REDIS_USER_PROFILE_TTL: int = 600
    REDIS_ASSESSMENT_TTL: int = 120
    # TTL for revoked JTI cache entries (seconds); should match refresh token lifetime
    REDIS_REVOKED_JTI_TTL: int = 60 * 60 * 24 * 7  # 7 days

    # ─── Celery ───────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    CELERY_TASK_ALWAYS_EAGER: bool = False

    # ─── Rate Limiting ────────────────────────────────────────────────────────
    # ─── Email ────────────────────────────────────────────────────────────────
    # Used when email delivery is wired up (Phase N)
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    EMAILS_FROM_EMAIL: str = "noreply@mindexa.ac"
    EMAILS_FROM_NAME: str = "Mindexa Platform"
    # In development, log emails instead of sending
    EMAIL_DEV_MODE: bool = True

    # ─── File Storage ─────────────────────────────────────────────────────────
    # local | s3
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    STORAGE_LOCAL_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 25
    ALLOWED_UPLOAD_EXTENSIONS: list[str] = [
        ".pdf",
        ".doc",
        ".docx",
        ".txt",
        ".png",
        ".jpg",
        ".jpeg",
    ]
    UPLOAD_DIR: str = "uploads"

    # AWS S3 (required only when STORAGE_BACKEND=s3)
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str | None = None
    AWS_S3_ENDPOINT_URL: str | None = None

    # ─── AI / LLM ─────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    DEFAULT_LLM_PROVIDER: Literal["openai", "anthropic"] = "openai"
    DEFAULT_EMBEDDING_MODEL: str = "text-embedding-3-small"
    DEFAULT_LLM_MODEL: str = "gpt-4o-mini"

    # ─── Google Gemini ────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_DEFAULT_MODEL: str = "gemini-1.5-flash"

    # ─── Vector Store ─────────────────────────────────────────────────────────
    VECTOR_STORE: Literal["pgvector", "qdrant"] = "pgvector"
    PGVECTOR_DIMENSION: int = 1536  # text-embedding-3-small

    # ─── Pagination ───────────────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # ─── Validators ───────────────────────────────────────────────────────────

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        if len(v) < 32:
            raise ValueError(
                "SECRET_KEY must be at least 32 characters long. "
                "Generate one with: openssl rand -hex 32"
            )
        return v

    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        """Build DATABASE_URL from POSTGRES_* settings when not explicitly provided."""
        if (
            not self.DATABASE_URL
            and self.POSTGRES_USER
            and self.POSTGRES_PASSWORD
            and self.POSTGRES_DB
        ):
            self.DATABASE_URL = (
                f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self

    @model_validator(mode="after")
    def validate_required_runtime_config(self) -> "Settings":
        """Enforce required runtime settings per environment."""
        if self.ENVIRONMENT in {"staging", "production"} and not self.SECRET_KEY:
            raise ValueError(
                "SECRET_KEY is required in staging/production. "
                "Set SECRET_KEY via environment variable."
            )
        if self.ENVIRONMENT != "test" and not self.DATABASE_URL:
            raise ValueError(
                "DATABASE_URL is required outside test environment. "
                "Set DATABASE_URL via environment variable or .env."
            )
        return self

    @model_validator(mode="after")
    def build_async_database_url(self) -> "Settings":
        """
        Auto-derive async database URL from sync URL if not explicitly set.

        Converts:
            postgresql://user:pass@host/db
        to:
            postgresql+asyncpg://user:pass@host/db
        """
        if not self.DATABASE_ASYNC_URL:
            sync_url = self.DATABASE_URL
            if sync_url.startswith("postgresql://"):
                self.DATABASE_ASYNC_URL = sync_url.replace(
                    "postgresql://", "postgresql+asyncpg://", 1
                )
            elif sync_url.startswith("postgres://"):
                # Heroku-style
                self.DATABASE_ASYNC_URL = sync_url.replace(
                    "postgres://", "postgresql+asyncpg://", 1
                )
            else:
                self.DATABASE_ASYNC_URL = sync_url
        return self

    @model_validator(mode="after")
    def warn_production_insecure(self) -> "Settings":
        """Warn about insecure settings in production."""
        if self.ENVIRONMENT == "production":
            if not self.ACCESS_TOKEN_COOKIE_SECURE:
                import warnings

                warnings.warn(
                    "ACCESS_TOKEN_COOKIE_SECURE=False in production! "
                    "Refresh tokens will be sent over HTTP.",
                    stacklevel=2,
                )
        return self

    @model_validator(mode="after")
    def validate_s3_config(self) -> "Settings":
        """Validate S3 configuration when S3 backend is enabled."""
        if self.STORAGE_BACKEND == "s3":
            missing = []
            if not self.AWS_ACCESS_KEY_ID:
                missing.append("AWS_ACCESS_KEY_ID")
            if not self.AWS_SECRET_ACCESS_KEY:
                missing.append("AWS_SECRET_ACCESS_KEY")
            if not self.AWS_S3_BUCKET:
                missing.append("AWS_S3_BUCKET")
            if missing:
                raise ValueError(
                    f"STORAGE_BACKEND is set to 's3' but the following "
                    f"required environment variables are missing: {', '.join(missing)}"
                )
        return self

    @model_validator(mode="after")
    def validate_metrics_config(self) -> "Settings":
        """Validate metrics config when metrics collection is enabled."""
        if self.METRICS_ENABLED and not self.METRICS_API_KEY.strip():
            raise ValueError(
                "METRICS_ENABLED is True but METRICS_API_KEY is missing. "
                "Set METRICS_API_KEY or disable metrics."
            )
        return self

    # ─── Computed Properties ──────────────────────────────────────────────────

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def access_token_expire_seconds(self) -> int:
        return self.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60

    @property
    def refresh_token_expire_seconds(self) -> int:
        return self.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60

    @property
    def email_verification_expire_seconds(self) -> int:
        return self.EMAIL_VERIFICATION_EXPIRE_MINUTES * 60

    @property
    def password_reset_expire_seconds(self) -> int:
        return self.PASSWORD_RESET_EXPIRE_MINUTES * 60

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    # ─── URL Builders ─────────────────────────────────────────────────────────

    def build_verification_url(self, token: str) -> str:
        """Build a full URL for email verification."""
        encoded_token = quote(token, safe="")
        return f"{self.FRONTEND_URL}/verify-email?token={encoded_token}"

    def build_password_reset_url(self, token: str) -> str:
        """Build a full URL for password reset."""
        encoded_token = quote(token, safe="")
        return f"{self.FRONTEND_URL}/reset-password?token={encoded_token}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return the cached Settings singleton.

    Using lru_cache ensures the .env file is only parsed once per process.
    In tests, call get_settings.cache_clear() before patching env vars.
    """
    return Settings()


# Module-level singleton — use this everywhere
settings: Settings = get_settings()
