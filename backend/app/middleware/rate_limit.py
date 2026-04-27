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
    return _DEFAULT_TIER


# ---------------------------------------------------------------------------
# LIMITS PER TIER
# ---------------------------------------------------------------------------

def _limit_for_tier(tier: str) -> int:
    """Return requests-per-minute limit for a tier."""
    if tier == "exempt":
        return 0   # 0 = no limit applied
    if tier == "login":
        return settings.RATE_LIMIT_LOGIN_PER_MINUTE
    if tier == "refresh":
        return settings.RATE_LIMIT_REFRESH_PER_MINUTE
    return settings.RATE_LIMIT_DEFAULT_PER_MINUTE


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
        tier = _resolve_tier(request.url.path)
        limit = _limit_for_tier(tier)

        # Exempt paths bypass all rate checking
        if tier == "exempt" or limit <= 0:
            return await call_next(request)

        client_ip = _get_client_ip(request)

        try:
            current_count, window_remaining = await _check_rate_limit(
                ip=client_ip, tier=tier, limit=limit
            )
        except Exception as exc:
            # Redis unavailable — fail open, log a warning
            logger.warning(
                "Rate limiter Redis error (fail-open): %s",
                str(exc),
                extra={"client_ip": client_ip, "tier": tier},
            )
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
    ip: str, tier: str, limit: int
) -> tuple[int, int]:
    """
    Increment the per-IP-per-tier-per-minute counter in Redis.

    Returns:
        (current_count, seconds_until_window_reset)
    """
    from app.core.redis import get_redis

    now = time.time()
    window_minute = math.floor(now / 60)  # minute-resolution window
    window_start = window_minute * 60
    window_remaining = int(60 - (now - window_start))

    key = f"rl:{tier}:{ip}:{window_minute}"
    redis = await get_redis()

    # INCR is atomic — safe for concurrent requests
    count = await redis.incr(key)

    # Set TTL on first increment so the key auto-expires
    if count == 1:
        await redis.expire(key, 65)  # 65s: window + small buffer

    return count, window_remaining
