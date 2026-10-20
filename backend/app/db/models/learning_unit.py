from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from app.db.base import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, JSON, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field


class LearningUnit(BaseModel, table=True):
    """
    Curriculum-aware Learning Unit (LU) extracted from workspace lecturer materials.
    Sequence of LUs forms an ordered, structured course table of contents.
    """
    __tablename__ = "learning_unit"

    teaching_workspace_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), ForeignKey("teaching_workspace.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    source_material_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), ForeignKey("lecturer_material.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    order_index: int = Field(nullable=False, index=True)
    title: str = Field(max_length=255, nullable=False)
    summary: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    learning_outcomes: List[str] = Field(default=[], sa_column=Column(JSON))
    start_page: Optional[int] = Field(default=None)
    end_page: Optional[int] = Field(default=None)
    source_chunk_ids: List[str] = Field(default=[], sa_column=Column(JSON))
    estimated_study_minutes: int = Field(default=45)
    is_active: bool = Field(default=True)

    __table_args__ = (
        UniqueConstraint("teaching_workspace_id", "source_material_id", "order_index", name="uq_lu_workspace_material_order"),
    )


class StudentLearningUnitProgress(BaseModel, table=True):
    """
    Student-level completion and mastery tracking per Learning Unit.
    """
    __tablename__ = "student_learning_unit_progress"

    student_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    learning_unit_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), ForeignKey("learning_unit.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    status: str = Field(default="NOT_STARTED", max_length=30)  # NOT_STARTED | IN_PROGRESS | COMPLETED | NEEDS_REVIEW
    confidence_score: Optional[int] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    linked_session_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), ForeignKey("study_session.id", ondelete="SET NULL"), nullable=True),
    )

    __table_args__ = (
        UniqueConstraint("student_id", "learning_unit_id", name="uq_student_lu"),
    )


class AssessmentLearningUnitCoverage(BaseModel, table=True):
    """
    Mapping of which Learning Units an Assessment covers.
    """
    __tablename__ = "assessment_learning_unit_coverage"

    assessment_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), ForeignKey("assessment.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    learning_unit_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), ForeignKey("learning_unit.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    weight_percent: Optional[int] = Field(default=None)
