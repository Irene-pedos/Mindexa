"""
tests/integration/test_single_notification_on_release.py

Verify that immediate-release and results released notifications (email + in-app)
are dispatched exactly ONCE when the final grade is finalized via GradingService.finalize_grade.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch
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
    NotificationType,
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
from app.db.models.notification import Notification
from app.services.grading_service import GradingService
from sqlalchemy import select


@pytest.mark.asyncio
async def test_single_notification_on_immediate_release(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    # 1. Setup users (lecturer & student)
    lecturer_id = uuid.uuid4()
    lecturer = User(
        id=lecturer_id,
        email="lecturer_notify@test.ac",
        hashed_password="...",
        role=UserRole.LECTURER,
        email_verified=True,
    )
    student_id = uuid.uuid4()
    student = User(
        id=student_id,
        email="student_notify@test.ac",
        hashed_password="...",
        role=UserRole.STUDENT,
        email_verified=True,
    )
    db.add_all([lecturer, student])
    await db.flush()

    # 2. Setup academic hierarchy
    inst = Institution(name="Inst Notify", code="INOT")
    db.add(inst)
    await db.flush()

    period = AcademicPeriod(
        institution_id=inst.id,
        name="P Notify",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db.add(period)
    await db.flush()

    dept = Department(institution_id=inst.id, name="D Notify", code="DNOT")
    db.add(dept)
    await db.flush()

    opt = Option(department_id=dept.id, name="Option Notify", code="ONOT")
    db.add(opt)
    await db.flush()

    course = Course(
        institution_id=inst.id,
        department_id=dept.id,
        name="Course Notify",
        code="CNOT",
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
        title="Workspace Notify",
        created_by_id=lecturer_id,
    )
    db.add(workspace)
    await db.flush()

    # 3. Create Assessment with 1 question and IMMEDIATE release mode
    assessment = Assessment(
        institution_id=inst.id,
        course_id=course.id,
        academic_period_id=period.id,
        teaching_workspace_id=workspace.id,
        created_by_id=lecturer.id,
        academic_year="2025/2026",
        title="Assessment Single Notify",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.PUBLISHED,
        result_release_mode=ResultReleaseMode.IMMEDIATE,
        total_marks=10.0,
        passing_marks=5.0,
        duration_minutes=60,
    )
    db.add(assessment)
    await db.flush()

    q1 = Question(
        created_by_id=lecturer_id,
        course_id=course.id,
        question_type=QuestionType.ESSAY,
        content="Essay Question Single",
        marks=10,
    )
    db.add(q1)
    await db.flush()

    aq1 = AssessmentQuestion(
        assessment_id=assessment.id,
        question_id=q1.id,
        order_index=1,
        score=10.0,
    )
    db.add(aq1)
    await db.flush()

    # 4. Student Attempt with response
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
        answer_text="Student essay single",
    )
    db.add(resp1)
    await db.flush()

    # Unfinalized draft grade
    grade1 = SubmissionGrade(
        attempt_id=attempt.id,
        assessment_id=assessment.id,
        student_id=student.id,
        question_id=q1.id,
        response_id=resp1.id,
        grading_mode="MANUAL",
        score=8.0,
        max_score=10.0,
        is_final=False,
        graded_by_id=lecturer_id,
    )
    db.add(grade1)
    await db.flush()

    # 5. Finalize grade via GradingService.finalize_grade while mocking send_email_notification.delay
    with patch("app.workers.tasks.send_email_notification.delay") as mock_email_delay:
        grading_service = GradingService(db)
        await grading_service.finalize_grade(
            response_id=resp1.id,
            lecturer_id=lecturer_id,
            score=8.5,
            feedback="Good work",
            is_final=True,
        )

        # Assert email was dispatched EXACTLY ONCE
        assert mock_email_delay.call_count == 1
        call_kwargs = mock_email_delay.call_args.kwargs
        assert call_kwargs["to_email"] == "student_notify@test.ac"
        assert call_kwargs["template_name"] == "result_released"

    # 6. Verify in-app notifications created EXACTLY ONCE
    await db.flush()
    notifications_stmt = select(Notification).where(
        Notification.recipient_id == student.id,
        Notification.notification_type == NotificationType.RESULT_RELEASED,
    )
    res_notif = await db.execute(notifications_stmt)
    notifications = res_notif.scalars().all()
    assert len(notifications) == 1
