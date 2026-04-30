from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import AttemptStatus
from app.db.models.academic import Course
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.course_repo import CourseRepository
from app.db.repositories.result_repo import ResultRepository
from app.schemas.student import (
    StudentActiveAttempt,
    StudentDashboardResponse,
    StudentDashboardSummary,
    StudentRecentResult,
    StudentScheduleEvent,
    StudentScheduleResponse,
    StudentUpcomingAssessment,
)


class StudentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.course_repo = CourseRepository(db)
        self.result_repo = ResultRepository(db)

    async def get_dashboard_data(self, student_id: uuid.UUID) -> StudentDashboardResponse:
        # 1. Fetch Summary Stats (Mock for now, will pull from Course/Enrollment records later)
        # We can calculate CGPA from Results
        results, total_results = await self.result_repo.list_by_student(
            student_id, is_released=True
        )

        cgpa = 0.0
        total_credits = 0
        if results:
            # Simple average for now
            cgpa = sum(r.percentage / 25.0 for r in results) / len(results)  # Mock GPA calculation
            cgpa = round(min(4.0, cgpa), 2)
            total_credits = len(results) * 3  # Mock credits

        # 2. Active Attempts
        active_attempts_list, _ = await self.attempt_repo.list_by_student(
            student_id=student_id, status=AttemptStatus.IN_PROGRESS.value
        )
        paused_attempts_list, _ = await self.attempt_repo.list_by_student(
            student_id=student_id, status=AttemptStatus.PAUSED.value
        )
        all_active = active_attempts_list + paused_attempts_list

        active_attempts_data = []
        for a in all_active:
            # Need assessment title
            assessment = await self.assessment_repo.get_by_id_simple(a.assessment_id)
            active_attempts_data.append(
                StudentActiveAttempt(
                    id=a.id,
                    assessment_id=a.assessment_id,
                    assessment_title=assessment.title if assessment else "Unknown Assessment",
                    status=a.status,
                    started_at=a.started_at,
                    expires_at=a.expires_at,
                )
            )

        # 3. Recent Results
        recent_results_data = []
        for r in results[:5]:  # Take top 5 recent
            recent_results_data.append(
                StudentRecentResult(
                    id=r.id,
                    assessment_title=r.assessment.title if r.assessment else "Unknown",
                    assessment_type=r.assessment.assessment_type if r.assessment else "CAT",
                    score=r.total_score,
                    total_marks=r.max_score,
                    percentage=r.percentage,
                    letter_grade=r.letter_grade,
                    released_at=r.released_at,
                )
            )

        # 4. Upcoming Assessments (Available but not attempted yet)
        available_assessments, _ = await self.assessment_repo.list_available_for_student(
            page_size=10
        )

        # Filter out ones already attempted
        upcoming_data = []
        for ass in available_assessments:
            count = await self.attempt_repo.count_attempts_by_student(student_id, ass.id)
            if count == 0:
                upcoming_data.append(
                    StudentUpcomingAssessment(
                        id=ass.id,
                        title=ass.title,
                        type=ass.assessment_type,
                        window_start=ass.window_start,
                        duration_minutes=ass.duration_minutes,
                        total_marks=ass.total_marks,
                    )
                )

        summary = StudentDashboardSummary(
            cgpa=cgpa,
            total_credits=total_credits,
            attendance_rate=92.0,  # Mock
            semesters_completed=4,  # Mock
            active_assessments_count=len(upcoming_data),
            pending_results_count=total_results,  # Simplified
        )

        return StudentDashboardResponse(
            summary=summary,
            active_attempts=active_attempts_data,
            recent_results=recent_results_data,
            upcoming_assessments=upcoming_data,
        )

    async def get_schedule_data(self, student_id: uuid.UUID) -> StudentScheduleResponse:
        # Fetch all available/scheduled assessments
        assessments, _ = await self.assessment_repo.list_available_for_student(page_size=100)

        events = []
        for ass in assessments:
            if not ass.window_start:
                continue

            # Each assessment window is an event
            events.append(
                StudentScheduleEvent(
                    id=str(ass.id),
                    title=ass.title,
                    type=ass.assessment_type.value,
                    start_at=ass.window_start,
                    end_at=ass.window_end,
                    description=f"{ass.duration_minutes} minute assessment",
                    color_hint="bg-red-500"
                    if ass.assessment_type.value in ["CAT", "SUMMATIVE"]
                    else "bg-emerald-500",
                )
            )

        return StudentScheduleResponse(events=events)

    async def list_courses(self, student_id: uuid.UUID) -> list[Course]:
        """List all courses the student is enrolled in."""
        return await self.course_repo.list_by_student(student_id)

    async def get_course_detail(self, student_id: uuid.UUID, course_id: uuid.UUID) -> dict:
        """Get detailed information for a specific course."""
        # 1. Fetch the course object
        # We need to make sure the student is actually enrolled in this course
        # but for now we'll fetch the course directly and we can add security checks
        from sqlalchemy import select

        from app.db.models.academic import Course

        result = await self.db.execute(
            select(Course).where(Course.id == course_id, Course.is_deleted == False)
        )
        course = result.scalar_one_or_none()

        if not course:
            return None

        # 2. Get additional stats
        student_count = await self.course_repo.get_student_count(course_id)

        # 3. Construct response (matching frontend expectations)
        return {
            "id": str(course.id),
            "code": course.code,
            "title": course.name,
            "lecturer": "Primary Lecturer",  # Placeholder
            "description": course.description or "No description available.",
            "progress": 75,  # Mocked for now
            "enrolled": student_count,
            "nextAssessment": "Upcoming assessment info...",
            "materials": 0,
            "assessments": 0,
        }
