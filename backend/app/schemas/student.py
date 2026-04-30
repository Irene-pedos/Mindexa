from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.db.enums import AttemptStatus, AssessmentType, ResultLetterGrade

class StudentDashboardSummary(BaseModel):
    """Overall student performance and status summary."""
    cgpa: float = 0.0
    total_credits: int = 0
    attendance_rate: float = 0.0
    semesters_completed: int = 0
    active_assessments_count: int = 0
    pending_results_count: int = 0

class StudentActiveAttempt(BaseModel):
    """Brief info about an attempt currently in progress or paused."""
    id: uuid.UUID
    assessment_id: uuid.UUID
    assessment_title: str
    status: AttemptStatus
    started_at: datetime
    expires_at: Optional[datetime] = None

class StudentRecentResult(BaseModel):
    """Brief info about a recently released result."""
    id: uuid.UUID
    assessment_title: str
    assessment_type: AssessmentType
    score: float
    total_marks: float
    percentage: float
    letter_grade: Optional[ResultLetterGrade] = None
    released_at: datetime

class StudentUpcomingAssessment(BaseModel):
    """Brief info about a scheduled assessment that hasn't started yet."""
    id: uuid.UUID
    title: str
    type: AssessmentType
    window_start: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    total_marks: Optional[int] = None

class StudentScheduleEvent(BaseModel):
    """General academic event for the calendar/schedule."""
    id: str
    title: str
    type: str # "CAT", "Summative", "Deadline", etc.
    start_at: datetime
    end_at: Optional[datetime] = None
    description: Optional[str] = None
    location: Optional[str] = None
    color_hint: Optional[str] = None

class StudentScheduleResponse(BaseModel):
    """Aggregated schedule data."""
    events: List[StudentScheduleEvent] = []

class StudentDashboardResponse(BaseModel):
    """Complete aggregated data for the student dashboard."""
    summary: StudentDashboardSummary
    active_attempts: List[StudentActiveAttempt] = []
    recent_results: List[StudentRecentResult] = []
    upcoming_assessments: List[StudentUpcomingAssessment] = []
