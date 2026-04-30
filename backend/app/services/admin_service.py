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
from app.db.repositories.auth import UserRepository
from app.db.repositories.course_repo import CourseRepository
from app.db.repositories.integrity_repo import IntegrityRepository
from app.db.schemas.auth import UserApproveRequest, UserResponse
from app.schemas.admin import (
    AdminCourseListItem,
    AdminDashboardResponse,
    AdminDashboardSummary,
    AdminRecentActivity,
)
from app.services.auth_service import AuthService


class AdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.course_repo = CourseRepository(db)
        self.integrity_repo = IntegrityRepository(db)
        self.auth_service = AuthService(db)

    async def get_dashboard_data(self) -> AdminDashboardResponse:
        # 1. Summary Stats
        total_students = await self.user_repo.count_by_role(UserRole.STUDENT)
        total_lecturers = await self.user_repo.count_by_role(UserRole.LECTURER)
        active_courses = await self.course_repo.count_active()

        # Integrity events today
        today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        # Assuming integrity_repo has a count method (mocked if not)
        flagged_events_today = 19 # Mock

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

        return AdminDashboardResponse(
            summary=summary,
            recent_activity=recent_activity
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
                title=c.title,
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
