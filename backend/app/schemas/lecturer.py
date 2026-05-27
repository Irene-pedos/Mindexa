from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.db.enums import AssessmentType, AssessmentStatus

class DashboardMetric(BaseModel):
    """A metric value with trend comparison."""
    value: int
    delta: float = 0.0
    last_month: int = 0
    positive: bool = True

class LecturerDashboardSummary(BaseModel):
    active_classes_count: DashboardMetric
    upcoming_assessments_count: DashboardMetric
    pending_grading_count: DashboardMetric
    flagged_events_count: DashboardMetric

class LecturerPendingItem(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    assessment_title: str
    type: str # "Manual Grading", "AI Review", etc.
    count: int
    urgency: str # "high", "medium", "low"

class LecturerRecentSubmission(BaseModel):
    student_name: str
    assessment_title: str
    submitted_at: datetime
    status: str

class LecturerChartDataPoint(BaseModel):
    date: str
    manual: int
    ai: int

class LecturerIntegrityAlert(BaseModel):
    id: uuid.UUID
    student_name: str
    student_id: str
    assessment_title: str
    event_type: str
    created_at: datetime
    risk_score: int
    severity: str

class LecturerDashboardResponse(BaseModel):
    summary: LecturerDashboardSummary
    pending_queue: list[LecturerPendingItem]
    recent_submissions: list[LecturerRecentSubmission]
    chart_data: List[LecturerChartDataPoint] = []
    recent_alerts: List[LecturerIntegrityAlert] = []
    workspaces: List[WorkspaceListItem] = []

class WorkspaceListItem(BaseModel):
    """Operational teaching space summary for lecturer dashboard."""
    id: uuid.UUID
    title: str
    code: str
    academic_year: str
    student_count: int
    status: str
    performance_avg: float = 0.0
    lecturer_name: str
    institution_name: str
    class_name: str

class WorkspaceDetail(WorkspaceListItem):
    """Detailed operational teaching space view."""
    description: Optional[str] = None
    department_name: Optional[str] = None
    option_name: Optional[str] = None
    sections: List[str] = []
    roster: List[LecturerCourseRosterItem] = []

class WorkspaceCreate(BaseModel):
    """Request to initialize a teaching workspace from an assignment."""
    teaching_assignment_id: uuid.UUID
    title: Optional[str] = None # Defaults to "{Course} ({Section})"
    description: Optional[str] = None

class LecturerCourseRosterItem(BaseModel):
    id: uuid.UUID
    student_id: str
    name: str
    email: str
    progress: int
    last_submission: str | None = None

class LecturerCourseDetail(BaseModel):
    id: uuid.UUID
    code: str
    title: str
    description: Optional[str] = None
    student_count: int
    performance_avg: float
    institution_id: uuid.UUID
    academic_year: str
    roster: List[LecturerCourseRosterItem]
    department_name: Optional[str] = None
    option_name: Optional[str] = None
    sections: List[str] = []


# -- Add Student & Record Viewing ---------------------------------------------

class AddStudentRequest(BaseModel):
    """Body for POST /lecturers/me/courses/{course_id}/students."""
    email: str


class StudentRecordAttempt(BaseModel):
    """A single assessment attempt record for a student in a specific course."""
    id: uuid.UUID
    assessment_title: str
    status: str
    submitted_at: datetime | None = None
    score: float | None = None
    max_score: float | None = None
    percentage: float | None = None


class StudentCourseRecordResponse(BaseModel):
    """Complete performance record for one student in one course."""
    student_name: str
    student_id: str
    email: str
    enrolled_at: datetime
    overall_progress: int
    attempts: list[StudentRecordAttempt] = []


# Rebuild models
LecturerDashboardSummary.model_rebuild()
LecturerPendingItem.model_rebuild()
LecturerRecentSubmission.model_rebuild()
LecturerChartDataPoint.model_rebuild()
LecturerDashboardResponse.model_rebuild()
LecturerCourseRosterItem.model_rebuild()
LecturerCourseDetail.model_rebuild()
AddStudentRequest.model_rebuild()
StudentRecordAttempt.model_rebuild()
StudentCourseRecordResponse.model_rebuild()

