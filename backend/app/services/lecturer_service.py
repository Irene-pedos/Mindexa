from __future__ import annotations

import uuid
from typing import List
from datetime import UTC, datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date

from app.db.models.attempt import AssessmentAttempt
from app.db.models.assessment import Assessment
from app.db.models.integrity import IntegrityEvent
from app.db.enums import AssessmentStatus, GradingQueueStatus, GradingMode, AttemptStatus
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.grading_repo import GradingRepository
from app.db.repositories.integrity_repo import IntegrityRepository
from app.core.exceptions import NotFoundError
from app.schemas.lecturer import (
    LecturerChartDataPoint,
    LecturerDashboardResponse,
    LecturerDashboardSummary,
    LecturerPendingItem,
    LecturerRecentSubmission,
    LecturerCourseDetail,
    LecturerCourseRosterItem,
    WorkspaceListItem,
    WorkspaceDetail,
    WorkspaceCreate,
)

from app.db.models.academic import (
    Course, 
    ClassSection, 
    StudentEnrollment, 
    LecturerCourseAssignment, 
    Institution, 
    AcademicPeriod,
    CourseDepartment,
    CourseOption,
    Option,
    ClassGroup,
    TeachingAssignment,
    TeachingWorkspace
)
from app.db.repositories.course_repo import CourseRepository
from app.db.repositories.workspace_repo import WorkspaceRepository
from app.db.repositories.auth import UserRepository
from app.db.schemas.academic import CourseCreate, CourseResponse
from app.schemas.lecturer import (
    AddStudentRequest,
    StudentRecordAttempt,
    StudentCourseRecordResponse,
)

