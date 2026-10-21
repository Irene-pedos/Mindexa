"""
app/db/models/export.py

Phase 6C: Excel/Mark-sheet Export models.
Spec: MINDEXA_INSTITUTIONAL_WORKFLOWS_SPEC.md Section 13
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

from app.db.base import BaseModel
from app.db.enums import ExportJobStatus, ExportType

if TYPE_CHECKING:
    from app.db.models.academic import AcademicPeriod, Course
    from app.db.models.assessment import Assessment
    from app.db.models.auth import User


class ExportTemplate(BaseModel, table=True):
    """
    Reusable configuration template for an export job (column order, branding, etc.).
    institution_id=None  → global / system-level template available to all institutions.
    is_default=True rows are auto-selected by the export service when no template is
    explicitly chosen.
    """

    __tablename__ = "export_template"
    __table_args__ = (
        UniqueConstraint("code", name="uq_export_template_code"),
    )

    institution_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    code: str = Field(
        sa_column=Column(String(64), nullable=False, unique=True)
    )
    name: str = Field(
        sa_column=Column(String(255), nullable=False)
    )
    config_json: dict = Field(
        default_factory=dict,
        sa_column=Column(
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    is_default: bool = Field(
        default=False,
        nullable=False,
        sa_column_kwargs={"server_default": sa.text("false")},
    )
    created_by_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    created_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ExportTemplate.created_by_id]"}
    )


class ExportJob(BaseModel, table=True):
    """
    A single export run requested by a user.
    Status machine: QUEUED → RUNNING → DONE | FAILED.
    file_path is populated (and expires_at set) when status reaches DONE.
    """

    __tablename__ = "export_job"
    __table_args__ = (
        Index("ix_export_job_requested_by_id", "requested_by_id"),
        Index("ix_export_job_status", "status"),
    )

    requested_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    export_type: ExportType = Field(
        sa_column=Column(
            sa.Enum(ExportType, name="exporttype", create_type=False),
            nullable=False,
        )
    )
    assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    course_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    period_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_period.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    template_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("export_template.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    status: ExportJobStatus = Field(
        default=ExportJobStatus.QUEUED,
        sa_column=Column(
            sa.Enum(ExportJobStatus, name="exportjobstatus", create_type=False),
            nullable=False,
            server_default=ExportJobStatus.QUEUED.value,
        ),
    )
    file_path: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    row_count: Optional[int] = Field(default=None, nullable=True)
    error: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    finished_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    expires_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    requested_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ExportJob.requested_by_id]"}
    )
    template: Optional["ExportTemplate"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ExportJob.template_id]"}
    )
    assessment: Optional["Assessment"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ExportJob.assessment_id]"}
    )
    course: Optional["Course"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ExportJob.course_id]"}
    )
    period: Optional["AcademicPeriod"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ExportJob.period_id]"}
    )
