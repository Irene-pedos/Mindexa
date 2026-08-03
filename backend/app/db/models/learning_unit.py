from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from app.db.base import BaseModel
from sqlalchemy import Column, DateTime, JSON, UniqueConstraint
from sqlmodel import Field


class LearningUnit(BaseModel, table=True):
    """
    Curriculum-aware Learning Unit (LU) extracted from workspace lecturer materials.
    Sequence of LUs forms an ordered, structured course table of contents.
    """
    __tablename__ = "learning_unit"

    teaching_workspace_id: uuid.UUID = Field(foreign_key="teaching_workspace.id", index=True, nullable=False)
    source_material_id: Optional[uuid.UUID] = Field(default=None, foreign_key="lecturer_material.id", nullable=True)
    order_index: int = Field(nullable=False, index=True)
    title: str = Field(max_length=255, nullable=False)
    summary: Optional[str] = Field(default=None)
    source_chunk_ids: List[str] = Field(default=[], sa_column=Column(JSON))
    estimated_study_minutes: int = Field(default=45)
    is_active: bool = Field(default=True)

    __table_args__ = (
        UniqueConstraint("teaching_workspace_id", "order_index", name="uq_lu_workspace_order"),
    )


class StudentLearningUnitProgress(BaseModel, table=True):
    """
    Student-level completion and mastery tracking per Learning Unit.
    """
    __tablename__ = "student_learning_unit_progress"

    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, nullable=False)
    learning_unit_id: uuid.UUID = Field(foreign_key="learning_unit.id", index=True, nullable=False)
    status: str = Field(default="NOT_STARTED", max_length=30)  # NOT_STARTED | IN_PROGRESS | COMPLETED | NEEDS_REVIEW
    confidence_score: Optional[int] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    linked_session_id: Optional[uuid.UUID] = Field(default=None, foreign_key="study_session.id", nullable=True)

    __table_args__ = (
        UniqueConstraint("student_id", "learning_unit_id", name="uq_student_lu"),
    )


class AssessmentLearningUnitCoverage(BaseModel, table=True):
    """
    Mapping of which Learning Units an Assessment covers.
    """
    __tablename__ = "assessment_learning_unit_coverage"

    assessment_id: uuid.UUID = Field(foreign_key="assessment.id", index=True, nullable=False)
    learning_unit_id: uuid.UUID = Field(foreign_key="learning_unit.id", index=True, nullable=False)
    weight_percent: Optional[int] = Field(default=None)
