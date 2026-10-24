"""
app/core/client_ip.py

Single source of truth for "who is calling": the rate limiter, request logging and the auth
routes (lockout / audit trail) must all agree, otherwise one of them can be spoofed.

X-Forwarded-For is client-controlled until a proxy we run appends to it, so it is only read
when TRUSTED_PROXY_COUNT says how many proxies sit in front of the app. The client address is
then the entry that the outermost trusted proxy recorded (counted from the right), never the
leftmost value, which the caller can set to anything.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Request

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_warned_unconfigured_proxy = False


def get_client_ip(request: Request) -> Optional[str]:
    """Best-effort client address, or None when the connection has no peer (e.g. test clients)."""
    peer = request.client.host if request.client else None
    hops = settings.TRUSTED_PROXY_COUNT
    if hops <= 0:
        _warn_if_behind_unconfigured_proxy(request)
        return peer

    forwarded = [
        part.strip()
        for part in request.headers.get("X-Forwarded-For", "").split(",")
        if part.strip()
    ]
    if len(forwarded) >= hops:
        return forwarded[-hops]
    return peer


def _warn_if_behind_unconfigured_proxy(request: Request) -> None:
    """Once per process, in production: a forwarded header with TRUSTED_PROXY_COUNT=0 means a proxy
    exists and every per-IP limit (login, lockout) is counting the proxy instead of the user."""
    global _warned_unconfigured_proxy
    if _warned_unconfigured_proxy or not settings.is_production:
        return
    if request.headers.get("X-Forwarded-For"):
        _warned_unconfigured_proxy = True
        logger.warning(
            "forwarded_header_ignored",
            hint="Requests carry X-Forwarded-For but TRUSTED_PROXY_COUNT=0; set it to the number of "
            "proxies in front of the API or all users will share one IP in rate limits and lockout.",
        )
