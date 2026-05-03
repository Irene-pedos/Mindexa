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

class AdminChartDataPoint(BaseModel):
    date: str
    submissions: int
    alerts: int

class AdminDashboardResponse(BaseModel):
    summary: AdminDashboardSummary
    recent_activity: List[AdminRecentActivity] = []
    chart_data: List[AdminChartDataPoint] = []

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

class AdminAnalyticsMetric(BaseModel):
    label: str
    value: str | int
    trend: str | None = None
    trend_direction: str | None = "up" # "up" or "down"

class AdminAnalyticsChartData(BaseModel):
    name: str
    value: int

class AdminAnalyticsResponse(BaseModel):
    summary: List[AdminAnalyticsMetric]
    user_distribution: List[dict] # [{name: 'Student', value: 400}, ...]
    assessment_trends: List[dict] # [{date: '2024-01', count: 10}, ...]
    integrity_hotspots: List[dict] # [{course: 'Database', flags: 5}, ...]
    key_insights: List[str]

class AdminIntegrityOverview(BaseModel):
    total_flagged_today: int
    high_severity_today: int
    active_sessions: int
    recent_flags: List[dict]

class SystemSettingsSchema(BaseModel):
    platform_name: str
    timezone: str
    maintenance_mode: bool
    enforce_fullscreen: bool
    ai_assistance_default: bool
    auto_flag_threshold: str
    default_duration: int
