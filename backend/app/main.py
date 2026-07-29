from __future__ import annotations

import uuid
from datetime import datetime

from app.api.v1.routes import (academic, admin, admin_academic, admin_ai_audit,
                               ai_generation, analytics, assessment, attempt,
                               auth, blueprint, gemini, grading, group_work,
                               health, integrity, lecturer, notification,
                               question, resource, result, student, student_ai, student_resources,
                               study_planner, submission)
from app.core.config import settings
from app.core.handlers import register_exception_handlers
from app.core.logging import get_logger
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

logger = get_logger(__name__)


import os

from fastapi.staticfiles import StaticFiles


from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.session import AsyncSessionLocal
    from app.db.repositories.integrity_repo import IntegrityRepository
    try:
        async with AsyncSessionLocal() as db:
            repo = IntegrityRepository(db)
            await repo.ensure_default_profiles()
            await db.commit()
    except Exception as err:
        logger.warning(f"Failed to seed default integrity profiles: {err}")
    yield


def create_app() -> FastAPI:
    """Application factory for the Mindexa Platform API."""
    app = FastAPI(
        title=settings.APP_NAME,
        description="Mindexa secure academic OS backend.",
        version="0.1.0",
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url=f"{settings.API_V1_STR}/docs",
        redoc_url=f"{settings.API_V1_STR}/redoc",
        lifespan=lifespan,
    )

    # ── STATIC FILES ──────────────────────────────────────────────────────────
    # Ensure uploads directory exists
    os.makedirs("uploads", exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

    from app.api.v1.routes import (academic, admin, admin_academic,
                                   admin_ai_audit, ai_generation, analytics,
                                   assessment, attempt, auth, blueprint,
                                   gemini, grading, group_work, health,
                                   integrity, lecturer, lecturer_ai, notification, question,
                                   resource, result, student, student_ai,
                                   student_resources, submission)

    # ── ROUTE REGISTRATION ────────────────────────────────────────────────────
    app.include_router(admin_ai_audit.router, prefix=settings.API_V1_STR)
    app.include_router(analytics.router, prefix=settings.API_V1_STR)
    app.include_router(auth.router, prefix=settings.API_V1_STR)
    app.include_router(academic.router, prefix=settings.API_V1_STR)
    app.include_router(admin.router, prefix=settings.API_V1_STR)
    app.include_router(admin_academic.router, prefix=settings.API_V1_STR)
    app.include_router(student.router, prefix=settings.API_V1_STR)
    app.include_router(student_resources.router, prefix=settings.API_V1_STR)
    app.include_router(student_ai.router, prefix=settings.API_V1_STR)
    app.include_router(study_planner.router, prefix=settings.API_V1_STR)
    app.include_router(lecturer.router, prefix=settings.API_V1_STR)
    app.include_router(lecturer_ai.router, prefix=settings.API_V1_STR)
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

    from app.middleware.rate_limit import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)

    from app.middleware.logging import RequestLoggingMiddleware
    app.add_middleware(RequestLoggingMiddleware)

    from app.middleware.security_headers import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)

    # Outermost: CORS must handle preflight (OPTIONS) BEFORE all other logic.
    # Middlewares execute in reverse order of registration.
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
