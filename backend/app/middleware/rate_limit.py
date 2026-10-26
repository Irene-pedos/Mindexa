"""
app/middleware/rate_limit.py

Redis-backed sliding-window rate limiter for Mindexa Platform.

TIERS:
    STRICT       — login endpoint: 5 req/min per IP (nobody is authenticated yet)
    MEDIUM       — token refresh:  20 req/min per IP
    DEFAULT      — all other API:  120 req/min per USER
    HIGH_VOLUME  — attempts / integrity / submissions / grading / results: 600 req/min per USER
                   (exam autosave, integrity events and batch grading must never be throttled)
    AI           — AI endpoints: 20 req/min per USER
    EXEMPT       — health/metrics/docs: unlimited

WHO IS COUNTED:
    Authenticated requests are counted per user id (from the verified access token), never
    per IP: a whole exam hall or lab shares one campus address, so an IP key would let one
    class exhaust a single budget. Requests without a valid token (login, public seal check)
    fall back to the client IP.

ALGORITHM:
    Sliding window using Redis INCR + EXPIRE.
    Each caller gets a key per minute window.
    When the counter exceeds the limit, a 429 is returned with
    Retry-After and X-RateLimit-* headers.

KEY FORMAT:
    rl:{tier}:{caller}:{window_minute}

    Example:
        rl:login:ip:192.168.1.1:27905640   (minute 27905640 since epoch)
        rl:default:user:3f2a...:27905640

DESIGN:
    - Redis failures are non-fatal: if Redis is unavailable the request
      is allowed through (fail-open). A warning is logged.
    - IP extraction honours X-Forwarded-For only for TRUSTED_PROXY_COUNT proxies (app.core.client_ip).
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

from app.core.client_ip import get_client_ip
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
    # Seal verification — public endpoint protection (Phase 3, Spec 7.7)
    ("/api/v1/public/verify-seal", "verify_seal"),
    ("/public/verify-seal", "verify_seal"),
    ("/api/v1/assessments/verify", "verify_seal"),
    ("/assessments/verify", "verify_seal"),
    # AI — quota protection & AI grading endpoints (Spec 3.3)
    ("/api/v1/student/ai/support", "student_ai_support"),
    ("/api/v1/ai/generate", "ai_heavy"),
    ("/api/v1/gemini", "ai_heavy"),
    ("/api/v1/student/ai", "ai_heavy"),
    ("/api/v1/lecturer/ai", "ai_heavy"),
    # The router is mounted at /lecturers/ai (plural); the singular prefix above never matched it.
    ("/api/v1/lecturers/ai", "ai_heavy"),
    ("/api/v1/grading/grade-attempt", "ai_heavy"),
    ("/grading/grade-attempt", "ai_heavy"),
    ("/api/v1/grading/confirm-ai", "ai_heavy"),
    ("/grading/confirm-ai", "ai_heavy"),
    ("/api/v1/grading/feedback-ai", "ai_heavy"),
    ("/grading/feedback-ai", "ai_heavy"),
    # High-volume work: answer autosave and integrity events fire constantly during an exam
    # (a throttled save would lose work), and batch grading saves one request per student.
    # These get a much higher per-user budget. AI grading routes are matched above, first.
    ("/api/v1/attempts", "high_volume"),
    ("/api/v1/integrity/event", "high_volume"),
    ("/api/v1/integrity/acknowledge-warning", "high_volume"),
    ("/api/v1/submissions", "high_volume"),
    ("/api/v1/grading", "high_volume"),
    ("/api/v1/results", "high_volume"),
    # Health / metrics / API docs — exempt
    ("/health", "exempt"),
    ("/metrics", "exempt"),
    ("/docs", "exempt"),
    ("/redoc", "exempt"),
    ("/openapi.json", "exempt"),
]

# Any path not matched above falls into the "default" tier.
_DEFAULT_TIER = "default"


# Grading routes that call an AI model. They sit under /grading, which is otherwise a
# high-volume tier (batch grading), so they are recognised first and kept in the strict tier.
_AI_PATH_MARKERS = (
    "/ai-summary",
    "/review-grade",
    "/review-attempt",
    "/draft-feedback",
    "/suggest-changes",
    "/process-ai",
    "/grade-attempt",
    "/confirm-ai",
    "/feedback-ai",
)


# Study planner routes that run an LLM: lesson generation, tutor Q&A, exercises, quiz generation
# and grading, session summary, and plan generation from an assessment.
_STUDY_PLAN_AI_MARKERS = (
    "/generate-from-assessment",
    "/guided/start",
    "/guided/ask",
    "/guided/exercise",
    "/guided/knowledge-check",
    "/guided/complete",
)

# Study reader routes that run an LLM (see api/v1/routes/study_reader.py).
_STUDY_READER_AI_SUFFIXES = ("/skim", "/page-check")


def _resolve_tier(path: str) -> str:
    if path == "/":
        return "exempt"
    if any(marker in path for marker in _AI_PATH_MARKERS):
        return "ai_heavy"
    for prefix, tier in _ROUTE_TIERS:
        if path.startswith(prefix):
            return tier

    # Study planner: only routes that call the model are AI-tier. Reads (GET /guided) and notes
    # stay on the default tier so polling a lesson cannot exhaust the student's AI budget.
    if "/students/study-plans" in path and any(marker in path for marker in _STUDY_PLAN_AI_MARKERS):
        return "ai_heavy"

    # Study reader (mounted at /student/reader): skim and page-check call the model.
    if "/student/reader/" in path and any(path.endswith(suffix) for suffix in _STUDY_READER_AI_SUFFIXES):
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
    if tier == "verify_seal":
        return settings.RATE_LIMIT_VERIFY_SEAL_PER_MINUTE
    if tier == "ai_heavy":
        return settings.RATE_LIMIT_AI_PER_MINUTE
    if tier == "high_volume":
        return settings.RATE_LIMIT_HIGH_VOLUME_PER_MINUTE
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
    return get_client_ip(request) or "unknown"


# Tiers whose callers are not signed in yet, so the only identity available is the address.
_IP_ONLY_TIERS = {"login", "refresh", "verify_seal"}


def _client_identity(request: Request, tier: str) -> str:
    """Who this request is counted against: the signed-in user, else the client address.

    The user id comes from a cryptographically verified access token, so it cannot be spoofed
    to dodge or to burn someone else's budget. An invalid or missing token falls back to the IP.
    """
    if tier not in _IP_ONLY_TIERS:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            try:
                from app.core.security import decode_access_token

                sub = decode_access_token(auth[7:].strip()).sub
                if sub:
                    return f"user:{sub}"
            except Exception:  # expired / malformed: counted by address instead
                pass
    return f"ip:{_get_client_ip(request)}"


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

        client_ip = _client_identity(request, tier)

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
                            f"Too many requests. Limit: {limit} per "
                            f"{'minute' if window_seconds == 60 else 'hour'}. "
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
