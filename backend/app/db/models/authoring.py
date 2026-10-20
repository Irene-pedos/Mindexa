"""
backend/app/db/models/authoring.py

Phase 4 Models: Collaborative authoring and delegations.
Strictly SQLModel-based ORM pattern.
"""
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
import uuid

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, Relationship

from app.db.base import AuditedBaseModel, utcnow
from app.db.enums import CollaboratorRole, DelegationStatus
from app.db.mixins import composite_index

if TYPE_CHECKING:
    from app.db.models.assessment import Assessment
    from app.db.models.auth import User


# ─────────────────────────────────────────────────────────────────────────────
# ASSESSMENT COLLABORATOR
# ─────────────────────────────────────────────────────────────────────────────

class AssessmentCollaborator(AuditedBaseModel, table=True):
    """
    Collaborative author attached to an assessment (R-01).

    Only lecturers who teach the assessment's course (TeachingAssignment or
    LecturerCourseAssignment) can be added as co-authors.

    Roles:
        OWNER: The primary author (assessment creator)
        CO_AUTHOR: Additional course lecturer with authoring access
    """

    __tablename__ = "assessment_collaborator"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id",
            "lecturer_id",
            name="uq_assessment_collaborator_assessment_lecturer",
        ),
        composite_index("assessment_collaborator", "assessment_id", "is_active"),
        composite_index("assessment_collaborator", "lecturer_id", "is_active"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    lecturer_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    role: CollaboratorRole = Field(
        default=CollaboratorRole.CO_AUTHOR,
        sa_column=Column(
            sa.Enum(CollaboratorRole, name="collaboratorrole", create_type=True),
            nullable=False,
            server_default="CO_AUTHOR",
        ),
    )
    added_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    added_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    is_active: bool = Field(default=True, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────

    assessment: Optional["Assessment"] = Relationship(
        back_populates="collaborators",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    lecturer: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[AssessmentCollaborator.lecturer_id]",
        }
    )
    added_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[AssessmentCollaborator.added_by_id]",
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
# AUTHOR DELEGATION
# ─────────────────────────────────────────────────────────────────────────────

class AuthorDelegation(AuditedBaseModel, table=True):
    """
    Temporary delegation of author authority for an assessment (R-09).

    Created by the author OR the department HOD when the author is unavailable.
    Delegate must be a lecturer in the same department as the course.

    Allows the delegate to:
        - Edit the paper
        - Resubmit to moderation
        - Reschedule assessment windows
    ONLY for this assessment and ONLY within the validity window [valid_from, valid_to].
    """

    __tablename__ = "author_delegation"

    __table_args__ = (
        composite_index("author_delegation", "assessment_id", "status"),
        composite_index("author_delegation", "delegate_id", "status"),
        composite_index("author_delegation", "valid_from", "valid_to"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    delegator_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    delegate_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    created_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    reason: str = Field(
        sa_column=Column(Text, nullable=False),
        description="Mandatory justification (min 10 chars)",
    )
    valid_from: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    valid_to: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    status: DelegationStatus = Field(
        default=DelegationStatus.ACTIVE,
        sa_column=Column(
            sa.Enum(DelegationStatus, name="delegationstatus", create_type=True),
            nullable=False,
            server_default="ACTIVE",
            index=True,
        ),
    )
    revoked_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    revoked_by_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    assessment: Optional["Assessment"] = Relationship(
        back_populates="delegations",
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    delegator: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[AuthorDelegation.delegator_id]",
        }
    )
    delegate: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[AuthorDelegation.delegate_id]",
        }
    )
    created_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[AuthorDelegation.created_by_id]",
        }
    )
