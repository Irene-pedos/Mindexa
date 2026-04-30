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
    - Swagger UI (/docs) and ReDoc (/redoc) get a relaxed docs CSP so their
      CDN assets (jsdelivr) and inline scripts load correctly. This only
      applies when docs_enabled=True (never in production).
    - All headers are additive — they never remove headers set by route handlers

USAGE (in main.py):
    from app.middleware.security_headers import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)
"""

from __future__ import annotations

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app.core.config import settings

# Paths that serve the Swagger / ReDoc browser UI and need relaxed CSP.
_DOCS_PATHS: frozenset[str] = frozenset({"/docs", "/redoc", "/openapi.json"})

# CSP that allows Swagger UI / ReDoc to load their CDN assets.
# Only ever applied to /docs, /redoc, /openapi.json — never to API responses.
_DOCS_CSP = (
    "default-src 'self'; "
    # jsdelivr CDN — swagger-ui-dist JS + CSS bundles
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    # FastAPI favicon + any inline SVGs
    "img-src 'self' https://fastapi.tiangolo.com data:; "
    # Swagger UI fetches the OpenAPI JSON from the same origin
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)

# Strict CSP for all real API endpoints (JSON responses, no browser rendering).
_API_CSP = (
    "default-src 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds security headers to every HTTP response.

    Instantiated once at startup — header strings are pre-built so there is
    zero per-request computation overhead beyond the dict lookup.

    Two CSP profiles:
        - _DOCS_CSP  -> applied to /docs, /redoc, /openapi.json (dev only)
        - _API_CSP   -> applied to all other paths
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._common_headers = self._build_common_headers()

    def _build_common_headers(self) -> dict[str, str]:
        """Pre-build security headers that are the same for all responses."""
        headers: dict[str, str] = {
            # Prevent the response from being rendered inside an <iframe>
            "X-Frame-Options": "DENY",

            # Prevent browsers from MIME-sniffing the Content-Type
            "X-Content-Type-Options": "nosniff",

            # Legacy XSS filter hint (ignored by modern browsers but harmless)
            "X-XSS-Protection": "1; mode=block",

            # Restrict how much referrer information is sent with requests
            "Referrer-Policy": "strict-origin-when-cross-origin",

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

        # Choose the correct CSP profile based on the request path.
        # Docs paths only get the relaxed CSP when docs are enabled.
        path = request.url.path
        is_docs_path = settings.docs_enabled and path in _DOCS_PATHS
        csp = _DOCS_CSP if is_docs_path else _API_CSP

        # Apply common headers (only if the route handler hasn't set them)
        for key, value in self._common_headers.items():
            if key not in response.headers:
                response.headers[key] = value

        # Always set the correct CSP for this path (override if needed)
        response.headers["Content-Security-Policy"] = csp

        return response
