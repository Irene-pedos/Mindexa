"""
app/db/models/duty.py

Scoped duty assignments for academic workflows.
Strictly SQLModel-based ORM pattern.
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, Relationship

from app.core.constants import Duty
from app.db.base import BaseModel, utcnow

if TYPE_CHECKING:
    from app.db.models.academic import Campus, Department, Institution
    from app.db.models.auth import User


class UserDutyAssignment(BaseModel, table=True):
    """
    Scoped duty assignment granting specific institutional capabilities
    (MODERATOR, EXAM_OFFICER, DEPARTMENT_HEAD) without mutating base user roles.
    """

    __tablename__ = "user_duty_assignment"
    __table_args__ = (
        Index(
            "uq_duty_assignment_dept_active",
            "user_id",
            "duty",
            "institution_id",
            "department_id",
            unique=True,
            postgresql_where=sa.text(
                "is_active = TRUE AND is_deleted = FALSE AND department_id IS NOT NULL"
            ),
        ),
        Index(
            "uq_duty_assignment_campus_active",
            "user_id",
            "duty",
            "institution_id",
            "campus_id",
            unique=True,
            postgresql_where=sa.text(
                "is_active = TRUE AND is_deleted = FALSE "
                "AND department_id IS NULL AND campus_id IS NOT NULL"
            ),
        ),
        Index(
            "uq_duty_assignment_inst_active",
            "user_id",
            "duty",
            "institution_id",
            unique=True,
            postgresql_where=sa.text(
                "is_active = TRUE AND is_deleted = FALSE "
                "AND department_id IS NULL AND campus_id IS NULL"
            ),
        ),
        Index("ix_user_duty_assignment_active_dates", "is_active", "valid_from", "valid_to"),
    )

    user_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    duty: Duty = Field(
        sa_column=Column(
            sa.Enum(Duty, name="duty_type", create_type=False),
            nullable=False,
            index=True,
        )
    )
    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    campus_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("campus.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    department_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("department.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
    )
    is_active: bool = Field(
        default=True,
        nullable=False,
        index=True,
        sa_column_kwargs={"server_default": sa.text("true")},
    )
    valid_from: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("TIMEZONE('utc', NOW())"),
        ),
    )
    valid_to: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    assigned_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )

    # Relationships
    user: Optional["User"] = Relationship(
        back_populates="duty_assignments",
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[UserDutyAssignment.user_id]",
        },
    )
    assigned_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={
            "lazy": "selectin",
            "foreign_keys": "[UserDutyAssignment.assigned_by_id]",
        }
    )
    institution: Optional["Institution"] = Relationship(
        sa_relationship_kwargs={"lazy": "selectin"}
    )
    campus: Optional["Campus"] = Relationship(
        sa_relationship_kwargs={"lazy": "selectin"}
    )
    department: Optional["Department"] = Relationship(
        sa_relationship_kwargs={"lazy": "selectin"}
    )
