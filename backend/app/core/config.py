from __future__ import annotations

import os
from datetime import timedelta
from typing import Annotated, Any, Literal

from pydantic import (
    AnyHttpUrl,
    BeforeValidator,
    Field,
    PostgresDsn,
    RedisDsn,
    computed_field,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, (list, str)):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    ENVIRONMENT: Literal["local", "development", "staging", "production", "test"] = "local"
    DEBUG: bool = False
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Mindexa Platform"
    APP_NAME: str = "mindexa-api"
    APP_VERSION: str = "1.0.0"
    FRONTEND_URL: str = "http://localhost:3000"
    
    @property
    def docs_enabled(self) -> bool:
        """Enable Swagger UI only outside production."""
        return self.ENVIRONMENT != "production"

    @computed_field
    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT in ("local", "development")

    @computed_field
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @computed_field
    @property
    def is_test(self) -> bool:
        return self.ENVIRONMENT == "test"

    # ─── Auth ─────────────────────────────────────────────────────────────────
    SECRET_KEY: str | None = None
    BCRYPT_ROUNDS: int = 12
    PASSWORD_MIN_LENGTH: int = 12
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    ACCOUNT_LOCKOUT_MINUTES: int = 15
    
    # JWT
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days (legacy high value)
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    REFRESH_TOKEN_COOKIE_NAME: str = "mindexa_refresh_token"
    ACCESS_TOKEN_COOKIE_SECURE: bool = False
    
    EMAIL_VERIFICATION_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30

    # SMTP
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    EMAILS_FROM_EMAIL: str = "noreply@mindexa.ac"
    EMAILS_FROM_NAME: str = "Mindexa Platform"
    EMAIL_DEV_MODE: bool = True

    @computed_field
    @property
    def refresh_token_expire_seconds(self) -> int:
        return self.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60

    def build_password_reset_url(self, token: str) -> str:
        return f"http://localhost:3000/reset-password?token={token}"

    # ─── Rate Limiting ────────────────────────────────────────────────────────
    RATE_LIMIT_LOGIN_PER_MINUTE: int = 5
    RATE_LIMIT_REFRESH_PER_MINUTE: int = 20
    RATE_LIMIT_DEFAULT_PER_MINUTE: int = 120
    RATE_LIMIT_STUDENT_AI_SUPPORT_PER_HOUR: int = 30

    # ─── Database ─────────────────────────────────────────────────────────────
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5433
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "Postgre123"
    POSTGRES_DB: str = "mindexa_db"
    
    DATABASE_URL: str | None = None
    DATABASE_ASYNC_URL: str | None = None
    DATABASE_ECHO: bool = False

    @model_validator(mode="after")
    def assemble_db_urls(self) -> Settings:
        """Dynamically build sync and async database URLs."""
        sync_url = self.DATABASE_URL
        if not sync_url:
            sync_url = (
                f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
            self.DATABASE_URL = sync_url

        if not self.DATABASE_ASYNC_URL:
            if sync_url.startswith("postgresql://"):
                self.DATABASE_ASYNC_URL = sync_url.replace(
                    "postgresql://", "postgresql+asyncpg://", 1
                )
            elif sync_url.startswith("postgres://"):
                self.DATABASE_ASYNC_URL = sync_url.replace(
                    "postgres://", "postgresql+asyncpg://", 1
                )
            else:
                self.DATABASE_ASYNC_URL = sync_url

        if not self.is_development and not self.is_test:
             if not self.SECRET_KEY:
                 raise ValueError("SECRET_KEY must be set in production/staging.")

        return self

    # ─── Redis & Cache ───────────────────────────────────────────────────────
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str | None = None
    REDIS_MAX_CONNECTIONS: int = 10
    
    REDIS_USER_PROFILE_TTL: int = 3600
    REDIS_ASSESSMENT_TTL: int = 3600
    REDIS_CACHE_DEFAULT_TTL: int = 3600

    @computed_field
    @property
    def REDIS_URL(self) -> str:
        password = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"redis://{password}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    CELERY_BROKER_URL: str | None = None
    CELERY_RESULT_BACKEND: str | None = None
    CELERY_TASK_ALWAYS_EAGER: bool = False

    @model_validator(mode="after")
    def assemble_celery_urls(self) -> Settings:
        if not self.CELERY_BROKER_URL:
            self.CELERY_BROKER_URL = self.REDIS_URL
        if not self.CELERY_RESULT_BACKEND:
            self.CELERY_RESULT_BACKEND = self.REDIS_URL
        return self

    # ─── Security ─────────────────────────────────────────────────────────────
    CORS_ORIGINS: Annotated[
        list[str] | str, BeforeValidator(parse_cors)
    ] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    CORS_ALLOW_CREDENTIALS: bool = True
    METRICS_ENABLED: bool = True

    # ─── Storage ──────────────────────────────────────────────────────────────
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    STORAGE_LOCAL_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 100
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

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    # AWS S3 (required only when STORAGE_BACKEND=s3)
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str | None = None
    AWS_S3_ENDPOINT_URL: str | None = None

    # ─── AI / LLM ─────────────────────────────────────────────────────────────
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_DEFAULT_MODEL: str = "llama-3.3-70b-versatile"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    JINA_API_KEY: str = ""
    JINA_BASE_URL: str = "https://api.jina.ai/v1"
    JINA_DEFAULT_MODEL: str = "jina-embeddings-v3"
    
    DEFAULT_LLM_PROVIDER: Literal["groq", "openai", "anthropic", "gemini"] = "groq"
    DEFAULT_EMBEDDING_PROVIDER: Literal["groq", "openai", "anthropic", "jina"] = "jina"
    DEFAULT_EMBEDDING_MODEL: str = "jina-embeddings-v3"
    DEFAULT_LLM_MODEL: str = "llama-3.3-70b-versatile"
    OPENAI_DEFAULT_MODEL: str = "gpt-4o-mini"
    ANTHROPIC_DEFAULT_MODEL: str = "claude-3-5-haiku-latest"
    AI_REQUEST_TIMEOUT_SECONDS: float = 30.0
    AI_MAX_RETRIES: int = 2
    AI_RETRY_BACKOFF_SECONDS: float = 0.5
    AI_STUDENT_SUPPORT_MAX_CONTEXT_SNIPPETS: int = 5

    # ─── Google Gemini ────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_DEFAULT_MODEL: str = "gemini-2.0-flash"

    # ─── Vector Store ─────────────────────────────────────────────────────────
    VECTOR_STORE: Literal["pgvector", "qdrant"] = "pgvector"
    PGVECTOR_DIMENSION: int = 768  # Updated to 768 for jina-embeddings-v3 per RAG spec

    # ─── RAG Parameters ───────────────────────────────────────────────────────
    RAG_TOP_K: int = 5
    RAG_SIMILARITY_THRESHOLD: float = 0.35  # Lowered: cosine sim for good RAG matches is 0.40–0.65; 0.75 always triggers fallback
    RAG_CHUNK_SIZE: int = 400
    RAG_CHUNK_OVERLAP: int = 50
    MAX_STUDENT_UPLOAD_SIZE_MB: int = 10

    @property
    def max_student_upload_size_bytes(self) -> int:
        return self.MAX_STUDENT_UPLOAD_SIZE_MB * 1024 * 1024

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


def get_settings() -> Settings:
    return Settings()


settings: Settings = get_settings()
