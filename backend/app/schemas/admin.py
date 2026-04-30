from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel
from app.db.schemas.auth import UserResponse

class AdminDashboardSummary(BaseModel):
    total_students: int = 0
    total_lecturers: int = 0
    active_courses: int = 0
    flagged_events_today: int = 0
    system_status: str = "Healthy"

class AdminRecentActivity(BaseModel):
    action: str
    details: str
    time: str

class AdminDashboardResponse(BaseModel):
    summary: AdminDashboardSummary
    recent_activity: List[AdminRecentActivity] = []

class AdminUserListResponse(BaseModel):
    items: List[UserResponse]
    total: int

class AdminCourseListItem(BaseModel):
    id: uuid.UUID
    code: str
    title: str
    lecturer_name: str
    student_count: int
    status: str

class AdminCourseListResponse(BaseModel):
    items: List[AdminCourseListItem]
    total: int

class AdminUserStatusUpdate(BaseModel):
    """Request to update a user's status."""
    status: str # Should match UserStatus enum values

class AdminCourseAssignmentRequest(BaseModel):
    """Request to assign courses to a lecturer."""
    course_ids: List[uuid.UUID]
