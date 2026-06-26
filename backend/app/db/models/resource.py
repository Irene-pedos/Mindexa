"""
app/db/models/resource.py

Student resources, lecturer materials, and RAG chunk models for Mindexa.

Tables defined here:
    student_resource     — A file uploaded by a student for personal study support
    resource_chunk       — A text chunk extracted from a student_resource (RAG pipeline)
    lecturer_material    — A file uploaded by a lecturer (notes, rubrics, past papers)
    lecturer_material_chunk — A text chunk extracted from a lecturer_material (RAG pipeline)

Architectural principles:

    1. Student resources and lecturer materials are SEPARATE tables.
       They have different access rules, different processing pipelines,
       and different AI usage contexts.

    2. Embedding storage uses pgvector.
       The dimension matches settings.PGVECTOR_DIMENSION (default 1536).

    3. File content is NEVER stored in the database.
       Only file metadata is stored here.

    4. Processing is asynchronous.
       Status transitions: PENDING -> PROCESSING -> COMPLETED/FAILED.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, Relationship

from app.core.config import settings
from app.db.base import BaseModel
from app.db.enums import ResourceCategory, ResourceProcessingStatus
from app.db.mixins import composite_index

if TYPE_CHECKING:
    from app.db.models.academic import Course, TeachingWorkspace
    from app.db.models.assessment import Assessment


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT RESOURCE
# ─────────────────────────────────────────────────────────────────────────────

class StudentResource(BaseModel, table=True):
    """
    A file uploaded by a student for personal study support.
    """

    __tablename__ = "student_resource"

    __table_args__ = (
        composite_index("student_resource", "student_id", "processing_status"),
        composite_index("student_resource", "student_id", "resource_category"),
        composite_index("student_resource", "student_id", "subject_tag"),
        composite_index("student_resource", "processing_status"),
        composite_index("student_resource", "expires_at"),
    )

    # ── Ownership ─────────────────────────────────────────────────────────────

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )

    # ── File metadata ─────────────────────────────────────────────────────────

    original_filename: str = Field(nullable=False, max_length=255)
    safe_filename: str = Field(nullable=False, max_length=255)
    file_path: str = Field(nullable=False, max_length=500)
    file_size_bytes: int = Field(nullable=False)
    file_extension: str = Field(nullable=False, max_length=20)
    mime_type: str = Field(nullable=False, max_length=100)
    file_hash: str | None = Field(default=None, nullable=True, max_length=64)

    # ── Classification ────────────────────────────────────────────────────────

    resource_category: ResourceCategory = Field(
        default=ResourceCategory.GENERAL,
        nullable=False,
    )
    subject_tag: str | None = Field(default=None, nullable=True, max_length=100)
    display_name: str | None = Field(default=None, nullable=True, max_length=255)

    # ── Processing state ──────────────────────────────────────────────────────

    processing_status: ResourceProcessingStatus = Field(
        default=ResourceProcessingStatus.PENDING,
        nullable=False,
    )

    processing_started_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    processing_completed_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    processing_error: str | None = Field(default=None, nullable=True, max_length=1000)
    chunk_count: int | None = Field(default=None, nullable=True)
    page_count: int | None = Field(default=None, nullable=True)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    expires_at: datetime | None = Field(
        default=None, 
        nullable=True,
        sa_type=DateTime(timezone=True),
    )

    # ── RAG Integration ───────────────────────────────────────────────────────

    academic_resource_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_resources.id", ondelete="SET NULL"),
            nullable=True,
        )
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    chunks: List["StudentResourceChunk"] = Relationship(
        back_populates="student_resource",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT RESOURCE CHUNK
# ─────────────────────────────────────────────────────────────────────────────

class StudentResourceChunk(BaseModel, table=True):
    """
    A text chunk extracted from a student_resource, with its embedding vector.
    """

    __tablename__ = "resource_chunk"

    __table_args__ = (
        UniqueConstraint(
            "student_resource_id", "chunk_index",
            name="uq_resource_chunk_resource_index",
        ),
        composite_index("resource_chunk", "student_resource_id", "chunk_index"),
        # For metadata-based filtering
        composite_index("resource_chunk", "student_id"),
        composite_index("resource_chunk", "institution_id"),
        composite_index("resource_chunk", "embedding_model"),
    )

    student_resource_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("student_resource.id", ondelete="CASCADE"),
            nullable=False,
        )
    )

    # Metadata for filtering
    student_id: uuid.UUID = Field(nullable=False)
    institution_id: uuid.UUID | None = Field(default=None, nullable=True)

    chunk_index: int = Field(nullable=False)
    content: str = Field(nullable=False)
    token_count: int | None = Field(default=None, nullable=True)
    source_page: int | None = Field(default=None, nullable=True)
    embedding_model: str = Field(
        default=settings.DEFAULT_EMBEDDING_MODEL,
        nullable=False,
        max_length=100,
    )

    # pgvector VECTOR column
    embedding: list[float] | None = Field(
        default=None,
        sa_column=Column(
            "embedding",
            __import__(
                "pgvector.sqlalchemy",
                fromlist=["Vector"],
            ).Vector(settings.PGVECTOR_DIMENSION),
            nullable=True,
        ),
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    student_resource: Optional["StudentResource"] = Relationship(
        back_populates="chunks"
    )


# ─────────────────────────────────────────────────────────────────────────────
# LECTURER MATERIAL
# ─────────────────────────────────────────────────────────────────────────────

class LecturerMaterial(BaseModel, table=True):
    """
    A file uploaded by a lecturer, scoped to a workspace or assessment.
    """

    __tablename__ = "lecturer_material"

    __table_args__ = (
        composite_index("lecturer_material", "teaching_workspace_id", "is_student_visible"),
        composite_index("lecturer_material", "assessment_id"),
        composite_index("lecturer_material", "lecturer_id", "material_category"),
        composite_index("lecturer_material", "teaching_workspace_id", "is_current"),
        composite_index("lecturer_material", "processing_status"),
    )

    # ── Ownership & scope ─────────────────────────────────────────────────────

    lecturer_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )

    teaching_workspace_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("teaching_workspace.id", ondelete="CASCADE"),
            nullable=False,
        )
    )

    institution_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=True,
        )
    )

    course_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="SET NULL"),
            nullable=True,
        )
    )
    assessment_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="SET NULL"),
            nullable=True,
        )
    )

    # ── File metadata ─────────────────────────────────────────────────────────

    original_filename: str = Field(nullable=False, max_length=255)
    safe_filename: str = Field(nullable=False, max_length=255)
    file_path: str = Field(nullable=False, max_length=500)
    file_size_bytes: int = Field(nullable=False)
    file_extension: str = Field(nullable=False, max_length=20)
    mime_type: str = Field(nullable=False, max_length=100)

    # ── Classification ────────────────────────────────────────────────────────

    material_category: ResourceCategory = Field(
        default=ResourceCategory.GENERAL,
        nullable=False,
    )
    display_name: str | None = Field(default=None, nullable=True, max_length=255)
    description: str | None = Field(default=None, nullable=True)

    # ── Access control ────────────────────────────────────────────────────────

    is_student_visible: bool = Field(default=False, nullable=False)

    # ── Processing state ──────────────────────────────────────────────────────

    processing_status: ResourceProcessingStatus = Field(
        default=ResourceProcessingStatus.PENDING,
        nullable=False,
    )

    processing_started_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    processing_completed_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    processing_error: str | None = Field(default=None, nullable=True, max_length=1000)
    chunk_count: int | None = Field(default=None, nullable=True)

    # ── RAG Integration ───────────────────────────────────────────────────────

    academic_resource_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_resources.id", ondelete="SET NULL"),
            nullable=True,
        )
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    workspace: "TeachingWorkspace" = Relationship(back_populates="materials")
    chunks: List["LecturerMaterialChunk"] = Relationship(
        back_populates="lecturer_material",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    # ── Versioning ────────────────────────────────────────────────────────────

    version: int = Field(default=1, nullable=False)
    is_current: bool = Field(default=True, nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# LECTURER MATERIAL CHUNK
# ─────────────────────────────────────────────────────────────────────────────

class LecturerMaterialChunk(BaseModel, table=True):
    """
    A text chunk extracted from a lecturer_material, with its embedding vector.
    """

    __tablename__ = "lecturer_material_chunk"

    __table_args__ = (
        UniqueConstraint(
            "lecturer_material_id", "chunk_index",
            name="uq_lecturer_chunk_material_index",
        ),
        composite_index("lecturer_material_chunk", "lecturer_material_id", "chunk_index"),
        # For metadata-based filtering
        composite_index("lecturer_material_chunk", "course_id"),
        composite_index("lecturer_material_chunk", "institution_id"),
        composite_index("lecturer_material_chunk", "department_id"),
        composite_index("lecturer_material_chunk", "embedding_model"),
    )

    lecturer_material_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("lecturer_material.id", ondelete="CASCADE"),
            nullable=False,
        )
    )

    # Metadata for strict filtering
    institution_id: uuid.UUID | None = Field(default=None, nullable=True)
    course_id: uuid.UUID | None = Field(default=None, nullable=True)
    department_id: uuid.UUID | None = Field(default=None, nullable=True)
    option_id: uuid.UUID | None = Field(default=None, nullable=True)
    academic_year: str | None = Field(default=None, nullable=True, max_length=50)

    chunk_index: int = Field(nullable=False)
    content: str = Field(nullable=False)
    token_count: int | None = Field(default=None, nullable=True)
    source_page: int | None = Field(default=None, nullable=True)
    embedding_model: str = Field(
        default=settings.DEFAULT_EMBEDDING_MODEL,
        nullable=False,
        max_length=100,
    )

    embedding: list[float] | None = Field(
        default=None,
        sa_column=Column(
            "embedding",
            __import__(
                "pgvector.sqlalchemy",
                fromlist=["Vector"],
            ).Vector(settings.PGVECTOR_DIMENSION),
            nullable=True,
        ),
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    lecturer_material: Optional["LecturerMaterial"] = Relationship(
        back_populates="chunks"
    )
