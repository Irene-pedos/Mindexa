"""
app/core/config.py

Application configuration loaded from environment variables via Pydantic Settings.
All settings are validated at startup — missing or wrongly-typed variables cause
an immediate startup failure with a clear error message.

Usage anywhere in the codebase:
    from app.core.config import settings
    settings.DATABASE_URL
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    ENVIRONMENT: str = Field(
        default="development",
        pattern="^(development|staging|production|test)$",
    )
    APP_NAME: str = "Mindexa Platform"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    SECRET_KEY: str = Field(..., min_length=32)
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = Field(default=5432, ge=1, le=65535)
    POSTGRES_USER: str = "mindexa"
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str = "mindexa_db"

    # Assembled automatically by model_validator — do not set manually in .env
    DATABASE_URL: str = ""
    DATABASE_URL_SYNC: str = ""

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = Field(default=6379, ge=1, le=65535)
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = Field(default=0, ge=0, le=15)
    REDIS_DB_CELERY: int = Field(default=1, ge=0, le=15)

    REDIS_URL: str = ""
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, ge=5, le=1440)
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, ge=1, le=30)

    # ── Password Policy ───────────────────────────────────────────────────────
    PASSWORD_MIN_LENGTH: int = Field(default=8, ge=6, le=128)
    BCRYPT_ROUNDS: int = Field(default=12, ge=10, le=16)

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_AI: str = "20/minute"

    # ── File Upload ───────────────────────────────────────────────────────────
    # Relative path — pathlib.Path handles Windows backslashes automatically
    UPLOAD_DIR: Path = Path("./uploads")
    MAX_UPLOAD_SIZE_MB: int = Field(default=25, ge=1, le=100)
    ALLOWED_UPLOAD_EXTENSIONS: list[str] = [
        "pdf", "docx", "pptx", "txt", "png", "jpg", "jpeg",
    ]

    # ── AI / OpenAI ───────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL_CHAT: str = "gpt-4o"
    OPENAI_MODEL_EMBEDDING: str = "text-embedding-3-small"
    OPENAI_EMBEDDING_DIMENSIONS: int = 1536

    # ── Email ─────────────────────────────────────────────────────────────────
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "noreply@mindexa.ac"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.example.com"
    MAIL_FROM_NAME: str = "Mindexa Platform"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False

    # ── Celery ────────────────────────────────────────────────────────────────
    CELERY_TASK_ALWAYS_EAGER: bool = False

    # ── Sentry ────────────────────────────────────────────────────────────────
    SENTRY_DSN: str = ""

    # ── URL Assembly ─────────────────────────────────────────────────────────

    @model_validator(mode="after")
    def assemble_urls(self) -> "Settings":
        """Build all connection strings from their component parts."""
        if not self.DATABASE_URL:
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        if not self.DATABASE_URL_SYNC:
            self.DATABASE_URL_SYNC = (
                f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )

        redis_auth = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        if not self.REDIS_URL:
            self.REDIS_URL = (
                f"redis://{redis_auth}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
            )
        if not self.CELERY_BROKER_URL:
            self.CELERY_BROKER_URL = (
                f"redis://{redis_auth}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB_CELERY}"
            )
        if not self.CELERY_RESULT_BACKEND:
            self.CELERY_RESULT_BACKEND = self.CELERY_BROKER_URL

        return self

    # ── Convenience Properties ────────────────────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_test(self) -> bool:
        return self.ENVIRONMENT == "test"

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def access_token_expire_seconds(self) -> int:
        return self.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60

    @property
    def refresh_token_expire_seconds(self) -> int:
        return self.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Cached singleton. Call get_settings.cache_clear() in tests to reload.
    """
    # Pydantic Settings will attempt to read these from the environment or .env file.
    # We pass empty strings as defaults here only to satisfy static analysis if needed,
    # but the Field(...) in the class definition ensures they must be provided
    # at runtime via environment variables or the .env file.
    return Settings()  # type: ignore


settings: Settings = get_settings()
