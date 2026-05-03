from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.db.enums import AssessmentType, AssessmentStatus

class LecturerDashboardSummary(BaseModel):
    active_classes_count: int = 0
    upcoming_assessments_count: int = 0
    pending_grading_count: int = 0
    flagged_events_count: int = 0

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

class LecturerDashboardResponse(BaseModel):
    summary: LecturerDashboardSummary
    pending_queue: list[LecturerPendingItem]
    recent_submissions: list[LecturerRecentSubmission]
    chart_data: List[LecturerChartDataPoint] = []

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
    student_count: int
    performance_avg: int
    roster: list[LecturerCourseRosterItem]


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

