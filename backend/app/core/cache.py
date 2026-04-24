"""
app/core/cache.py

Generic Redis cache layer for Mindexa Platform.

CACHED OBJECTS:
    user_profile        — UserProfile + User summary (TTL: 10 min)
    assessment_meta     — Assessment metadata for attempt gating (TTL: 2 min)
    generic             — Any JSON-serializable object (TTL: configurable)

DESIGN:
    - All values are stored as JSON strings.
    - Every key has an explicit TTL — no unbounded cache entries.
    - Cache misses return None; callers decide whether to fall back to DB.
    - Cache invalidation is explicit: call invalidate_user() / invalidate_assessment()
      after any mutation.
    - Redis failures are logged but NEVER propagated — the application must
      function correctly even when Redis is down.

KEY NAMESPACES:
    cache:user:{user_id}                — User profile dict
    cache:assessment:{assessment_id}    — Assessment summary dict
    cache:custom:{namespace}:{key}      — Generic caller-defined cache

USAGE:
    from app.core.cache import cache

    # Write
    await cache.set_user_profile(user_id, profile_dict)

    # Read
    profile = await cache.get_user_profile(user_id)
    if profile is None:
        profile = await load_from_db(...)
        await cache.set_user_profile(user_id, profile)

    # Invalidate
    await cache.invalidate_user(user_id)
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger("mindexa.cache")

# ---------------------------------------------------------------------------
# KEY BUILDERS
# ---------------------------------------------------------------------------

_USER_KEY = "cache:user:{user_id}"
_ASSESSMENT_KEY = "cache:assessment:{assessment_id}"
_CUSTOM_KEY = "cache:custom:{namespace}:{key}"


def _user_key(user_id: uuid.UUID | str) -> str:
    return _USER_KEY.format(user_id=str(user_id))


def _assessment_key(assessment_id: uuid.UUID | str) -> str:
    return _ASSESSMENT_KEY.format(assessment_id=str(assessment_id))


def _custom_key(namespace: str, key: str) -> str:
    return _CUSTOM_KEY.format(namespace=namespace, key=key)


# ---------------------------------------------------------------------------
# CACHE CLASS
# ---------------------------------------------------------------------------

class RedisCache:
    """
    Application-level cache backed by Redis.

    Methods are designed to be fail-safe: any Redis error is caught,
    logged, and None is returned (or the operation is silently skipped).
    """

    # ── User Profile ──────────────────────────────────────────────────────────

    async def get_user_profile(
        self, user_id: uuid.UUID | str
    ) -> Optional[dict[str, Any]]:
        """Return cached user profile dict, or None on miss/error."""
        return await self._get_json(_user_key(user_id))

    async def set_user_profile(
        self,
        user_id: uuid.UUID | str,
        data: dict[str, Any],
        ttl: Optional[int] = None,
    ) -> None:
        """Cache user profile with TTL (default: REDIS_USER_PROFILE_TTL)."""
        await self._set_json(
            _user_key(user_id),
            data,
            ttl=ttl or settings.REDIS_USER_PROFILE_TTL,
        )

    async def invalidate_user(self, user_id: uuid.UUID | str) -> None:
        """Remove user profile from cache (call after any user/profile mutation)."""
        await self._delete(_user_key(user_id))
        logger.debug("Cache invalidated: user %s", str(user_id))

    # ── Assessment Metadata ───────────────────────────────────────────────────

    async def get_assessment(
        self, assessment_id: uuid.UUID | str
    ) -> Optional[dict[str, Any]]:
        """Return cached assessment summary, or None on miss/error."""
        return await self._get_json(_assessment_key(assessment_id))

    async def set_assessment(
        self,
        assessment_id: uuid.UUID | str,
        data: dict[str, Any],
        ttl: Optional[int] = None,
    ) -> None:
        """Cache assessment metadata with TTL (default: REDIS_ASSESSMENT_TTL)."""
        await self._set_json(
            _assessment_key(assessment_id),
            data,
            ttl=ttl or settings.REDIS_ASSESSMENT_TTL,
        )

    async def invalidate_assessment(self, assessment_id: uuid.UUID | str) -> None:
        """Remove assessment from cache (call after status change, publish, etc.)."""
        await self._delete(_assessment_key(assessment_id))
        logger.debug("Cache invalidated: assessment %s", str(assessment_id))

    # ── Generic Key-Value ─────────────────────────────────────────────────────

    async def get(
        self, namespace: str, key: str
    ) -> Optional[Any]:
        """Generic cache get. Returns deserialized value or None."""
        return await self._get_json(_custom_key(namespace, key))

    async def set(
        self,
        namespace: str,
        key: str,
        value: Any,
        ttl: int | None = None,
    ) -> None:
        """Generic cache set with TTL (default: REDIS_CACHE_DEFAULT_TTL)."""
        await self._set_json(
            _custom_key(namespace, key),
            value,
            ttl=ttl or settings.REDIS_CACHE_DEFAULT_TTL,
        )

    async def delete(self, namespace: str, key: str) -> None:
        """Generic cache delete."""
        await self._delete(_custom_key(namespace, key))

    async def exists(self, namespace: str, key: str) -> bool:
        """Return True if the key exists in cache."""
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            return bool(await redis.exists(_custom_key(namespace, key)))
        except Exception as exc:
            logger.warning("Cache exists check error: %s", str(exc))
            return False

    # ── TTL Management ────────────────────────────────────────────────────────

    async def ttl(self, namespace: str, key: str) -> int:
        """Return remaining TTL in seconds, or -1 if key not found."""
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            result = await redis.ttl(_custom_key(namespace, key))
            return int(result)
        except Exception as exc:
            logger.warning("Cache TTL error: %s", str(exc))
            return -1

    # ── Health Check ──────────────────────────────────────────────────────────

    async def ping(self) -> bool:
        """Return True if Redis is reachable."""
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            result = await redis.ping()
            return bool(result)
        except Exception:
            return False

    # ── Internal Helpers ──────────────────────────────────────────────────────

    async def _get_json(self, key: str) -> Optional[Any]:
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            raw = await redis.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("Cache JSON decode error for key %s: %s", key, exc)
            await self._delete(key)   # evict corrupt entry
            return None
        except Exception as exc:
            logger.warning("Cache get error for key %s: %s", key, str(exc))
            return None

    async def _set_json(self, key: str, value: Any, ttl: int) -> None:
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            serialized = json.dumps(value, default=str)
            await redis.setex(key, ttl, serialized)
        except Exception as exc:
            logger.warning("Cache set error for key %s: %s", key, str(exc))

    async def _delete(self, key: str) -> None:
        try:
            from app.core.redis import get_redis
            redis = await get_redis()
            await redis.delete(key)
        except Exception as exc:
            logger.warning("Cache delete error for key %s: %s", key, str(exc))


# ---------------------------------------------------------------------------
# MODULE-LEVEL SINGLETON
# ---------------------------------------------------------------------------

cache = RedisCache()
