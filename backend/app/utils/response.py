"""
app/utils/response.py

Standard API response wrappers.

Success:  { "data": {...}, "message": "..." }
Error:    { "error": { "code": "...", "message": "..." } }   ← from handlers.py
"""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class SuccessResponse(BaseModel, Generic[T]):
    """
    Standard success response wrapping a single item.

    Usage in route:
        return SuccessResponse(data=user, message="User retrieved.")
    """
    data: T
    message: str = "Success."


class MessageResponse(BaseModel):
    """
    Lightweight response for operations that return no data.
    Use for deletes, confirmations, and state-change acknowledgements.
    """
    message: str
    success: bool = True


def success(data: Any, message: str = "Success.") -> dict[str, Any]:
    """Build a plain dict success response (for JSONResponse use cases)."""
    return {"data": data, "message": message}


def message_only(text: str, success: bool = True) -> dict[str, Any]:
    """Build a minimal message-only response dict."""
    return {"message": text, "success": success}
