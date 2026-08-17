"""
tests/integration/test_kinyarwanda_queue_routing.py

Verify that assessments in Kinyarwanda ("RW") correctly route AI queue items
to manual grading (PENDING status, ai_pre_graded=False, grading_mode=MANUAL)
without raising exceptions, referencing nonexistent columns, or calling db.commit().
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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
    GradingQueueStatus,
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
from app.db.models.attempt import (
    AssessmentAttempt,
    StudentResponse,
    GradingQueueItem,
)
from app.services.grading_service import GradingService


@pytest.mark.asyncio
async def test_kinyarwanda_ai_queue_routing_fallback_to_manual(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    # 1. Setup users
    lecturer_id = uuid.uuid4()
    lecturer = User(
        id=lecturer_id,
        email="lecturer_rw@test.ac",
        hashed_password="...",
        role=UserRole.LECTURER,
        email_verified=True,
    )
    student_id = uuid.uuid4()
    student = User(
        id=student_id,
        email="student_rw@test.ac",
        hashed_password="...",
        role=UserRole.STUDENT,
        email_verified=True,
    )
    db.add_all([lecturer, student])
    await db.flush()

    # 2. Setup academic structure
    inst = Institution(name="Inst RW", code="IRW")
    db.add(inst)
    await db.flush()

    period = AcademicPeriod(
        institution_id=inst.id,
        name="P RW",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db.add(period)
    await db.flush()

    dept = Department(institution_id=inst.id, name="D RW", code="DRW")
    db.add(dept)
    await db.flush()

    opt = Option(department_id=dept.id, name="Option RW", code="ORW")
    db.add(opt)
    await db.flush()

    course = Course(
        institution_id=inst.id,
        department_id=dept.id,
        name="Course RW",
        code="CRW",
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
        title="Workspace RW",
        created_by_id=lecturer_id,
    )
    db.add(workspace)
    await db.flush()

    # 3. Create Assessment with language="RW"
    assessment = Assessment(
        institution_id=inst.id,
        course_id=course.id,
        academic_period_id=period.id,
        teaching_workspace_id=workspace.id,
        created_by_id=lecturer.id,
        academic_year="2025/2026",
        title="Isuzuma mu Kinyarwanda",
        language="RW",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.PUBLISHED,
        result_release_mode=ResultReleaseMode.MANUAL,
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
        content="Sobanura akamaro k'uburezi mu iterambere ry'igihugu.",
        marks=20,
    )
    db.add(q1)
    await db.flush()

    aq1 = AssessmentQuestion(
        assessment_id=assessment.id,
        question_id=q1.id,
        order_index=1,
        score=20.0,
    )
    db.add(aq1)
    await db.flush()

    # 4. Attempt & Response
    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student.id,
        attempt_number=1,
        grading_mode=GradingMode.SEMI,
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
        answer_text="Uburezi butuma abaturage bagira ubumenyi...",
    )
    db.add(resp1)
    await db.flush()

    # 5. Create Queue Item for AI grading
    queue_item = GradingQueueItem(
        response_id=resp1.id,
        attempt_id=attempt.id,
        assessment_id=assessment.id,
        question_id=q1.id,
        student_id=student.id,
        grading_mode="SEMI",
        status=GradingQueueStatus.PENDING.value,
        ai_pre_graded=False,
    )
    db.add(queue_item)
    await db.flush()

    # 6. Process AI Queue Item via GradingService
    service = GradingService(db)
    result = await service.process_ai_queue_item(queue_item.id)

    assert result is not None
    assert result["status"] == "manual_review_required"
    assert "Kinyarwanda" in result["reason"]

    # 7. Verify the queue item was cleanly transitioned in DB
    await db.flush()
    refreshed_item = await db.get(GradingQueueItem, queue_item.id)
    assert refreshed_item is not None
    assert refreshed_item.status == GradingQueueStatus.PENDING.value
    assert refreshed_item.ai_pre_graded is False
    assert refreshed_item.grading_mode == GradingMode.MANUAL.value
