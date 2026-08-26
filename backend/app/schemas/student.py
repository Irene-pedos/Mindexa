from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.db.enums import AttemptStatus, AssessmentType, ResultLetterGrade

class DashboardMetric(BaseModel):
    """A metric value with trend comparison."""
    value: float
    delta: float = 0.0
    last_month: float = 0.0
    positive: bool = True

class StudentDashboardSummary(BaseModel):
    """Overall student performance and status summary."""
    cgpa: DashboardMetric
    active_assessments_count: DashboardMetric
    completed_assessments_count: DashboardMetric
    avg_performance_percent: DashboardMetric

class StudentActiveAttempt(BaseModel):
    """Brief info about an attempt currently in progress or paused."""
    id: uuid.UUID
    assessment_id: uuid.UUID
    assessment_title: str
    assessment_type: AssessmentType
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    academic_year: Optional[str] = None
    status: AttemptStatus
    started_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    termination_reason: Optional[str] = None  # BUG-02: populated for TERMINATED/AUTO_SUBMITTED attempts

class StudentRecentResult(BaseModel):
    """Brief info about a recently released result."""
    id: uuid.UUID
    assessment_title: str
    assessment_type: AssessmentType
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    academic_year: Optional[str] = None
    score: float
    total_marks: float
    percentage: float
    letter_grade: Optional[ResultLetterGrade] = None
    released_at: Optional[datetime] = None

class StudentUpcomingAssessment(BaseModel):
    """Brief info about a scheduled assessment that hasn't started yet."""
    id: uuid.UUID
    title: str
    type: AssessmentType
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    academic_year: Optional[str] = None
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    total_marks: Optional[int] = None

class PerformanceTrendItem(BaseModel):
    """Monthly performance tracking."""
    month: str
    score: float
    average: float

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
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    duration_minutes: Optional[int] = None

class StudentScheduleResponse(BaseModel):
    """Aggregated schedule data."""
    events: list[StudentScheduleEvent] = []

class StudentCourseListItem(BaseModel):
    """Simplified course/workspace info for student listing with progress."""
    id: uuid.UUID
    code: str
    title: str
    lecturer_name: str
    status: str
    progress: int = 0
    academic_year: str
    workspace_id: Optional[uuid.UUID] = None
    banner_image_url: Optional[str] = None

class StudentDashboardResponse(BaseModel):
    """Complete aggregated data for the student dashboard."""
    summary: StudentDashboardSummary
    active_attempts: list[StudentActiveAttempt] = []
    recent_results: list[StudentRecentResult] = []
    upcoming_assessments: list[StudentUpcomingAssessment] = []
    performance_trend: list[PerformanceTrendItem] = []
    workspaces: list[StudentCourseListItem] = []
    current_academic_period: Optional[str] = None  # BUG-01: e.g. "2025/2026 Semester 2"

# Rebuild models to resolve deferred type evaluation
StudentDashboardSummary.model_rebuild()
StudentActiveAttempt.model_rebuild()
StudentRecentResult.model_rebuild()
StudentUpcomingAssessment.model_rebuild()
PerformanceTrendItem.model_rebuild()
StudentDashboardResponse.model_rebuild()
StudentScheduleEvent.model_rebuild()
StudentScheduleResponse.model_rebuild()
StudentCourseListItem.model_rebuild()

