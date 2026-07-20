"""
app/core/handlers.py

Global FastAPI exception handlers.
Never expose stack traces or internal details to clients.
All errors follow a consistent JSON envelope.
"""

from __future__ import annotations

import traceback
import uuid

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.exceptions import MindexaError
from app.core.logging import get_logger

logger = get_logger(__name__)


def _error_response(
    *,
    status_code: int,
    error_code: str,
    message: str,
    request_id: str | None = None,
    validation_errors: list[dict] | None = None,
) -> JSONResponse:
    body: dict = {"error": {"code": error_code, "message": message}}
    if request_id:
        body["error"]["request_id"] = request_id
    if validation_errors:
        body["error"]["errors"] = validation_errors
    return JSONResponse(status_code=status_code, content=body)


def register_exception_handlers(app: FastAPI) -> None:

    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        error_msg = str(exc.orig) if exc.orig else str(exc)
        
        # Determine user-friendly message
        friendly_message = "A resource with these details already exists."
        if "unique" in error_msg.lower() or "already exists" in error_msg.lower():
            if "code" in error_msg.lower():
                friendly_message = "This entity code is already in use within this scope."
            elif "email" in error_msg.lower():
                friendly_message = "This email address is already registered."
            elif "name" in error_msg.lower():
                friendly_message = "This entity name is already in use within this scope."

        logger.info(
            "integrity_error",
            message=error_msg,
            path=str(request.url),
            request_id=request_id,
        )
        return _error_response(
            status_code=status.HTTP_409_CONFLICT,
            error_code="ALREADY_EXISTS",
            message=friendly_message,
            request_id=request_id,
        )

    @app.exception_handler(MindexaError)
    async def handle_mindexa_exception(request: Request, exc: MindexaError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        logger.warning(
            "mindexa_exception",
            error_code=exc.code,
            message=exc.detail,
            status_code=exc.status_code,
            path=str(request.url),
            request_id=request_id,
        )
        
        message = exc.detail
        detail_lower = (exc.detail or "").lower()
        if any(
            pattern in detail_lower
            for pattern in [
                "getaddrinfo failed",
                "errno 11001",
                "connecterror",
                "nameorpolicynotknown",
                "connection refused",
                "socket.gaierror",
                "all configured ai providers failed",
            ]
        ):
            message = "Network problem: Unable to connect to AI services. Please check your internet connection and try again."

        response = _error_response(
            status_code=exc.status_code,
            error_code=exc.code,
            message=message,
            request_id=request_id,
        )
        headers = getattr(exc, "headers", None)
        if headers:
            for key, value in headers.items():
                response.headers[key] = value
        return response

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        errors = []
        for error in exc.errors():
            field_path = " → ".join(str(loc) for loc in error["loc"] if loc != "body")
            errors.append({
                "field": field_path or "body",
                "message": error["msg"],
                "type": error["type"],
            })
        
        # Enhanced message to help debugging
        detail_messages = [f"{e['field']}: {e['message']}" for e in errors]
        combined_msg = "Validation failed: " + " | ".join(detail_messages)
            
        logger.info("validation_error", path=str(request.url), errors=errors, request_id=request_id)
        return _error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code="VALIDATION_ERROR",
            message=combined_msg,
            request_id=request_id,
            validation_errors=errors,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        error_code_map = {
            400: "BAD_REQUEST", 401: "AUTHENTICATION_FAILED", 403: "PERMISSION_DENIED",
            404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 409: "CONFLICT",
            422: "UNPROCESSABLE_ENTITY", 429: "RATE_LIMIT_EXCEEDED",
            500: "INTERNAL_ERROR", 503: "SERVICE_UNAVAILABLE",
        }
        error_code = error_code_map.get(exc.status_code, "HTTP_ERROR")
        logger.info("http_exception", status_code=exc.status_code, path=str(request.url))
        response = _error_response(
            status_code=exc.status_code,
            error_code=error_code,
            message=str(exc.detail) if exc.detail else "An error occurred.",
            request_id=request_id,
        )
        headers = getattr(exc, "headers", None)
        if headers:
            for key, value in headers.items():
                response.headers[key] = value
        return response

    @app.exception_handler(Exception)
    async def handle_unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        
        # Log full traceback for server-side monitoring
        logger.error(
            "unhandled_exception",
            exc_type=type(exc).__name__,
            exc_message=str(exc),
            path=str(request.url),
            method=request.method,
            request_id=request_id,
            traceback=traceback.format_exc(),
        )

        error_message = f"An unexpected error occurred. Reference ID: {request_id}"
        
        # Surface internal error details ONLY if in DEBUG mode
        if settings.DEBUG:
            error_message += f" | Detail: [{type(exc).__name__}] {str(exc)}"

        return _error_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="INTERNAL_ERROR",
            message=error_message,
            request_id=request_id,
        )
