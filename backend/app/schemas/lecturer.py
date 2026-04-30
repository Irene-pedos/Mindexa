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

class LecturerDashboardResponse(BaseModel):
    summary: LecturerDashboardSummary
    pending_queue: List[LecturerPendingItem] = []
    recent_submissions: List[LecturerRecentSubmission] = []
