"""
app/middleware/rate_limit.py

Redis-backed sliding-window rate limiter for Mindexa Platform.

TIERS:
    STRICT   — login endpoint: 5 req/min per IP
    MEDIUM   — token refresh:  20 req/min per IP
    DEFAULT  — all other API:  120 req/min per IP
    EXEMPT   — health/metrics: unlimited

ALGORITHM:
    Sliding window using Redis INCR + EXPIRE.
    Each IP gets a key per minute window.
    When the counter exceeds the limit, a 429 is returned with
    Retry-After and X-RateLimit-* headers.

KEY FORMAT:
    rl:{tier}:{ip}:{window_minute}

    Example:
        rl:login:192.168.1.1:27905640   (minute 27905640 since epoch)

DESIGN:
    - Redis failures are non-fatal: if Redis is unavailable the request
      is allowed through (fail-open). A warning is logged.
    - IP extraction honours X-Forwarded-For (for reverse proxy deployments).
    - All limits are read from settings so they can be tuned without code changes.
    - Rate limit headers are always returned (even when not limited) so
      clients can adapt their request rate.

USAGE (in main.py):
    from app.middleware.rate_limit import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)
"""

from __future__ import annotations

import asyncio
import math
import time

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger("mindexa.rate_limit")


# ---------------------------------------------------------------------------
# ROUTE → TIER MAPPING
# ---------------------------------------------------------------------------

# Paths matched by prefix.  More-specific prefixes must come first.
_ROUTE_TIERS: list[tuple[str, str]] = [
    # Auth — strict
    ("/api/v1/auth/login", "login"),
    ("/api/v1/auth/refresh", "refresh"),
    # AI — quota protection
    ("/api/v1/student/ai/support", "student_ai_support"),
    ("/api/v1/ai/generate", "ai_heavy"),
    ("/api/v1/student/ai", "ai_heavy"),
    ("/api/v1/lecturer/ai", "ai_heavy"),
    # Health / metrics — exempt
    ("/health", "exempt"),
    ("/metrics", "exempt"),
    ("/", "exempt"),
]

# Any path not matched above falls into the "default" tier.
_DEFAULT_TIER = "default"


def _resolve_tier(path: str) -> str:
    for prefix, tier in _ROUTE_TIERS:
        if path.startswith(prefix):
            return tier

    # AI guided study sessions & generation under study-plans
    if "/students/study-plans" in path:
        if "/guided" in path or "/generate" in path or "/knowledge-check" in path:
            return "ai_heavy"

    if "/study-reader" in path and ("/generate" in path or "/ai" in path):
        return "ai_heavy"

    return _DEFAULT_TIER


# ---------------------------------------------------------------------------
# LIMITS PER TIER
# ---------------------------------------------------------------------------

def _limit_for_tier(tier: str) -> int:
    """Return request limit for a tier."""
    if tier == "exempt":
        return 0   # 0 = no limit applied
    if tier == "login":
        return settings.RATE_LIMIT_LOGIN_PER_MINUTE
    if tier == "refresh":
        return settings.RATE_LIMIT_REFRESH_PER_MINUTE
    if tier == "student_ai_support":
        return settings.RATE_LIMIT_STUDENT_AI_SUPPORT_PER_HOUR
    if tier == "ai_heavy":
        return settings.RATE_LIMIT_AI_PER_MINUTE
    return settings.RATE_LIMIT_DEFAULT_PER_MINUTE


def _window_for_tier(tier: str) -> int:
    """Return rate-limit window size in seconds for a tier."""
    if tier == "student_ai_support":
        return 60 * 60
    return 60


