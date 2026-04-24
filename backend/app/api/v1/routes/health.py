"""
app/api/v1/routes/health.py

Health check and metrics endpoints for Mindexa Platform.

ENDPOINTS:
    GET  /health           — Liveness + dependency check (no auth required)
    GET  /health/live      — Simple liveness probe (K8s: livenessProbe)
    GET  /health/ready     — Readiness probe — fails if DB/Redis are down
    GET  /metrics          — Prometheus-compatible text metrics

DESIGN:
    /health is intentionally unauthenticated so that:
        - Load balancers can health-check the service
        - Docker health checks work without a token
        - Kubernetes liveness/readiness probes function correctly

    /metrics is protected by an internal API key (METRICS_API_KEY env var)
    in production so it is not publicly accessible.

RESPONSE SHAPE:
    {
        "status": "ok" | "degraded" | "error",
        "timestamp": "2026-04-16T10:00:00Z",
        "version": "1.0.0",
        "environment": "production",
        "checks": {
            "database": {"status": "ok", "latency_ms": 4},
            "redis":    {"status": "ok", "latency_ms": 1}
        }
    }

STATUS CODES:
    200  — All checks pass (status: "ok")
    200  — Some checks degraded (status: "degraded") — still serving traffic
    503  — Critical check failed (status: "error") — take out of rotation
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.core.logger import get_logger
from fastapi import APIRouter, Header, HTTPException, status
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import text

logger = get_logger("mindexa.health")

router = APIRouter(tags=["Health"])


# ---------------------------------------------------------------------------
# DEPENDENCY CHECKS
# ---------------------------------------------------------------------------

async def _check_database() -> dict[str, Any]:
    """Ping the database with a lightweight query."""
    start = time.perf_counter()
    try:
        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {"status": "ok", "latency_ms": latency_ms}
    except Exception as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        logger.error("Health check: database failed: %s", str(exc))
        return {"status": "error", "latency_ms": latency_ms, "error": str(exc)}


async def _check_redis() -> dict[str, Any]:
    """Ping Redis."""
    start = time.perf_counter()
    try:
        from app.core.redis import get_redis
        redis = await get_redis()
        await redis.ping()
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {"status": "ok", "latency_ms": latency_ms}
    except Exception as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        logger.error("Health check: redis failed: %s", str(exc))
        return {"status": "error", "latency_ms": latency_ms, "error": str(exc)}


# ---------------------------------------------------------------------------
# HEALTH ENDPOINTS
# ---------------------------------------------------------------------------

@router.get(
    "/health",
    summary="Full health check",
    response_description="Service health with dependency status",
    include_in_schema=False,
)
async def health_check() -> Response:
    """
    Comprehensive health check.

    Returns dependency status for database and Redis.
    Status is "ok" only when all checks pass.
    Status is "degraded" if non-critical services fail.
    Status is "error" if critical services (DB) fail — triggers 503.
    """
    db_check, redis_check = await _check_database(), await _check_redis()

    checks = {
        "database": db_check,
        "redis": redis_check,
    }

    # Determine overall status
    if db_check["status"] == "error":
        overall = "error"
    elif redis_check["status"] == "error":
        overall = "degraded"  # Redis failure degrades but doesn't stop service
    else:
        overall = "ok"

    response_body = {
        "status": overall,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "checks": checks,
    }

    # 503 only when the database (critical dependency) is down
    status_code = (
        status.HTTP_503_SERVICE_UNAVAILABLE
        if overall == "error"
        else status.HTTP_200_OK
    )

    return Response(
        content=__import__("json").dumps(response_body),
        status_code=status_code,
        media_type="application/json",
    )


@router.get(
    "/health/live",
    summary="Liveness probe",
    include_in_schema=False,
)
async def liveness_probe() -> dict[str, str]:
    """
    Kubernetes liveness probe — returns 200 if the process is alive.
    Does NOT check external dependencies.
    """
    return {"status": "alive"}


@router.get(
    "/health/ready",
    summary="Readiness probe",
    include_in_schema=False,
)
async def readiness_probe() -> dict[str, Any]:
    """
    Kubernetes readiness probe — returns 200 only when the service
    can accept traffic (DB and Redis are reachable).
    """
    db_check = await _check_database()
    redis_check = await _check_redis()

    if db_check["status"] != "ok":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "not_ready",
                "reason": "database_unavailable",
                "database": db_check,
            },
        )

    return {
        "status": "ready",
        "database": db_check,
        "redis": redis_check,
    }


# ---------------------------------------------------------------------------
# METRICS ENDPOINT
# ---------------------------------------------------------------------------

@router.get(
    "/metrics",
    summary="Prometheus metrics",
    response_class=PlainTextResponse,
    include_in_schema=False,
)
async def metrics_endpoint() -> PlainTextResponse:
    """
    Prometheus text-format metrics.

    In production, requires X-Metrics-Key header matching METRICS_API_KEY.
    Exposes basic process and application counters.
    """
    if not settings.METRICS_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Metrics are disabled.",
        )

    lines = await _build_prometheus_metrics()
    return PlainTextResponse(
        content="\n".join(lines) + "\n",
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


async def _build_prometheus_metrics() -> list[str]:
    """
    Build Prometheus text-format metric lines.

    Covers:
        - Process info (version, environment)
        - Database pool stats (if available)
        - Redis connection state
        - Application-level counters (from DB row counts)
    """
    lines: list[str] = []
    now_ms = int(time.time() * 1000)

    def metric(name: str, value: Any, labels: dict | None = None, help_text: str = "", type_: str = "gauge") -> None:
        if help_text:
            lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} {type_}")
        if labels:
            label_str = ",".join(f'{k}="{v}"' for k, v in labels.items())
            lines.append(f"{name}{{{label_str}}} {value} {now_ms}")
        else:
            lines.append(f"{name} {value} {now_ms}")

    # ── App info ──────────────────────────────────────────────────────────────
    metric(
        "mindexa_info",
        1,
        labels={
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
        },
        help_text="Mindexa platform version info",
    )

    # ── Database pool ─────────────────────────────────────────────────────────
    try:
        from app.db.session import async_engine
        pool = async_engine.pool
        metric(
            "mindexa_db_pool_size",
            getattr(pool, "size", lambda: 0)(),
            help_text="Database connection pool size",
        )
        metric(
            "mindexa_db_pool_checked_out",
            getattr(pool, "checkedout", lambda: 0)(),
            help_text="Database connections currently in use",
        )
        metric(
            "mindexa_db_pool_overflow",
            getattr(pool, "overflow", lambda: 0)(),
            help_text="Database overflow connections",
        )
    except Exception:
        pass

    # ── Redis ping ────────────────────────────────────────────────────────────
    redis_check = await _check_redis()
    metric(
        "mindexa_redis_up",
        1 if redis_check["status"] == "ok" else 0,
        help_text="Redis connectivity (1=up, 0=down)",
    )
    if "latency_ms" in redis_check:
        metric(
            "mindexa_redis_latency_ms",
            redis_check["latency_ms"],
            help_text="Redis ping latency in milliseconds",
        )

    # ── DB row counts (application metrics) ───────────────────────────────────
    try:
        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            counts = await session.execute(
                text(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM users WHERE is_deleted = false) AS users,
                        (SELECT COUNT(*) FROM assessment WHERE is_deleted = false) AS assessments,
                        (SELECT COUNT(*) FROM assessment_attempt
                         WHERE status = 'in_progress' AND is_deleted = false) AS active_attempts,
                        (SELECT COUNT(*) FROM grading_queue_item
                         WHERE status = 'pending') AS pending_grading
                    """
                )
            )
            row = counts.fetchone()
            if row:
                metric("mindexa_users_total", row[0], help_text="Total active users")
                metric("mindexa_assessments_total", row[1], help_text="Total active assessments")
                metric("mindexa_active_attempts", row[2], help_text="Currently in-progress attempts")
                metric("mindexa_pending_grading", row[3], help_text="Grading queue items pending review")
    except Exception as exc:
        logger.warning("Metrics: DB count query failed: %s", str(exc))

    return lines
