from __future__ import annotations

import random
import uuid
from datetime import UTC, date, datetime

from app.db.enums import AssessmentStatus, AssessmentType, AttemptStatus
from app.db.models.academic import (AcademicPeriod, Campus, ClassGroup,
                                    ClassSection, College, Course, Department,
                                    Institution, Option, StudentEnrollment,
                                    TeachingWorkspace)
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.auth import UserProfile
from app.db.models.resource import LecturerMaterial
from app.db.models.result import AssessmentResult
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.course_repo import CourseRepository
from app.db.repositories.result_repo import ResultRepository
from app.db.repositories.workspace_repo import WorkspaceRepository
from app.schemas.student import (PerformanceTrendItem, StudentAcademicContext,
                                 StudentActiveAttempt, StudentContextLevel,
                                 StudentContextPeriod, StudentCourseListItem,
                                 StudentDashboardResponse,
                                 StudentDashboardSummary, StudentRecentResult,
                                 StudentScheduleEvent, StudentScheduleResponse,
                                 StudentUpcomingAssessment)
from sqlalchemy import and_, exists, func, not_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


# What a student can see and take (mirrors AssessmentRepository._student_visibility_filters).
_STUDENT_VISIBLE_STATUSES = [AssessmentStatus.PUBLISHED, AssessmentStatus.ACTIVE]

_DEFAULT_LEVEL_LABELS = {
    "campus": "Campus",
    "college": "College",
    "department": "Department",
    "program": "Programme",
    "year": "Year level",
    "class": "Class",
}


