"""
tests/integration/test_result_release_guards.py

Integration tests verifying that partial (not fully graded) results are strictly NEVER released
to students, whether via explicit attempt_ids, class section, or IMMEDIATE release mode.
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
    ResultReleaseMode,
    QuestionType,
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
from app.db.models.question import Question, AssessmentQuestion
from app.db.models.attempt import AssessmentAttempt, StudentResponse, SubmissionGrade
from app.db.models.result import AssessmentResult
from app.services.result_service import ResultService


@pytest.mark.asyncio
async def test_partial_result_never_released_server_guards(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    # 1. Setup users (lecturer & student)
    lecturer_id = uuid.uuid4()
    lecturer = User(
        id=lecturer_id,
        email="lecturer_release@test.ac",
        hashed_password="...",
        role=UserRole.LECTURER,
        email_verified=True,
    )
    student_id = uuid.uuid4()
    student = User(
        id=student_id,
        email="student_release@test.ac",
        hashed_password="...",
        role=UserRole.STUDENT,
        email_verified=True,
    )
    db.add_all([lecturer, student])
    await db.flush()

    headers = make_auth_headers(
        user_id=str(lecturer_id),
        role=UserRole.LECTURER,
        email="lecturer_release@test.ac",
    )

    # 2. Setup academic hierarchy
    inst = Institution(name="Inst Release", code="IREL")
    db.add(inst)
    await db.flush()

    period = AcademicPeriod(
        institution_id=inst.id,
        name="P Release",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db.add(period)
    await db.flush()

    dept = Department(institution_id=inst.id, name="D Release", code="DREL")
    db.add(dept)
    await db.flush()

    opt = Option(department_id=dept.id, name="Option Release", code="OREL")
    db.add(opt)
    await db.flush()

    course = Course(
        institution_id=inst.id,
        department_id=dept.id,
        name="Course Release",
        code="CREL",
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
        title="Workspace Release",
        created_by_id=lecturer_id,
    )
    db.add(workspace)
    await db.flush()

    # 3. Create Assessment with 2 questions and IMMEDIATE release mode
    assessment = Assessment(
        institution_id=inst.id,
        course_id=course.id,
        academic_period_id=period.id,
        teaching_workspace_id=workspace.id,
        created_by_id=lecturer.id,
        academic_year="2025/2026",
        title="Assessment Two Questions",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.PUBLISHED,
        result_release_mode=ResultReleaseMode.IMMEDIATE,
        total_marks=20.0,
        passing_marks=10.0,
        duration_minutes=60,
    )
    db.add(assessment)
    await db.flush()

    q1 = Question(
        created_by_id=lecturer_id,
        course_id=course.id,
        question_type=QuestionType.ESSAY,
        content="Essay Question 1",
        marks=10,
    )
    q2 = Question(
        created_by_id=lecturer_id,
        course_id=course.id,
        question_type=QuestionType.ESSAY,
        content="Essay Question 2",
        marks=10,
    )
    db.add_all([q1, q2])
    await db.flush()

    aq1 = AssessmentQuestion(
        assessment_id=assessment.id,
        question_id=q1.id,
        order_index=1,
        score=10.0,
    )
    aq2 = AssessmentQuestion(
        assessment_id=assessment.id,
        question_id=q2.id,
        order_index=2,
        score=10.0,
    )
    db.add_all([aq1, aq2])
    await db.flush()

    # 4. Student Attempt with responses to both questions
    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student.id,
        attempt_number=1,
        grading_mode=GradingMode.MANUAL,
        status=AttemptStatus.SUBMITTED,
        started_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        access_token=uuid.uuid4(),
        is_flagged=False,
    )
    db.add(attempt)
    await db.flush()

    resp1 = StudentResponse(
        attempt_id=attempt.id,
        question_id=q1.id,
        answer_text="Student essay 1",
    )
    resp2 = StudentResponse(
        attempt_id=attempt.id,
        question_id=q2.id,
        answer_text="Student essay 2",
    )
    db.add_all([resp1, resp2])
    await db.flush()

    # 5. ONLY Question 1 has a finalized grade (Question 2 is still ungraded)
    grade1 = SubmissionGrade(
        attempt_id=attempt.id,
        assessment_id=assessment.id,
        student_id=student.id,
        question_id=q1.id,
        response_id=resp1.id,
        grading_mode="MANUAL",
        score=9.0,
        max_score=10.0,
        is_final=True,
        graded_by_id=lecturer_id,
    )
    db.add(grade1)
    await db.flush()

    # 6. Test calculate_result with IMMEDIATE release:
    # Even though release_mode is IMMEDIATE, because only 1/2 questions is graded,
    # it must NOT release the result to the student.
    result_service = ResultService(db)
    calc_result, _ = await result_service.calculate_result(attempt_id=attempt.id, allow_partial=True)
    assert calc_result.graded_question_count == 1
    assert calc_result.total_question_count == 2
    assert calc_result.is_released is False

    # 7. Test POST /results/release with explicit attempt_ids:
    # Server guard MUST catch that 1/2 is not fully graded, refuse release, and report incomplete.
    res_release_explicit = await client.post(
        "/api/v1/results/release",
        headers=headers,
        json={
            "assessment_id": str(assessment.id),
            "attempt_ids": [str(attempt.id)],
        },
    )
    assert res_release_explicit.status_code == 200
    data_explicit = res_release_explicit.json()
    assert data_explicit["released_count"] == 0
    assert data_explicit["incomplete_count"] == 1
    assert str(attempt.id) in [str(x) for x in data_explicit["incomplete_attempt_ids"]]

    await db.refresh(calc_result)
    assert calc_result.is_released is False

    # 8. Test POST /results/release assessment-wide (attempt_ids=None):
    res_release_all = await client.post(
        "/api/v1/results/release",
        headers=headers,
        json={
            "assessment_id": str(assessment.id),
        },
    )
    assert res_release_all.status_code == 200
    data_all = res_release_all.json()
    assert data_all["released_count"] == 0
    assert data_all["incomplete_count"] == 1
    await db.refresh(calc_result)
    assert calc_result.is_released is False

    # 9. Now, grade Question 2 (making it 2/2 fully graded)
    grade2 = SubmissionGrade(
        attempt_id=attempt.id,
        assessment_id=assessment.id,
        student_id=student.id,
        question_id=q2.id,
        response_id=resp2.id,
        grading_mode="MANUAL",
        score=8.5,
        max_score=10.0,
        is_final=True,
        graded_by_id=lecturer_id,
    )
    db.add(grade2)
    await db.flush()

    # Recalculate result
    calc_result_full, _ = await result_service.calculate_result(attempt_id=attempt.id)
    assert calc_result_full.graded_question_count == 2
    assert calc_result_full.total_question_count == 2
    # Because release_mode is IMMEDIATE, calculate_result now safely auto-releases the completed result!
    assert calc_result_full.is_released is True

    # 10. Re-releasing an already released result does not double count
    res_re_release = await client.post(
        "/api/v1/results/release",
        headers=headers,
        json={
            "assessment_id": str(assessment.id),
            "attempt_ids": [str(attempt.id)],
        },
    )
    assert res_re_release.status_code == 200
    assert res_re_release.json()["released_count"] == 0
