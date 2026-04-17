"""
app/core/redis.py

Redis client setup and helper utilities for Mindexa Platform.

Used for:
    - Refresh token JTI revocation cache (fast O(1) revocation check)
    - Rate limiting counters (future)
    - Celery broker/backend (via Celery config, not this module)
    - Session blacklist (if needed)

DESIGN:
    Uses redis.asyncio for non-blocking async operations.
    A single shared connection pool is created on startup.
    All helpers use prefixed keys to avoid namespace collisions.

KEY PREFIXES:
    revoked_jti:{jti}    — JTI revocation cache (TTL = token remaining lifetime)
    rate_limit:{key}     — Rate limiting counters (future)
"""

from typing import Optional

import redis.asyncio as aioredis
from app.core.config import settings

# ─── Redis Client Singleton ────────────────────────────────────────────────────

_redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    """
    Return the shared Redis client.

    The client is created lazily on first access and reused.
    Connection pooling is handled internally by redis.asyncio.
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
        )
    return _redis_client


async def close_redis() -> None:
    """
    Close the Redis connection pool.

    Called during application shutdown (lifespan event in main.py).
    """
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


async def check_redis_health() -> bool:
    try:
        client = await get_redis()
        await client.ping()
        return True
    except Exception:
        return False


# ─── JTI Revocation Cache ─────────────────────────────────────────────────────

_REVOKED_JTI_PREFIX = "revoked_jti:"


def _jti_key(jti: str) -> str:
    """Build the Redis key for a revoked JTI."""
    return f"{_REVOKED_JTI_PREFIX}{jti}"


async def cache_revoked_jti(jti: str, ttl_seconds: int) -> None:
    """
    Add a revoked JTI to the Redis cache with a TTL.

    The TTL should match the remaining lifetime of the refresh token so that
    the cache entry expires naturally when the token would have expired anyway.

    This provides O(1) fast-path revocation checking before hitting the DB.

    Args:
        jti: The JWT ID to mark as revoked.
        ttl_seconds: Time-to-live in seconds.
    """
    client = await get_redis()
    await client.setex(_jti_key(jti), ttl_seconds, "1")


async def is_jti_revoked_in_cache(jti: str) -> bool:
    """
    Check if a JTI exists in the Redis revocation cache.

    Returns True if the JTI is in the cache (definitively revoked).
    Returns False if NOT in cache (may still need DB check for authoritative answer).

    IMPORTANT:
        False here does NOT mean the token is valid.
        Always follow up with a DB check if the cache says False.
        The cache is the FAST PATH for already-known-revoked tokens.

    Args:
        jti: The JWT ID to check.

    Returns:
        True if cached as revoked, False if not in cache.
    """
    client = await get_redis()
    result = await client.exists(_jti_key(jti))
    return bool(result)


async def remove_jti_from_cache(jti: str) -> None:
    """
    Remove a JTI from the revocation cache.

    Not typically needed (TTL handles cleanup), but useful for testing.
    """
    client = await get_redis()
    await client.delete(_jti_key(jti))


# ─── Generic Key Helpers ──────────────────────────────────────────────────────


async def set_key(key: str, value: str, ttl_seconds: Optional[int] = None) -> None:
    """Set a Redis key with optional TTL."""
    client = await get_redis()
    if ttl_seconds:
        await client.setex(key, ttl_seconds, value)
    else:
        await client.set(key, value)


async def get_key(key: str) -> Optional[str]:
    """Get a Redis key value."""
    client = await get_redis()
    return await client.get(key)


async def delete_key(key: str) -> None:
    """Delete a Redis key."""
    client = await get_redis()
    await client.delete(key)


async def key_exists(key: str) -> bool:
    """Check if a Redis key exists."""
    client = await get_redis()
    return bool(await client.exists(key))
