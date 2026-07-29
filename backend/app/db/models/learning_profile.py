from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Dict, List, Any
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON, DateTime, UniqueConstraint

from app.db.base import BaseModel


class StudentLearningProfile(BaseModel, table=True):
    """
    Student Learning Profile for institutional learning history and per-course AI personalization.
    Inherits IDMixin (id), TimestampMixin (created_at, updated_at), and SoftDeleteMixin (is_deleted, deleted_at)
    from BaseModel.
    """
    __tablename__ = "student_learning_profile"
    __table_args__ = (
        UniqueConstraint("student_id", "course_id", name="uq_learning_profile_student_course"),
    )

    student_id: uuid.UUID = Field(foreign_key="user.id", index=True, nullable=False)
    course_id: Optional[uuid.UUID] = Field(default=None, foreign_key="course.id", index=True)

    topic_confidence: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    weak_topics: List[str] = Field(default=[], sa_column=Column(JSON))
    total_sessions_completed: int = Field(default=0)
    average_knowledge_check_score: Optional[float] = Field(default=None)
    current_streak_days: int = Field(default=0)
    last_studied_at: Optional[datetime] = Field(default=None, sa_type=DateTime(timezone=True))
