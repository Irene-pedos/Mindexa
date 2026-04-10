"""
main.py

FastAPI application entry point.

Responsibilities:
  - Create and configure the FastAPI application instance
  - Register middleware (order matters — outermost first)
  - Register exception handlers
  - Register all API routers with their prefixes
  - Manage application lifespan (startup/shutdown hooks)

This file stays thin — all logic lives in modules it imports.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sentry_sdk
from app.api.middleware import (RequestContextMiddleware,
                                SecurityHeadersMiddleware)
from app.api.routes import health
from app.core.config import settings
from app.core.handlers import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.redis import close_redis, init_redis
from app.db.session import dispose_engine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

# Initialise logging first — before anything else runs
configure_logging()
logger = get_logger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan handler.
    Code before `yield` runs at startup.
    Code after `yield` runs at shutdown.

    Startup order matters:
    1. Logging (already done at module level above)
    2. Sentry (capture errors from all subsequent steps)
    3. Redis (needed for auth/cache — before first request)
    4. DB connectivity check (fail fast if DB is unreachable)
    5. Upload directory (must exist before any file upload)
    """

    # ── Startup ───────────────────────────────────────────────────────────────
    logger.info(
        "application_starting",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
    )

    # Sentry — initialise before any I/O so exceptions during startup are captured
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
            send_default_pii=False,   # Never send PII to Sentry
        )
        logger.info("sentry_initialised")

    # Redis connection
    await init_redis()

    # Database connectivity check (fail fast on misconfiguration)
    from app.db.session import check_db_health
    if not await check_db_health():
        logger.error("database_unreachable_on_startup")
        raise RuntimeError(
            "Cannot connect to the database. Check POSTGRES_* environment variables."
        )
    logger.info("database_connectivity_verified")

    # Ensure upload directory exists
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("upload_directory_ready", path=str(settings.UPLOAD_DIR))

    logger.info("application_ready")

    yield  # ── Application serves requests here ─────────────────────────────

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("application_shutting_down")
    await close_redis()
    await dispose_engine()
    logger.info("application_shutdown_complete")


# ── Application Factory ───────────────────────────────────────────────────────

def create_application() -> FastAPI:
    """
    Create and configure the FastAPI application.
    Returns a ready-to-serve application instance.
    """
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "Mindexa Platform — Secure Academic Assessment Operating System. "
            "API documentation for internal use only."
        ),
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # ── Middleware (outermost registered first) ────────────────────────────────
    # 1. Request context (request_id, structured logging)
    app.add_middleware(RequestContextMiddleware)

    # 2. Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # 3. CORS — must be after security middleware, before routing
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Request-ID",
            "X-Attempt-Token",   # Custom header for assessment attempt sessions
        ],
        expose_headers=["X-Request-ID"],
    )

    # ── Exception Handlers ────────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Routers ───────────────────────────────────────────────────────────────
    # Health checks — no auth, no versioning
    app.include_router(health.router, prefix="/health")

    # ── Phase 3: Authentication ───────────────────────────────────────────────
    # Auth router is registered at /api/v1 — the router itself adds /auth prefix
    # so all endpoints are at /api/v1/auth/*
    from app.api.v1.routes.auth import router as auth_router
    app.include_router(auth_router, prefix="/api/v1")

    # ── Future routers — uncomment as phases are built ────────────────────────
    # from app.api.v1.routes.academic import router as academic_router
    # app.include_router(academic_router, prefix="/api/v1")
    #
    # from app.api.v1.routes.assessments import router as assessments_router
    # app.include_router(assessments_router, prefix="/api/v1")
    #
    # from app.api.v1.routes.attempts import router as attempts_router
    # app.include_router(attempts_router, prefix="/api/v1")
    #
    # from app.api.v1.routes.grading import router as grading_router
    # app.include_router(grading_router, prefix="/api/v1")
    #
    # from app.api.v1.routes.integrity import router as integrity_router
    # app.include_router(integrity_router, prefix="/api/v1")
    #
    # from app.api.v1.routes.resources import router as resources_router
    # app.include_router(resources_router, prefix="/api/v1")
    #
    # from app.api.v1.routes.admin import router as admin_router
    # app.include_router(admin_router, prefix="/api/v1")

    return app


# ── Application Instance ──────────────────────────────────────────────────────

app: FastAPI = create_application()


# ── Development Entry Point ───────────────────────────────────────────────────
# Run with: uvicorn app.main:app --reload
# Or:        python -m app.main

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_development,
        log_config=None,        # Disable uvicorn's default logging — we use structlog
        access_log=False,       # We log requests in RequestContextMiddleware
        workers=1 if settings.is_development else 4,
    )
