"""
app/main.py

FastAPI application factory — Phase 7 production-hardened version.

MIDDLEWARE STACK (applied bottom-up by Starlette):
    1. SecurityHeadersMiddleware  — helmet-style headers on every response
    2. RequestLoggingMiddleware   — structured JSON request/response logs
    3. RateLimitMiddleware        — Redis-backed per-endpoint rate limiting
    4. CORSMiddleware             — strict origin whitelist, no wildcards

EXCEPTION HANDLERS:
    MindexaError                — domain errors → structured JSON
    RequestValidationError      — pydantic validation → field-level errors
    Exception (catchall)        — 500 with no stack trace in production

LIFESPAN:
    startup   — configure logging, ping Redis, optional Sentry init
    shutdown  — close Redis pool, close DB engine
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.exceptions import MindexaError
from app.core.logger import configure_logging, get_logger

# Configure structured logging FIRST — before any other imports that log
configure_logging()
logger = get_logger("mindexa.main")


# ---------------------------------------------------------------------------
# LIFESPAN
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown hooks."""

    logger.info(
        "Starting Mindexa Platform",
        extra={
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
        },
    )

    # Sentry (optional error tracking)
    if settings.SENTRY_DSN:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.fastapi import FastApiIntegration
            from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
            sentry_sdk.init(
                dsn=settings.SENTRY_DSN,
                traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
                environment=settings.ENVIRONMENT,
                release=settings.APP_VERSION,
                integrations=[
                    FastApiIntegration(transaction_style="endpoint"),
                    SqlalchemyIntegration(),
                ],
            )
            logger.info("Sentry error tracking initialized")
        except ImportError:
            logger.warning("sentry-sdk not installed — error tracking disabled")
        except Exception as exc:
            logger.error("Sentry initialization failed: %s", str(exc))

    # Redis ping
    try:
        from app.core.redis import get_redis
        redis = await get_redis()
        await redis.ping()
        logger.info("Redis connection established")
    except Exception as exc:
        logger.error("Redis unavailable — rate limiting and caching degraded: %s", str(exc))

    # DB ping
    try:
        from sqlalchemy import text

        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        logger.info("Database connection established")
    except Exception as exc:
        logger.critical("Database unavailable — cannot serve requests: %s", str(exc))

    logger.info("Mindexa Platform ready")
    yield

    # Shutdown
    logger.info("Shutting down Mindexa Platform...")
    from app.core.redis import close_redis
    from app.db.session import close_db_engine
    await close_redis()
    await close_db_engine()
    logger.info("Mindexa Platform shutdown complete")


# ---------------------------------------------------------------------------
# APPLICATION FACTORY
# ---------------------------------------------------------------------------

def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "Mindexa Platform — Security-first academic assessment and integrity "
            "management system. REST API for institutional use."
        ),
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
        swagger_ui_parameters={"persistAuthorization": True},
    )

    # ── EXCEPTION HANDLERS ────────────────────────────────────────────────────

    @app.exception_handler(MindexaError)
    async def mindexa_error_handler(request: Request, exc: MindexaError) -> JSONResponse:
        logger.warning(
            "Domain error: %s — %s %s", exc.code, request.method, request.url.path,
            extra={"error_code": exc.code, "http_status": exc.status_code},
        )
        error_response: dict[str, Any] = {
            "code": exc.code,
            "message": exc.detail,
        }
        # Only include "details" key if context is present
        if exc.context:
            error_response["details"] = exc.context

        return JSONResponse(
            status_code=exc.status_code,
            content={"error": error_response},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        field_errors: dict[str, str] = {}
        for error in exc.errors():
            loc = " → ".join(str(p) for p in error["loc"] if p != "body")
            field_errors[loc or "request"] = error["msg"]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed. Check 'details' for field-level errors.",
                    "details": field_errors,
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception: %s %s — %s", request.method, request.url.path, str(exc))
        if settings.is_development:
            raise exc
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred. Our team has been notified.",
                }
            },
        )

    # ── MIDDLEWARE (reverse registration order = outermost first) ─────────────

    # Outermost: CORS handles preflight first
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
        max_age=600,
    )

    from app.middleware.rate_limit import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)

    from app.middleware.logging import RequestLoggingMiddleware
    app.add_middleware(RequestLoggingMiddleware)

    from app.middleware.security_headers import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)

    # ── ROUTERS ───────────────────────────────────────────────────────────────

    API_V1 = "/api/v1"

    from app.api.v1.routes.health import router as health_router
    app.include_router(health_router)

    from app.api.v1.routes.auth import router as auth_router
    app.include_router(auth_router, prefix=API_V1)

    from app.api.v1.routes.ai_generation import router as ai_router
    from app.api.v1.routes.assessment import router as assessment_router
    from app.api.v1.routes.blueprint import router as blueprint_router
    from app.api.v1.routes.question import router as question_router
    app.include_router(assessment_router, prefix=API_V1)
    app.include_router(question_router, prefix=API_V1)
    app.include_router(ai_router, prefix=API_V1)
    app.include_router(blueprint_router, prefix=API_V1)

    from app.api.v1.routes.attempt import router as attempt_router
    from app.api.v1.routes.grading import router as grading_router
    from app.api.v1.routes.integrity import router as integrity_router
    from app.api.v1.routes.result import router as result_router
    from app.api.v1.routes.submission import router as submission_router
    app.include_router(attempt_router, prefix=API_V1)
    app.include_router(submission_router, prefix=API_V1)
    app.include_router(grading_router, prefix=API_V1)
    app.include_router(result_router, prefix=API_V1)
    app.include_router(integrity_router, prefix=API_V1)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "docs": "/docs" if settings.docs_enabled else "disabled",
            "health": "/health",
        }

    return app


# ---------------------------------------------------------------------------
# APPLICATION INSTANCE
# ---------------------------------------------------------------------------

app: FastAPI = create_application()
