"""
app/api/routes/health.py

Health check endpoints — no auth required, always fast.

GET /health/live   — liveness probe (is the process running?)
GET /health/ready  — readiness probe (are DB and Redis reachable?)
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.redis import check_redis_health
from app.db.session import check_db_health

router = APIRouter(tags=["Health"])


class LivenessResponse(BaseModel):
    status: str
    app: str
    version: str
    timestamp: str


@router.get("/live", response_model=LivenessResponse, summary="Liveness probe")
async def liveness() -> LivenessResponse:
    return LivenessResponse(
        status="alive",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        timestamp=datetime.now(UTC).isoformat(),
    )


@router.get("/ready", summary="Readiness probe")
async def readiness() -> JSONResponse:
    checks: dict[str, str] = {}
    all_healthy = True

    db_ok = await check_db_health()
    checks["database"] = "ok" if db_ok else "degraded"
    if not db_ok:
        all_healthy = False

    redis_ok = await check_redis_health()
    checks["redis"] = "ok" if redis_ok else "degraded"
    if not redis_ok:
        all_healthy = False

    return JSONResponse(
        content={
            "status": "ready" if all_healthy else "degraded",
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "timestamp": datetime.now(UTC).isoformat(),
            "checks": checks,
        },
        status_code=(
            status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
        ),
    )