def _period_status(period: AcademicPeriod | None, today: date) -> str:
    """ACTIVE while the period runs, COMPLETED once it ended, UPCOMING before it starts."""
    if period is None:
        return "ACTIVE"
    if period.end_date < today:
        return "COMPLETED"
    if period.start_date > today:
        return "UPCOMING"
    return "ACTIVE"


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

        # 2. Active Tasks (Open or In-Progress Assessments)
        available_assessments, _ = await self.assessment_repo.list_available_for_student(
            student_id=student_id, page_size=100
        )
        active_count = 0
        upcoming_assessments_data = []
        for ass in available_assessments:
            attempts, _ = await self.attempt_repo.list_by_student(student_id=student_id, assessment_id=ass.id)
            has_submitted = any(att.status in [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] for att in attempts)

            if not has_submitted:
                w_start = ass.window_start
                w_end = ass.window_end

                # Exclude expired / missed assessments from active list
                if w_end and now > w_end:
                    continue

                if not w_start or now >= w_start:
                    active_count += 1

                upcoming_assessments_data.append(StudentUpcomingAssessment(
                    id=ass.id,
                    title=ass.title,
                    type=ass.assessment_type,
                    course_code=ass.course.code if ass.course else None,
                    course_name=ass.course.name if ass.course else None,
                    academic_year=ass.academic_year,
                    window_start=ass.window_start,
                    window_end=ass.window_end,
                    duration_minutes=ass.duration_minutes,
                    total_marks=ass.total_marks,
                ))
        active_metric = DashboardMetric(value=active_count, delta=0, last_month=active_count, positive=True)

        # 3. Completed Assessments (Distinct assessments completed/submitted by student)
        stmt_completed = select(func.count(func.distinct(AssessmentAttempt.assessment_id))).where(
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
        from sqlalchemy.orm import selectinload
        for r in results[:5]:
            # Load attempt and assessment for display
            stmt_r = select(AssessmentResult).where(AssessmentResult.id == r.id).options(
                selectinload(AssessmentResult.attempt).selectinload(AssessmentAttempt.assessment).selectinload(Assessment.course)
            )
            r_full = (await self.db.execute(stmt_r)).scalar_one()
            assessment = r_full.attempt.assessment if r_full.attempt else None
            if not assessment and r_full.assessment_id:
                stmt_a = select(Assessment).where(Assessment.id == r_full.assessment_id).options(selectinload(Assessment.course))
                assessment = (await self.db.execute(stmt_a)).scalar_one_or_none()

            recent_results_data.append(StudentRecentResult(
                id=r.attempt_id or r.id,
                assessment_title=assessment.title if assessment else "Unknown",
                assessment_type=assessment.assessment_type if assessment else AssessmentType.CAT,
                course_code=assessment.course.code if assessment and assessment.course else (getattr(assessment, "course_code", None) if assessment else None),
                course_name=assessment.course.name if assessment and assessment.course else (getattr(assessment, "course_name", None) if assessment else None),
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
            upcoming_assessments=upcoming_assessments_data
        )


    async def list_workspaces(self, student_id: uuid.UUID) -> list[StudentCourseListItem]:
        """List all operational teaching workspaces the student is enrolled in."""
        workspaces = await self.workspace_repo.list_by_student(student_id)

        items = []
        today = datetime.now(UTC).date()
        for ws in workspaces:
            progress = await self._calculate_workspace_progress(student_id, ws.id)
            period = ws.academic_period
            items.append(StudentCourseListItem(
                id=ws.id,
                code=ws.course.code,
                title=ws.title,
                lecturer_name=self._lecturer_name(ws),
                status=_period_status(period, today),
                progress=progress,
                academic_year=period.name if period else "",
                workspace_id=ws.id,
                banner_image_url=ws.banner_image_url,
                period_start=period.start_date if period else None,
                period_end=period.end_date if period else None,
                class_name=ws.class_section.name if ws.class_section else None,
            ))
        return items

    @staticmethod
    def _lecturer_name(ws: TeachingWorkspace) -> str:
        profile = ws.teaching_assignment.lecturer.profile if ws.teaching_assignment else None
        name = f"{profile.first_name} {profile.last_name}".strip() if profile else ""
        return name or "Instructor to be announced"

    async def _next_assessment(self, student_id: uuid.UUID, workspace_id: uuid.UUID) -> dict | None:
        """The soonest assessment of the course the student can still take."""
        now = datetime.now(UTC)
        done = exists().where(
            AssessmentAttempt.assessment_id == Assessment.id,
            AssessmentAttempt.student_id == student_id,
            AssessmentAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]),
            AssessmentAttempt.is_deleted == False,
        )
        row = (await self.db.execute(
            select(Assessment.id, Assessment.title, Assessment.window_start, Assessment.window_end)
            .where(
                Assessment.teaching_workspace_id == workspace_id,
                Assessment.status.in_(_STUDENT_VISIBLE_STATUSES),
                Assessment.is_deleted == False,
                (Assessment.window_end.is_(None)) | (Assessment.window_end > now),
                not_(done),
            )
            .order_by(Assessment.window_start.asc().nulls_last())
            .limit(1)
        )).first()
        if not row:
            return None
        return {
            "id": str(row.id),
            "title": row.title,
            "window_start": row.window_start.isoformat() if row.window_start else None,
            "window_end": row.window_end.isoformat() if row.window_end else None,
        }

    async def get_academic_context(self, student_id: uuid.UUID) -> StudentAcademicContext:
        """Campus > faculty > department > programme > year > class, named by the institution."""
        profile = (await self.db.execute(
            select(UserProfile).where(UserProfile.user_id == student_id)
        )).scalar_one_or_none()
        if profile is None:
            return StudentAcademicContext()

        section = await self.db.get(ClassSection, profile.class_section_id) if profile.class_section_id else None
        group = await self.db.get(ClassGroup, section.class_group_id) if section and section.class_group_id else None
        option_id = group.option_id if group else profile.option_id
        option = await self.db.get(Option, option_id) if option_id else None
        department_id = (
            (option.department_id if option else None)
            or (section.department_id if section else None)
            or profile.department_id
        )
        department = await self.db.get(Department, department_id) if department_id else None
        college_id = (department.college_id if department else None) or profile.college_id
        college = await self.db.get(College, college_id) if college_id else None
        campus_id = (
            (department.campus_id if department else None)
            or (college.campus_id if college else None)
            or profile.campus_id
        )
        campus = await self.db.get(Campus, campus_id) if campus_id else None
        institution_id = (
            (department.institution_id if department else None) or profile.institution_id
        )
        institution = await self.db.get(Institution, institution_id) if institution_id else None

        saved = (institution.settings or {}).get("structure_profile") if institution else None
        labels = saved.get("labels", {}) if isinstance(saved, dict) else {}

        def label_for(key: str) -> str:
            custom = labels.get(key) if isinstance(labels, dict) else None
            text = custom.get("singular") if isinstance(custom, dict) else None
            return text.strip() if isinstance(text, str) and text.strip() else _DEFAULT_LEVEL_LABELS[key]

        found: list[tuple[str, str | None]] = [
            ("campus", campus.name if campus else None),
            ("college", college.name if college else None),
            ("department", department.name if department else None),
            ("program", option.name if option else None),
            ("year", group.name if group else None),
            ("class", section.name if section else None),
        ]
        levels = [
            StudentContextLevel(key=key, label=label_for(key), name=name)
            for key, name in found
            if name
        ]

        current_period = None
        if institution:
            today = datetime.now(UTC).date()
            period = (await self.db.execute(
                select(AcademicPeriod)
                .where(
                    AcademicPeriod.institution_id == institution.id,
                    AcademicPeriod.is_deleted == False,
                    AcademicPeriod.is_active == True,
                    AcademicPeriod.start_date <= today,
                    AcademicPeriod.end_date >= today,
                )
                .order_by(AcademicPeriod.start_date.desc())
                .limit(1)
            )).scalar_one_or_none()
            if period:
                current_period = StudentContextPeriod(
                    name=period.name,
                    period_type=str(getattr(period.period_type, "value", period.period_type)),
                    start_date=period.start_date,
                    end_date=period.end_date,
                )

        return StudentAcademicContext(
            institution_name=institution.name if institution else None,
            levels=levels,
            current_period=current_period,
        )

    async def get_workspace_detail(self, student_id: uuid.UUID, workspace_id: uuid.UUID) -> dict:
        """Get detailed information for a specific teaching workspace."""
        ws = await self.workspace_repo.get_by_id(workspace_id)
        if not ws or ws.is_deleted: return None
        # Callers (workspace page, material list/download, study reader) rely on None meaning "no access".
        if not await self.workspace_repo.is_student_enrolled(student_id, workspace_id):
            return None

        student_count = await self.workspace_repo.get_student_count(workspace_id)
        progress = await self._calculate_workspace_progress(student_id, workspace_id)

        materials_count = (await self.db.execute(select(func.count(LecturerMaterial.id)).where(
            LecturerMaterial.teaching_workspace_id == workspace_id,
            LecturerMaterial.is_student_visible == True,
            LecturerMaterial.is_deleted == False
        ))).scalar_one()

        assessments_count = (await self.db.execute(select(func.count(Assessment.id)).where(
            Assessment.teaching_workspace_id == workspace_id,
            Assessment.status.in_(_STUDENT_VISIBLE_STATUSES),
            Assessment.is_deleted == False
        ))).scalar_one()

        period = ws.academic_period
        return {
            "id": str(ws.id),
            "code": ws.course.code,
            "title": ws.title,
            "lecturer": self._lecturer_name(ws),
            "description": ws.description or ws.course.description,
            "progress": progress,
            "enrolled": student_count,
            "next_assessment": await self._next_assessment(student_id, workspace_id),
            "materials": materials_count,
            "assessments": assessments_count,
            "academic_year": period.name if period else "",
            "status": _period_status(period, datetime.now(UTC).date()),
            "class_name": ws.class_section.name if ws.class_section else None,
            "banner_image_url": ws.banner_image_url,
        }

    async def _calculate_workspace_progress(self, student_id: uuid.UUID, workspace_id: uuid.UUID) -> int:
        """(Completed Workspace Assessments / Total Published Workspace Assessments) * 100"""
        total_stmt = select(func.count(Assessment.id)).where(
            Assessment.teaching_workspace_id == workspace_id,
            Assessment.status.in_(_STUDENT_VISIBLE_STATUSES),
            Assessment.is_deleted == False
        )
        total_count = (await self.db.execute(total_stmt)).scalar_one()
        if not total_count:
            return 0

        comp_stmt = select(func.count(func.distinct(AssessmentAttempt.assessment_id))).where(
            AssessmentAttempt.student_id == student_id,
            AssessmentAttempt.assessment_id.in_(
                select(Assessment.id).where(
                    Assessment.teaching_workspace_id == workspace_id,
                    Assessment.status.in_(_STUDENT_VISIBLE_STATUSES),
                    Assessment.is_deleted == False
                )
            ),
            AssessmentAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]),
            AssessmentAttempt.is_deleted == False
        )
        comp_count = (await self.db.execute(comp_stmt)).scalar_one() or 0
        return min(100, int((comp_count / total_count) * 100))

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
                color_hint="bg-red-500" if (ass.assessment_type.value if hasattr(ass.assessment_type, 'value') else str(ass.assessment_type)) in ["CAT", "SUMMATIVE"] else "bg-emerald-500",
                course_code=ass.course.code if ass.course else None,
                course_name=ass.course.name if ass.course else None,
                duration_minutes=ass.duration_minutes
            ))

        # Include Study Plan sessions
        from app.db.repositories.study_planner_repo import \
            StudyPlannerRepository
        sp_repo = StudyPlannerRepository(self.db)
        study_sessions = await sp_repo.list_upcoming_sessions_for_student(student_id)
        for s in study_sessions:
            events.append(StudentScheduleEvent(
                id=str(s.id),
                title=f"Study: {s.title}",
                type="STUDY_SESSION",
                start_at=s.scheduled_start,
                end_at=s.scheduled_end,
                description=f"Topic: {s.topic} ({s.session_type})",
                color_hint="bg-primary",
                duration_minutes=s.duration_minutes
            ))

        return StudentScheduleResponse(events=events)
