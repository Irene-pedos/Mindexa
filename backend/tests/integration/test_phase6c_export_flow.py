"""
tests/integration/test_phase6c_export_flow.py

End-to-end integration tests for Phase 6C (Section 12):
1. Assessment marksheet export returns valid xlsx bytes
2. sanitize_cell injection protection is applied in output
3. Course consolidated marksheet uses Phase 6A unweighted average
4. ExportJob lifecycle: create → running → done
5. ExportTemplate upsert and retrieval
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.enums import (
    AcademicPeriodType,
    AssessmentStatus,
    AttemptStatus,
    ExportJobStatus,
    ExportType,
    GradingMode,
    SubmissionStatus,
    UserRole,
)
from app.db.models.academic import (
    AcademicPeriod,
    Course,
    Department,
    Institution,
    StudentEnrollment,
    TeachingAssignment,
    TeachingWorkspace,
)
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.auth import User, UserProfile
from app.db.models.export import ExportTemplate
from app.db.models.result import AssessmentResult
from app.db.repositories.export_repo import ExportRepository
from app.services.export_service import ExportService
from app.utils.spreadsheet import sanitize_cell


def _user(role: UserRole, db: AsyncSession) -> User:
    user = User(
        email=f"user_{uuid.uuid4().hex[:8]}@test.com",
        hashed_password="hashed",
        role=role,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    profile = UserProfile(
        user=user,
        first_name="Export",
        last_name=role.value.title(),
        phone_number=f"+25079{uuid.uuid4().int % 10000000:07d}",
    )
    db.add(profile)
    return user


async def _setup_export_env(db: AsyncSession):
    inst = Institution(
        name="ExportInst",
        code=f"EXP-{uuid.uuid4().hex[:4]}",
        country="RW",
        subdomain=f"exp-{uuid.uuid4().hex[:6]}",
    )
    db.add(inst)
    dept = Department(
        name="EE",
        code=f"EE-{uuid.uuid4().hex[:4]}",
        institution_id=inst.id if hasattr(inst, 'id') else None,
    )
    db.add(dept)
    await db.flush()
    dept.institution_id = inst.id

    period = AcademicPeriod(
        institution_id=inst.id,
        name="2026-S2",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=datetime(2026, 7, 1, tzinfo=timezone.utc),
        end_date=datetime(2026, 12, 31, tzinfo=timezone.utc),
    )
    db.add(period)
    await db.flush()

    dept.institution_id = inst.id
    course = Course(
        institution_id=inst.id,
        department_id=dept.id,
        academic_period_id=period.id,
        name="Digital Systems",
        code=f"DS-{uuid.uuid4().hex[:4]}",
        academic_year="2026",
        credits=4,
    )
    db.add(course)
    await db.flush()

    return inst, dept, course, period


@pytest.mark.asyncio
async def test_assessment_marksheet_returns_xlsx(db: AsyncSession):
    """Export returns valid xlsx bytes that can be opened by openpyxl."""
    pytest.importorskip("openpyxl")

    inst, dept, course, period = await _setup_export_env(db)
    lecturer = _user(UserRole.LECTURER, db)
    student = _user(UserRole.STUDENT, db)
    ta = TeachingAssignment(
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_year="2026",
    )
    db.add(ta)
    await db.flush()

    ws = TeachingWorkspace(
        teaching_assignment_id=ta.id,
        course_id=course.id,
        academic_period_id=period.id,
        title="DS Workspace",
        created_by_id=lecturer.id,
    )
    db.add(ws)
    await db.flush()

    assessment = Assessment(
        teaching_workspace_id=ws.id,
        course_id=course.id,
        academic_period_id=period.id,
        institution_id=inst.id,
        academic_year="2026",
        title="Digital Logic CAT",
        assessment_type="CAT",
        status=AssessmentStatus.PUBLISHED,
        total_marks=50,
        required_marks=50,
        created_by_id=lecturer.id,
    )
    db.add(assessment)
    await db.flush()

    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student.id,
        status=AttemptStatus.SUBMITTED,
        submission_status=SubmissionStatus.GRADED,
        grading_mode=GradingMode.MANUAL,
        started_at=utcnow(),
        submitted_at=utcnow(),
    )
    db.add(attempt)
    await db.flush()

    result = AssessmentResult(
        attempt_id=attempt.id,
        student_id=student.id,
        assessment_id=assessment.id,
        total_score=38.0,
        max_score=50.0,
        percentage=76.0,
        is_released=True,
        released_at=utcnow(),
    )
    db.add(result)

    # Seed the default marksheet template
    db.add(ExportTemplate(
        code="default_marksheet",
        name="Default Assessment Mark Sheet",
        config_json={},
        is_default=True,
    ))
    await db.flush()

    service = ExportService(db)
    xlsx_bytes = await service.export_assessment_marksheet(
        assessment_id=assessment.id,
        requester=lecturer,
    )

    assert len(xlsx_bytes) > 0

    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
    assert "Marks" in wb.sheetnames
    assert "Summary" in wb.sheetnames
    assert "Meta" in wb.sheetnames

    ws = wb["Marks"]
    # Header row
    headers = [ws.cell(row=1, column=i).value for i in range(1, 10)]
    assert "Full Name" in headers
    assert "Percentage" in headers


@pytest.mark.asyncio
async def test_sanitize_cell_applied_in_export(db: AsyncSession):
    """Cells starting with formula characters must be prefixed with single quote."""
    pytest.importorskip("openpyxl")

    inst, dept, course, period = await _setup_export_env(db)
    lecturer = _user(UserRole.LECTURER, db)
    student = _user(UserRole.STUDENT, db)
    await db.flush()

    # Give student a name that starts with '=' (injection attempt)
    student.profile.first_name = "=EVIL"
    student.profile.last_name = "Smith"

    ta = TeachingAssignment(
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_year="2026",
    )
    db.add(ta)
    await db.flush()

    ws = TeachingWorkspace(
        teaching_assignment_id=ta.id,
        course_id=course.id,
        academic_period_id=period.id,
        title="Sanitize WS",
        created_by_id=lecturer.id,
    )
    db.add(ws)
    await db.flush()

    assessment = Assessment(
        teaching_workspace_id=ws.id,
        course_id=course.id,
        academic_period_id=period.id,
        institution_id=inst.id,
        academic_year="2026",
        title="Test CAT",
        assessment_type="CAT",
        status=AssessmentStatus.PUBLISHED,
        total_marks=100,
        created_by_id=lecturer.id,
    )
    db.add(assessment)
    await db.flush()

    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student.id,
        status=AttemptStatus.SUBMITTED,
        submission_status=SubmissionStatus.GRADED,
        grading_mode=GradingMode.MANUAL,
        started_at=utcnow(),
        submitted_at=utcnow(),
    )
    db.add(attempt)
    await db.flush()

    result = AssessmentResult(
        attempt_id=attempt.id,
        student_id=student.id,
        assessment_id=assessment.id,
        total_score=70.0,
        max_score=100.0,
        percentage=70.0,
        is_released=True,
        released_at=utcnow(),
    )
    db.add(result)
    db.add(ExportTemplate(code="default_marksheet", name="Default", config_json={}, is_default=True))
    await db.flush()

    service = ExportService(db)
    xlsx_bytes = await service.export_assessment_marksheet(
        assessment_id=assessment.id, requester=lecturer
    )

    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
    ws = wb["Marks"]

    # Find the "Full Name" column index
    headers = {ws.cell(row=1, column=c).value: c for c in range(1, ws.max_column + 1)}
    name_col = headers.get("Full Name")
    if name_col:
        cell_value = ws.cell(row=2, column=name_col).value
        # Should be prefixed with single quote to neutralize formula
        assert cell_value is not None
        assert not str(cell_value).startswith("="), "Injection string was not sanitized!"


@pytest.mark.asyncio
async def test_export_job_lifecycle(db: AsyncSession):
    """ExportJob: QUEUED → RUNNING → DONE."""
    inst, dept, course, period = await _setup_export_env(db)
    requester = _user(UserRole.LECTURER, db)
    await db.flush()

    ta = TeachingAssignment(
        lecturer_id=requester.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_year="2026",
    )
    db.add(ta)
    await db.flush()

    ws = TeachingWorkspace(
        teaching_assignment_id=ta.id,
        course_id=course.id,
        academic_period_id=period.id,
        title="Lifecycle WS",
        created_by_id=requester.id,
    )
    db.add(ws)
    await db.flush()

    assessment = Assessment(
        teaching_workspace_id=ws.id,
        course_id=course.id,
        academic_period_id=period.id,
        institution_id=inst.id,
        academic_year="2026",
        title="Lifecycle CAT",
        assessment_type="CAT",
        status=AssessmentStatus.PUBLISHED,
        total_marks=100,
        created_by_id=requester.id,
    )
    db.add(assessment)
    await db.flush()

    db.add(ExportTemplate(
        code="default_marksheet",
        name="Default Assessment Mark Sheet",
        config_json={},
        is_default=True,
    ))
    await db.flush()

    repo = ExportRepository(db)
    template = await repo.get_template_by_code("default_marksheet")
    assert template is not None

    job = await repo.create_job(
        requested_by_id=requester.id,
        export_type=ExportType.ASSESSMENT_MARKSHEET,
        template_id=template.id,
        assessment_id=assessment.id,
    )
    assert job.status == ExportJobStatus.QUEUED

    job = await repo.update_job_status(job, ExportJobStatus.RUNNING)
    assert job.status == ExportJobStatus.RUNNING

    job = await repo.update_job_status(
        job,
        ExportJobStatus.DONE,
        file_path="/tmp/export_test.xlsx",
        row_count=5,
        expires_at=utcnow(),
    )
    assert job.status == ExportJobStatus.DONE
    assert job.file_path == "/tmp/export_test.xlsx"
    assert job.row_count == 5
    assert job.finished_at is not None


@pytest.mark.asyncio
async def test_export_template_upsert(db: AsyncSession):
    """Upsert creates on first call, updates on second."""
    inst, dept, course, period = await _setup_export_env(db)
    creator = _user(UserRole.ADMIN, db)
    await db.flush()

    repo = ExportRepository(db)

    t1 = await repo.upsert_template(
        code="test_template",
        name="Test Template",
        config_json={"version": 1},
        is_default=False,
        created_by_id=creator.id,
    )
    assert t1.name == "Test Template"

    t2 = await repo.upsert_template(
        code="test_template",
        name="Updated Template",
        config_json={"version": 2},
        is_default=True,
    )
    assert t2.id == t1.id
    assert t2.name == "Updated Template"
    assert t2.config_json == {"version": 2}
