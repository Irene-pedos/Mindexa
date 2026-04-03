"""
app/utils/validators.py

Shared validation functions used in Pydantic schemas and service layers.
Pure functions — no DB access, no I/O.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

from app.core.config import settings
from app.core.exceptions import FileTypeNotAllowedError, FileTooLargeError


# ── String Validators ─────────────────────────────────────────────────────────

def validate_password_strength(password: str) -> str:
    """
    Validates password meets minimum requirements.
    Returns the password unchanged if valid; raises ValueError if not.
    Can be used directly as a Pydantic field_validator.
    """
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        raise ValueError(
            f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters."
        )
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one number.")
    return password


def validate_uuid(value: str | uuid.UUID) -> uuid.UUID:
    """Coerce and validate a value to UUID. Raises ValueError for invalid input."""
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"'{value}' is not a valid UUID.") from exc


def sanitise_filename(filename: str) -> str:
    """
    Remove path traversal characters and normalise a filename.
    Never trust a client-supplied filename directly.
    Uses pathlib so it handles both Windows and Linux paths safely.
    """
    # Strip any directory components (handles both / and \ separators)
    safe = Path(filename).name
    # Replace characters that are unsafe on both Windows and Linux
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", safe)
    # Collapse whitespace
    safe = re.sub(r"\s+", "_", safe.strip())
    # Limit total length
    if len(safe) > 200:
        stem = Path(safe).stem[:195]
        suffix = Path(safe).suffix
        safe = f"{stem}{suffix}"
    return safe or "upload"


# ── File Validators ───────────────────────────────────────────────────────────

def validate_upload_file(filename: str, file_size_bytes: int) -> str:
    """
    Validate a file upload against platform policies.
    Returns the safe filename if valid.
    Raises FileTooLargeError or FileTypeNotAllowedError if not.
    """
    if file_size_bytes > settings.max_upload_size_bytes:
        raise FileTooLargeError(max_mb=settings.MAX_UPLOAD_SIZE_MB)

    extension = Path(filename).suffix.lstrip(".").lower()
    if extension not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise FileTypeNotAllowedError(extension=extension)

    return sanitise_filename(filename)


# ── Academic Validators ───────────────────────────────────────────────────────

def validate_marks_range(marks: int | float, total_marks: int | float) -> None:
    """Validate awarded marks are not negative and don't exceed total."""
    if marks < 0:
        raise ValueError("Marks cannot be negative.")
    if marks > total_marks:
        raise ValueError(
            f"Awarded marks ({marks}) cannot exceed total marks ({total_marks})."
        )


def validate_percentage(value: float, field_name: str = "value") -> float:
    """Validate a value is between 0 and 100 inclusive."""
    if not (0.0 <= value <= 100.0):
        raise ValueError(f"{field_name} must be between 0 and 100.")
    return value


def validate_duration_minutes(minutes: int) -> int:
    """Validate assessment duration is between 1 minute and 8 hours."""
    if minutes < 1:
        raise ValueError("Duration must be at least 1 minute.")
    if minutes > 480:
        raise ValueError("Duration cannot exceed 480 minutes (8 hours).")
    return minutes
