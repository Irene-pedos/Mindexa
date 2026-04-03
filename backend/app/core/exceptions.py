"""
app/core/exceptions.py

Custom exception hierarchy for Mindexa.

Every exception carries:
  - error_code   — machine-readable string for frontend handling
  - http_status  — set at class level, not at raise site
  - message      — safe human-readable message (no internal details)
"""

from __future__ import annotations

from typing import Any


class MindexaException(Exception):
    http_status: int = 500
    error_code: str = "INTERNAL_ERROR"
    default_message: str = "An unexpected error occurred."

    def __init__(
        self,
        message: str | None = None,
        *,
        detail: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.message = message or self.default_message
        self.detail = detail
        self.headers = headers
        super().__init__(self.message)


# ── Auth & Permission ─────────────────────────────────────────────────────────

class AuthenticationError(MindexaException):
    http_status = 401
    error_code = "AUTHENTICATION_FAILED"
    default_message = "Authentication credentials are missing or invalid."

    def __init__(self, message: str | None = None, **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.headers = self.headers or {"WWW-Authenticate": "Bearer"}


class InvalidTokenError(AuthenticationError):
    error_code = "INVALID_TOKEN"
    default_message = "The provided token is invalid or has expired."


class TokenExpiredError(AuthenticationError):
    error_code = "TOKEN_EXPIRED"
    default_message = "Your session has expired. Please log in again."


class PermissionDeniedError(MindexaException):
    http_status = 403
    error_code = "PERMISSION_DENIED"
    default_message = "You do not have permission to perform this action."


class RoleRequiredError(PermissionDeniedError):
    error_code = "ROLE_REQUIRED"
    default_message = "This action requires a specific role."

    def __init__(self, required_role: str, **kwargs: Any) -> None:
        super().__init__(f"This action requires the '{required_role}' role.", **kwargs)
        self.required_role = required_role


# ── Resource ──────────────────────────────────────────────────────────────────

class NotFoundError(MindexaException):
    http_status = 404
    error_code = "NOT_FOUND"
    default_message = "The requested resource was not found."

    def __init__(
        self,
        resource: str = "Resource",
        resource_id: Any = None,
        **kwargs: Any,
    ) -> None:
        id_str = f" with id '{resource_id}'" if resource_id is not None else ""
        super().__init__(f"{resource}{id_str} was not found.", **kwargs)
        self.resource = resource
        self.resource_id = resource_id


class ConflictError(MindexaException):
    http_status = 409
    error_code = "CONFLICT"
    default_message = "A conflict occurred with the current state of the resource."


class AlreadyExistsError(ConflictError):
    error_code = "ALREADY_EXISTS"
    default_message = "A resource with these details already exists."

    def __init__(self, resource: str = "Resource", **kwargs: Any) -> None:
        super().__init__(f"{resource} already exists.", **kwargs)


# ── Validation ────────────────────────────────────────────────────────────────

class ValidationError(MindexaException):
    http_status = 422
    error_code = "VALIDATION_ERROR"
    default_message = "The provided data is invalid."


class BadRequestError(MindexaException):
    http_status = 400
    error_code = "BAD_REQUEST"
    default_message = "The request is malformed or contains invalid parameters."


# ── Assessment & Academic ─────────────────────────────────────────────────────

class AssessmentNotAvailableError(MindexaException):
    http_status = 403
    error_code = "ASSESSMENT_NOT_AVAILABLE"
    default_message = "This assessment is not currently available."


class AssessmentWindowClosedError(MindexaException):
    http_status = 403
    error_code = "ASSESSMENT_WINDOW_CLOSED"
    default_message = "The submission window for this assessment has closed."


class AttemptAlreadyActiveError(MindexaException):
    http_status = 409
    error_code = "ATTEMPT_ALREADY_ACTIVE"
    default_message = "You already have an active attempt for this assessment."


class AttemptNotActiveError(MindexaException):
    http_status = 400
    error_code = "ATTEMPT_NOT_ACTIVE"
    default_message = "There is no active attempt to perform this action on."


class MaxAttemptsReachedError(MindexaException):
    http_status = 403
    error_code = "MAX_ATTEMPTS_REACHED"
    default_message = "You have reached the maximum number of attempts."


class NotEnrolledError(MindexaException):
    http_status = 403
    error_code = "NOT_ENROLLED"
    default_message = "You are not enrolled in the course for this assessment."


class WrongPasswordError(MindexaException):
    http_status = 401
    error_code = "WRONG_ASSESSMENT_PASSWORD"
    default_message = "The assessment password is incorrect."


class AIBlockedError(MindexaException):
    http_status = 403
    error_code = "AI_BLOCKED"
    default_message = (
        "AI assistance is not permitted during this assessment. "
        "Study support AI is disabled for protected assessments."
    )


# ── AI & Agent ────────────────────────────────────────────────────────────────

class AIServiceError(MindexaException):
    http_status = 502
    error_code = "AI_SERVICE_ERROR"
    default_message = "The AI service is temporarily unavailable. Please try again."


class AIRateLimitError(MindexaException):
    http_status = 429
    error_code = "AI_RATE_LIMIT"
    default_message = "AI rate limit reached. Please wait before retrying."


# ── File ──────────────────────────────────────────────────────────────────────

class FileTooLargeError(MindexaException):
    http_status = 413
    error_code = "FILE_TOO_LARGE"
    default_message = "The uploaded file exceeds the maximum allowed size."

    def __init__(self, max_mb: int, **kwargs: Any) -> None:
        super().__init__(f"File exceeds the maximum size of {max_mb}MB.", **kwargs)


class FileTypeNotAllowedError(MindexaException):
    http_status = 415
    error_code = "FILE_TYPE_NOT_ALLOWED"
    default_message = "This file type is not permitted."

    def __init__(self, extension: str, **kwargs: Any) -> None:
        super().__init__(f"File type '.{extension}' is not allowed.", **kwargs)


# ── Rate Limiting ─────────────────────────────────────────────────────────────

class RateLimitExceededError(MindexaException):
    http_status = 429
    error_code = "RATE_LIMIT_EXCEEDED"
    default_message = "Too many requests. Please slow down."


# ── Infrastructure ────────────────────────────────────────────────────────────

class DatabaseError(MindexaException):
    http_status = 500
    error_code = "DATABASE_ERROR"
    default_message = "A database error occurred. Please try again."


class ServiceUnavailableError(MindexaException):
    http_status = 503
    error_code = "SERVICE_UNAVAILABLE"
    default_message = "The service is temporarily unavailable."
