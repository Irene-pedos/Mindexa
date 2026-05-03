from __future__ import annotations

import uuid
import random
from datetime import UTC, datetime
from sqlalchemy import select, func, and_, not_, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import AttemptStatus, AssessmentType
from app.db.models.academic import Course
from app.db.models.attempt import AssessmentAttempt
from app.db.models.result import AssessmentResult
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
    PerformanceTrendItem,
)


class StudentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.course_repo = CourseRepository(db)
        self.result_repo = ResultRepository(db)

    async def get_dashboard_data(self, student_id: uuid.UUID) -> StudentDashboardResponse:
        """Aggregate student-scoped data for the main dashboard view."""
        # 1. Fetch Summary Stats
        results, total_results = await self.result_repo.list_by_student(
            student_id, is_released=True
        )

        # Calculate "Real" GPA and Credits
        cgpa = 0.0
        total_credits = 0
        if results:
            # Weighted GPA calculation (mocked credits per course as 3 for now)
            total_points = sum((r.percentage / 25.0) * 3 for r in results)
            total_credits = len(results) * 3
            cgpa = round(total_points / total_credits, 2) if total_credits > 0 else 0.0
            cgpa = min(4.0, cgpa)

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

        # 3. Count pending results (Submitted but not released)
        released_exists = exists().where(
            and_(
                AssessmentResult.attempt_id == AssessmentAttempt.id,
                AssessmentResult.is_released == True,
                AssessmentResult.is_deleted == False
            )
        )
        
        pending_res_stmt = select(func.count(AssessmentAttempt.id)).where(
            and_(
                AssessmentAttempt.student_id == student_id,
                AssessmentAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]),
                AssessmentAttempt.is_deleted == False,
                not_(released_exists)
            )
        )
        pending_res_exec = await self.db.execute(pending_res_stmt)
        pending_results_count = pending_res_exec.scalar_one()

        # 4. Recent Results
        recent_results_data = []
        for r in results[:5]:  # Take top 5 recent
            assessment = r.attempt.assessment if r.attempt else None
            recent_results_data.append(
                StudentRecentResult(
                    id=r.id,
                    assessment_title=assessment.title if assessment else "Unknown",
                    assessment_type=assessment.assessment_type if assessment else AssessmentType.CAT,
                    score=r.total_score or 0.0,
                    total_marks=r.max_score or 100.0,
                    percentage=r.percentage or 0.0,
                    letter_grade=r.letter_grade,
                    released_at=r.released_at,
                )
            )

        # 5. Upcoming Assessments (Available but not attempted yet)
        available_assessments, _ = await self.assessment_repo.list_available_for_student(
            page_size=10
        )

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

        # 6. Performance Trend (Monthly) - Map real results to months
        trend_map = {}
        for r in results:
            if r.released_at:
                month_key = r.released_at.strftime("%b")
                if month_key not in trend_map:
                    trend_map[month_key] = []
                trend_map[month_key].append(r.percentage)
        
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
        trend_data = []
        
        for m in months:
            if m in trend_map:
                avg = sum(trend_map[m]) / len(trend_map[m])
                trend_data.append(PerformanceTrendItem(
                    month=m,
                    score=round(avg, 1),
                    average=75.0
                ))
            else:
                trend_data.append(PerformanceTrendItem(
                    month=m,
                    score=0.0,
                    average=75.0
                ))

        summary = StudentDashboardSummary(
            cgpa=cgpa,
            total_credits=total_credits,
            attendance_rate=95.0, 
            semesters_completed=1, 
            active_assessments_count=len(upcoming_data),
            pending_results_count=pending_results_count,
        )

        return StudentDashboardResponse(
            summary=summary,
            active_attempts=active_attempts_data,
            recent_results=recent_results_data,
            upcoming_assessments=upcoming_data,
            performance_trend=trend_data,
        )

    async def get_schedule_data(self, student_id: uuid.UUID) -> StudentScheduleResponse:
        assessments, _ = await self.assessment_repo.list_available_for_student(page_size=100)

        events = []
        for ass in assessments:
            if not ass.window_start:
                continue

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
                    course_code=ass.course.code if ass.course else None,
                    course_name=ass.course.name if ass.course else None,
                    duration_minutes=ass.duration_minutes
                )
            )

        return StudentScheduleResponse(events=events)

    async def list_courses(self, student_id: uuid.UUID) -> list[Course]:
        """List all courses the student is enrolled in."""
        return await self.course_repo.list_by_student(student_id)

    async def get_course_detail(self, student_id: uuid.UUID, course_id: uuid.UUID) -> dict:
        """Get detailed information for a specific course."""
        stmt = select(Course).where(Course.id == course_id, Course.is_deleted == False)
        result = await self.db.execute(stmt)
        course = result.scalar_one_or_none()

        if not course:
            return None

        student_count = await self.course_repo.get_student_count(course_id)

        return {
            "id": str(course.id),
            "code": course.code,
            "title": course.name,
            "lecturer": "Primary Lecturer",
            "description": course.description or "No description available.",
            "progress": 75,
            "enrolled": student_count,
            "nextAssessment": "Upcoming assessment info...",
            "materials": 0,
            "assessments": 0,
        }
