from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.api.v1.routes import (
    admin,
    ai_generation,
    assessment,
    attempt,
    auth,
    blueprint,
    gemini,
    grading,
    group_work,
    health,
    integrity,
    lecturer,
    notification,
    question,
    resource,
    result,
    student,
    submission,
    academic,
    admin_academic,
    )

from app.core.config import settings
from app.core.logging import get_logger
from app.core.handlers import register_exception_handlers

logger = get_logger(__name__)


from fastapi.staticfiles import StaticFiles
import os

def create_app() -> FastAPI:
    """Application factory for the Mindexa Platform API."""
    app = FastAPI(
        title=settings.APP_NAME,
        description="Mindexa secure academic OS backend.",
        version="0.1.0",
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url=f"{settings.API_V1_STR}/docs",
        redoc_url=f"{settings.API_V1_STR}/redoc",
    )

    # ── STATIC FILES ──────────────────────────────────────────────────────────
    # Ensure uploads directory exists
    os.makedirs("uploads", exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

    # ── ROUTE REGISTRATION ────────────────────────────────────────────────────
    app.include_router(auth.router, prefix=settings.API_V1_STR)
    app.include_router(academic.router, prefix=settings.API_V1_STR)
    app.include_router(admin.router, prefix=settings.API_V1_STR)
    app.include_router(admin_academic.router, prefix=settings.API_V1_STR)
    app.include_router(student.router, prefix=settings.API_V1_STR)
    app.include_router(lecturer.router, prefix=settings.API_V1_STR)
    app.include_router(resource.router, prefix=settings.API_V1_STR)
    app.include_router(question.router, prefix=settings.API_V1_STR)
    app.include_router(assessment.router, prefix=settings.API_V1_STR)
    app.include_router(attempt.router, prefix=settings.API_V1_STR)
    app.include_router(group_work.router, prefix=settings.API_V1_STR)
    app.include_router(notification.router, prefix=settings.API_V1_STR)
    app.include_router(result.router, prefix=settings.API_V1_STR)
    app.include_router(grading.router, prefix=settings.API_V1_STR)
    app.include_router(integrity.router, prefix=settings.API_V1_STR)
    app.include_router(submission.router, prefix=settings.API_V1_STR)
    app.include_router(ai_generation.router, prefix=settings.API_V1_STR)
    app.include_router(blueprint.router, prefix=settings.API_V1_STR)
    app.include_router(gemini.router, prefix=settings.API_V1_STR)
    app.include_router(health.router, prefix=settings.API_V1_STR)

    # ── EXCEPTION HANDLERS ───────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── MIDDLEWARE (reverse registration order = outermost first) ─────────────

    # Outermost: CORS handles preflight first
    from app.middleware.rate_limit import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)

    from app.middleware.logging import RequestLoggingMiddleware
    app.add_middleware(RequestLoggingMiddleware)

    from app.middleware.security_headers import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    )

    return app


app = create_app()
