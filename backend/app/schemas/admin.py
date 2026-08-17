from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel
from app.db.schemas.auth import UserResponse
from app.db.schemas.academic import CourseCreate, CourseResponse

class DashboardMetric(BaseModel):
    """A metric value with trend comparison."""
    value: int
    delta: float = 0.0
    last_month: int = 0
    positive: bool = True

class AdminDashboardSummary(BaseModel):
    total_students: DashboardMetric
    total_lecturers: DashboardMetric
    active_courses: DashboardMetric
    flagged_events_today: DashboardMetric
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

from app.db.enums import LanguageEnum

class AdminCourseListItem(BaseModel):
    id: uuid.UUID
    code: str
    title: str
    lecturer_name: str
    student_count: int
    status: str
    language: LanguageEnum = LanguageEnum.EN
    performance_avg: float = 0.0
    academic_year: str | None = None

class AdminCourseListResponse(BaseModel):
    items: List[AdminCourseListItem]
    total: int

class AdminUserStatusUpdate(BaseModel):
    """Request to update a user's status."""
    status: str # Should match UserStatus enum values

class AdminUserAccommodationsUpdate(BaseModel):
    """Request to update a student's accessibility accommodations and digital literacy tier."""
    extra_time_percent: Optional[int] = None
    requires_screen_reader_mode: Optional[bool] = None
    large_text_default: Optional[bool] = None
    simple_mode_enabled: Optional[bool] = None
    reduced_motion_default: Optional[bool] = None
    reason: Optional[str] = None

class AdminUserCreate(BaseModel):
    """Request to create a new user by an admin."""
    email: str
    password: str
    first_name: str
    last_name: str
    role: str # ADMIN, LECTURER, STUDENT
    status: str = "ACTIVE"
    email_verified: bool = True
    # Optional profile fields
    staff_id: Optional[str] = None
    student_id: Optional[str] = None
    college: Optional[str] = None
    department: Optional[str] = None

class AdminCourseAssignmentRequest(BaseModel):
    """Request to assign courses to a lecturer."""
    course_ids: List[uuid.UUID]

class AdminCourseCreate(CourseCreate):
    """Admin-specific course creation, allowing optional lecturer assignment."""
    primary_lecturer_id: Optional[uuid.UUID] = None

class AdminCourseUpdate(BaseModel):
    """Request to update course metadata."""
    title: Optional[str] = None
    code: Optional[str] = None
    credit_hours: Optional[int] = None
    description: Optional[str] = None
    language: Optional[LanguageEnum] = None
    is_active: Optional[bool] = None
    institution_id: Optional[uuid.UUID] = None
    academic_period_id: Optional[uuid.UUID] = None
    academic_year: Optional[str] = None

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
    activity_data: List[dict] # [{month: 'January', assessments: 10, violations: 2}, ...]
    assessment_trends: List[dict] # [{date: '2024-01', count: 10}, ...]
    integrity_hotspots: List[dict] # [{course: 'Database', flags: 5}, ...]
    ai_grading_stats: List[dict] = [] # [{mode: 'AI Fully Auto', count: 120}, ...]
    key_insights: List[str]

class AdminIntegrityOverview(BaseModel):
    total_flagged_today: int
    high_severity_today: int
    active_sessions: int
    recent_flags: List[dict]

class AdminBulkUserApproveRequest(BaseModel):
    """Request to approve multiple users."""
    user_ids: List[uuid.UUID]
    status: str = "ACTIVE"

class AdminBulkUserStatusUpdateRequest(BaseModel):
    """Request to update status of multiple users."""
    user_ids: List[uuid.UUID]
    status: str

class SystemSettingsSchema(BaseModel):
    platform_name: str
    timezone: str
    maintenance_mode: bool
    enforce_fullscreen: bool
    ai_assistance_default: bool
    auto_flag_threshold: str
    default_duration: int

class AdminInstitutionSummary(BaseModel):
    active_partners: int
    total_capacity: int
    integrations_count: int
    suspended_partners: int

# Rebuild models
DashboardMetric.model_rebuild()
AdminDashboardSummary.model_rebuild()
AdminRecentActivity.model_rebuild()
AdminChartDataPoint.model_rebuild()
AdminDashboardResponse.model_rebuild()
AdminUserListResponse.model_rebuild()
AdminCourseListItem.model_rebuild()
AdminCourseListResponse.model_rebuild()
AdminUserStatusUpdate.model_rebuild()
AdminUserCreate.model_rebuild()
AdminCourseAssignmentRequest.model_rebuild()
AdminCourseCreate.model_rebuild()
AdminAnalyticsMetric.model_rebuild()
AdminAnalyticsChartData.model_rebuild()
AdminAnalyticsResponse.model_rebuild()
AdminIntegrityOverview.model_rebuild()
AdminBulkUserApproveRequest.model_rebuild()
AdminBulkUserStatusUpdateRequest.model_rebuild()
AdminUserAccommodationsUpdate.model_rebuild()
SystemSettingsSchema.model_rebuild()
AdminInstitutionSummary.model_rebuild()