# ---------------------------------------------------------------------------
# IP EXTRACTION
# ---------------------------------------------------------------------------

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# MIDDLEWARE
# ---------------------------------------------------------------------------

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window rate limiter backed by Redis.

    Middleware ordering matters: this should be added AFTER logging
    middleware so that rate-limited requests are still logged.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Preflight requests (OPTIONS) should always bypass rate limiting
        if request.method == "OPTIONS":
            return await call_next(request)

        tier = _resolve_tier(request.url.path)
        limit = _limit_for_tier(tier)
        window_seconds = _window_for_tier(tier)

        # Exempt paths bypass all rate checking
        if tier == "exempt" or limit <= 0:
            return await call_next(request)

        client_ip = _get_client_ip(request)

        try:
            current_count, window_remaining = await _check_rate_limit(
                ip=client_ip,
                tier=tier,
                limit=limit,
                window_seconds=window_seconds,
            )
        except Exception as exc:
            logger.warning(
                "Rate limiter Redis error (using in-memory fallback): %s",
                str(exc),
                extra={"client_ip": client_ip, "tier": tier},
            )
            if getattr(settings, "RATE_LIMIT_FAIL_CLOSED_ON_AI", False) and tier == "ai_heavy":
                return JSONResponse(
                    status_code=503,
                    content={
                        "error": {
                            "code": "SERVICE_UNAVAILABLE",
                            "message": "AI services temporarily rate-limited due to capacity protection.",
                        }
                    },
                )
            try:
                current_count, window_remaining = await _check_in_memory_rate_limit(
                    ip=client_ip,
                    tier=tier,
                    limit=limit,
                    window_seconds=window_seconds,
                )
            except Exception as fallback_exc:
                logger.error("Rate limiter fallback failed: %s", str(fallback_exc))
                return await call_next(request)

        # Add rate limit headers to every response
        headers = {
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": str(max(0, limit - current_count)),
            "X-RateLimit-Reset": str(int(time.time()) + window_remaining),
            "X-RateLimit-Tier": tier,
        }

        if current_count > limit:
            logger.warning(
                "Rate limit exceeded: %s %s (ip=%s, tier=%s, count=%d/%d)",
                request.method,
                request.url.path,
                client_ip,
                tier,
                current_count,
                limit,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": (
                            f"Too many requests. Limit: {limit} per minute. "
                            if window_seconds == 60
                            else f"Too many requests. Limit: {limit} per hour. "
                            f"Try again in {window_remaining} seconds."
                        ),
                        "details": {
                            "limit": limit,
                            "tier": tier,
                            "retry_after_seconds": window_remaining,
                        },
                    }
                },
                headers={
                    **headers,
                    "Retry-After": str(window_remaining),
                },
            )

        response = await call_next(request)
        for k, v in headers.items():
            response.headers[k] = v
        return response


# ---------------------------------------------------------------------------
# REDIS COUNTER LOGIC
# ---------------------------------------------------------------------------

async def _check_rate_limit(
    ip: str, tier: str, limit: int, window_seconds: int = 60
) -> tuple[int, int]:
    """
    Increment the per-IP-per-tier-per-minute counter in Redis.

    Returns:
        (current_count, seconds_until_window_reset)
    """
    from app.core.redis import get_redis

    now = time.time()
    window_bucket = math.floor(now / window_seconds)
    window_start = window_bucket * window_seconds
    window_remaining = int(window_seconds - (now - window_start))

    key = f"rl:{tier}:{ip}:{window_bucket}"
    redis = await get_redis()

    # INCR is atomic — safe for concurrent requests
    count = await redis.incr(key)

    # Set TTL on first increment so the key auto-expires
    if count == 1:
        await redis.expire(key, window_seconds + 5)

    return count, window_remaining


# ---------------------------------------------------------------------------
# IN-MEMORY FALLBACK COUNTER LOGIC (WHEN REDIS IS UNAVAILABLE)
# ---------------------------------------------------------------------------

_fallback_lock = asyncio.Lock()
_fallback_store: dict[str, tuple[int, float]] = {}
_MAX_FALLBACK_KEYS = 10000


async def _check_in_memory_rate_limit(
    ip: str, tier: str, limit: int, window_seconds: int = 60
) -> tuple[int, int]:
    """
    In-memory fallback sliding window counter when Redis is degraded or down.
    Ensures that rate limits are still strictly enforced locally.
    """
    now = time.time()
    window_bucket = math.floor(now / window_seconds)
    window_start = window_bucket * window_seconds
    window_remaining = max(1, int(window_seconds - (now - window_start)))
    key = f"rl:{tier}:{ip}:{window_bucket}"

    async with _fallback_lock:
        if len(_fallback_store) > _MAX_FALLBACK_KEYS:
            expired = [k for k, (_, exp) in _fallback_store.items() if exp < now]
            for k in expired:
                _fallback_store.pop(k, None)

        count, _ = _fallback_store.get(key, (0, 0.0))
        count += 1
        _fallback_store[key] = (count, now + window_seconds + 5)

    return count, window_remaining
