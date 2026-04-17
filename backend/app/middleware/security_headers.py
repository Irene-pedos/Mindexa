"""
app/middleware/security_headers.py

Helmet-style security HTTP response headers for Mindexa Platform.

Every response from the API gets a standard set of security headers that
instruct browsers to enforce a stricter security posture.

HEADERS ADDED:
    X-Frame-Options             — Prevents clickjacking (DENY)
    X-Content-Type-Options      — Prevents MIME sniffing (nosniff)
    X-XSS-Protection            — Legacy XSS protection hint (1; mode=block)
    Referrer-Policy             — Limits referrer information leakage
    Content-Security-Policy     — Restricts resource loading origins
    Strict-Transport-Security   — Forces HTTPS in production (HSTS)
    Permissions-Policy          — Disables dangerous browser features
    Cache-Control               — Prevents caching of API responses

DESIGN:
    - HSTS is only set in staging/production (not in development to avoid
      accidentally locking the browser to HTTPS on localhost)
    - CSP is kept API-safe (no script-src needed for a pure JSON API)
    - All headers are additive — they never remove headers set by route handlers

USAGE (in main.py):
    from app.middleware.security_headers import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)
"""

from __future__ import annotations

from app.core.config import settings
from fastapi import Request, Response
from starlette.middleware.base import (BaseHTTPMiddleware,
                                       RequestResponseEndpoint)
from starlette.types import ASGIApp


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds security headers to every HTTP response.

    Instantiated once at startup — header strings are pre-built so there is
    zero per-request computation overhead beyond the dict lookup.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._headers = self._build_headers()

    def _build_headers(self) -> dict[str, str]:
        """Pre-build the security header map for this environment."""
        headers: dict[str, str] = {
            # Prevent the response from being rendered inside an <iframe>
            "X-Frame-Options": "DENY",

            # Prevent browsers from MIME-sniffing the Content-Type
            "X-Content-Type-Options": "nosniff",

            # Legacy XSS filter hint (ignored by modern browsers but harmless)
            "X-XSS-Protection": "1; mode=block",

            # Restrict how much referrer information is sent with requests
            "Referrer-Policy": "strict-origin-when-cross-origin",

            # Content Security Policy — API only, no inline scripts/styles needed
            # Allows same-origin fetches; blocks everything else by default.
            "Content-Security-Policy": (
                "default-src 'none'; "
                "frame-ancestors 'none'; "
                "form-action 'none'"
            ),

            # Disable powerful browser features not needed by a REST API
            "Permissions-Policy": (
                "accelerometer=(), "
                "ambient-light-sensor=(), "
                "autoplay=(), "
                "camera=(), "
                "geolocation=(), "
                "gyroscope=(), "
                "magnetometer=(), "
                "microphone=(), "
                "payment=(), "
                "usb=()"
            ),

            # API responses should never be cached by browsers or proxies
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",

            # Remove server fingerprinting
            "Server": "Mindexa",
        }

        # HSTS — only set in staging and production (not dev, to avoid
        # locking localhost into HTTPS mode in the browser).
        if not settings.is_development:
            headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        return headers

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        for key, value in self._headers.items():
            # Only set if not already explicitly set by the route handler
            if key not in response.headers:
                response.headers[key] = value
        return response
