"""
app/core/exceptions.py

Custom exception hierarchy for Mindexa Platform.

STRUCTURE:
    MindexaError (base)
    ├── AuthenticationError      → 401 Unauthorized
    │   ├── InvalidCredentialsError → 401 (wrong email/password — enumeration-safe)
    │   ├── TokenExpiredError    → 401 (token past expiry)
    │   └── InvalidTokenError    → 401 (malformed / bad signature / wrong type)
    ├── AuthorizationError       → 403 Forbidden
    │   ├── PermissionDeniedError → 403 (authenticated but not allowed)
    │   └── RoleRequiredError    → 403 (wrong role for this endpoint)
    ├── AccountError             → 403 (account state blocks access)
    │   ├── AccountSuspendedError
    │   ├── AccountInactiveError
    │   ├── AccountLockedError
    │   └── EmailNotVerifiedError
    ├── NotFoundError            → 404 Not Found
    ├── AlreadyExistsError       → 409 Conflict (duplicate resource)
    │   └── EmailAlreadyRegisteredError
    ├── ConflictError            → 409 Conflict (state conflict)
    ├── ValidationError          → 422 Unprocessable Entity
    ├── RateLimitError           → 429 Too Many Requests
    ├── FileTooLargeError        → 413 Payload Too Large
    ├── FileTypeNotAllowedError  → 415 Unsupported Media Type
    └── InternalError            → 500 Internal Server Error

All exceptions carry:
    - detail:  human-readable message (shown to client)
    - code:    machine-readable string (used by frontend to branch logic)
    - context: arbitrary kwargs for logging/debugging

NAMING ALIASES:
    Several exception names exist in two forms for backward compatibility
    and clarity at call sites. Both point to the same class.

        TokenInvalidError   ← same as → InvalidTokenError
        ConflictError       ← same as → AlreadyExistsError (for generic conflicts)
"""

from __future__ import annotations

from typing import Any

# ─────────────────────────────────────────────────────────────────────────────
# BASE
# ─────────────────────────────────────────────────────────────────────────────


class MindexaError(Exception):
    """
    Base exception for all Mindexa application errors.

    Every exception subclass must define:
        status_code    — the HTTP status code for this error category
        default_message — what the user sees if no detail is provided
        default_code   — machine-readable string for frontend routing

    Usage:
        raise NotFoundError(resource="Assessment", resource_id=str(assessment_id))
        raise AuthenticationError(detail="Token has been revoked.")
    """

    status_code: int = 500
    default_message: str = "An unexpected error occurred."
    default_code: str = "internal_error"

    def __init__(
        self,
        detail: str | None = None,
        code: str | None = None,
        **context: Any,
    ) -> None:
        self.detail = detail or self.default_message
        self.code = code or self.default_code
        self.context = context
        super().__init__(self.detail)


# ─────────────────────────────────────────────────────────────────────────────
# AUTHENTICATION  (401)
# ─────────────────────────────────────────────────────────────────────────────


class AuthenticationError(MindexaError):
    """
    Raised when authentication credentials are missing, expired, or invalid.
    Maps to HTTP 401.
    """

    status_code = 401
    default_message = "Authentication required."
    default_code = "authentication_required"


class InvalidCredentialsError(AuthenticationError):
    """
    Raised when an email/password combination is incorrect.

    SECURITY: The message is intentionally vague — we never reveal whether
    the email exists or the password is wrong. Both cases return the same
    user-facing text to prevent user enumeration attacks.
    """

    default_message = "Invalid email or password."
    default_code = "invalid_credentials"


class TokenExpiredError(AuthenticationError):
    """Raised when a JWT token has passed its expiry time (exp claim)."""

    default_message = "Your session has expired. Please log in again."
    default_code = "token_expired"


class InvalidTokenError(AuthenticationError):
    """
    Raised when a JWT token fails cryptographic validation.

    Covers:
        - Malformed token (cannot be decoded at all)
        - Bad signature (tampered payload)
        - Wrong token type (refresh used as access, or vice versa)
        - Missing required claims (sub, jti, etc.)
        - Token has been revoked (blocklisted JTI)
    """

    default_message = "Invalid authentication token."
    default_code = "token_invalid"


# Backward-compatible alias — some modules import TokenInvalidError
TokenInvalidError = InvalidTokenError


# ─────────────────────────────────────────────────────────────────────────────
# AUTHORIZATION  (403)
# ─────────────────────────────────────────────────────────────────────────────


class AuthorizationError(MindexaError):
    """
    Raised when a user is authenticated but lacks permission for an action.
    Maps to HTTP 403.
    """

    status_code = 403
    default_message = "You do not have permission to perform this action."
    default_code = "forbidden"


class PermissionDeniedError(AuthorizationError):
    """
    Raised when a user's role or resource ownership check fails.

    Use this when the user is fully authenticated but is attempting to access
    a resource or perform an action they are not authorised for — e.g. a
    student trying to access lecturer-only grading endpoints, or a lecturer
    trying to modify another lecturer's assessment.
    """

    default_message = "You do not have permission to access this resource."
    default_code = "permission_denied"


