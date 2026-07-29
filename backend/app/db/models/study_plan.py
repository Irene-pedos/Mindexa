from __future__ import annotations

import uuid
from datetime import datetime, UTC
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, String, JSON, DateTime
from sqlalchemy.orm import relationship

class StudyPlan(SQLModel, table=True):
    __tablename__ = "study_plans"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
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
    readiness_score: int = Field(default=85)
    
    readiness_history: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    covered_material_ids: List[str] = Field(default=[], sa_column=Column(JSON))
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False, sa_type=DateTime(timezone=True))
    is_deleted: bool = Field(default=False)

    sessions: List["StudySession"] = Relationship(sa_relationship=relationship("StudySession", back_populates="plan"))

class StudySession(SQLModel, table=True):
    __tablename__ = "study_sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    study_plan_id: uuid.UUID = Field(foreign_key="study_plans.id", index=True, nullable=False)
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
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False, sa_type=DateTime(timezone=True))
    is_deleted: bool = Field(default=False)

    plan: Optional["StudyPlan"] = Relationship(sa_relationship=relationship("StudyPlan", back_populates="sessions"))
