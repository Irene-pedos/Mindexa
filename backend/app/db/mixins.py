"""
app/db/mixins.py

Reusable field definitions and model-level utility functions
shared across multiple domain models.

These are NOT SQLModel classes — they are functions that return
pre-configured Field() instances with consistent settings.
Import what you need into each model file.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Column, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field

# ─────────────────────────────────────────────────────────────────────────────
# REUSABLE FIELD FACTORIES
# ─────────────────────────────────────────────────────────────────────────────

def fk_uuid(
    foreign_table: str,
    *,
    nullable: bool = False,
    index: bool = True,
    ondelete: str = "RESTRICT",
) -> Any:
    """
    Return a pre-configured UUID foreign key field.

    Args:
        foreign_table: The target table and column, e.g. "user.id"
        nullable:      Whether this FK can be null (optional relationship)
        index:         Whether to add an index on this column
        ondelete:      PostgreSQL ON DELETE behaviour.
                       Default is RESTRICT — never silently cascade deletes
                       on this security-first platform.

    Usage:
        user_id: uuid.UUID = fk_uuid("user.id")
        course_id: Optional[uuid.UUID] = fk_uuid("course.id", nullable=True)
    """
    if nullable:
        return Field(
            default=None,
            sa_column=Column(
                UUID(as_uuid=True),
                ForeignKey(foreign_table, ondelete=ondelete),
                nullable=True,
                index=index,
            ),
        )
    return Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey(foreign_table, ondelete=ondelete),
            nullable=False,
            index=index,
        ),
    )


def optional_fk_uuid(
    foreign_table: str,
    *,
    index: bool = True,
    ondelete: str = "RESTRICT",
) -> Any:
    """
    Shorthand for a nullable UUID foreign key field.
    Equivalent to fk_uuid(..., nullable=True).

    Usage:
        department_id: Optional[uuid.UUID] = optional_fk_uuid("department.id")
    """
    return fk_uuid(foreign_table, nullable=True, index=index, ondelete=ondelete)


def short_text(max_length: int = 255, *, nullable: bool = False) -> Any:
    """
    VARCHAR field with an explicit max length.
    Use for: titles, codes, names, labels.
    Do NOT use for: free-form text, JSON, long descriptions.

    Usage:
        title: str = short_text(255)
        code: str = short_text(50)
    """
    if nullable:
        return Field(default=None, nullable=True, max_length=max_length)
    return Field(nullable=False, max_length=max_length)


def long_text(*, nullable: bool = True) -> Any:
    """
    Unbounded TEXT field for descriptions, instructions, feedback, etc.
    Nullable by default — most long text fields are optional.

    Usage:
        description: Optional[str] = long_text()
        instructions: str = long_text(nullable=False)
    """
    if nullable:
        return Field(default=None, nullable=True)
    return Field(nullable=False)


def positive_int(
    default: int | None = None,
    *,
    nullable: bool = False,
) -> Any:
    """
    Integer field with optional default, intended for counts and marks.
    Positivity is enforced at the Pydantic schema layer (ge=0 or ge=1),
    not at the DB layer (CHECK constraints would require raw SQL in migration).

    Usage:
        total_marks: int = positive_int(100)
        max_attempts: int = positive_int(1)
        credit_hours: Optional[int] = positive_int(nullable=True)
    """
    if nullable:
        return Field(default=default, nullable=True)
    if default is not None:
        return Field(default=default, nullable=False)
    return Field(nullable=False)


def non_negative_float(
    default: float | None = None,
    *,
    nullable: bool = False,
) -> Any:
    """
    Float field for percentages, scores, confidence values.
    Range validation (0.0–100.0 or 0.0–1.0) is enforced in schemas.

    Usage:
        percentage: float = non_negative_float(0.0)
        ai_confidence: Optional[float] = non_negative_float(nullable=True)
    """
    if nullable:
        return Field(default=default, nullable=True)
    if default is not None:
        return Field(default=default, nullable=False)
    return Field(nullable=False)


def bool_field(default: bool = False) -> Any:
    """
    Boolean field with an explicit default.
    Always provide a default — nullable booleans are a logic smell.

    Usage:
        is_active: bool = bool_field(True)
        is_deleted: bool = bool_field(False)
    """
    return Field(default=default, nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# INDEX HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def composite_index(table_name: str, *columns: str) -> Index:
    """
    Create a named composite index.
    SQLAlchemy requires globally unique index names — this helper
    generates a consistent naming pattern: ix_{table}_{col1}_{col2}.

    Usage in __table_args__:
        __table_args__ = (
            composite_index("assessment", "course_id", "status"),
            composite_index("assessment", "subject_id", "window_start"),
        )
    """
    col_part = "_".join(columns)
    index_name = f"ix_{table_name}_{col_part}"
    return Index(index_name, *columns)


def unique_composite_index(table_name: str, *columns: str) -> Index:
    """
    Create a named unique composite index.
    Naming pattern: uix_{table}_{col1}_{col2}.

    Usage in __table_args__:
        __table_args__ = (
            unique_composite_index("student_enrollment", "student_id", "class_section_id"),
        )
    """
    col_part = "_".join(columns)
    index_name = f"uix_{table_name}_{col_part}"
    return Index(index_name, *columns, unique=True)


# ─────────────────────────────────────────────────────────────────────────────
# MODEL-LEVEL CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# Maximum wizard step number in the assessment creation flow
ASSESSMENT_WIZARD_STEPS: int = 6

# Maximum allowed depth of question versioning (parent → child only, no deeper)
MAX_QUESTION_VERSION_DEPTH: int = 1

# Autosave expiry in days — records older than this are purgeable
AUTOSAVE_EXPIRY_DAYS: int = 7

# Vector embedding dimension matching OpenAI text-embedding-3-small
EMBEDDING_DIMENSIONS: int = 1536