class RoleRequiredError(AuthorizationError):
    """
    Raised when the user's role is insufficient for the requested endpoint.

    Includes the required role(s) in the context dict so the error handler
    can optionally surface them in the response for debugging.

    Example:
        raise RoleRequiredError(required_roles=["lecturer", "admin"])
    """

    default_message = "Your role does not have access to this resource."
    default_code = "insufficient_role"

    def __init__(
        self,
        required_roles: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.required_roles = required_roles or []


# Alias for call sites that use the more generic name
InsufficientRoleError = RoleRequiredError


# ─────────────────────────────────────────────────────────────────────────────
# ACCOUNT STATE  (403)
# ─────────────────────────────────────────────────────────────────────────────


class AccountError(AuthorizationError):
    """
    Base for errors caused by the account's current state blocking access.
    Inherits from AuthorizationError → HTTP 403.
    """

    default_code = "account_error"


class AccountSuspendedError(AccountError):
    """Raised when an admin has suspended the user's account."""

    default_message = (
        "Your account has been suspended. "
        "Please contact your institution administrator."
    )
    default_code = "account_suspended"


class AccountInactiveError(AccountError):
    """Raised when the user's account has been deactivated."""

    default_message = (
        "Your account is inactive. "
        "Please contact your institution administrator."
    )
    default_code = "account_inactive"


class AccountLockedError(AccountError):
    """
    Raised when the account is temporarily locked due to too many
    consecutive failed login attempts.

    The locked_until attribute contains the datetime when the lock expires,
    so the response handler can surface it to the client for countdown display.
    """

    default_message = (
        "Your account is temporarily locked due to too many failed login attempts. "
        "Please try again later."
    )
    default_code = "account_locked"

    def __init__(self, locked_until: Any = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.locked_until = locked_until


class EmailNotVerifiedError(AccountError):
    """
    Raised when a protected endpoint requires email verification and
    the user's email_verified flag is False.
    """

    default_message = (
        "Please verify your email address before accessing this resource. "
        "Check your inbox or request a new verification email."
    )
    default_code = "email_not_verified"


# ─────────────────────────────────────────────────────────────────────────────
# RESOURCE  (404)
# ─────────────────────────────────────────────────────────────────────────────


class NotFoundError(MindexaError):
    """
    Raised when a requested resource does not exist (or has been soft-deleted).
    Maps to HTTP 404.

    Usage:
        raise NotFoundError(resource="Assessment", resource_id=str(pk))
    """

    status_code = 404
    default_message = "The requested resource was not found."
    default_code = "not_found"

    def __init__(
        self,
        resource: str | None = None,
        resource_id: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.resource = resource
        self.resource_id = resource_id
        if resource:
            self.detail = f"{resource} not found."
            if resource_id:
                self.detail = f"{resource} with id '{resource_id}' not found."


# ─────────────────────────────────────────────────────────────────────────────
# CONFLICT / DUPLICATE  (409)
# ─────────────────────────────────────────────────────────────────────────────


class AlreadyExistsError(MindexaError):
    """
    Raised when a create operation would violate a uniqueness constraint.
    Maps to HTTP 409.

    Use this for all duplicate-resource scenarios (duplicate email, duplicate
    course code, duplicate enrollment, etc.).
    """

    status_code = 409
    default_message = "A resource with these details already exists."
    default_code = "already_exists"


class EmailAlreadyRegisteredError(AlreadyExistsError):
    """
    Raised during registration when the submitted email is already in use.

    NOTE: Only raise this during registration — never during login.
    Login always returns InvalidCredentialsError regardless of whether
    the email exists, to prevent enumeration.
    """

    default_message = "An account with this email address already exists."
    default_code = "email_already_registered"


class ConflictError(MindexaError):
    """
    Raised when an operation conflicts with the current state of a resource,
    not because of a uniqueness violation but because of a state machine rule.

    Examples:
        - Trying to publish an assessment that is already published
        - Trying to submit an attempt that is already submitted
        - Trying to release grades that have not been graded yet

    Maps to HTTP 409.
    """

    status_code = 409
    default_message = "This operation conflicts with the current resource state."
    default_code = "conflict"


# ─────────────────────────────────────────────────────────────────────────────
# VALIDATION  (422)
# ─────────────────────────────────────────────────────────────────────────────


class ValidationError(MindexaError):
    """
    Raised for business-rule validation failures that are not caught by
    Pydantic schema validation.

    Pydantic schema errors produce FastAPI's built-in 422 responses.
    This exception is for service-layer rules that require DB context to check
    (e.g. "assessment window has already closed", "max attempts exceeded").

    Maps to HTTP 422.
    """

    status_code = 422
    default_message = "The provided data failed validation."
    default_code = "validation_error"


# ─────────────────────────────────────────────────────────────────────────────
# RATE LIMIT  (429)
# ─────────────────────────────────────────────────────────────────────────────


class RateLimitError(MindexaError):
    """
    Raised when a client exceeds the configured rate limit for an endpoint.
    Maps to HTTP 429.
    """

    status_code = 429
    default_message = "Too many requests. Please slow down."
    default_code = "rate_limit_exceeded"


# ─────────────────────────────────────────────────────────────────────────────
# FILE ERRORS  (413 / 415)
# ─────────────────────────────────────────────────────────────────────────────


class FileTooLargeError(MindexaError):
    """
    Raised when an uploaded file exceeds the configured size limit.
    Maps to HTTP 413.
    """

    status_code = 413
    default_message = "The uploaded file exceeds the maximum allowed size."
    default_code = "file_too_large"

    def __init__(self, max_mb: int | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        if max_mb:
            self.detail = f"File exceeds the maximum allowed size of {max_mb}MB."


class FileTypeNotAllowedError(MindexaError):
    """
    Raised when an uploaded file has a disallowed extension or MIME type.
    Maps to HTTP 415.
    """

    status_code = 415
    default_message = "This file type is not allowed."
    default_code = "file_type_not_allowed"

    def __init__(self, extension: str | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        if extension:
            self.detail = f"File type '.{extension}' is not allowed."


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL  (500)
# ─────────────────────────────────────────────────────────────────────────────


class InternalError(MindexaError):
    """
    Raised for unexpected server-side errors.
    The detail is intentionally generic — never expose stack traces to clients.
    Maps to HTTP 500.
    """

    status_code = 500
    default_message = "An internal server error occurred. Please try again."
    default_code = "internal_error"
