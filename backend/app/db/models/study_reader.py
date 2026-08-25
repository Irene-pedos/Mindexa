"""
app/db/models/study_reader.py

Data models for the Study Reader workspace:
- StudentReadingProgress (last page, scale, seen count)
- StudentMaterialAnnotation (highlight text, color, normalized rects, note)
- StudentMaterialKeyPoint (key study points, quotes, tags, confidence)
"""

import uuid
from datetime import datetime
from typing import Any, List, Optional

from app.db.base import BaseModel
from app.db.mixins import composite_index
from sqlalchemy import (Boolean, Column, DateTime, Float, ForeignKey, Index,
                        Integer, String, Text, UniqueConstraint)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

# ─────────────────────────────────────────────────────────────────────────────
# STUDENT READING PROGRESS
# ─────────────────────────────────────────────────────────────────────────────

class StudentReadingProgress(BaseModel, table=True):
    """
    Tracks a student's reading progress and viewport settings across devices.
    """

    __tablename__ = "student_reading_progress"

    __table_args__ = (
        UniqueConstraint(
            "student_id", "source_kind", "source_id",
            name="uq_student_reading_progress_source",
        ),
        Index("idx_srp_student_source", "student_id", "source_kind", "source_id"),
        Index("idx_srp_student_updated", "student_id", "updated_at"),
    )

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )

    source_kind: str = Field(
        sa_column=Column(String(50), nullable=False),
        description="lecturer_material | student_resource",
    )

    source_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), nullable=False, index=True),
        description="ID of lecturer_material or student_resource",
    )

    last_page: int = Field(default=1, nullable=False)
    last_scale: float = Field(default=100.0, nullable=False)
    rotation: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    zoom_mode: str = Field(
        default="fit-width",
        sa_column=Column(String(30), nullable=False, server_default="fit-width"),
        description="fit-width | fit-page | custom",
    )
    two_page_view: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
        description="Whether dual page layout is active",
    )
    furthest_page_reached: int = Field(
        default=1,
        sa_column=Column(Integer, nullable=False, server_default="1"),
        description="Highest page number navigated to by student (high water mark)",
    )
    page_count_seen: int = Field(
        default=1,
        nullable=False,
        description="Legacy alias for furthest_page_reached",
    )


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT MATERIAL ANNOTATION
# ─────────────────────────────────────────────────────────────────────────────

class StudentMaterialAnnotation(BaseModel, table=True):
    """
    Highlights and notes made by a student on a specific PDF material/resource.
    """

    __tablename__ = "student_material_annotation"

    __table_args__ = (
        Index("idx_sma_student_source", "student_id", "source_kind", "source_id"),
        Index("idx_sma_source_page", "source_id", "page_number"),
        Index("idx_sma_student_created", "student_id", "created_at"),
    )

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )

    source_kind: str = Field(
        sa_column=Column(String(50), nullable=False),
        description="lecturer_material | student_resource",
    )

    source_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), nullable=False, index=True),
    )

    page_number: int = Field(nullable=False, description="1-based page number")

    color: str = Field(
        sa_column=Column(String(30), nullable=False, default="key_idea"),
        description="key_idea | definition | example | confused",
    )

    selected_text: str = Field(
        sa_column=Column(Text, nullable=False),
        description="The quoted text snippet",
    )

    rects_json: List[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False),
        description="List of viewport-normalized bounding boxes [{x,y,w,h,page}]",
    )

    note_text: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Student's personal note on this highlight",
    )

    # Relationships
    key_points: List["StudentMaterialKeyPoint"] = Relationship(
        back_populates="annotation",
        sa_relationship_kwargs={"cascade": "save-update, merge"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT MATERIAL KEY POINT
# ─────────────────────────────────────────────────────────────────────────────

class StudentMaterialKeyPoint(BaseModel, table=True):
    """
    Key conceptual takeaways and definitions extracted or drafted by the student.
    """

    __tablename__ = "student_material_key_point"

    __table_args__ = (
        Index("idx_smkp_student_source", "student_id", "source_kind", "source_id"),
        Index("idx_smkp_student_tag", "student_id", "tag"),
        Index("idx_smkp_student_confidence", "student_id", "confidence"),
        Index("idx_smkp_next_review_at", "next_review_at"),
    )

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )

    source_kind: str = Field(
        sa_column=Column(String(50), nullable=False),
        description="lecturer_material | student_resource",
    )

    source_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), nullable=False, index=True),
    )

    title: str = Field(
        sa_column=Column(String(255), nullable=False),
        description="Student's synthesis or concept name",
    )

    quote: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Direct quote from material if applicable",
    )

    page_number: int = Field(default=1, nullable=False)

    tag: str = Field(
        sa_column=Column(String(50), nullable=False, default="other"),
        description="definition | formula | process | exam_likely | other",
    )

    confidence: str = Field(
        sa_column=Column(String(30), nullable=False, default="got_it"),
        description="got_it | fuzzy | lost",
    )

    annotation_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("student_material_annotation.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    next_review_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        description="Spaced review schedule timestamp for fuzzy/lost points",
    )

    # Relationships
    annotation: Optional["StudentMaterialAnnotation"] = Relationship(
        back_populates="key_points"
    )
