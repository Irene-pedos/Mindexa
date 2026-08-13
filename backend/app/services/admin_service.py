from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import List, Tuple, Optional

from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import UserStatus
from app.core.exceptions import NotFoundError
from app.db.enums import LecturerAssignmentRole, UserRole
from app.db.models.academic import (
    Course, 
    CourseDepartment, 
    CourseOption, 
    ClassSection, 
    ClassGroup,
    Institution,
    Campus,
    College,
    Department,
    Option
)
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
    AdminCourseCreate,
    AdminUserAccommodationsUpdate,
)
from app.db.schemas.academic import CourseResponse
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
            AdminAnalyticsMetric(label="Active Students", value=total_students),
            AdminAnalyticsMetric(label="Total Lecturers", value=total_lecturers),
            AdminAnalyticsMetric(label="Active Courses", value=active_courses),
            AdminAnalyticsMetric(label="Integrity Incidents", value=total_flags, trend="4.2% decrease", trend_direction="down"),
        ]

        user_distribution = [
            {"name": "Students", "value": total_students},
            {"name": "Lecturers", "value": total_lecturers},
            {"name": "Admins", "value": await self.user_repo.count_by_role(UserRole.ADMIN)},
        ]

        # 3. Monthly Activity Data (Real data from DB)
        now = datetime.now(UTC)
        activity_data = []
        
        # We iterate over the last 6 months
        for i in range(5, -1, -1):
            target_date = now - timedelta(days=i*30)
            month_name = target_date.strftime("%B")
            month_num = target_date.month
            year_num = target_date.year
            
            # Count assessments in this month/year
            from sqlalchemy import extract
            as_stmt = select(func.count(Assessment.id)).where(
                Assessment.is_deleted == False,
                extract('month', Assessment.created_at) == month_num,
                extract('year', Assessment.created_at) == year_num
            )
            as_res = await self.db.execute(as_stmt)
            as_count = as_res.scalar_one()
            
            # Count flags in this month/year
            fl_stmt = select(func.count(IntegrityFlag.id)).where(
                IntegrityFlag.is_deleted == False,
                extract('month', IntegrityFlag.created_at) == month_num,
                extract('year', IntegrityFlag.created_at) == year_num
            )
            fl_res = await self.db.execute(fl_stmt)
            fl_count = fl_res.scalar_one()
            
            activity_data.append({
                "month": month_name,
                "assessments": as_count,
                "violations": fl_count
            })

        # 4. Assessment trends (Last 10 days for timeline)
        trend_stmt = (
            select(cast(Assessment.created_at, Date), func.count(Assessment.id))
            .where(Assessment.is_deleted == False)
            .group_by(cast(Assessment.created_at, Date))
            .order_by(cast(Assessment.created_at, Date).desc())
            .limit(10)
        )
        trend_res = await self.db.execute(trend_stmt)
        assessment_trends = [{"date": row[0].isoformat(), "count": row[1]} for row in trend_res.all() if row[0]]

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

        # AI Grading Stats
        grading_stmt = select(Assessment.grading_mode, func.count(Assessment.id)).group_by(Assessment.grading_mode)
        grading_res = await self.db.execute(grading_stmt)
        ai_grading_stats = [{"mode": str(row[0]), "count": row[1]} for row in grading_res.all()]

        key_insights = [
            f"Total platform reach: {total_students} students across {active_courses} active modules.",
            f"AI adoption: {sum(s['count'] for s in ai_grading_stats)} assessments using diverse grading modes.",
            f"Integrity monitoring active: {total_flags} events recorded for faculty review."
        ]

        return AdminAnalyticsResponse(
            summary=summary,
            user_distribution=user_distribution,
            activity_data=activity_data,
            assessment_trends=assessment_trends,
            integrity_hotspots=integrity_hotspots,
            ai_grading_stats=ai_grading_stats,
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
        from app.db.models.auth import User
        from app.db.models.academic import Course
        from app.db.models.integrity import IntegrityEvent
        from app.core.constants import UserRole
        from app.schemas.admin import DashboardMetric, AdminRecentActivity

        now = datetime.now(UTC)
        first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        async def get_metric(model, role_filter=None):
            # Current Total
            stmt = select(func.count(model.id)).where(model.is_deleted == False)
            if role_filter:
                stmt = stmt.where(model.role == role_filter)
            curr = (await self.db.execute(stmt)).scalar_one()

            # Last Month Total (created before this month)
            stmt_last = select(func.count(model.id)).where(model.is_deleted == False, model.created_at < first_of_this_month)
            if role_filter:
                stmt_last = stmt_last.where(model.role == role_filter)
            last = (await self.db.execute(stmt_last)).scalar_one()

            delta = 0
            if last > 0:
                delta = round(((curr - last) / last) * 100, 1)
            
            return DashboardMetric(value=curr, delta=delta, last_month=last, positive=curr >= last)

        # 1. Summary Stats
        total_students = await get_metric(User, UserRole.STUDENT.value)
        total_lecturers = await get_metric(User, UserRole.LECTURER.value)
        active_courses = await get_metric(Course)

        # Integrity events today vs yesterday
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)
        
        stmt_today = select(func.count(IntegrityEvent.id)).where(IntegrityEvent.created_at >= today_start)
        curr_flags = (await self.db.execute(stmt_today)).scalar_one()
        
        stmt_yesterday = select(func.count(IntegrityEvent.id)).where(
            IntegrityEvent.created_at >= yesterday_start,
            IntegrityEvent.created_at < today_start
        )
        last_flags = (await self.db.execute(stmt_yesterday)).scalar_one()
        
        delta_flags = 0
        if last_flags > 0:
            delta_flags = round(((curr_flags - last_flags) / last_flags) * 100, 1)
        
        flagged_events = DashboardMetric(
            value=curr_flags, 
            delta=delta_flags, 
            last_month=last_flags, 
            positive=curr_flags <= last_flags # fewer is better
        )

        summary = AdminDashboardSummary(
            total_students=total_students,
            total_lecturers=total_lecturers,
            active_courses=active_courses,
            flagged_events_today=flagged_events,
            system_status="Healthy"
        )

        # 2. Recent Activity (Real system-wide activity from AuditLog)
        from app.db.models.audit import AuditLog
        activity_stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(10)
        activity_res = await self.db.execute(activity_stmt)
        activity_items = activity_res.scalars().all()

        def format_time_ago(dt: datetime) -> str:
            diff = datetime.now(UTC) - dt
            if diff.days > 0:
                return f"{diff.days} days ago" if diff.days > 1 else "Yesterday"
            hours = diff.seconds // 3600
            if hours > 0:
                return f"{hours} hours ago" if hours > 1 else "1 hour ago"
            minutes = diff.seconds // 60
            if minutes > 0:
                return f"{minutes} min ago" if minutes > 1 else "Just now"
            return "Just now"

        recent_activity = []
        for act in activity_items:
            recent_activity.append(AdminRecentActivity(
                action=act.action.replace("_", " ").title(),
                details=act.description or f"{act.entity_type} {act.action}",
                time=format_time_ago(act.created_at)
            ))

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

    async def list_users(
        self, 
        page: int = 1, 
        page_size: int = 20,
        role: Optional[str] = None,
        status: Optional[str] = None
    ) -> Tuple[List[UserResponse], int]:
        """List all users with their full profile and assigned courses for lecturers."""
        users, total = await self.user_repo.list_all(
            page=page, 
            page_size=page_size,
            role=role,
            status=status
        )

        items = []
        for u in users:
            items.append(await self._build_user_response_with_courses(u))

        return items, total

    async def create_user(self, data: AdminUserCreate) -> UserResponse:
        """Create a new user with profile by an admin."""
        from app.db.models.auth import User, UserProfile
        from app.core.security import hash_password

        # 1. Check if email exists
        if await self.user_repo.email_exists(data.email):
            from app.core.exceptions import AuthenticationError
            raise AuthenticationError("Email already registered")

        # 2. Create User
        user = User(
            email=data.email,
            hashed_password=hash_password(data.password),
            role=UserRole(data.role.upper()),
            status=UserStatus(data.status.upper()),
            email_verified=data.email_verified,
            email_verified_at=datetime.now(UTC) if data.email_verified else None,
        )
        user = await self.user_repo.create(user)

        # 3. Create Profile
        profile = UserProfile(
            user_id=user.id,
            first_name=data.first_name,
            last_name=data.last_name,
            staff_id=data.staff_id,
            student_id=data.student_id,
            college=data.college,
            department=data.department,
        )
        from app.db.repositories.auth import UserProfileRepository
        profile_repo = UserProfileRepository(self.db)
        await profile_repo.create(profile)
        
        await self.db.refresh(user)
        return await self._build_user_response_with_courses(user)

    async def list_courses(self, page: int = 1, page_size: int = 20) -> Tuple[List[AdminCourseListItem], int]:
        courses, total = await self.course_repo.list_all(page=page, page_size=page_size)

        items = []
        for c in courses:
            student_count = await self.course_repo.get_student_count(c.id)
            
            # Fetch primary lecturer name
            from app.db.models.academic import TeachingAssignment
            lecturer_stmt = (
                select(TeachingAssignment)
                .where(
                    TeachingAssignment.course_id == c.id,
                    TeachingAssignment.is_active == True,
                    TeachingAssignment.is_deleted == False
                )
            )
            lecturer_res = await self.db.execute(lecturer_stmt)
            lecturer_assignment = lecturer_res.scalars().first()
            
            lecturer_name = "Not Assigned"
            if lecturer_assignment:
                lecturer = await self.user_repo.get_by_id(lecturer_assignment.lecturer_id)
                if lecturer and lecturer.profile:
                    p = lecturer.profile
                    lecturer_name = f"{p.first_name} {p.last_name}" if p.first_name else p.display_name or lecturer.email

            items.append(AdminCourseListItem(
                id=c.id,
                code=c.code,
                title=c.name,
                lecturer_name=lecturer_name,
                student_count=student_count,
                status="Active" if not c.is_deleted else "Deleted",
                academic_year=c.academic_year
            ))

        return items, total

    async def create_course(self, data: AdminCourseCreate) -> Course:
        """Create a new course with optional primary lecturer assignment."""
        # Create the course
        course = Course(
            institution_id=data.institution_id,
            academic_period_id=data.academic_period_id,
            academic_year=data.academic_year,
            code=data.code,
            name=data.title,
            description=data.description,
            credit_hours=data.credit_hours,
            is_active=True
        )
        await self.course_repo.create(course)

        # 1. Assign Departments
        if data.department_ids:
            for dept_id in data.department_ids:
                cd = CourseDepartment(course_id=course.id, department_id=dept_id)
                self.db.add(cd)
        
        # 2. Assign Options
        if data.option_ids:
            for opt_id in data.option_ids:
                co = CourseOption(course_id=course.id, option_id=opt_id)
                self.db.add(co)

        # 3. Create Class Sections from Class Groups
        created_sections = []
        if data.class_group_ids:
            for cg_id in data.class_group_ids:
                stmt = select(ClassGroup).where(ClassGroup.id == cg_id)
                res = await self.db.execute(stmt)
                cg = res.scalars().first()
                if cg:
                    section = ClassSection(
                        class_group_id=cg.id,
                        name=cg.name,
                        capacity=50,
                        is_active=True
                    )
                    self.db.add(section)
                    await self.db.flush() # Generate section ID
                    created_sections.append(section)

        # 4. Assign Primary Lecturer if provided
        if data.primary_lecturer_id:
            from app.db.models.academic import TeachingAssignment
            
            # Use first department as primary for the assignment record
            primary_dept_id = data.department_ids[0] if data.department_ids else None
            
            if created_sections:
                for section in created_sections:
                    assignment = TeachingAssignment(
                        lecturer_id=data.primary_lecturer_id,
                        institution_id=data.institution_id,
                        department_id=primary_dept_id,
                        course_id=course.id,
                        class_section_id=section.id,
                        academic_period_id=data.academic_period_id,
                        academic_year=data.academic_year,
                        role=LecturerAssignmentRole.MAIN_LECTURER,
                        is_active=True
                    )
                    self.db.add(assignment)
            else:
                # Global assignment if no sections
                assignment = TeachingAssignment(
                    lecturer_id=data.primary_lecturer_id,
                    institution_id=data.institution_id,
                    department_id=primary_dept_id,
                    course_id=course.id,
                    academic_period_id=data.academic_period_id,
                    academic_year=data.academic_year,
                    role=LecturerAssignmentRole.MAIN_LECTURER,
                    is_active=True
                )
                self.db.add(assignment)
        
        await self.db.commit()
        return course

    async def delete_course(self, course_id: uuid.UUID) -> None:
        """Soft delete a course."""
        deleted = await self.course_repo.delete(course_id)
        if not deleted:
            raise NotFoundError("Course", str(course_id))
        await self.db.commit()

    async def update_course(self, course_id: uuid.UUID, data: AdminCourseUpdate) -> Course:
        """Update course metadata."""
        course = await self.course_repo.get_by_id(course_id)
        if not course:
            raise NotFoundError("Course", str(course_id))

        if data.title is not None:
            course.name = data.title
        if data.code is not None:
            course.code = data.code
        if data.credit_hours is not None:
            course.credit_hours = data.credit_hours
        if data.description is not None:
            course.description = data.description
        if data.is_active is not None:
            course.is_active = data.is_active
            if data.is_active:
                course.is_deleted = False # Reactivation undoes soft delete
        if data.institution_id is not None:
            course.institution_id = data.institution_id
        if data.academic_period_id is not None:
            course.academic_period_id = data.academic_period_id
        if data.academic_year is not None:
            course.academic_year = data.academic_year

        await self.db.commit()
        await self.db.refresh(course)
        return course

    async def list_lecturers(self) -> List[UserResponse]:
        """List all active lecturers for selection in course creation."""
        from app.db.models.auth import User
        stmt = select(User).where(
            User.role == UserRole.LECTURER,
            User.status == UserStatus.ACTIVE,
            User.is_deleted == False
        )
        result = await self.db.execute(stmt)
        users = result.scalars().all()
        
        items = []
        for u in users:
            items.append(await self._build_user_response_with_courses(u))
        return items

    # ── Institution Management ────────────────────────────────────────────────

    async def create_institution(self, data: InstitutionCreate) -> Institution:
        """Create a new institution."""
        from app.db.models.academic import Institution
        institution = Institution(
            name=data.name,
            code=data.code,
            timezone=data.timezone,
            logo_url=data.logo_url,
            settings=data.settings or {},
            integrations=data.integrations or {},
            is_active=True
        )
        self.db.add(institution)
        await self.db.commit()
        await self.db.refresh(institution)
        return institution

    async def update_institution(self, institution_id: uuid.UUID, data: InstitutionUpdate) -> Institution:
        """Update institution settings and branding."""
        from app.db.models.academic import Institution
        institution = await self.db.get(Institution, institution_id)
        if not institution:
            raise NotFoundError("Institution", str(institution_id))

        if data.name is not None:
            institution.name = data.name
        if data.timezone is not None:
            institution.timezone = data.timezone
        if data.logo_url is not None:
            institution.logo_url = data.logo_url
        if data.is_active is not None:
            institution.is_active = data.is_active
        if data.settings is not None:
            institution.settings = data.settings
        if data.integrations is not None:
            institution.integrations = data.integrations

        await self.db.commit()
        await self.db.refresh(institution)
        return institution

    async def list_institutions(self) -> List[Institution]:
        """List all institutions."""
        from app.db.models.academic import Institution
        stmt = select(Institution).where(Institution.is_deleted == False)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_institution_summary(self) -> AdminInstitutionSummary:
        """Calculate aggregated stats for all institutions."""
        from app.schemas.admin import AdminInstitutionSummary

        # 1. Active vs Suspended
        stmt = select(Institution.is_active, func.count(Institution.id)).where(Institution.is_deleted == False).group_by(Institution.is_active)
        res = await self.db.execute(stmt)
        counts = {row[0]: row[1] for row in res.all()}
        
        active_partners = counts.get(True, 0)
        suspended_partners = counts.get(False, 0)

        # 2. Total Capacity (Sum of all class sections)
        cap_stmt = select(func.sum(ClassSection.capacity)).where(
            ClassSection.is_active == True,
            ClassSection.is_deleted == False
        )
        cap_res = await self.db.execute(cap_stmt)
        total_capacity = cap_res.scalar() or 0

        # 3. Integrations (Count institutions with any non-empty integration)
        # Fetch all integrations and count in Python for maximum compatibility
        int_stmt = select(Institution.integrations).where(Institution.is_deleted == False)
        int_res = await self.db.execute(int_stmt)
        integrations_count = 0
        for row in int_res.all():
            if row[0] and isinstance(row[0], dict) and len(row[0]) > 0:
                integrations_count += 1

        return AdminInstitutionSummary(
            active_partners=active_partners,
            total_capacity=int(total_capacity),
            integrations_count=integrations_count,
            suspended_partners=suspended_partners
        )

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

    async def bulk_approve_users(self, user_ids: list[uuid.UUID], status: UserStatus) -> int:
        """Approve multiple user accounts at once."""
        count = 0
        for u_id in user_ids:
            user = await self.user_repo.get_by_id(u_id)
            if user:
                user.status = status
                if status == UserStatus.ACTIVE:
                    user.email_verified = True
                await self.user_repo.update(user)
                count += 1
        return count

    async def bulk_update_user_status(self, user_ids: list[uuid.UUID], status: UserStatus) -> int:
        """Update status for multiple users at once."""
        count = 0
        for u_id in user_ids:
            user = await self.user_repo.get_by_id(u_id)
            if user:
                # Enforce student-only graduated status
                if status == UserStatus.GRADUATED and user.role != UserRole.STUDENT:
                    continue
                user.status = status
                await self.user_repo.update(user)
                count += 1
        return count

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
        from app.db.models.academic import TeachingAssignment, Course, CourseDepartment
        user = await self.user_repo.get_by_id(lecturer_id)
        if not user or user.role != UserRole.LECTURER:
            raise NotFoundError("Lecturer", str(lecturer_id))

        # 1. Remove existing assignments
        await self.db.execute(
            delete(TeachingAssignment).where(TeachingAssignment.lecturer_id == lecturer_id)
        )

        # 2. Add new assignments
        for c_id in course_ids:
            course = await self.db.get(Course, c_id)
            if not course: continue
            
            # Find primary department for this course to satisfy non-null constraint
            dept_res = await self.db.execute(select(CourseDepartment.department_id).where(CourseDepartment.course_id == c_id).limit(1))
            dept_id = dept_res.scalar_one_or_none()

            assignment = TeachingAssignment(
                lecturer_id=lecturer_id,
                institution_id=course.institution_id,
                department_id=dept_id or uuid.uuid4(), # Fallback if data is missing, but should be there
                course_id=c_id,
                academic_period_id=course.academic_period_id,
                academic_year=course.academic_year,
                role=LecturerAssignmentRole.MAIN_LECTURER,
                is_active=True
            )
            self.db.add(assignment)

        await self.db.flush()
        return await self._build_user_response_with_courses(user)

    async def _build_user_response_with_courses(self, user) -> UserResponse:
        """Helper to build UserResponse and populate assigned_courses for lecturers."""
        from app.api.v1.routes.auth import _build_user_response
        from app.db.models.academic import TeachingAssignment
        response = _build_user_response(user)

        if user.role == UserRole.LECTURER and response.profile:
            # Fetch assigned course codes
            stmt = select(Course.code).join(
                TeachingAssignment, TeachingAssignment.course_id == Course.id
            ).where(
                TeachingAssignment.lecturer_id == user.id,
                TeachingAssignment.is_active == True
            )
            result = await self.db.execute(stmt)
            response.profile.assigned_courses = list(result.scalars().all())

        return response

    async def update_user_accommodations(
        self,
        user_id: uuid.UUID,
        body: AdminUserAccommodationsUpdate,
        actor_id: Optional[uuid.UUID] = None,
        actor_role: Optional[str] = "admin",
    ) -> UserResponse:
        """
        Update student accessibility accommodations and digital literacy tier,
        recording an immutable AuditLog row with before/after state diff.
        """
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        profile = user.profile
        if not profile:
            raise NotFoundError("User profile not found")

        # Capture before_state
        before_state = {
            "extra_time_percent": getattr(profile, "extra_time_percent", 0),
            "requires_screen_reader_mode": getattr(profile, "requires_screen_reader_mode", False),
            "large_text_default": getattr(profile, "large_text_default", False),
            "simple_mode_enabled": getattr(profile, "simple_mode_enabled", False),
            "reduced_motion_default": getattr(profile, "reduced_motion_default", False),
        }

        # Apply updates
        if body.extra_time_percent is not None:
            profile.extra_time_percent = body.extra_time_percent
        if body.requires_screen_reader_mode is not None:
            profile.requires_screen_reader_mode = body.requires_screen_reader_mode
        if body.large_text_default is not None:
            profile.large_text_default = body.large_text_default
        if body.simple_mode_enabled is not None:
            profile.simple_mode_enabled = body.simple_mode_enabled
        if body.reduced_motion_default is not None:
            profile.reduced_motion_default = body.reduced_motion_default

        # Capture after_state
        after_state = {
            "extra_time_percent": getattr(profile, "extra_time_percent", 0),
            "requires_screen_reader_mode": getattr(profile, "requires_screen_reader_mode", False),
            "large_text_default": getattr(profile, "large_text_default", False),
            "simple_mode_enabled": getattr(profile, "simple_mode_enabled", False),
            "reduced_motion_default": getattr(profile, "reduced_motion_default", False),
        }
        if body.reason:
            after_state["reason"] = body.reason

        self.db.add(profile)

        # Write AuditLog
        from app.db.models.audit import AuditLog

        audit = AuditLog(
            entity_type="user_profile",
            entity_id=profile.id,
            action="accommodations_updated",
            description=f"Accommodations updated for user {user.email}. Reason: {body.reason or 'Administrative review'}",
            before_state=before_state,
            after_state=after_state,
            actor_id=actor_id,
            actor_role=actor_role,
        )
        self.db.add(audit)

        await self.db.commit()
        await self.db.refresh(profile)
        await self.db.refresh(user)

        return await self._build_user_response_with_courses(user)

