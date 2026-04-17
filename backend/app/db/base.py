"""
app/db/base.py

Base model classes and shared field factories for all Mindexa database models.

Inheritance paths:
  AppendOnlyModel    — for immutable ledger tables (audit_log, integrity_event,
                        security_event, ai_action_log). Has ONLY created_at.
                        No updated_at. No soft delete. No audit fields.

  BaseModel          — for standard domain entities. Has UUID PK, created_at,
                        updated_at, is_deleted, deleted_at.

  AuditedBaseModel   — for high-accountability entities that must track who
                        created and last modified them. Inherits everything
                        from BaseModel and adds created_by_id, updated_by_id.

Tables and their base class:
  AppendOnlyModel    -> audit_log, integrity_event, security_event, ai_action_log
  AuditedBaseModel   -> assessment, submission_grade, rubric, ai_grade_review
  BaseModel          -> everything else

IMPORTANT — SQLModel usage:
  All Phase 4+ models use SQLModel (from sqlmodel import Field, Relationship).
  Phase 3 auth models use the SQLAlchemy Base alias at the bottom of this file.
  Do NOT mix the two in the same table hierarchy.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlmodel import Field, SQLModel

# ---------------------------------------------------------------------------
# UTILITY FUNCTIONS
# ---------------------------------------------------------------------------


def utcnow() -> datetime:
    """
    Return the current UTC time as a timezone-aware datetime.
    Always use this — never datetime.utcnow() (naive, deprecated in 3.12+).
    """
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    """Generate a new UUID4. Used as default_factory for primary keys."""
    return uuid.uuid4()


def _camel_to_snake(name: str) -> str:
    """
    Convert CamelCase class name to snake_case table name.

    Examples:
        UserProfile       -> user_profile
        AssessmentAttempt -> assessment_attempt
        AIActionLog       -> ai_action_log
        ClassSection      -> class_section
    """
    s1 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    s2 = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s1)
    return s2.lower()


# ---------------------------------------------------------------------------
# MIXINS
# ---------------------------------------------------------------------------


class CreatedOnlyMixin(SQLModel):
    """
    Provides ONLY created_at.

    Use for append-only tables where records are never updated.
    Tables: audit_log, integrity_event, security_event, ai_action_log
    """

    created_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_column_kwargs={"server_default": text("TIMEZONE('utc', NOW())")},
    )


class TimestampMixin(SQLModel):
    """
    Provides created_at and updated_at.

    Use for standard domain entities where records can be updated.
    """

    created_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_column_kwargs={"server_default": text("TIMEZONE('utc', NOW())")},
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_column_kwargs={
            "server_default": text("TIMEZONE('utc', NOW())"),
            "onupdate": text("TIMEZONE('utc', NOW())"),
        },
    )


class SoftDeleteMixin(SQLModel):
    """
    Provides is_deleted and deleted_at for soft-delete support.

    RULE: Every repository querying a soft-deletable model MUST filter
    WHERE is_deleted = false by default.
    """

    is_deleted: bool = Field(default=False, nullable=False, index=True)
    deleted_at: Optional[datetime] = Field(default=None, nullable=True)

    def soft_delete(self) -> None:
        """Mark this record as deleted. Call inside an active DB session."""
        self.is_deleted = True
        self.deleted_at = utcnow()


class AuditMixin(SQLModel):
    """
    Tracks who created and last modified a record.

    Plain UUID columns (not FK declarations) to avoid circular imports.
    Logical FK to user.id is enforced at the service layer.
    """

    created_by_id: Optional[uuid.UUID] = Field(
        default=None, nullable=True, index=True
    )
    updated_by_id: Optional[uuid.UUID] = Field(default=None, nullable=True)


# ---------------------------------------------------------------------------
# BASE CLASSES
# ---------------------------------------------------------------------------


class AppendOnlyModel(CreatedOnlyMixin, SQLModel):
    """
    Base for immutable append-only tables (audit_log, security_event, etc.).

    Has: UUID PK, created_at only.
    No updated_at, no soft-delete, no audit actor fields.
    """

    id: uuid.UUID = Field(
        default_factory=new_uuid,
        primary_key=True,
        nullable=False,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )

    class Config:
        arbitrary_types_allowed = True
        from_attributes = True

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if not getattr(cls, "__tablename__", None):
            cls.__tablename__ = _camel_to_snake(cls.__name__)


class BaseModel(TimestampMixin, SoftDeleteMixin, SQLModel):
    """
    Root base for standard domain entities.

    Has: UUID PK, created_at, updated_at, is_deleted, deleted_at.
    No audit actor fields — use AuditedBaseModel for those.
    """

    id: uuid.UUID = Field(
        default_factory=new_uuid,
        primary_key=True,
        nullable=False,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")},
    )

    class Config:
        arbitrary_types_allowed = True
        from_attributes = True

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if not getattr(cls, "__tablename__", None):
            cls.__tablename__ = _camel_to_snake(cls.__name__)


class AuditedBaseModel(AuditMixin, BaseModel):
    """
    Base for high-accountability entities requiring WHO made each change.

    Has everything in BaseModel plus created_by_id, updated_by_id.
    Tables: assessment, submission_grade, rubric, ai_grade_review,
            lecturer_course_assignment, student_enrollment
    """

    pass


# ---------------------------------------------------------------------------
# BACKWARD-COMPAT ALIAS FOR PHASE 3 AUTH MODELS
# ---------------------------------------------------------------------------
# Phase 3 auth models (User, UserProfile, RefreshToken, etc.) were written
# using SQLAlchemy's DeclarativeBase. We keep this alias so those imports
# continue to work while auth models are migrated in a later phase.
# New Phase 4+ models must use BaseModel / AuditedBaseModel above.

from sqlalchemy.orm import DeclarativeBase as _DeclarativeBase  # noqa: E402


class Base(_DeclarativeBase):
    """
    SQLAlchemy declarative base — for Phase 3 auth models only.
    New models must use BaseModel or AuditedBaseModel (SQLModel-based).
    """

    pass
