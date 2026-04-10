"""
app/db/models/resource.py

Student resources, lecturer materials, and RAG chunk models for Mindexa.

Tables defined here:
    student_resource     — A file uploaded by a student for personal study support
    resource_chunk       — A text chunk extracted from a student_resource (RAG pipeline)
    lecturer_material    — A file uploaded by a lecturer (notes, rubrics, past papers)

Architectural principles:

    1. Student resources and lecturer materials are SEPARATE tables.
       They have different access rules, different processing pipelines,
       and different AI usage contexts.

       student_resource:
           - Owned by one student
           - Used ONLY by that student's Study Support AI session
           - Never shared with other students or lecturers
           - Chunked and embedded for personal RAG retrieval

       lecturer_material:
           - Owned by a lecturer, scoped to a course or assessment
           - May be shared with enrolled students (if lecturer marks is_student_visible)
           - Used by the Lecturer Assessment Agent for context
           - Not chunked into resource_chunk (different processing path)

    2. Embedding storage uses pgvector.
       resource_chunk.embedding is a VECTOR(1536) column.
       This requires the pgvector PostgreSQL extension (already in init.sql).
       The dimension 1536 matches text-embedding-3-small (OpenAI).
       If a different model is used, EMBEDDING_DIMENSIONS in mixins.py controls this.

    3. File content is NEVER stored in the database.
       Only file metadata is stored here. The actual file bytes live on disk
       (UPLOAD_DIR from settings) or in object storage (S3/MinIO in production).
       file_path stores the relative path from UPLOAD_DIR.

    4. Processing is asynchronous.
       When a student uploads a file, the route handler:
           a. Writes the file to disk
           b. Creates a student_resource row with status=PENDING
           c. Enqueues a Celery task: process_student_resource.delay(resource_id)
       The Celery task:
           a. Parses the file (PyMuPDF for PDF, python-docx for DOCX)
           b. Chunks the text
           c. Embeds each chunk via OpenAI API
           d. Writes resource_chunk rows
           e. Updates student_resource.status = COMPLETED

Import order safety:
    This file imports from:
        app.db.base    → BaseModel, utcnow
        app.db.enums   → ResourceCategory, ResourceProcessingStatus
        app.db.mixins  → composite_index, unique_composite_index

    This file references via TYPE_CHECKING only:
        app.db.models.auth       → User (student, lecturer)
        app.db.models.academic   → Course
        app.db.models.assessment → Assessment

    pgvector import:
        from pgvector.sqlalchemy import Vector
        This requires the pgvector Python package: pip install pgvector

Cascade rules:
    resource_chunk → CASCADE from student_resource
        (chunks are derived from the resource; if resource is deleted, chunks go with it)
    lecturer_material → RESTRICT on course and assessment
        (materials reference academic objects; service layer handles deletion order)

JSONB:
    None. All metadata is stored as typed columns, not in a JSON blob.
    This allows indexed queries on file type, status, and subject tags.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from app.db.base import BaseModel, utcnow
from app.db.enums import ResourceCategory, ResourceProcessingStatus
from app.db.mixins import composite_index
from sqlalchemy import Column, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

if TYPE_CHECKING:
    from app.db.models.academic import Course
    from app.db.models.assessment import Assessment
    from app.db.models.auth import User


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT RESOURCE
# ─────────────────────────────────────────────────────────────────────────────

class StudentResource(BaseModel, table=True):
    """
    A file uploaded by a student for personal study support.

    Student resources feed the Study Support AI (RAG pipeline).
    They are NEVER used by any grading workflow, NEVER visible to lecturers,
    and NEVER shared with other students.

    Access control:
        Only the owning student (student_id) may read, update, or delete
        their own resource. This is enforced at the service layer.

    resource_category (ResourceCategory enum):
        LECTURE_NOTES     → Notes taken during lectures
        PAST_PAPER        → Past exam papers downloaded or uploaded
        TEXTBOOK_EXCERPT  → Excerpts from study materials
        ASSIGNMENT        → A completed assignment the student wants analysed
        GENERAL           → Uncategorised study material

    processing_status (ResourceProcessingStatus enum):
        PENDING     → File received; Celery task not yet started
        PROCESSING  → Celery task is running (parsing, chunking, embedding)
        COMPLETED   → All chunks embedded; resource is available for RAG
        FAILED      → Processing failed; see processing_error for reason
        SKIPPED     → File type not supported for embedding (e.g. image-only PDF)

    file_path:
        Relative path from settings.UPLOAD_DIR.
        Example: "students/uuid-of-student/uuid-of-resource.pdf"
        Never exposed directly to the student — presigned URLs or streaming
        are used for download.

    file_hash:
        SHA-256 hash of the file content. Used to detect duplicate uploads
        from the same student (service layer warns but does not block).

    chunk_count:
        The number of resource_chunk rows created during processing.
        NULL before processing completes. Used by the UI to show "12 chunks indexed."

    subject_tag:
        Optional free-text label the student applies when uploading
        (e.g. "Database Systems"). Used to filter the RAG retrieval
        to relevant subject context.

    expires_at:
        Optional expiry timestamp. Resources are never auto-deleted
        in production, but an admin policy may set expiry for storage management.
        NULL = never expires.
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
            index=True,
        )
    )

    # ── File metadata ─────────────────────────────────────────────────────────

    original_filename: str = Field(nullable=False, max_length=255)
    safe_filename: str = Field(
        nullable=False,
        max_length=255,
        # Sanitised version of original_filename. Stored separately so the
        # original name is preserved for display while the safe name is used
        # for filesystem operations.
    )
    file_path: str = Field(nullable=False, max_length=500)
    file_size_bytes: int = Field(nullable=False)
    file_extension: str = Field(nullable=False, max_length=20)
    mime_type: str = Field(nullable=False, max_length=100)
    file_hash: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=64,
        # SHA-256 hex digest (64 characters)
    )

    # ── Classification ────────────────────────────────────────────────────────

    resource_category: ResourceCategory = Field(
        default=ResourceCategory.GENERAL,
        nullable=False,
        index=True,
    )
    subject_tag: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=100,
        index=True,
    )
    display_name: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=255,
        # Optional student-provided display name shown in the UI.
        # Falls back to original_filename if not set.
    )

    # ── Processing state ──────────────────────────────────────────────────────

    processing_status: ResourceProcessingStatus = Field(
        default=ResourceProcessingStatus.PENDING,
        nullable=False,
        index=True,
    )
    processing_started_at: Optional[datetime] = Field(default=None, nullable=True)
    processing_completed_at: Optional[datetime] = Field(default=None, nullable=True)
    processing_error: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=1000,
    )
    chunk_count: Optional[int] = Field(default=None, nullable=True)
    page_count: Optional[int] = Field(
        default=None,
        nullable=True,
        # Total pages/sections detected during parsing.
    )

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    expires_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        index=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────

    chunks: List["ResourceChunk"] = Relationship(
        back_populates="student_resource",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# RESOURCE CHUNK
# ─────────────────────────────────────────────────────────────────────────────

class ResourceChunk(BaseModel, table=True):
    """
    A text chunk extracted from a student_resource, with its embedding vector.

    One student_resource produces N resource_chunk rows depending on
    the chunking strategy (typically 300–500 tokens per chunk with overlap).

    The embedding vector powers semantic search during Study Support AI sessions.
    When a student asks a question, the query is embedded and the top-K nearest
    chunk embeddings are retrieved to form the RAG context.

    chunk_index:
        Zero-based position of this chunk within the source document.
        Used to reconstruct reading order for context assembly.

    token_count:
        Approximate token count for this chunk (estimated at chunking time).
        Used by the AI agent to enforce context window limits when assembling
        multiple chunks.

    embedding:
        A VECTOR(1536) column using pgvector.
        Stored using the pgvector SQLAlchemy type.
        NULL during the brief window between chunk creation and embedding
        completion (the Celery task creates chunks first, then embeds).

    embedding_model:
        The model used to generate the embedding.
        Example: "text-embedding-3-small"
        Stored so that if the embedding model changes, old chunks can be
        identified and re-embedded without re-parsing the source file.

    source_page:
        The page number (1-based) in the source document where this chunk
        originates. NULL for non-paginated sources (e.g. plain text).
        Used to cite the source in AI responses ("See page 7 of your notes").
    """

    __tablename__ = "resource_chunk"

    __table_args__ = (
        UniqueConstraint(
            "student_resource_id", "chunk_index",
            name="uq_resource_chunk_resource_index",
        ),
        composite_index("resource_chunk", "student_resource_id", "chunk_index"),
        # For embedding model migration queries
        composite_index("resource_chunk", "embedding_model"),
    )

    student_resource_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("student_resource.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    chunk_index: int = Field(nullable=False)
    content: str = Field(nullable=False)
    token_count: Optional[int] = Field(default=None, nullable=True)
    source_page: Optional[int] = Field(default=None, nullable=True)
    embedding_model: str = Field(
        default="text-embedding-3-small",
        nullable=False,
        max_length=100,
        index=True,
    )

    # pgvector VECTOR column — nullable until embedding task completes
    # Using sa_column with the pgvector Vector type
    # Dimension must match EMBEDDING_DIMENSIONS from mixins.py (1536)
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column(
            "embedding",
            # Import done inline to avoid module-level import failure
            # if pgvector is not installed yet during development
            # In production this must always be installed
            __import__(
                "pgvector.sqlalchemy",
                fromlist=["Vector"],
            ).Vector(1536),
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
    A file uploaded by a lecturer, scoped to a course or assessment.

    Lecturer materials serve two purposes:
        1. Shared with students (if is_student_visible = True):
              Lecture notes, past papers, reference materials, rubric PDFs.
        2. Used as context by the Lecturer Assessment Agent (always):
              Any lecturer material for a course can be included in the AI
              prompt when generating assessment questions.

    Access rules:
        - The uploading lecturer (lecturer_id) always has access.
        - Students enrolled in the associated course have access
          if is_student_visible = True AND the assessment window
          is open or closed (determined by service layer policy).
        - Admins always have access.

    material_category (ResourceCategory enum):
        Re-uses the same enum as student_resource for simplicity.
        Common values: LECTURE_NOTES, PAST_PAPER, GENERAL.

    assessment_id:
        Optional. If set, this material is specifically linked to one
        assessment (e.g. the official rubric PDF for a CAT).
        If NULL, the material is course-level (available across all
        assessments in the course).

    is_student_visible:
        Controls student access. False by default for uploaded materials
        to prevent accidental exposure of lecturer-only files.
        The lecturer must explicitly set this to True to share with students.

    version:
        Incremented when the lecturer replaces a file with a newer version.
        The service layer creates a new row (preserving the old version
        with is_current = False) rather than updating the file path.
        Only is_current = True materials are shown to students.

    is_current:
        See version field above. False for superseded versions.
    """

    __tablename__ = "lecturer_material"

    __table_args__ = (
        composite_index("lecturer_material", "course_id", "is_student_visible"),
        composite_index("lecturer_material", "assessment_id"),
        composite_index("lecturer_material", "lecturer_id", "material_category"),
        composite_index("lecturer_material", "course_id", "is_current"),
    )

    # ── Ownership & scope ─────────────────────────────────────────────────────

    lecturer_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    course_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )
    assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
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
        index=True,
    )
    display_name: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=255,
    )
    description: Optional[str] = Field(default=None, nullable=True)

    # ── Access control ────────────────────────────────────────────────────────

    is_student_visible: bool = Field(default=False, nullable=False, index=True)

    # ── Versioning ────────────────────────────────────────────────────────────

    version: int = Field(default=1, nullable=False)
    is_current: bool = Field(default=True, nullable=False, index=True)
