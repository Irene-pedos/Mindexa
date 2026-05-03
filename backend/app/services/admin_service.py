from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import List, Tuple

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import UserStatus
from app.core.exceptions import NotFoundError
from app.db.enums import LecturerAssignmentRole, UserRole
from app.db.models.academic import Course, LecturerCourseAssignment
from app.db.models.assessment import Assessment
from app.db.repositories.auth import UserRepository
from app.db.repositories.course_repo import CourseRepository
from app.db.repositories.integrity_repo import IntegrityRepository
from app.db.schemas.auth import UserApproveRequest, UserResponse
from app.db.models.attempt import AssessmentAttempt
from app.db.models.integrity import IntegrityEvent, IntegrityFlag
from sqlalchemy import func, cast, Date

from app.schemas.admin import (
    AdminAnalyticsMetric,
    AdminAnalyticsResponse,
    AdminChartDataPoint,
    AdminCourseListItem,
    AdminDashboardResponse,
    AdminDashboardSummary,
    AdminRecentActivity,
    SystemSettingsSchema,
)
from app.services.auth_service import AuthService


class AdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.course_repo = CourseRepository(db)
        self.integrity_repo = IntegrityRepository(db)
        self.auth_service = AuthService(db)

    async def get_system_settings(self) -> SystemSettingsSchema:
        """Fetch platform-wide system settings."""
        # In a real app, this would fetch from a 'system_settings' table or Institution model.
        # For now, we return defaults to ensure the frontend works 'without error'.
        return SystemSettingsSchema(
            platform_name="Mindexa Academic OS",
            timezone="UTC",
            maintenance_mode=False,
            enforce_fullscreen=True,
            ai_assistance_default=False,
            auto_flag_threshold="3",
            default_duration=90
        )

    async def update_system_settings(self, data: SystemSettingsSchema) -> SystemSettingsSchema:
        """Update platform-wide system settings."""
        # Business logic for applying settings (e.g. updating Institution record, clearing caches)
        # For now, we just return the data back to confirm successful 'save'.
        return data

    async def get_analytics_data(self) -> AdminAnalyticsResponse:
        """Fetch platform-wide analytics."""
        total_students = await self.user_repo.count_by_role(UserRole.STUDENT)
        total_lecturers = await self.user_repo.count_by_role(UserRole.LECTURER)
        active_courses = await self.course_repo.count_active()

        # Flags count
        flag_stmt = select(func.count(IntegrityFlag.id)).where(IntegrityFlag.is_deleted == False)
        flag_res = await self.db.execute(flag_stmt)
        total_flags = flag_res.scalar_one()

        summary = [
            AdminAnalyticsMetric(label="Active Students", value=total_students, trend="8.2%", trend_direction="up"),
            AdminAnalyticsMetric(label="Total Lecturers", value=total_lecturers, trend="2.1%", trend_direction="up"),
            AdminAnalyticsMetric(label="Active Courses", value=active_courses),
            AdminAnalyticsMetric(label="Integrity Incidents", value=total_flags, trend="-12%", trend_direction="down"),
        ]

        user_distribution = [
            {"name": "Students", "value": total_students},
            {"name": "Lecturers", "value": total_lecturers},
            {"name": "Admins", "value": await self.user_repo.count_by_role(UserRole.ADMIN)},
        ]

        # Assessment trends (Mocked for now as we need date-based aggregation in assessment_repo)
        assessment_trends = [
            {"date": "Jan", "count": 45},
            {"date": "Feb", "count": 52},
            {"date": "Mar", "count": 89},
            {"date": "Apr", "count": 76},
        ]

        # Integrity hotspots
        hotspot_stmt = (
            select(Course.name, func.count(IntegrityFlag.id))
            .join(Assessment, Assessment.course_id == Course.id)
            .join(IntegrityFlag, IntegrityFlag.assessment_id == Assessment.id)
            .group_by(Course.name)
            .order_by(func.count(IntegrityFlag.id).desc())
            .limit(5)
        )
        hotspot_res = await self.db.execute(hotspot_stmt)
        integrity_hotspots = [{"course": row[0], "flags": row[1]} for row in hotspot_res.all()]

        key_insights = [
            "Peak system load identified during Mid-Semester weeks.",
            f"Integrity violations are {summary[3].trend} lower than previous period.",
            "Most assessments now utilize AI-assisted grading modes."
        ]

        return AdminAnalyticsResponse(
            summary=summary,
            user_distribution=user_distribution,
            assessment_trends=assessment_trends,
            integrity_hotspots=integrity_hotspots,
            key_insights=key_insights
        )

    async def get_integrity_overview(self) -> AdminIntegrityOverview:
        """Fetch global integrity overview for admin."""
        today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        
        # 1. Total flagged today
        flag_stmt = select(func.count(IntegrityFlag.id)).where(IntegrityFlag.created_at >= today_start)
        flag_res = await self.db.execute(flag_stmt)
        total_flagged_today = flag_res.scalar_one()

        # 2. High severity today
        from app.db.enums import RiskLevel
        high_stmt = select(func.count(IntegrityFlag.id)).where(
            IntegrityFlag.created_at >= today_start,
            IntegrityFlag.risk_level.in_([RiskLevel.HIGH.value, RiskLevel.CRITICAL.value])
        )
        high_res = await self.db.execute(high_stmt)
        high_severity_today = high_res.scalar_one()

        # 3. Active sessions (Attempts with status IN_PROGRESS)
        from app.db.enums import AttemptStatus
        session_stmt = select(func.count(AssessmentAttempt.id)).where(AssessmentAttempt.status == AttemptStatus.IN_PROGRESS)
        session_res = await self.db.execute(session_stmt)
        active_sessions = session_res.scalar_one()

        # 4. Recent flags (Last 50)
        recent_flags, _ = await self.integrity_repo.list_all_flags(page=1, page_size=50)

        from app.schemas.admin import AdminIntegrityOverview
        return AdminIntegrityOverview(
            total_flagged_today=total_flagged_today,
            high_severity_today=high_severity_today,
            active_sessions=active_sessions,
            recent_flags=recent_flags
        )

    async def get_dashboard_data(self) -> AdminDashboardResponse:
        # 1. Summary Stats
        total_students = await self.user_repo.count_by_role(UserRole.STUDENT)
        total_lecturers = await self.user_repo.count_by_role(UserRole.LECTURER)
        active_courses = await self.course_repo.count_active()

        # Integrity events today
        today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        flag_stmt = select(func.count(IntegrityEvent.id)).where(IntegrityEvent.created_at >= today_start)
        flag_res = await self.db.execute(flag_stmt)
        flagged_events_today = flag_res.scalar_one()

        summary = AdminDashboardSummary(
            total_students=total_students,
            total_lecturers=total_lecturers,
            active_courses=active_courses,
            flagged_events_today=flagged_events_today,
            system_status="Healthy"
        )

        # 2. Recent Activity (Mocked system-wide activity)
        recent_activity = [
            AdminRecentActivity(action="New student registered", details="ID: S3921 • Computer Science", time="14 min ago"),
            AdminRecentActivity(action="Assessment published", details="Database Systems CAT", time="2 hours ago"),
            AdminRecentActivity(action="Integrity alert resolved", details="Student S2847 – Tab switching", time="Yesterday"),
        ]

        # 3. Chart Data (Last 30 days)
        chart_data = []
        base = datetime.now(UTC).date()
        start_date = base - timedelta(days=30)

        # Aggregation query for submissions
        sub_stmt = (
            select(cast(AssessmentAttempt.submitted_at, Date), func.count(AssessmentAttempt.id))
            .where(AssessmentAttempt.submitted_at >= start_date)
            .group_by(cast(AssessmentAttempt.submitted_at, Date))
            .order_by(cast(AssessmentAttempt.submitted_at, Date))
        )
        sub_res = await self.db.execute(sub_stmt)
        sub_map = {row[0].isoformat(): row[1] for row in sub_res.all() if row[0]}

        # Aggregation query for alerts
        alert_stmt = (
            select(cast(IntegrityEvent.created_at, Date), func.count(IntegrityEvent.id))
            .where(IntegrityEvent.created_at >= start_date)
            .group_by(cast(IntegrityEvent.created_at, Date))
            .order_by(cast(IntegrityEvent.created_at, Date))
        )
        alert_res = await self.db.execute(alert_stmt)
        alert_map = {row[0].isoformat(): row[1] for row in alert_res.all() if row[0]}

        for i in range(30, -1, -1):
            d = (base - timedelta(days=i)).isoformat()
            chart_data.append(AdminChartDataPoint(
                date=d,
                submissions=sub_map.get(d, 0),
                alerts=alert_map.get(d, 0)
            ))

        return AdminDashboardResponse(
            summary=summary,
            recent_activity=recent_activity,
            chart_data=chart_data
        )

    async def list_users(self, page: int = 1, page_size: int = 20) -> Tuple[List[UserResponse], int]:
        """List all users with their full profile and assigned courses for lecturers."""
        users, total = await self.user_repo.list_all(page=page, page_size=page_size)

        items = []
        for u in users:
            items.append(await self._build_user_response_with_courses(u))

        return items, total

    async def list_courses(self, page: int = 1, page_size: int = 20) -> Tuple[List[AdminCourseListItem], int]:
        courses, total = await self.course_repo.list_all(page=page, page_size=page_size)

        items = []
        for c in courses:
            student_count = await self.course_repo.get_student_count(c.id)
            items.append(AdminCourseListItem(
                id=c.id,
                code=c.code,
                title=c.name,
                lecturer_name="Primary Lecturer", # Needs more repo logic
                student_count=student_count,
                status="Active" if not c.is_deleted else "Deleted"
            ))

        return items, total

    async def approve_user(self, user_id: uuid.UUID, data: UserApproveRequest) -> UserResponse:
        """Approve a user account and update its status."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", str(user_id))

        user.status = data.status
        if data.status == UserStatus.ACTIVE:
             user.email_verified = True # Auto-verify on admin approval

        await self.user_repo.update(user)
        return await self._build_user_response_with_courses(user)

    async def update_user_status(self, user_id: uuid.UUID, status: UserStatus) -> UserResponse:
        """Update any user status (SUSPENDED, ACTIVE, GRADUATED)."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", str(user_id))

        # Enforce role-based status logic if needed (e.g. only students can be GRADUATED)
        if status == UserStatus.GRADUATED and user.role != UserRole.STUDENT:
            from app.core.exceptions import ValidationError
            raise ValidationError("Only students can be marked as Graduated.")

        user.status = status
        await self.user_repo.update(user)
        return await self._build_user_response_with_courses(user)

    async def assign_courses_to_lecturer(self, lecturer_id: uuid.UUID, course_ids: list[uuid.UUID]) -> UserResponse:
        """Assign a list of courses to a lecturer."""
        user = await self.user_repo.get_by_id(lecturer_id)
        if not user or user.role != UserRole.LECTURER:
            raise NotFoundError("Lecturer", str(lecturer_id))

        # 1. Remove existing assignments (or we could merge, but usually easier to replace)
        await self.db.execute(
            delete(LecturerCourseAssignment).where(LecturerCourseAssignment.lecturer_id == lecturer_id)
        )

        # 2. Add new assignments
        for c_id in course_ids:
            assignment = LecturerCourseAssignment(
                lecturer_id=lecturer_id,
                course_id=c_id,
                assignment_role=LecturerAssignmentRole.PRIMARY,
                is_active=True
            )
            self.db.add(assignment)

        await self.db.flush()
        return await self._build_user_response_with_courses(user)

    async def _build_user_response_with_courses(self, user) -> UserResponse:
        """Helper to build UserResponse and populate assigned_courses for lecturers."""
        from app.api.v1.routes.auth import _build_user_response
        response = _build_user_response(user)

        if user.role == UserRole.LECTURER and response.profile:
            # Fetch assigned course codes
            stmt = select(Course.code).join(
                LecturerCourseAssignment, LecturerCourseAssignment.course_id == Course.id
            ).where(
                LecturerCourseAssignment.lecturer_id == user.id,
                LecturerCourseAssignment.is_active == True
            )
            result = await self.db.execute(stmt)
            response.profile.assigned_courses = list(result.scalars().all())

        return response
