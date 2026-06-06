from __future__ import annotations

import uuid
import random
from datetime import UTC, datetime
from sqlalchemy import select, func, and_, not_, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import AttemptStatus, AssessmentType, AssessmentStatus
from app.db.models.academic import Course, TeachingWorkspace, StudentEnrollment, ClassSection
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.resource import LecturerMaterial
from app.db.models.result import AssessmentResult
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.course_repo import CourseRepository
from app.db.repositories.result_repo import ResultRepository
from app.db.repositories.workspace_repo import WorkspaceRepository
from app.schemas.student import (
    StudentActiveAttempt,
    StudentDashboardResponse,
    StudentDashboardSummary,
    StudentRecentResult,
    StudentScheduleEvent,
    StudentScheduleResponse,
    StudentUpcomingAssessment,
    PerformanceTrendItem,
    StudentCourseListItem,
)


class StudentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.course_repo = CourseRepository(db)
        self.workspace_repo = WorkspaceRepository(db)
        self.result_repo = ResultRepository(db)

    async def get_dashboard_data(self, student_id: uuid.UUID) -> StudentDashboardResponse:
        """Aggregate student-scoped data for the main dashboard view."""
        from app.schemas.student import DashboardMetric
        
        # 1. Fetch ALL released results for calculation accuracy
        # Note: For students with 1000s of results, we might want to optimize this,
        # but for typical academic use, fetching all results is fine for the dashboard.
        all_results_stmt = select(AssessmentResult).where(
            AssessmentResult.student_id == student_id,
            AssessmentResult.is_released == True,
            AssessmentResult.is_deleted == False
        ).order_by(AssessmentResult.released_at.desc())
        
        res = await self.db.execute(all_results_stmt)
        results = list(res.scalars().all())
        
        now = datetime.now(UTC)
        first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # GPA Calculation (using all results)
        async def calculate_gpa(rows):
            if not rows: return 0.0
            total_points = sum((r.percentage / 25.0) * 3 for r in rows)
            total_credits = len(rows) * 3
            return round(total_points / total_credits, 2) if total_credits > 0 else 0.0

        curr_gpa = await calculate_gpa(results)
        prev_results = [r for r in results if r.released_at and r.released_at < first_of_this_month]
        last_gpa = await calculate_gpa(prev_results)
        delta_gpa = round(((curr_gpa - last_gpa) / last_gpa * 100), 1) if last_gpa > 0 else 0
        gpa_metric = DashboardMetric(value=curr_gpa, delta=delta_gpa, last_month=last_gpa, positive=curr_gpa >= last_gpa)

        # 2. Active Tasks (Upcoming)
        available_assessments, _ = await self.assessment_repo.list_available_for_student(
            student_id=student_id, page_size=100
        )
        upcoming_count = 0
        for ass in available_assessments:
            count = await self.attempt_repo.count_attempts_by_student(student_id, ass.id)
            if count == 0:
                upcoming_count += 1
        active_metric = DashboardMetric(value=upcoming_count, delta=0, last_month=upcoming_count, positive=True)

        # 3. Completed Assessments
        stmt_completed = select(func.count(AssessmentAttempt.id)).where(
            AssessmentAttempt.student_id == student_id,
            AssessmentAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]),
            AssessmentAttempt.is_deleted == False
        )
        curr_comp = (await self.db.execute(stmt_completed)).scalar_one()
        stmt_last_comp = stmt_completed.where(AssessmentAttempt.created_at < first_of_this_month)
        last_comp = (await self.db.execute(stmt_last_comp)).scalar_one()
        delta_comp = round(((curr_comp - last_comp) / last_comp * 100), 1) if last_comp > 0 else 0
        comp_metric = DashboardMetric(value=curr_comp, delta=delta_comp, last_month=last_comp, positive=curr_comp >= last_comp)

        # 4. Avg Performance (using all results)
        curr_avg = round(sum(r.percentage for r in results) / len(results), 1) if results else 0.0
        last_avg = round(sum(r.percentage for r in prev_results) / len(prev_results), 1) if prev_results else 0.0
        delta_avg = round(((curr_avg - last_avg) / last_avg * 100), 1) if last_avg > 0 else 0
        perf_metric = DashboardMetric(value=curr_avg, delta=delta_avg, last_month=last_avg, positive=curr_avg >= last_avg)

        summary = StudentDashboardSummary(
            cgpa=gpa_metric,
            active_assessments_count=active_metric,
            completed_assessments_count=comp_metric,
            avg_performance_percent=perf_metric
        )

        # 5. Workspaces
        workspaces = await self.list_workspaces(student_id)

        # 6. Active Attempts
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
            active_attempts_data.append(StudentActiveAttempt(
                id=a.id,
                assessment_id=a.assessment_id,
                assessment_title=assessment.title if assessment else "Unknown",
                assessment_type=assessment.assessment_type if assessment else AssessmentType.CAT,
                course_code=assessment.course_code if assessment else None,
                course_name=assessment.course_name if assessment else None,
                academic_year=assessment.academic_year if assessment else None,
                status=a.status,
                started_at=a.started_at,
                expires_at=a.expires_at,
            ))

        # 7. Recent Results (Top 5 from our all_results list)
        recent_results_data = []
        for r in results[:5]:
            # Load attempt and assessment for display
            stmt_r = select(AssessmentResult).where(AssessmentResult.id == r.id).options(
                selectinload(AssessmentResult.attempt).selectinload(AssessmentAttempt.assessment)
            )
            r_full = (await self.db.execute(stmt_r)).scalar_one()
            assessment = r_full.attempt.assessment if r_full.attempt else None
            
            recent_results_data.append(StudentRecentResult(
                id=r.attempt_id,
                assessment_title=assessment.title if assessment else "Unknown",
                assessment_type=assessment.assessment_type if assessment else AssessmentType.CAT,
                course_code=assessment.course_code if assessment else None,
                course_name=assessment.course_name if assessment else None,
                academic_year=assessment.academic_year if assessment else None,
                score=r.total_score or 0.0,
                total_marks=r.max_score or 100.0,
                percentage=r.percentage or 0.0,
                letter_grade=r.letter_grade,
                released_at=r.released_at,
            ))

        # 8. Performance Trend (Real data from DB)
        from dateutil.relativedelta import relativedelta
        trend_data = []
        
        # We look back 6 months
        for i in range(5, -1, -1):
            month_date = now - relativedelta(months=i)
            start_of_month = month_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end_of_month = (start_of_month + relativedelta(months=1))
            m = start_of_month.strftime("%b")
            
            # Student's average for this month (using our pre-fetched all_results)
            student_month_results = [r.percentage for r in results if r.released_at and start_of_month <= r.released_at < end_of_month]
            student_avg = sum(student_month_results) / len(student_month_results) if student_month_results else 0.0
            
            # Real Platform average for this month (all released results)
            global_avg_stmt = select(func.avg(AssessmentResult.percentage)).where(
                AssessmentResult.is_released == True,
                AssessmentResult.is_deleted == False,
                AssessmentResult.released_at >= start_of_month,
                AssessmentResult.released_at < end_of_month
            )
            global_avg_res = await self.db.execute(global_avg_stmt)
            global_avg = global_avg_res.scalar() or 0.0
            
            trend_data.append(PerformanceTrendItem(
                month=m,
                score=round(float(student_avg), 1),
                average=round(float(global_avg), 1)
            ))

        return StudentDashboardResponse(
            summary=summary,
            workspaces=workspaces,
            active_attempts=active_attempts_data,
            recent_results=recent_results_data,
            performance_trend=trend_data,
            upcoming_assessments=[] 
        )


    async def list_workspaces(self, student_id: uuid.UUID) -> list[StudentCourseListItem]:
        """List all operational teaching workspaces the student is enrolled in."""
        workspaces = await self.workspace_repo.list_by_student(student_id)
        
        items = []
        for ws in workspaces:
            progress = await self._calculate_workspace_progress(student_id, ws.id)
            
            lecturer = ws.teaching_assignment.lecturer.profile
            items.append(StudentCourseListItem(
                id=ws.id,
                code=ws.course.code,
                title=ws.title,
                lecturer_name=f"{lecturer.first_name} {lecturer.last_name}",
                status="Active",
                progress=progress,
                academic_year=ws.academic_period.name if ws.academic_period else "GLOBAL",
                workspace_id=ws.id
            ))
        return items

    async def get_workspace_detail(self, student_id: uuid.UUID, workspace_id: uuid.UUID) -> dict:
        """Get detailed information for a specific teaching workspace."""
        ws = await self.workspace_repo.get_by_id(workspace_id)
        if not ws or ws.is_deleted: return None

        student_count = await self.workspace_repo.get_student_count(workspace_id)
        progress = await self._calculate_workspace_progress(student_id, workspace_id)
        
        materials_count = (await self.db.execute(select(func.count(LecturerMaterial.id)).where(
            LecturerMaterial.teaching_workspace_id == workspace_id,
            LecturerMaterial.is_student_visible == True,
            LecturerMaterial.is_deleted == False
        ))).scalar_one()

        assessments_count = (await self.db.execute(select(func.count(Assessment.id)).where(
            Assessment.teaching_workspace_id == workspace_id,
            Assessment.status == AssessmentStatus.PUBLISHED,
            Assessment.is_deleted == False
        ))).scalar_one()

        lecturer = ws.teaching_assignment.lecturer.profile
        return {
            "id": str(ws.id),
            "code": ws.course.code,
            "title": ws.title,
            "lecturer": f"{lecturer.first_name} {lecturer.last_name}",
            "description": ws.description or ws.course.description,
            "progress": progress,
            "enrolled": student_count,
            "nextAssessment": "Check Assessment Registry",
            "materials": materials_count,
            "assessments": assessments_count,
            "academic_year": ws.academic_period.name if ws.academic_period else "GLOBAL",
        }

    async def _calculate_workspace_progress(self, student_id: uuid.UUID, workspace_id: uuid.UUID) -> int:
        """(Completed Workspace Assessments / Total Published Workspace Assessments) * 100"""
        total_stmt = select(func.count(Assessment.id)).where(
            Assessment.teaching_workspace_id == workspace_id,
            Assessment.status == AssessmentStatus.PUBLISHED,
            Assessment.is_deleted == False
        )
        total_count = (await self.db.execute(total_stmt)).scalar_one() or 1
        
        comp_stmt = select(func.count(func.distinct(AssessmentAttempt.assessment_id))).where(
            AssessmentAttempt.student_id == student_id,
            AssessmentAttempt.assessment_id.in_(
                select(Assessment.id).where(
                    Assessment.teaching_workspace_id == workspace_id,
                    Assessment.status == AssessmentStatus.PUBLISHED,
                    Assessment.is_deleted == False
                )
            ),
            AssessmentAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]),
            AssessmentAttempt.is_deleted == False
        )
        comp_count = (await self.db.execute(comp_stmt)).scalar_one() or 0
        return int((comp_count / total_count) * 100)

    async def get_schedule_data(self, student_id: uuid.UUID) -> StudentScheduleResponse:
        assessments, _ = await self.assessment_repo.list_available_for_student(
            student_id=student_id, page_size=100
        )
        events = []
        for ass in assessments:
            if not ass.window_start: continue
            events.append(StudentScheduleEvent(
                id=str(ass.id),
                title=ass.title,
                type=ass.assessment_type.value,
                start_at=ass.window_start,
                end_at=ass.window_end,
                description=f"{ass.duration_minutes} minute assessment",
                color_hint="bg-red-500" if ass.assessment_type.value in ["CAT", "SUMMATIVE"] else "bg-emerald-500",
                course_code=ass.course.code if ass.course else None,
                course_name=ass.course.name if ass.course else None,
                duration_minutes=ass.duration_minutes
            ))
        return StudentScheduleResponse(events=events)
