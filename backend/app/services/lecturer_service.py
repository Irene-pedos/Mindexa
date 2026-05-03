from __future__ import annotations

import uuid
from typing import List
from datetime import UTC, datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date

from app.db.models.attempt import AssessmentAttempt
from app.db.models.assessment import Assessment
from app.db.models.integrity import IntegrityEvent
from app.db.enums import AssessmentStatus, GradingQueueStatus, GradingMode
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
)

from app.db.models.academic import Course, ClassSection, StudentEnrollment, LecturerCourseAssignment, Institution, AcademicPeriod
from app.db.repositories.course_repo import CourseRepository
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
        self.user_repo = UserRepository(db)

    async def add_student_to_course(self, lecturer_id: uuid.UUID, course_id: uuid.UUID, email: str) -> bool:
        from app.db.models.auth import User
        from app.db.enums import UserRole, EnrollmentStatus

        # 1. Verify lecturer is assigned to this course
        assign_stmt = select(LecturerCourseAssignment).where(
            LecturerCourseAssignment.lecturer_id == lecturer_id,
            LecturerCourseAssignment.course_id == course_id,
            LecturerCourseAssignment.is_active == True
        )
        assign_res = await self.db.execute(assign_stmt)
        if not assign_res.scalars().first():
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("You are not authorized to manage students for this course")

        # 2. Find student by email
        user = await self.user_repo.get_by_email(email.lower())
        if not user or user.role != UserRole.STUDENT.value:
            from app.core.exceptions import ValidationError
            raise ValidationError(f"Student with email '{email}' not found")

        # 3. Find the default section for the course
        section_stmt = select(ClassSection).where(
            ClassSection.course_id == course_id,
            ClassSection.is_active == True,
            ClassSection.is_deleted == False
        ).order_by(ClassSection.created_at.asc())
        section_res = await self.db.execute(section_stmt)
        section = section_res.scalars().first()
        if not section:
            # Create a default section if none exists
            section = ClassSection(
                course_id=course_id,
                name="Section A",
                capacity=50,
                is_active=True
            )
            self.db.add(section)
            await self.db.flush()

        # 4. Check if already enrolled
        enroll_stmt = select(StudentEnrollment).where(
            StudentEnrollment.student_id == user.id,
            StudentEnrollment.class_section_id == section.id,
            StudentEnrollment.is_deleted == False
        )
        enroll_res = await self.db.execute(enroll_stmt)
        if enroll_res.scalars().first():
            return True # Already enrolled

        # 5. Create enrollment
        enrollment = StudentEnrollment(
            student_id=user.id,
            class_section_id=section.id,
            enrollment_status=EnrollmentStatus.ACTIVE,
            enrolled_at=datetime.now(UTC)
        )
        self.db.add(enrollment)
        await self.db.commit()
        return True

    async def get_student_course_record(self, lecturer_id: uuid.UUID, course_id: uuid.UUID, student_id: uuid.UUID) -> StudentCourseRecordResponse:
        from app.db.models.auth import User, UserProfile
        from app.db.models.academic import StudentEnrollment, ClassSection
        from app.db.models.assessment import Assessment
        from app.db.models.attempt import AssessmentAttempt
        from app.db.models.result import AssessmentResult

        # 1. Fetch Student Profile and Enrollment
        stmt = (
            select(User, UserProfile, StudentEnrollment)
            .join(UserProfile, UserProfile.user_id == User.id)
            .join(StudentEnrollment, StudentEnrollment.student_id == User.id)
            .join(ClassSection, ClassSection.id == StudentEnrollment.class_section_id)
            .where(
                User.id == student_id,
                ClassSection.course_id == course_id,
                StudentEnrollment.is_deleted == False
            )
        )
        res = await self.db.execute(stmt)
        row = res.first()
        if not row:
            raise NotFoundError("Student enrollment not found in this course")
        
        user, profile, enrollment = row

        # 2. Fetch all attempts for assessments in this course
        # We find attempts for this student where the assessment is linked to this course
        attempts_stmt = (
            select(AssessmentAttempt, Assessment)
            .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
            .where(
                AssessmentAttempt.student_id == student_id,
                Assessment.course_id == course_id,
                AssessmentAttempt.is_deleted == False
            )
            .order_by(AssessmentAttempt.started_at.desc())
        )
        attempts_res = await self.db.execute(attempts_stmt)
        attempt_rows = attempts_res.all()

        attempts_data = []
        for att, ass in attempt_rows:
            # Check for released result
            res_stmt = select(AssessmentResult).where(
                AssessmentResult.attempt_id == att.id,
                AssessmentResult.is_released == True,
                AssessmentResult.is_deleted == False
            )
            res_exec = await self.db.execute(res_stmt)
            result = res_exec.scalars().first()

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

    async def create_course(self, lecturer_id: uuid.UUID, data: CourseCreate) -> Course:
        # Create the course
        course = Course(
            institution_id=data.institution_id,
            department_id=data.department_id,
            academic_period_id=data.academic_period_id,
            name=data.title,
            code=data.code,
            description=data.description,
            credit_hours=data.credit_hours,
            is_active=True
        )
        await self.course_repo.create(course)

        # Automatically assign the creator as the primary lecturer
        from app.db.enums import LecturerAssignmentRole
        assignment = LecturerCourseAssignment(
            lecturer_id=lecturer_id,
            course_id=course.id,
            assignment_role=LecturerAssignmentRole.PRIMARY,
            is_active=True
        )
        self.db.add(assignment)
        
        # Create a default "Section A" for the course
        section = ClassSection(
            course_id=course.id,
            name="Section A",
            capacity=50,
            is_active=True
        )
        self.db.add(section)
        
        await self.db.commit()
        return course

    async def get_dashboard_data(self, lecturer_id: uuid.UUID) -> LecturerDashboardResponse:
        from app.db.models.academic import LecturerCourseAssignment, ClassSection
        # 1. Summary Stats
        # Active Classes (Sections of courses assigned to this lecturer)
        class_stmt = (
            select(func.count(ClassSection.id))
            .join(LecturerCourseAssignment, LecturerCourseAssignment.course_id == ClassSection.course_id)
            .where(
                LecturerCourseAssignment.lecturer_id == lecturer_id,
                LecturerCourseAssignment.is_active == True,
                ClassSection.is_deleted == False
            )
        )
        class_res = await self.db.execute(class_stmt)
        active_classes_count = class_res.scalar_one()
        
        # Upcoming Assessments (Published but not yet closed)
        # We use PUBLISHED because SCHEDULED is not in DB
        assessments, total_ass = await self.assessment_repo.list_by_creator(
            created_by_id=lecturer_id,
            status=AssessmentStatus.PUBLISHED
        )
        
        # Pending Grading (Items in queue for this lecturer's assessments)
        pending_items, total_pending = await self.grading_repo.list_queue(
            status=GradingQueueStatus.PENDING
        )
        
        # Flagged Integrity Events for this lecturer's assessments
        flag_stmt = (
            select(func.count(IntegrityEvent.id))
            .join(Assessment, Assessment.id == IntegrityEvent.assessment_id)
            .where(Assessment.created_by_id == lecturer_id)
        )
        flag_res = await self.db.execute(flag_stmt)
        flagged_events_count = flag_res.scalar_one()

        summary = LecturerDashboardSummary(
            active_classes_count=active_classes_count,
            upcoming_assessments_count=total_ass,
            pending_grading_count=total_pending,
            flagged_events_count=flagged_events_count
        )

        # 2. Pending Queue (Grouped by Assessment for the UI)
        queue_items, _ = await self.grading_repo.list_queue(
            status=GradingQueueStatus.PENDING,
            page_size=100
        )
        
        pending_items_data = []
        assessment_counts = {}
        for item in queue_items:
            aid = item.assessment_id
            assessment_counts[aid] = assessment_counts.get(aid, 0) + 1
            
        for aid, count in assessment_counts.items():
            ass = await self.assessment_repo.get_by_id_simple(aid)
            if ass and ass.created_by_id == lecturer_id:
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

        return LecturerDashboardResponse(
            summary=summary,
            pending_queue=pending_items_data,
            recent_submissions=recent_submissions_data,
            chart_data=chart_data
        )

    async def get_course_detail(self, lecturer_id: uuid.UUID, course_id: uuid.UUID) -> LecturerCourseDetail:
        from app.db.models.academic import Course, ClassSection, StudentEnrollment
        from app.db.models.auth import User, UserProfile

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
            roster.append(LecturerCourseRosterItem(
                id=user.id,
                student_id=profile.student_id or "N/A",
                name=f"{profile.first_name} {profile.last_name}",
                email=user.email,
                progress=80, # Mocked
                last_submission="Yesterday" # Mocked
            ))

        return LecturerCourseDetail(
            id=course.id,
            code=course.code,
            title=course.name, # Use name from model
            student_count=count,
            performance_avg=82, # Mocked
            roster=roster
        )
