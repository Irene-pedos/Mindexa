"""
app/core/logger.py

Structured JSON logging system for Mindexa Platform.

DESIGN:
    Every log record is a JSON object with a consistent schema.
    This makes logs machine-parseable by log aggregators (Datadog, Loki, CloudWatch).

    In development, logs are human-readable (coloured text).
    In staging/production, logs are strict JSON (one object per line).

    Request middleware attaches:
        request_id  — UUID per request (X-Request-ID header)
        user_id     — from JWT if authenticated
        path        — URL path
        method      — HTTP verb

USAGE:
    from app.core.logger import get_logger
    logger = get_logger(__name__)
    logger.info("Assessment published", extra={"assessment_id": str(id)})

    # All request context is automatically included when the
    # LoggingMiddleware is active. You don't need to pass it manually.
"""

from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings

# ---------------------------------------------------------------------------
# REQUEST CONTEXT (per-request via contextvars — thread/async-safe)
# ---------------------------------------------------------------------------

# These ContextVars are set by LoggingMiddleware at the start of each request
# and automatically inherited by all coroutines within that request's scope.
_request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")
_user_id_ctx: ContextVar[str] = ContextVar("user_id", default="")
_path_ctx: ContextVar[str] = ContextVar("path", default="")
_method_ctx: ContextVar[str] = ContextVar("method", default="")


def set_request_context(
    request_id: str,
    path: str,
    method: str,
    user_id: str = "",
) -> None:
    """Set request context for the current async task tree."""
    _request_id_ctx.set(request_id)
    _path_ctx.set(path)
    _method_ctx.set(method)
    _user_id_ctx.set(user_id)


def set_user_id(user_id: str) -> None:
    """Update user_id after JWT is decoded (called by auth dependency)."""
    _user_id_ctx.set(user_id)


def get_request_id() -> str:
    return _request_id_ctx.get()


# ---------------------------------------------------------------------------
# JSON LOG FORMATTER
# ---------------------------------------------------------------------------


class JSONFormatter(logging.Formatter):
    """
    Formats log records as single-line JSON objects.

    Output schema:
    {
        "ts":         "2026-04-01T12:00:00.123Z",  # ISO-8601 UTC
        "level":      "INFO",
        "logger":     "app.services.auth_service",
        "message":    "User logged in",
        "request_id": "a1b2c3d4",
        "user_id":    "uuid-...",
        "path":       "/api/v1/auth/login",
        "method":     "POST",
        "extra":      {...},                        # any extra= kwargs
        "exc_info":   "Traceback..."               # only on errors
    }
    """

    # Fields that belong to the standard LogRecord but are not our domain fields
    _STDLIB_ATTRS = frozenset({
        "args", "created", "exc_info", "exc_text", "filename",
        "funcName", "levelname", "levelno", "lineno", "message",
        "module", "msecs", "msg", "name", "pathname", "process",
        "processName", "relativeCreated", "stack_info", "taskName",
        "thread", "threadName",
    })

    def format(self, record: logging.LogRecord) -> str:
        # Build the timestamp in UTC ISO-8601
        ts = datetime.fromtimestamp(record.created, tz=UTC).strftime(
            "%Y-%m-%dT%H:%M:%S.%f"
        )[:-3] + "Z"

        payload: dict[str, Any] = {
            "ts": ts,
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": _request_id_ctx.get() or None,
            "user_id": _user_id_ctx.get() or None,
            "path": _path_ctx.get() or None,
            "method": _method_ctx.get() or None,
        }

        # Remove None values (keep JSON lean in production)
        payload = {k: v for k, v in payload.items() if v is not None}

        # Collect any extra fields the caller passed via extra={}
        extra: dict[str, Any] = {
            k: v for k, v in record.__dict__.items()
            if k not in self._STDLIB_ATTRS
        }
        if extra:
            payload["extra"] = extra

        # Attach exception traceback if present
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        elif record.exc_text:
            payload["exc_info"] = record.exc_text

        return json.dumps(payload, default=str, ensure_ascii=False)


# ---------------------------------------------------------------------------
# HUMAN-READABLE FORMATTER (development)
# ---------------------------------------------------------------------------


class DevFormatter(logging.Formatter):
    """
    Coloured, human-readable formatter for development consoles.
    Not used in staging or production.
    """

    COLOURS = {
        "DEBUG":    "\033[36m",   # cyan
        "INFO":     "\033[32m",   # green
        "WARNING":  "\033[33m",   # yellow
        "ERROR":    "\033[31m",   # red
        "CRITICAL": "\033[35m",   # magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        colour = self.COLOURS.get(record.levelname, "")
        ts = datetime.fromtimestamp(record.created, tz=UTC).strftime(
            "%H:%M:%S.%f"
        )[:-3]
        rid = _request_id_ctx.get()
        rid_str = f" [{rid[:8]}]" if rid else ""
        uid = _user_id_ctx.get()
        uid_str = f" user={uid[:8]}" if uid else ""

        base = (
            f"{colour}{ts} {record.levelname:<8}{self.RESET}"
            f"{rid_str}{uid_str}"
            f" {record.name}: {record.getMessage()}"
        )

        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)

        return base


# ---------------------------------------------------------------------------
# LOGGER FACTORY
# ---------------------------------------------------------------------------


def configure_logging() -> None:
    """
    Configure the root logging system for the entire application.

    Called once at application startup (in main.py lifespan).
    Subsequent calls are idempotent (handler is only added if not present).
    """
    root = logging.getLogger()

    # Remove any default handlers (avoids duplicate output in Docker)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)

    if settings.is_development:
        handler.setFormatter(DevFormatter())
        root.setLevel(logging.DEBUG)
    else:
        handler.setFormatter(JSONFormatter())
        root.setLevel(logging.INFO)

    root.addHandler(handler)

    # Silence noisy third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DATABASE_ECHO else logging.WARNING
    )
    logging.getLogger("celery").setLevel(logging.INFO)
    logging.getLogger("redis").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """
    Return a named logger.

    Usage:
        logger = get_logger(__name__)
        logger.info("Something happened", extra={"key": "value"})
    """
    return logging.getLogger(name)
