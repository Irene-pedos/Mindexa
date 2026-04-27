"""
app/middleware/logging.py

Request/response logging middleware.

Logs every HTTP request with:
    - Unique request_id (UUID, also returned as X-Request-ID header)
    - Method, path, status code, duration
    - User agent, client IP

Sets the request context so all downstream loggers within the same
request automatically include request_id, user_id, path, method.
"""

from __future__ import annotations

import time
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app.core.logger import get_logger, set_request_context

logger = get_logger("mindexa.http")

# Paths to skip from access logging (health checks, metrics)
_SILENT_PATHS = frozenset({"/health", "/metrics", "/favicon.ico", "/"})


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware that logs every request/response pair.

    Added to the FastAPI app in main.py via:
        app.add_middleware(RequestLoggingMiddleware)
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Generate or inherit request ID
        request_id = (
            request.headers.get("X-Request-ID")
            or str(uuid.uuid4()).replace("-", "")[:16]
        )

        # Set context vars for this request's async task tree
        set_request_context(
            request_id=request_id,
            path=request.url.path,
            method=request.method,
        )

        start = time.perf_counter()
        response: Response | None = None

        try:
            response = await call_next(request)
            duration_ms = int((time.perf_counter() - start) * 1000)

            # Skip noisy health-check logs
            if request.url.path not in _SILENT_PATHS:
                level = "warning" if response.status_code >= 400 else "info"
                getattr(logger, level)(
                    "%s %s → %d (%dms)",
                    request.method,
                    request.url.path,
                    response.status_code,
                    duration_ms,
                    extra={
                        "status_code": response.status_code,
                        "duration_ms": duration_ms,
                        "client_ip": _get_client_ip(request),
                        "user_agent": request.headers.get("user-agent", ""),
                    },
                )

            response.headers["X-Request-ID"] = request_id
            return response

        except Exception as exc:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.error(
                "Unhandled exception: %s %s (%dms)",
                request.method,
                request.url.path,
                duration_ms,
                exc_info=exc,
                extra={"client_ip": _get_client_ip(request)},
            )
            raise


def _get_client_ip(request: Request) -> str:
    """Extract real client IP, honouring X-Forwarded-For from trusted proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return ""
