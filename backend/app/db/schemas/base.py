"""
app/db/schemas/base.py

Shared base schemas, pagination helpers, and standard API response wrappers.

Rules applied throughout all Mindexa schemas:
    1. Request schemas never include id, created_at, updated_at, is_deleted.
       These are DB-managed fields — the client never sets them.

    2. Response schemas always include id and created_at at minimum.
       They inherit from BaseResponse which provides these.

    3. All UUIDs are serialised as strings in JSON responses (uuid_serializer).

    4. Sensitive fields (hashed_password, access_password_hash, file_path)
       are NEVER present on any response schema.

    5. Enum fields on response schemas use their string VALUE, not the
       enum object, so the JSON is human-readable.

    6. Optional fields on request schemas default to None unless there is a
       clear business reason for a different default.

    7. All text fields that accept user input are stripped of leading/trailing
       whitespace via a validator.

    8. Paginated list endpoints always return PaginatedResponse[T] so the
       frontend always gets: items, total, page, page_size, has_next.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ─────────────────────────────────────────────────────────────────────────────
# BASE CONFIG
# ─────────────────────────────────────────────────────────────────────────────

class MindexaSchema(BaseModel):
    """
    Base Pydantic model for all Mindexa schemas.

    Applies shared configuration:
        - from_attributes=True  → allows ORM model → schema coercion
        - populate_by_name=True → allows both alias and field name
        - str_strip_whitespace  → auto-strips whitespace from str fields
        - use_enum_values=True  → serialises enums as their values (str/int)
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
        use_enum_values=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# BASE RESPONSE
# ─────────────────────────────────────────────────────────────────────────────

class BaseResponse(MindexaSchema):
    """
    Base for all API response schemas.

    Every database entity response includes id and created_at.
    This enforces consistency — clients can always sort and key by these.
    """

    id: uuid.UUID
    created_at: datetime


class BaseAuditedResponse(BaseResponse):
    """
    Base for audited entity responses.

    Adds updated_at for entities that use TimestampMixin.
    """

    updated_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# PAGINATION
# ─────────────────────────────────────────────────────────────────────────────

T = TypeVar("T")


class PaginatedResponse(MindexaSchema, Generic[T]):
    """
    Standard paginated list response wrapper.

    All list endpoints return this shape:
    {
        "items": [...],
        "total": 84,
        "page": 1,
        "page_size": 20,
        "has_next": true
    }
    """

    items: List[T]
    total: int = Field(ge=0, description="Total number of matching records.")
    page: int = Field(ge=1, description="Current page number (1-based).")
    page_size: int = Field(ge=1, le=100, description="Records per page.")
    has_next: bool = Field(description="True if there are more pages after this one.")


class PaginationParams(MindexaSchema):
    """
    Standard query parameters for paginated endpoints.

    Used as a FastAPI dependency:
        async def list_assessments(pagination: PaginationParams = Depends()):
    """

    page: int = Field(default=1, ge=1, description="Page number (1-based).")
    page_size: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Number of records per page (max 100).",
    )

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


# ─────────────────────────────────────────────────────────────────────────────
# STANDARD API RESPONSES
# ─────────────────────────────────────────────────────────────────────────────

class MessageResponse(MindexaSchema):
    """
    Simple message response for operations that don't return an entity.
    Used for: delete confirmations, status updates, publish triggers.
    """

    message: str
    success: bool = True


class ErrorDetail(MindexaSchema):
    """Single error detail object within an ErrorResponse."""

    field: Optional[str] = None
    message: str
    code: Optional[str] = None


class ErrorResponse(MindexaSchema):
    """
    Standard error response body.

    Returned by the global exception handler for all 4xx and 5xx errors.
    The `errors` list allows multiple field-level validation errors to be
    returned in a single response.
    """

    success: bool = False
    message: str
    errors: List[ErrorDetail] = Field(default_factory=list)
    request_id: Optional[str] = None
