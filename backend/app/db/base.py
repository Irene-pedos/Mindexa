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
  AppendOnlyModel    → audit_log, integrity_event, security_event, ai_action_log
  AuditedBaseModel   → assessment, submission_grade, rubric, ai_grade_review
  BaseModel          → everything else
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlmodel import Field, SQLModel

# ─────────────────────────────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def utcnow() -> datetime:
    """
    Return the current UTC time as a timezone-aware datetime.
    Always use this — never datetime.utcnow() (naive, deprecated in Python 3.12+).
    """
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    """Generate a new UUID4. Used as default_factory for primary keys."""
    return uuid.uuid4()


def _camel_to_snake(name: str) -> str:
    """
    Convert CamelCase class name to snake_case table name.

    Examples:
        UserProfile          → user_profile
        AssessmentAttempt    → assessment_attempt
        AIActionLog          → ai_action_log
        ClassSection         → class_section
    """
    # Handle sequences of uppercase letters (e.g. "AI" → "ai")
    s1 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    s2 = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s1)
    return s2.lower()


# ─────────────────────────────────────────────────────────────────────────────
# MIXINS
# ─────────────────────────────────────────────────────────────────────────────

class CreatedOnlyMixin(SQLModel):
    """
    Provides ONLY created_at.

    Use this for append-only tables where records are never updated.
    Adding updated_at to such tables would be misleading — the column
    would always equal created_at since the row is never modified.

    Tables that use this (via AppendOnlyModel):
        audit_log, integrity_event, security_event, ai_action_log
    """

    created_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_column_kwargs={
            "server_default": text("TIMEZONE('utc', NOW())"),
        },
    )


class TimestampMixin(SQLModel):
    """
    Provides created_at and updated_at.

    Use this for standard domain entities where records can be updated.
    The onupdate= argument ensures PostgreSQL automatically refreshes
    updated_at on every UPDATE statement touching the row.

    Tables that use this (via BaseModel or AuditedBaseModel):
        All domain tables except the append-only ledger tables above.
    """

    created_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_column_kwargs={
            "server_default": text("TIMEZONE('utc', NOW())"),
        },
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
    Provides soft-delete fields: is_deleted and deleted_at.

    CRITICAL RULE: Every repository that queries a soft-deletable model
    MUST filter WHERE is_deleted = false by default. The only place that
    may query deleted records is admin-level audit endpoints.

    This mixin is intentionally NOT applied to:
        audit_log        — immutable ledger, records must never be removed
        integrity_event  — append-only sensor feed
        security_event   — append-only security ledger
        ai_action_log    — append-only AI trace ledger
        refresh_token    — hard-deleted on logout by design
        password_reset_token — hard-deleted after use
    """

    is_deleted: bool = Field(
        default=False,
        nullable=False,
        index=True,
    )
    deleted_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
    )

    def soft_delete(self) -> None:
        """
        Mark this record as deleted.
        Always call inside an active DB session, then flush/commit.
        Never call this directly from a route handler — call through
        a service function that also writes to audit_log.
        """
        self.is_deleted = True
        self.deleted_at = utcnow()


class AuditMixin(SQLModel):
    """
    Tracks who created and last modified a record.

    These are plain UUID columns, not declared FK fields, to avoid
    circular import issues between domain modules. The logical FK
    relationship to user.id is enforced at the service layer, not here.

    Rules:
        - created_by_id is set on INSERT by the service function
        - updated_by_id is updated on every significant UPDATE
        - Repositories must never set these — only service functions do
        - Both are nullable to support system-generated records (e.g. Celery tasks)
          where no human user initiated the action
    """

    created_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    updated_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# BASE CLASSES
# ─────────────────────────────────────────────────────────────────────────────

class AppendOnlyModel(CreatedOnlyMixin, SQLModel):
    """
    Base class for immutable append-only tables.

    Deliberately contains:
        ✅ UUID primary key
        ✅ created_at only

    Deliberately EXCLUDES:
        ❌ updated_at      — records are never modified
        ❌ is_deleted      — records are never removed
        ❌ deleted_at      — records are never removed
        ❌ created_by_id   — the initiating actor is a domain column on each
                             table (e.g. actor_id on audit_log, user_id on
                             security_event), not a generic audit field
        ❌ updated_by_id   — no update path exists

    Tables using this base:
        audit_log, integrity_event, security_event, ai_action_log

    Enforcement: The service layer must never call UPDATE or DELETE on
    these tables. Repositories must only expose create() and query().
    """

    id: uuid.UUID = Field(
        default_factory=new_uuid,
        primary_key=True,
        nullable=False,
        sa_column_kwargs={
            "server_default": text("gen_random_uuid()"),
        },
    )

    class Config:
        arbitrary_types_allowed = True
        from_attributes = True

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if not hasattr(cls, "__tablename__") or cls.__tablename__ is None:
            cls.__tablename__ = _camel_to_snake(cls.__name__)  # type: ignore[attr-defined]


class BaseModel(TimestampMixin, SoftDeleteMixin, SQLModel):
    """
    Root base class for all standard domain entities.

    Contains:
        ✅ UUID primary key
        ✅ created_at
        ✅ updated_at
        ✅ is_deleted
        ✅ deleted_at

    Does NOT contain:
        ❌ created_by_id / updated_by_id  — use AuditedBaseModel for those

    Tables using this base: most domain tables — see AuditedBaseModel
    for the subset that also needs audit actor tracking.
    """

    id: uuid.UUID = Field(
        default_factory=new_uuid,
        primary_key=True,
        nullable=False,
        sa_column_kwargs={
            "server_default": text("gen_random_uuid()"),
        },
    )

    class Config:
        arbitrary_types_allowed = True
        from_attributes = True

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if not hasattr(cls, "__tablename__") or cls.__tablename__ is None:
            cls.__tablename__ = _camel_to_snake(cls.__name__)  # type: ignore[attr-defined]


class AuditedBaseModel(AuditMixin, BaseModel):
    """
    Base class for high-accountability entities where knowing WHO made
    a change is a compliance and academic integrity requirement.

    Contains everything in BaseModel, plus:
        ✅ created_by_id
        ✅ updated_by_id

    Tables using this base:
        assessment, submission_grade, rubric, ai_grade_review,
        lecturer_course_assignment, student_enrollment
    """
    pass

