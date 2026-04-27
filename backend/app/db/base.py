"""
app/db/base.py

Base model classes and shared field factories for all Mindexa database models.
This file enforces a strict SQLModel-only pattern.

HIERARCHY:
    SQLModel
      ├── IDMixin
      ├── CreatedOnlyMixin
      ├── TimestampMixin (CreatedOnlyMixin)
      ├── SoftDeleteMixin
      ├── AuditMixin
      │
      ├── AppendOnlyModel (IDMixin, CreatedOnlyMixin)
      ├── BaseModel (IDMixin, TimestampMixin, SoftDeleteMixin)
      └── AuditedBaseModel (BaseModel, AuditMixin)
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, text
from sqlmodel import Field, SQLModel

# ---------------------------------------------------------------------------
# UTILITY FUNCTIONS
# ---------------------------------------------------------------------------

def utcnow() -> datetime:
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(UTC)


def _camel_to_snake(name: str) -> str:
    """Convert CamelCase class name to snake_case table name."""
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


# ---------------------------------------------------------------------------
# MIXINS
# ---------------------------------------------------------------------------

class IDMixin(SQLModel):
    """Provides a UUID primary key with server-side generation."""
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )


class CreatedOnlyMixin(SQLModel):
    """Provides only the created_at column."""
    created_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": text("TIMEZONE('utc', NOW())")},
    )


class TimestampMixin(CreatedOnlyMixin):
    """Adds updated_at to the created_at field."""
    updated_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={
            "server_default": text("TIMEZONE('utc', NOW())"),
            "onupdate": text("TIMEZONE('utc', NOW())"),
        },
    )


class SoftDeleteMixin(SQLModel):
    """Provides fields for soft-deletion support."""
    is_deleted: bool = Field(default=False, nullable=False, index=True)
    deleted_at: datetime | None = Field(
        default=None,
        nullable=True,
        sa_type=DateTime(timezone=True),
    )


class AuditMixin(SQLModel):
    """Tracks identity of creator and last modifier."""
    created_by_id: uuid.UUID | None = Field(default=None, index=True)
    updated_by_id: uuid.UUID | None = Field(default=None)


# ---------------------------------------------------------------------------
# BASE MODELS
# ---------------------------------------------------------------------------

class AppendOnlyModel(IDMixin, CreatedOnlyMixin, SQLModel):
    """Base for immutable append-only tables."""
    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if not getattr(cls, "__tablename__", None) and cls.__dict__.get("__table__") is not None:
            cls.__tablename__ = _camel_to_snake(cls.__name__)


class BaseModel(IDMixin, TimestampMixin, SoftDeleteMixin, SQLModel):
    """Root base for standard domain entities."""
    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if not getattr(cls, "__tablename__", None):
            cls.__tablename__ = _camel_to_snake(cls.__name__)

    def soft_delete(self, deleter_id: uuid.UUID | None = None) -> None:
        """Mark this record as deleted."""
        self.is_deleted = True
        self.deleted_at = utcnow()
        if deleter_id and hasattr(self, "updated_by_id"):
            self.updated_by_id = deleter_id


class AuditedBaseModel(BaseModel, AuditMixin):
    """Base for high-accountability entities."""
    pass
