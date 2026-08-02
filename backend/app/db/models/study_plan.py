from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, String, JSON, DateTime, Text
from sqlalchemy.orm import relationship

from app.db.base import BaseModel

DEFAULT_INITIAL_READINESS_SCORE = 0


class StudyPlan(BaseModel, table=True):
    """
    Study Plan model for institutional student academic planning.
    Inherits IDMixin (id), TimestampMixin (created_at, updated_at with onupdate trigger),
    SoftDeleteMixin (is_deleted with index, deleted_at) from BaseModel.
    Table name automatically resolves to singular 'study_plan'.
    """
    __tablename__ = "study_plan"

    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, nullable=False)
    title: str = Field(max_length=255, nullable=False)
    study_type: str = Field(max_length=50, default="Assessment Preparation")
    course_id: Optional[uuid.UUID] = Field(default=None, foreign_key="course.id", index=True)
    teaching_workspace_id: Optional[uuid.UUID] = Field(default=None, foreign_key="teaching_workspace.id", index=True)
    assessment_id: Optional[uuid.UUID] = Field(default=None, foreign_key="assessment.id", index=True)

    start_date: datetime = Field(nullable=False, sa_type=DateTime(timezone=True))
    end_date: datetime = Field(nullable=False, sa_type=DateTime(timezone=True))
    available_days: List[str] = Field(default=[], sa_column=Column(JSON))
    blackout_dates: List[str] = Field(default=[], sa_column=Column(JSON))
    preferred_time_start: str = Field(default="19:00", max_length=10)
    preferred_time_end: str = Field(default="21:00", max_length=10)
    session_duration_minutes: int = Field(default=60)
    daily_goal: str = Field(default="Study 1 topic per session", max_length=255)
    preferred_difficulty: str = Field(default="Balanced", max_length=30)

    reminder_preference_minutes: int = Field(default=30)
    reminder_channels: List[str] = Field(default=["in_app", "browser"], sa_column=Column(JSON))
    priority: str = Field(default="Medium", max_length=20)

    status: str = Field(default="ACTIVE", max_length=20)
    auto_generated: bool = Field(default=False)
    streak_count: int = Field(default=0)
    readiness_score: int = Field(default=DEFAULT_INITIAL_READINESS_SCORE)

    readiness_history: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    covered_material_ids: List[str] = Field(default=[], sa_column=Column(JSON))

    sessions: List["StudySession"] = Relationship(sa_relationship=relationship("StudySession", back_populates="plan"))


class StudySession(BaseModel, table=True):
    """
    Study Session model representing scheduled or completed study events.
    Inherits IDMixin (id), TimestampMixin (created_at, updated_at with onupdate trigger),
    SoftDeleteMixin (is_deleted with index, deleted_at) from BaseModel.
    Table name automatically resolves to singular 'study_session'.
    """
    __tablename__ = "study_session"

    study_plan_id: uuid.UUID = Field(foreign_key="study_plan.id", index=True, nullable=False)
    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, nullable=False)

    title: str = Field(max_length=255, nullable=False)
    topic: str = Field(max_length=255, nullable=False)
    session_type: str = Field(default="STUDY", max_length=30)

    scheduled_start: datetime = Field(nullable=False, sa_type=DateTime(timezone=True))
    scheduled_end: datetime = Field(nullable=False, sa_type=DateTime(timezone=True))
    duration_minutes: int = Field(default=60)

    status: str = Field(default="SCHEDULED", max_length=20)
    completed_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    understanding_level: Optional[str] = Field(default=None, max_length=20)
    difficulty_rating: Optional[str] = Field(default=None, max_length=20)
    confidence_rating: Optional[int] = Field(default=None)
    feedback_notes: Optional[str] = Field(default=None)

    checklist_items: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    quiz_questions: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    recommended_resource_ids: List[str] = Field(default=[], sa_column=Column(JSON))

    # AI Guided Study Session Fields
    lesson_sections_json: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    lesson_plan_json: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    lesson_status: str = Field(default="NOT_GENERATED", max_length=20)  # NOT_GENERATED | IN_PROGRESS | COMPLETED
    current_section_index: int = Field(default=0)
    lesson_generated_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
    knowledge_check_answers: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    knowledge_check_score: Optional[float] = Field(default=None)
    knowledge_check_report: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    session_summary_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    student_notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    tutor_chat_history: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))

    plan: Optional["StudyPlan"] = Relationship(sa_relationship=relationship("StudyPlan", back_populates="sessions"))
