"""
app/main.py

FastAPI application entry point.

Responsibilities:
  - Create and configure the FastAPI application instance
  - Register middleware in the correct order (outermost first)
  - Register exception handlers
  - Register all API routers with their prefixes
  - Manage application lifespan (startup / shutdown hooks)
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from app.api.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from app.api.routes import health
from app.core.config import settings
from app.core.handlers import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.redis import close_redis, init_redis
from app.db.session import dispose_engine

# Initialise logging first — before anything else runs
configure_logging()
logger = get_logger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Startup code runs before yield.
    Shutdown code runs after yield.
    """

    logger.info(
        "application_starting",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
    )

    # Sentry — initialise before any I/O so startup errors are captured
    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            release=f"{settings.APP_NAME}@{settings.APP_VERSION}",
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
            ],
            traces_sample_rate=0.1 if settings.is_production else 1.0,
            send_default_pii=False,
        )
        logger.info("sentry_initialised")

    # Redis
    await init_redis()

    # Database connectivity check — fail fast if misconfigured
    from app.db.session import check_db_health
    if not await check_db_health():
        logger.error("database_unreachable_on_startup")
        raise RuntimeError(
            "Cannot connect to the database. "
            "Check POSTGRES_* environment variables in your .env file."
        )
    logger.info("database_connectivity_verified")

    # Ensure upload directory exists (pathlib handles Windows paths correctly)
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("upload_directory_ready", path=str(settings.UPLOAD_DIR))

    logger.info("application_ready")

    yield  # ── Application serves requests here ──────────────────────────────

    logger.info("application_shutting_down")
    await close_redis()
    await dispose_engine()
    logger.info("application_shutdown_complete")


# ── Application Factory ───────────────────────────────────────────────────────

def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "Mindexa Platform — Secure Academic Assessment Operating System."
        ),
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # ── Middleware (outermost registered first) ───────────────────────────────
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Request-ID",
            "X-Attempt-Token",
        ],
        expose_headers=["X-Request-ID"],
    )

    # ── Exception Handlers ────────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Routers ───────────────────────────────────────────────────────────────
    # Health — no auth, no versioning
    app.include_router(health.router, prefix="/health")

    # Versioned API routes added here as phases progress:
    # from app.api.routes import auth, users, courses, assessments, grading, integrity
    # app.include_router(auth.router,        prefix="/api/v1/auth",        tags=["Auth"])
    # app.include_router(users.router,       prefix="/api/v1/users",       tags=["Users"])
    # app.include_router(courses.router,     prefix="/api/v1/courses",     tags=["Courses"])
    # app.include_router(assessments.router, prefix="/api/v1/assessments", tags=["Assessments"])
    # app.include_router(grading.router,     prefix="/api/v1/grading",     tags=["Grading"])
    # app.include_router(integrity.router,   prefix="/api/v1/integrity",   tags=["Integrity"])

    return app


app: FastAPI = create_application()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_development,
        log_config=None,
        access_log=False,
    )
