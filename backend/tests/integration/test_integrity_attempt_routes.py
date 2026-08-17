"""
tests/integration/test_integrity_attempt_routes.py

Integration tests for attempt-level integrity toggle-flag and lift-hold endpoints.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import (
    AssessmentType,
    AssessmentStatus,
    UserRole,
    GradingMode,
    AttemptStatus,
    AcademicPeriodType,
    LecturerAssignmentRole,
)
from app.db.models.auth import User
from app.db.models.academic import (
    Institution,
    AcademicPeriod,
    Department,
    Option,
    Course,
    TeachingAssignment,
    TeachingWorkspace,
)
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.result import AssessmentResult


@pytest.mark.asyncio
async def test_toggle_attempt_flag_and_lift_hold(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    # 1. Create lecturer and student users
    lecturer_id = uuid.uuid4()
    lecturer = User(
        id=lecturer_id,
        email="lecturer_flag@test.ac",
        hashed_password="...",
        role=UserRole.LECTURER,
        email_verified=True,
    )
    student_id = uuid.uuid4()
    student = User(
        id=student_id,
        email="student_flag@test.ac",
        hashed_password="...",
        role=UserRole.STUDENT,
        email_verified=True,
    )
    db.add_all([lecturer, student])
    await db.flush()

    headers = make_auth_headers(
        user_id=str(lecturer_id),
        role=UserRole.LECTURER,
        email="lecturer_flag@test.ac",
    )

    # 2. Academic context & assessment
    inst = Institution(name="Inst Flag", code="IFLAG")
    db.add(inst)
    await db.flush()

    period = AcademicPeriod(
        institution_id=inst.id,
        name="P Flag",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db.add(period)
    await db.flush()

    dept = Department(institution_id=inst.id, name="D Flag", code="DFLAG")
    db.add(dept)
    await db.flush()

    opt = Option(department_id=dept.id, name="Option Flag", code="OFLAG")
    db.add(opt)
    await db.flush()

    course = Course(
        institution_id=inst.id,
        department_id=dept.id,
        name="Course Flag",
        code="CFLAG",
        academic_year="2025/2026",
    )
    db.add(course)
    await db.flush()

    assignment = TeachingAssignment(
        lecturer_id=lecturer_id,
        institution_id=inst.id,
        department_id=dept.id,
        option_id=opt.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2025/2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        class_section_id=None,
    )
    db.add(assignment)
    await db.flush()

    workspace = TeachingWorkspace(
        teaching_assignment_id=assignment.id,
        course_id=course.id,
        class_section_id=None,
        academic_period_id=period.id,
        title="Workspace Flag",
        created_by_id=lecturer_id,
    )
    db.add(workspace)
    await db.flush()

    assessment = Assessment(
        institution_id=inst.id,
        course_id=course.id,
        academic_period_id=period.id,
        teaching_workspace_id=workspace.id,
        created_by_id=lecturer.id,
        academic_year="2025/2026",
        title="Assessment Flag",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.PUBLISHED,
        total_marks=100.0,
        passing_marks=50.0,
        duration_minutes=60,
    )
    db.add(assessment)
    await db.flush()

    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student.id,
        attempt_number=1,
        grading_mode=GradingMode.AUTO,
        status=AttemptStatus.SUBMITTED,
        started_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        access_token=uuid.uuid4(),
        is_flagged=False,
    )
    db.add(attempt)
    await db.flush()

    result = AssessmentResult(
        attempt_id=attempt.id,
        student_id=student.id,
        assessment_id=assessment.id,
        total_score=80.0,
        max_score=100.0,
        percentage=80.0,
        is_passing=True,
        is_released=False,
        integrity_hold=False,
        graded_question_count=1,
        total_question_count=1,
    )
    db.add(result)
    await db.flush()

    # 3. Toggle flag -> ON
    res_flag_on = await client.post(
        f"/api/v1/integrity/attempt/{attempt.id}/toggle-flag",
        headers=headers,
        json={"is_flagged": True, "reason": "Suspicious activity noticed"},
    )
    assert res_flag_on.status_code == 200
    data_on = res_flag_on.json()
    assert data_on["is_flagged"] is True

    # Check attempt is flagged and result has integrity hold
    await db.refresh(attempt)
    await db.refresh(result)
    assert attempt.is_flagged is True
    assert result.integrity_hold is True

    # 4. Lift hold endpoint
    res_lift = await client.post(
        f"/api/v1/integrity/attempt/{attempt.id}/lift-hold",
        headers=headers,
    )
    assert res_lift.status_code == 200

    await db.refresh(attempt)
    await db.refresh(result)
    assert attempt.is_flagged is False
    assert result.integrity_hold is False
