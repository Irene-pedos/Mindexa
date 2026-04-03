"""
app/core/redis.py

Async Redis client, helpers, token blocklist, and live session tracking.
"""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis
from app.core.config import settings
from app.core.logging import get_logger
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = get_logger(__name__)

_redis_client: Redis | None = None


def get_redis() -> Redis:
    if _redis_client is None:
        raise RuntimeError(
            "Redis client not initialised. "
            "Ensure init_redis() is called in the application lifespan."
        )
    return _redis_client


async def init_redis() -> Redis:
    global _redis_client
    _redis_client = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
        health_check_interval=30,
    )
    await _redis_client.ping()
    logger.info("redis_connected", host=settings.REDIS_HOST, port=settings.REDIS_PORT)
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
        logger.info("redis_connection_closed")


async def check_redis_health() -> bool:
    try:
        return await get_redis().ping()
    except Exception as exc:
        logger.error("redis_health_check_failed", error=str(exc))
        return False


async def get_redis_dep() -> Redis:
    """FastAPI dependency."""
    return get_redis()


# ── Token Blocklist ───────────────────────────────────────────────────────────

BLOCKLIST_PREFIX = "token:blocklist:"


async def blocklist_token(jti: str, expire_seconds: int) -> None:
    key = f"{BLOCKLIST_PREFIX}{jti}"
    await get_redis().setex(key, expire_seconds, "1")
    logger.info("token_blocklisted", jti=jti, ttl=expire_seconds)


async def is_token_blocklisted(jti: str) -> bool:
    key = f"{BLOCKLIST_PREFIX}{jti}"
    result = await get_redis().get(key)
    return result is not None


# ── Cache Helpers ─────────────────────────────────────────────────────────────

CACHE_PREFIX = "cache:"


async def cache_set(key: str, value: Any, expire_seconds: int = 300) -> None:
    try:
        await get_redis().setex(f"{CACHE_PREFIX}{key}", expire_seconds, json.dumps(value))
    except RedisError as exc:
        logger.warning("cache_set_failed", key=key, error=str(exc))


async def cache_get(key: str) -> Any | None:
    try:
        raw = await get_redis().get(f"{CACHE_PREFIX}{key}")
        return json.loads(raw) if raw else None
    except (RedisError, json.JSONDecodeError) as exc:
        logger.warning("cache_get_failed", key=key, error=str(exc))
        return None


async def cache_invalidate(key: str) -> None:
    try:
        await get_redis().delete(f"{CACHE_PREFIX}{key}")
    except RedisError as exc:
        logger.warning("cache_invalidate_failed", key=key, error=str(exc))


# ── Live Attempt Session Tracking ────────────────────────────────────────────

SESSION_PREFIX = "active_attempt:"
SESSION_TTL = 7200


async def mark_attempt_active(attempt_id: str, student_id: str, assessment_id: str) -> None:
    key = f"{SESSION_PREFIX}{attempt_id}"
    await get_redis().setex(
        key,
        SESSION_TTL,
        json.dumps({
            "student_id": student_id,
            "assessment_id": assessment_id,
            "attempt_id": attempt_id,
        }),
    )


async def mark_attempt_inactive(attempt_id: str) -> None:
    await get_redis().delete(f"{SESSION_PREFIX}{attempt_id}")


async def get_active_attempts_for_assessment(assessment_id: str) -> list[dict[str, str]]:
    client = get_redis()
    results: list[dict[str, str]] = []
    try:
        cursor = 0
        while True:
            cursor, keys = await client.scan(cursor, match=f"{SESSION_PREFIX}*", count=100)
            for key in keys:
                raw = await client.get(key)
                if raw:
                    data = json.loads(raw)
                    if data.get("assessment_id") == assessment_id:
                        results.append(data)
            if cursor == 0:
                break
    except RedisError as exc:
        logger.error("active_attempts_fetch_failed", error=str(exc))
    return results