class LecturerService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.grading_repo = GradingRepository(db)
        self.integrity_repo = IntegrityRepository(db)
        self.course_repo = CourseRepository(db)
        self.workspace_repo = WorkspaceRepository(db)
        self.user_repo = UserRepository(db)

    async def add_student_to_workspace(self, lecturer_id: uuid.UUID, workspace_id: uuid.UUID, email: str) -> bool:
        from app.db.models.auth import User
        from app.db.enums import UserRole, EnrollmentStatus

        # 1. Fetch Workspace
        ws = await self.workspace_repo.get_by_id(workspace_id)
        if not ws:
            raise NotFoundError("Workspace", str(workspace_id))

        # 2. Verify lecturer ownership
        if ws.teaching_assignment.lecturer_id != lecturer_id:
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("You are not authorized to manage students for this workspace")

        # 3. Find student by email
        user = await self.user_repo.get_by_email(email.lower())
        if not user or user.role != UserRole.STUDENT.value:
            from app.core.exceptions import ValidationError
            raise ValidationError(f"Student with email '{email}' not found")

        # 4. Check if already enrolled in the section
        enroll_stmt = select(StudentEnrollment).where(
            StudentEnrollment.student_id == user.id,
            StudentEnrollment.class_section_id == ws.class_section_id,
            StudentEnrollment.is_deleted == False
        )
        enroll_res = await self.db.execute(enroll_stmt)
        if enroll_res.scalars().first():
            return True # Already enrolled

        # 5. Create enrollment
        enrollment = StudentEnrollment(
            student_id=user.id,
            class_section_id=ws.class_section_id,
            enrollment_status=EnrollmentStatus.ACTIVE,
            enrolled_at=datetime.now(UTC)
        )
        self.db.add(enrollment)
        await self.db.commit()
        return True

    async def get_student_workspace_record(self, lecturer_id: uuid.UUID, workspace_id: uuid.UUID, student_id: uuid.UUID) -> StudentCourseRecordResponse:
        from app.db.models.auth import User, UserProfile
        from app.db.models.result import AssessmentResult

        # 1. Fetch Workspace
        ws = await self.workspace_repo.get_by_id(workspace_id)
        if not ws:
            raise NotFoundError("Workspace", str(workspace_id))

        # 2. Fetch Student Profile and Enrollment in this section
        stmt = (
            select(User, UserProfile, StudentEnrollment)
            .join(UserProfile, UserProfile.user_id == User.id)
            .join(StudentEnrollment, StudentEnrollment.student_id == User.id)
            .where(
                User.id == student_id,
                StudentEnrollment.class_section_id == ws.class_section_id,
                StudentEnrollment.is_deleted == False
            )
        )
        res = await self.db.execute(stmt)
        row = res.first()
        if not row:
            raise NotFoundError("Student enrollment not found in this workspace")
        
        user, profile, enrollment = row

        # 3. Fetch all attempts for assessments in this workspace
        attempts_stmt = (
            select(AssessmentAttempt, Assessment)
            .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
            .where(
                AssessmentAttempt.student_id == student_id,
                Assessment.teaching_workspace_id == workspace_id,
                AssessmentAttempt.is_deleted == False
            )
            .order_by(AssessmentAttempt.started_at.desc())
        )
        attempts_res = await self.db.execute(attempts_stmt)
        attempt_rows = attempts_res.all()

        attempts_data = []
        for att, ass in attempt_rows:
            res_stmt = select(AssessmentResult).where(
                AssessmentResult.attempt_id == att.id,
                AssessmentResult.is_released == True,
                AssessmentResult.is_deleted == False
            )
            result = (await self.db.execute(res_stmt)).scalars().first()

            attempts_data.append(StudentRecordAttempt(
                id=att.id,
                assessment_title=ass.title,
                status=att.status,
                submitted_at=att.submitted_at,
                score=result.total_score if result else None,
                max_score=result.max_score if result else None,
                percentage=result.percentage if result else None
            ))

        return StudentCourseRecordResponse(
            student_name=f"{profile.first_name} {profile.last_name}",
            student_id=profile.student_id or "N/A",
            email=user.email,
            enrolled_at=enrollment.enrolled_at,
            overall_progress=85, # Mocked
            attempts=attempts_data
        )

    async def list_workspaces(
        self, lecturer_id: uuid.UUID, page: int = 1, page_size: int = 20
    ) -> tuple[list[WorkspaceListItem], int]:
        """List operational teaching workspaces assigned to a lecturer."""
        stmt = (
            select(TeachingWorkspace)
            .join(TeachingAssignment, TeachingAssignment.id == TeachingWorkspace.teaching_assignment_id)
            .where(
                TeachingAssignment.lecturer_id == lecturer_id,
                TeachingWorkspace.is_deleted == False
            )
            .order_by(TeachingWorkspace.created_at.desc())
        )
        
        # Paginate
        res = await self.db.execute(stmt)
        workspaces = res.scalars().all()
        total = len(workspaces)

        items = []
        for ws in workspaces:
            # Refresh with relationships
            ws = await self.workspace_repo.get_by_id(ws.id)
            student_count = await self.workspace_repo.get_student_count(ws.id)
            
            # Performance avg
            from app.db.models.result import AssessmentResult
            perf_stmt = (
                select(func.avg(AssessmentResult.percentage))
                .join(AssessmentAttempt, AssessmentAttempt.id == AssessmentResult.attempt_id)
                .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
                .where(
                    Assessment.teaching_workspace_id == ws.id,
                    AssessmentResult.is_deleted == False
                )
            )
            avg_perf = (await self.db.execute(perf_stmt)).scalar() or 0.0

            lect_p = ws.teaching_assignment.lecturer.profile
            items.append(WorkspaceListItem(
                id=ws.id,
                title=ws.title,
                code=ws.course.code,
                academic_year=ws.academic_period.name,
                student_count=student_count,
                status=ws.status,
                performance_avg=float(avg_perf),
                lecturer_name=f"{lect_p.first_name} {lect_p.last_name}",
                institution_name=ws.course.institution.name,
                class_name=ws.class_section.name
            ))

        return items, total

    async def get_workspace_detail(self, lecturer_id: uuid.UUID, workspace_id: uuid.UUID) -> WorkspaceDetail:
        from app.db.models.auth import User, UserProfile
        from app.db.models.result import AssessmentResult

        ws = await self.workspace_repo.get_by_id(workspace_id)
        if not ws:
            raise NotFoundError("Workspace", str(workspace_id))

        student_count = await self.workspace_repo.get_student_count(workspace_id)
        
        roster_stmt = (
            select(User, UserProfile)
            .join(StudentEnrollment, StudentEnrollment.student_id == User.id)
            .join(UserProfile, UserProfile.user_id == User.id)
            .where(
                StudentEnrollment.class_section_id == ws.class_section_id,
                StudentEnrollment.is_deleted == False
            )
            .order_by(UserProfile.last_name.asc())
        )
        rows = (await self.db.execute(roster_stmt)).all()

        roster = []
        for user, profile in rows:
            total_ass_stmt = select(func.count(Assessment.id)).where(
                Assessment.teaching_workspace_id == workspace_id, 
                Assessment.status == AssessmentStatus.PUBLISHED,
                Assessment.is_deleted == False
            )
            total_ass_count = (await self.db.execute(total_ass_stmt)).scalar_one() or 1
            
            comp_ass_stmt = (
                select(func.count(AssessmentAttempt.id))
                .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
                .where(
                    Assessment.teaching_workspace_id == workspace_id,
                    AssessmentAttempt.student_id == user.id,
                    AssessmentAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]),
                    AssessmentAttempt.is_deleted == False
                )
            )
            comp_ass_count = (await self.db.execute(comp_ass_stmt)).scalar_one() or 0
            progress = int((comp_ass_count / total_ass_count) * 100)

            roster.append(LecturerCourseRosterItem(
                id=user.id,
                student_id=profile.student_id or "N/A",
                name=f"{profile.first_name} {profile.last_name}",
                email=user.email,
                progress=progress,
                last_submission="N/A"
            ))

        perf_stmt = (
            select(func.avg(AssessmentResult.percentage))
            .join(AssessmentAttempt, AssessmentAttempt.id == AssessmentResult.attempt_id)
            .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
            .where(
                Assessment.teaching_workspace_id == workspace_id,
                AssessmentResult.is_deleted == False
            )
        )
        avg_perf = (await self.db.execute(perf_stmt)).scalar() or 0.0

        lect_p = ws.teaching_assignment.lecturer.profile
        return WorkspaceDetail(
            id=ws.id,
            title=ws.title,
            code=ws.course.code,
            description=ws.description or ws.course.description,
            student_count=student_count,
            performance_avg=float(avg_perf),
            institution_name=ws.course.institution.name,
            academic_year=ws.academic_period.name,
            lecturer_name=f"{lect_p.first_name} {lect_p.last_name}",
            status=ws.status,
            class_name=ws.class_section.name,
            roster=roster,
            sections=[ws.class_section.name]
        )

    async def initialize_workspace(self, lecturer_id: uuid.UUID, data: WorkspaceCreate) -> TeachingWorkspace:
        """Initialize an operational workspace from an admin-assigned teaching assignment."""
        stmt = select(TeachingAssignment).where(
            TeachingAssignment.id == data.teaching_assignment_id,
            TeachingAssignment.lecturer_id == lecturer_id,
            TeachingAssignment.is_active == True
        )
        assignment = (await self.db.execute(stmt)).scalars().first()
        if not assignment:
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("Valid teaching assignment not found.")

        exists_stmt = select(TeachingWorkspace).where(
            TeachingWorkspace.teaching_assignment_id == assignment.id,
            TeachingWorkspace.is_deleted == False
        )
        if (await self.db.execute(exists_stmt)).scalars().first():
            from app.core.exceptions import ValidationError
            raise ValidationError("Workspace for this assignment already exists.")

        course = await self.db.get(Course, assignment.course_id)
        section = await self.db.get(ClassSection, assignment.class_section_id)

        workspace = TeachingWorkspace(
            teaching_assignment_id=assignment.id,
            course_id=assignment.course_id,
            class_section_id=assignment.class_section_id,
            academic_period_id=assignment.academic_period_id,
            title=data.title or f"{course.name} ({section.name})",
            description=data.description or course.description,
            status="ACTIVE",
            created_by_id=lecturer_id
        )
        self.db.add(workspace)
        await self.db.commit()
        await self.db.refresh(workspace)
        return workspace

    async def get_dashboard_data(self, lecturer_id: uuid.UUID) -> LecturerDashboardResponse:
        from app.db.models.integrity import IntegrityEvent
        from app.schemas.lecturer import DashboardMetric
        from app.services.grading_service import GradingService

        now = datetime.now(UTC)
        first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # 1. Summary Stats (Now based on Workspaces)
        async def get_class_metric():
            stmt = select(func.count(TeachingWorkspace.id)).join(TeachingAssignment).where(
                TeachingAssignment.lecturer_id == lecturer_id,
                TeachingWorkspace.status == "ACTIVE",
                TeachingWorkspace.is_deleted == False
            )
            curr = (await self.db.execute(stmt)).scalar_one()
            stmt_last = stmt.where(TeachingWorkspace.created_at < first_of_this_month)
            last = (await self.db.execute(stmt_last)).scalar_one()
            delta = round(((curr - last) / last * 100), 1) if last > 0 else 0
            return DashboardMetric(value=curr, delta=delta, last_month=last, positive=curr >= last)

        async def get_assessment_metric():
            # Current (Published)
            stmt = select(func.count(Assessment.id)).where(Assessment.created_by_id == lecturer_id, Assessment.status == AssessmentStatus.PUBLISHED, Assessment.is_deleted == False)
            curr = (await self.db.execute(stmt)).scalar_one()
            # Last Month
            stmt_last = stmt.where(Assessment.created_at < first_of_this_month)
            last = (await self.db.execute(stmt_last)).scalar_one()
            delta = round(((curr - last) / last * 100), 1) if last > 0 else 0
            return DashboardMetric(value=curr, delta=delta, last_month=last, positive=curr >= last)

        async def get_grading_metric():
            grading_svc = GradingService(self.db)
            _, total_pending = await grading_svc.get_grading_queue(lecturer_id=lecturer_id, status=GradingQueueStatus.PENDING, page_size=1)
            # Mock trend for grading as historical queue state isn't tracked easily
            return DashboardMetric(value=total_pending, delta=0, last_month=total_pending, positive=True)

        async def get_flag_metric():
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday_start = today_start - timedelta(days=1)
            # Today
            stmt_today = select(func.count(IntegrityEvent.id)).join(Assessment, Assessment.id == IntegrityEvent.assessment_id).where(Assessment.created_by_id == lecturer_id, IntegrityEvent.created_at >= today_start)
            curr = (await self.db.execute(stmt_today)).scalar_one()
            # Yesterday
            stmt_yest = select(func.count(IntegrityEvent.id)).join(Assessment, Assessment.id == IntegrityEvent.assessment_id).where(
                Assessment.created_by_id == lecturer_id, 
                IntegrityEvent.created_at >= yesterday_start,
                IntegrityEvent.created_at < today_start
            )
            last = (await self.db.execute(stmt_yest)).scalar_one()
            delta = round(((curr - last) / last * 100), 1) if last > 0 else 0
            return DashboardMetric(value=curr, delta=delta, last_month=last, positive=curr <= last)

        summary = LecturerDashboardSummary(
            active_classes_count=await get_class_metric(),
            upcoming_assessments_count=await get_assessment_metric(),
            pending_grading_count=await get_grading_metric(),
            flagged_events_count=await get_flag_metric()
        )

        # 2. Pending Queue (Grouped by Assessment for the UI)
        grading_svc = GradingService(self.db)
        queue_items, _ = await grading_svc.get_grading_queue(lecturer_id=lecturer_id, status=GradingQueueStatus.PENDING, page_size=100)

        pending_items_data = []
        assessment_counts = {}
        for item in queue_items:
            aid = item.assessment_id
            assessment_counts[aid] = assessment_counts.get(aid, 0) + 1
            
        for aid, count in assessment_counts.items():
            ass = await self.assessment_repo.get_by_id_simple(aid)
            if ass:
                pending_items_data.append(LecturerPendingItem(
                    id=uuid.uuid4(),
                    assessment_id=aid,
                    assessment_title=ass.title,
                    type="Manual Grading",
                    count=count,
                    urgency="high" if count > 10 else "medium"
                ))

        # 3. Recent Submissions
        recent_attempts = await self.attempt_repo.list_recent_submissions_by_lecturer(lecturer_id)
        
        recent_submissions_data = []
        for a in recent_attempts:
            student_name = "Student"
            if a.student and a.student.profile:
                p = a.student.profile
                student_name = f"{p.first_name} {p.last_name}" if p.first_name else p.display_name or "Student"

            recent_submissions_data.append(LecturerRecentSubmission(
                student_name=student_name,
                assessment_title=a.assessment.title if a.assessment else "Unknown",
                submitted_at=a.submitted_at or a.started_at,
                status=a.status
            ))

        # 4. Chart Data (Last 30 days)
        chart_data = []
        base = datetime.now(UTC).date()
        start_date = base - timedelta(days=30)

        # manual grading (GradingMode.MANUAL)
        manual_stmt = (
            select(cast(AssessmentAttempt.submitted_at, Date), func.count(AssessmentAttempt.id))
            .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
            .where(
                Assessment.created_by_id == lecturer_id,
                AssessmentAttempt.submitted_at >= start_date,
                AssessmentAttempt.grading_mode == GradingMode.MANUAL
            )
            .group_by(cast(AssessmentAttempt.submitted_at, Date))
        )
        manual_res = await self.db.execute(manual_stmt)
        manual_map = {row[0].isoformat(): row[1] for row in manual_res.all() if row[0]}

        # AI assisted (GradingMode.SEMI)
        ai_stmt = (
            select(cast(AssessmentAttempt.submitted_at, Date), func.count(AssessmentAttempt.id))
            .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
            .where(
                Assessment.created_by_id == lecturer_id,
                AssessmentAttempt.submitted_at >= start_date,
                AssessmentAttempt.grading_mode == GradingMode.SEMI
            )
            .group_by(cast(AssessmentAttempt.submitted_at, Date))
        )
        ai_res = await self.db.execute(ai_stmt)
        ai_map = {row[0].isoformat(): row[1] for row in ai_res.all() if row[0]}

        for i in range(30, -1, -1):
            d = (base - timedelta(days=i)).isoformat()
            chart_data.append(LecturerChartDataPoint(
                date=d,
                manual=manual_map.get(d, 0),
                ai=ai_map.get(d, 0)
            ))

        # 5. Recent Integrity Alerts
        from app.db.models.auth import User, UserProfile
        alert_stmt = (
            select(IntegrityEvent, UserProfile, Assessment.title)
            .join(Assessment, Assessment.id == IntegrityEvent.assessment_id)
            .join(User, User.id == IntegrityEvent.student_id)
            .join(UserProfile, UserProfile.user_id == User.id)
            .where(
                Assessment.created_by_id == lecturer_id,
                IntegrityEvent.created_at >= datetime.now(UTC) - timedelta(hours=24)
            )
            .order_by(IntegrityEvent.created_at.desc())
            .limit(5)
        )
        alert_res = await self.db.execute(alert_stmt)
        recent_alerts = []
        for event, profile, ass_title in alert_res.all():
            severity = "low"
            risk_score = 10
            if event.event_type in ["DEVTOOLS_DETECTED", "SUSPICIOUS_DEVICE"]:
                severity = "high"
                risk_score = 80
            elif event.event_type in ["COPY_ATTEMPT", "FULLSCREEN_EXIT", "TAB_SWITCH"]:
                severity = "medium"
                risk_score = 40

            from app.schemas.lecturer import LecturerIntegrityAlert
            recent_alerts.append(LecturerIntegrityAlert(
                id=event.id,
                student_name=f"{profile.first_name} {profile.last_name}",
                student_id=profile.student_id or "N/A",
                assessment_title=ass_title,
                event_type=event.event_type,
                created_at=event.created_at,
                risk_score=risk_score,
                severity=severity
            ))

        return LecturerDashboardResponse(
            summary=summary,
            pending_queue=pending_items_data,
            recent_submissions=recent_submissions_data,
            chart_data=chart_data,
            recent_alerts=recent_alerts
        )

    async def list_lecturer_courses(
        self, lecturer_id: uuid.UUID, page: int = 1, page_size: int = 20
    ) -> tuple[list[AdminCourseListItem], int]:
        """List courses assigned to a specific lecturer with their specific role."""
        from app.db.models.academic import Course, TeachingAssignment
        from app.schemas.admin import AdminCourseListItem

        # 1. Total count for this lecturer
        count_stmt = (
            select(func.count(Course.id))
            .join(TeachingAssignment, TeachingAssignment.course_id == Course.id)
            .where(
                TeachingAssignment.lecturer_id == lecturer_id,
                Course.is_deleted == False,
                TeachingAssignment.is_active == True
            )
        )
        count_res = await self.db.execute(count_stmt)
        total = count_res.scalar_one()

        # 2. Paginated list with Role
        stmt = (
            select(Course, TeachingAssignment.role)
            .join(TeachingAssignment, TeachingAssignment.course_id == Course.id)
            .where(
                TeachingAssignment.lecturer_id == lecturer_id,
                Course.is_deleted == False,
                TeachingAssignment.is_active == True
            )
            .order_by(Course.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        res = await self.db.execute(stmt)
        rows = res.all()
        items = []
        for c, role in rows:
            student_count = await self.course_repo.get_student_count(c.id)
            
            # Calculate real performance average
            from app.db.models.result import AssessmentResult
            from app.db.models.attempt import AssessmentAttempt
            from app.db.models.assessment import Assessment
            
            perf_stmt = (
                select(func.avg(AssessmentResult.percentage))
                .join(AssessmentAttempt, AssessmentAttempt.id == AssessmentResult.attempt_id)
                .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
                .where(
                    Assessment.course_id == c.id,
                    AssessmentResult.is_deleted == False
                )
            )
            perf_res = await self.db.execute(perf_stmt)
            avg_perf = perf_res.scalar() or 0.0

            role_label = str(role).replace("_", " ").title()

            items.append(AdminCourseListItem(
                id=c.id,
                code=c.code,
                title=c.name,
                lecturer_name=role_label, # Use the role as the label
                student_count=student_count,
                status="Active" if not c.is_deleted else "Deleted",
                performance_avg=float(avg_perf),
                academic_year=c.academic_year
            ))

        return items, total

    async def get_course_detail(self, lecturer_id: uuid.UUID, course_id: uuid.UUID) -> LecturerCourseDetail:
        from app.db.models.academic import (
            Course, 
            ClassSection, 
            StudentEnrollment, 
            Department, 
            Option, 
            CourseDepartment, 
            CourseOption
        )
        from app.db.models.auth import User, UserProfile
        from app.db.models.result import AssessmentResult
        from app.db.models.attempt import AssessmentAttempt
        from app.db.models.assessment import Assessment

        # 1. Fetch Course
        stmt = select(Course).where(Course.id == course_id, Course.is_deleted == False)
        res = await self.db.execute(stmt)
        course = res.scalars().first()
        if not course:
            raise NotFoundError("Course not found")

        # 2. Fetch student count
        student_count_stmt = (
            select(func.count(StudentEnrollment.id))
            .join(ClassSection, ClassSection.id == StudentEnrollment.class_section_id)
            .where(ClassSection.course_id == course_id, StudentEnrollment.is_deleted == False)
        )
        student_count_res = await self.db.execute(student_count_stmt)
        count = student_count_res.scalar_one()

        # 3. Fetch Roster
        stmt = (
            select(User, UserProfile)
            .join(StudentEnrollment, StudentEnrollment.student_id == User.id)
            .join(ClassSection, ClassSection.id == StudentEnrollment.class_section_id)
            .join(UserProfile, UserProfile.user_id == User.id)
            .where(ClassSection.course_id == course_id, StudentEnrollment.is_deleted == False)
            .order_by(UserProfile.last_name.asc())
        )
        res = await self.db.execute(stmt)
        rows = res.all()

        roster = []
        for user, profile in rows:
            # Calculate student progress in this course
            # Progress = (completed assessments / total assessments in course) * 100
            total_ass_stmt = select(func.count(Assessment.id)).where(Assessment.course_id == course_id, Assessment.is_deleted == False)
            total_ass_res = await self.db.execute(total_ass_stmt)
            total_ass_count = total_ass_res.scalar_one() or 1
            
            comp_ass_stmt = (
                select(func.count(AssessmentAttempt.id))
                .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
                .where(
                    Assessment.course_id == course_id,
                    AssessmentAttempt.student_id == user.id,
                    AssessmentAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]),
                    AssessmentAttempt.is_deleted == False
                )
            )
            comp_ass_res = await self.db.execute(comp_ass_stmt)
            comp_ass_count = comp_ass_res.scalar_one() or 0
            
            progress = int((comp_ass_count / total_ass_count) * 100)

            roster.append(LecturerCourseRosterItem(
                id=user.id,
                student_id=profile.student_id or "N/A",
                name=f"{profile.first_name} {profile.last_name}",
                email=user.email,
                progress=progress,
                last_submission="N/A" # Default
            ))

        # 4. Fetch sections
        sections_stmt = select(ClassSection).where(ClassSection.course_id == course_id, ClassSection.is_deleted == False)
        sections_res = await self.db.execute(sections_stmt)
        sections = [s.name for s in sections_res.scalars().all()]

        # 5. Aggregate Department and Option names if not set
        dept_name = course.department_name
        if not dept_name:
            dept_stmt = (
                select(Department.name)
                .join(CourseDepartment, CourseDepartment.department_id == Department.id)
                .where(CourseDepartment.course_id == course_id)
            )
            dept_res = await self.db.execute(dept_stmt)
            dept_names = dept_res.scalars().all()
            if dept_names:
                dept_name = ", ".join(dept_names)

        opt_name = course.option_name
        if not opt_name:
            opt_stmt = (
                select(Option.name)
                .join(CourseOption, CourseOption.option_id == Option.id)
                .where(CourseOption.course_id == course_id)
            )
            opt_res = await self.db.execute(opt_stmt)
            opt_names = opt_res.scalars().all()
            if opt_names:
                opt_name = ", ".join(opt_names)

        # 6. Calculate real performance average
        perf_stmt = (
            select(func.avg(AssessmentResult.percentage))
            .join(AssessmentAttempt, AssessmentAttempt.id == AssessmentResult.attempt_id)
            .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
            .where(
                Assessment.course_id == course_id,
                AssessmentResult.is_deleted == False
            )
        )
        perf_res = await self.db.execute(perf_stmt)
        avg_perf = perf_res.scalar() or 0.0

        return LecturerCourseDetail(
            id=course.id,
            code=course.code,
            title=course.name,
            description=course.description,
            student_count=count,
            performance_avg=float(avg_perf),
            institution_id=course.institution_id,
            academic_year=course.academic_year,
            roster=roster,
            department_name=dept_name,
            option_name=opt_name,
            sections=sections
        )

    async def delete_course(self, lecturer_id: uuid.UUID, course_id: uuid.UUID) -> bool:
        """Soft delete a course if the lecturer is the primary owner."""
        from app.db.models.academic import LecturerCourseAssignment
        from app.db.enums import LecturerAssignmentRole
        from app.core.exceptions import AuthorizationError

        # 1. Verify lecturer is primary assigned to this course
        assign_stmt = select(LecturerCourseAssignment).where(
            LecturerCourseAssignment.lecturer_id == lecturer_id,
            LecturerCourseAssignment.course_id == course_id,
            LecturerCourseAssignment.assignment_role == LecturerAssignmentRole.MAIN_LECTURER,
            LecturerCourseAssignment.is_active == True
        )
        assign_res = await self.db.execute(assign_stmt)
        if not assign_res.scalars().first():
            raise AuthorizationError("Only the primary lecturer can delete the course")

        # 2. Fetch and soft-delete
        course = await self.course_repo.get_by_id_simple(course_id)
        if not course:
            raise NotFoundError("Course not found")

        await self.course_repo.delete(course_id)
        return True

    async def list_lecturers(self) -> list[UserResponse]:
        """Returns a list of all active lecturers for colleague selection."""
        from app.db.models.auth import User, UserProfile
        from app.db.enums import UserRole, UserStatus
        from sqlalchemy.orm import selectinload

        stmt = (
            select(User)
            .join(UserProfile, UserProfile.user_id == User.id)
            .options(selectinload(User.profile))
            .where(
                User.role == UserRole.LECTURER.value,
                User.status == UserStatus.ACTIVE.value,
                User.is_deleted == False
            )
            .order_by(UserProfile.last_name.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
