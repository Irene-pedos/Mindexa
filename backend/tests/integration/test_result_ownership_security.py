"""
tests/integration/test_result_ownership_security.py

Security tests verifying lecturer assessment scoping and ownership checks on result routes:
- Unauthorized lecturers cannot view results, calculate results, or release results for
  assessments they do not own or supervise.
- Authorized lecturers (creators, supervisors, assigned teachers) and institutional admins
  retain full access.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import UserRole
from app.db.enums import (
    AcademicPeriodType,
    AssessmentStatus,
    AssessmentType,
    AttemptStatus,
    GradingMode,
    LecturerAssignmentRole,
    QuestionType,
    ResultReleaseMode,
)
from app.db.models.academic import (
    AcademicPeriod,
    ClassGroup,
    ClassSection,
    Course,
    Department,
    Institution,
    Option,
    StudentEnrollment,
    TeachingAssignment,
    TeachingWorkspace,
)
from app.db.models.assessment import Assessment, AssessmentSupervisor
from app.db.models.attempt import AssessmentAttempt, StudentResponse, SubmissionGrade
from app.db.models.auth import User, UserProfile
from app.db.models.question import Question, AssessmentQuestion
from app.db.models.result import AssessmentResult
from app.services.result_service import ResultService


@pytest.mark.asyncio
async def test_lecturer_result_routes_ownership_scoping(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    # 1. Setup Users: Lecturer 1 (Owner), Lecturer 2 (Attacker/Unauthorized), Admin, Student
    l1_id = uuid.uuid4()
    lecturer1 = User(
        id=l1_id,
        email="lecturer1_owner@test.ac",
        hashed_password="hash",
        role=UserRole.LECTURER,
        email_verified=True,
    )

    l2_id = uuid.uuid4()
    lecturer2 = User(
        id=l2_id,
        email="lecturer2_attacker@test.ac",
        hashed_password="hash",
        role=UserRole.LECTURER,
        email_verified=True,
    )

    admin_id = uuid.uuid4()
    admin = User(
        id=admin_id,
        email="admin_audit@test.ac",
        role=UserRole.ADMIN,
        hashed_password="hash",
        email_verified=True,
    )

    student_id = uuid.uuid4()
    student = User(
        id=student_id,
        email="student_test@test.ac",
        role=UserRole.STUDENT,
        hashed_password="hash",
        email_verified=True,
    )

    db.add_all([lecturer1, lecturer2, admin, student])
    await db.flush()

    p_l1 = UserProfile(user_id=l1_id, first_name="Dr. Owner", last_name="Prof")
    p_l2 = UserProfile(user_id=l2_id, first_name="Dr. Attacker", last_name="Prof")
    p_stu = UserProfile(user_id=student_id, first_name="John", last_name="Doe")
    db.add_all([p_l1, p_l2, p_stu])
    await db.flush()

    # 2. Setup Academic Structure for Lecturer 1
    inst = Institution(name="Ownership Test University", code="OTU")
    db.add(inst)
    await db.flush()

    period = AcademicPeriod(
        institution_id=inst.id,
        name="Semester 1 2026",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db.add(period)
    await db.flush()

    dept = Department(institution_id=inst.id, name="Computer Science", code="CS_SEC")
    db.add(dept)
    await db.flush()

    opt = Option(department_id=dept.id, name="CS Core", code="CSC")
    db.add(opt)
    await db.flush()

    course = Course(
        institution_id=inst.id,
        department_id=dept.id,
        name="Operating Systems",
        code="CS301",
        academic_year="2025/2026",
    )
    db.add(course)
    await db.flush()

    cg = ClassGroup(course_id=course.id, name="Year 3", code="Y3", option_id=opt.id)
    db.add(cg)
    await db.flush()

    section = ClassSection(class_group_id=cg.id, name="Section A")
    db.add(section)
    await db.flush()

    enrollment = StudentEnrollment(
        student_id=student_id,
        class_section_id=section.id,
        is_active=True,
    )
    db.add(enrollment)
    await db.flush()

    assignment = TeachingAssignment(
        lecturer_id=l1_id,
        institution_id=inst.id,
        department_id=dept.id,
        option_id=opt.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2025/2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        class_section_id=section.id,
    )
    db.add(assignment)
    await db.flush()

    workspace = TeachingWorkspace(
        teaching_assignment_id=assignment.id,
        course_id=course.id,
        class_section_id=section.id,
        academic_period_id=period.id,
        title="OS Workspace",
        created_by_id=l1_id,
    )
    db.add(workspace)
    await db.flush()

    # 3. Assessment created by Lecturer 1
    assessment = Assessment(
        institution_id=inst.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2025/2026",
        teaching_workspace_id=workspace.id,
        created_by_id=l1_id,
        title="OS Midterm Exam",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.PUBLISHED,
        result_release_mode=ResultReleaseMode.MANUAL,
        total_marks=20.0,
        passing_marks=10.0,
    )
    db.add(assessment)
    await db.flush()

    q1 = Question(
        created_by_id=l1_id,
        course_id=course.id,
        question_type=QuestionType.SHORT_ANSWER,
        content="What is virtual memory?",
        default_marks=20.0,
    )
    db.add(q1)
    await db.flush()

    aq1 = AssessmentQuestion(
        assessment_id=assessment.id,
        question_id=q1.id,
        order_index=1,
    )
    db.add(aq1)
    await db.flush()

    # 4. Student Attempt and Submitted Response
    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student_id,
        status=AttemptStatus.SUBMITTED,
        grading_mode=GradingMode.MANUAL,
        submitted_at=datetime.now(UTC),
    )
    db.add(attempt)
    await db.flush()

    resp = StudentResponse(
        attempt_id=attempt.id,
        question_id=q1.id,
        student_id=student_id,
        text_response="Virtual memory provides an abstraction of main storage.",
    )
    db.add(resp)
    await db.flush()

    grade = SubmissionGrade(
        attempt_id=attempt.id,
        response_id=resp.id,
        question_id=q1.id,
        student_id=student_id,
        assessment_id=assessment.id,
        score=18.0,
        max_score=20.0,
        grading_mode=GradingMode.MANUAL,
        is_final=True,
        created_by_id=l1_id,
        is_current=True,
    )
    db.add(grade)
    await db.flush()

    result = AssessmentResult(
        attempt_id=attempt.id,
        student_id=student_id,
        assessment_id=assessment.id,
        total_score=18.0,
        max_score=20.0,
        percentage=90.0,
        letter_grade="A",
        is_passing=True,
        is_released=False,
        integrity_hold=False,
        calculated_at=datetime.now(UTC),
        graded_question_count=1,
        total_question_count=1,
    )
    db.add(result)
    await db.flush()

    # Setup Auth Headers
    l1_headers = make_auth_headers(user_id=str(l1_id), role=UserRole.LECTURER, email=lecturer1.email)
    l2_headers = make_auth_headers(user_id=str(l2_id), role=UserRole.LECTURER, email=lecturer2.email)
    admin_headers = make_auth_headers(user_id=str(admin_id), role=UserRole.ADMIN, email=admin.email)

    # -------------------------------------------------------------------------
    # TEST 1: GET /results/lecturer/{attempt_id}
    # -------------------------------------------------------------------------
    # Owner (Lecturer 1) should SUCCEED
    res_l1 = await client.get(f"/api/v1/results/lecturer/{attempt.id}", headers=l1_headers)
    assert res_l1.status_code == 200
    assert res_l1.json()["total_score"] == 18.0

    # Attacker (Lecturer 2) MUST BE FORBIDDEN (403)
    res_l2 = await client.get(f"/api/v1/results/lecturer/{attempt.id}", headers=l2_headers)
    assert res_l2.status_code == 403

    # Institutional Admin should SUCCEED
    res_admin = await client.get(f"/api/v1/results/lecturer/{attempt.id}", headers=admin_headers)
    assert res_admin.status_code == 200

    # -------------------------------------------------------------------------
    # TEST 2: GET /results/assessment/{assessment_id}
    # -------------------------------------------------------------------------
    # Owner should SUCCEED
    res_list_l1 = await client.get(f"/api/v1/results/assessment/{assessment.id}", headers=l1_headers)
    assert res_list_l1.status_code == 200

    # Attacker MUST BE FORBIDDEN (403)
    res_list_l2 = await client.get(f"/api/v1/results/assessment/{assessment.id}", headers=l2_headers)
    assert res_list_l2.status_code == 403

    # -------------------------------------------------------------------------
    # TEST 3: POST /results/calculate/{attempt_id}
    # -------------------------------------------------------------------------
    # Attacker cannot trigger calculation
    res_calc_l2 = await client.post(f"/api/v1/results/calculate/{attempt.id}", headers=l2_headers)
    assert res_calc_l2.status_code == 403

    # -------------------------------------------------------------------------
    # TEST 4: POST /results/release
    # -------------------------------------------------------------------------
    # Attacker cannot release results
    res_rel_l2 = await client.post(
        "/api/v1/results/release",
        json={"assessment_id": str(assessment.id)},
        headers=l2_headers,
    )
    assert res_rel_l2.status_code == 403

    # -------------------------------------------------------------------------
    # TEST 5: GET /results/assessment/{assessment_id}/release-queue
    # -------------------------------------------------------------------------
    # Attacker cannot inspect the release queue
    res_q_l2 = await client.get(
        f"/api/v1/results/assessment/{assessment.id}/release-queue?class_section_id={section.id}",
        headers=l2_headers,
    )
    assert res_q_l2.status_code == 403

    # -------------------------------------------------------------------------
    # TEST 6: Adding Lecturer 2 as an AssessmentSupervisor grants access
    # -------------------------------------------------------------------------
    supervisor = AssessmentSupervisor(
        assessment_id=assessment.id,
        supervisor_id=l2_id,
        role=LecturerAssignmentRole.MAIN_LECTURER.value,
        is_deleted=False,
    )
    db.add(supervisor)
    await db.flush()

    # Now Lecturer 2 should have legitimate access as a supervisor
    res_l2_supervised = await client.get(f"/api/v1/results/lecturer/{attempt.id}", headers=l2_headers)
    assert res_l2_supervised.status_code == 200

    # -------------------------------------------------------------------------
    # TEST 7: Lecturer 3 (unauthorized attacker) tests Release Operations (Finding 4)
    # -------------------------------------------------------------------------
    l3_id = uuid.uuid4()
    lecturer3 = User(
        id=l3_id,
        email="lecturer3_intruder@test.ac",
        hashed_password="hash",
        role=UserRole.LECTURER,
        email_verified=True,
    )
    db.add(lecturer3)
    await db.flush()
    l3_headers = make_auth_headers(user_id=str(l3_id), role=UserRole.LECTURER, email=lecturer3.email)

    # 7a. Trigger immediate release (POST /results/assessment/{id}/trigger-release)
    res_trig_l3 = await client.post(
        f"/api/v1/results/assessment/{assessment.id}/trigger-release",
        headers=l3_headers,
    )
    assert res_trig_l3.status_code == 403

    # 7b. Update release policy (PATCH /results/assessment/{id}/release-policy)
    res_pol_l3 = await client.patch(
        f"/api/v1/results/assessment/{assessment.id}/release-policy",
        json={"policy": "immediate"},
        headers=l3_headers,
    )
    assert res_pol_l3.status_code == 403

    # Owner can update release policy
    res_pol_l1 = await client.patch(
        f"/api/v1/results/assessment/{assessment.id}/release-policy",
        json={"policy": "immediate"},
        headers=l1_headers,
    )
    assert res_pol_l1.status_code == 200

    # -------------------------------------------------------------------------
    # TEST 8: Release Queue & Class Section Association Checks (Finding 5)
    # -------------------------------------------------------------------------
    # Create an unrelated class section belonging to a different course/workspace
    unrelated_section = ClassSection(class_group_id=cg.id, name="Unrelated Section Z")
    db.add(unrelated_section)
    await db.flush()

    # Even owner (Lecturer 1) cannot enumerate an unrelated section's roster against this assessment
    res_q_unrelated = await client.get(
        f"/api/v1/results/assessment/{assessment.id}/release-queue?class_section_id={unrelated_section.id}",
        headers=l1_headers,
    )
    assert res_q_unrelated.status_code == 403
    assert "SECTION_ASSESSMENT_MISMATCH" in res_q_unrelated.text

    # Owner accessing their actual targeted section succeeds
    res_q_valid = await client.get(
        f"/api/v1/results/assessment/{assessment.id}/release-queue?class_section_id={section.id}",
        headers=l1_headers,
    )
    assert res_q_valid.status_code == 200

    # -------------------------------------------------------------------------
    # TEST 9: Grading Stats & AI Pedagogical Summary Scoping (Finding 6)
    # -------------------------------------------------------------------------
    # 9a. Class stats: GET /grading/assessment/{assessment_id}/stats/classes
    # Attacker (Lecturer 3) MUST BE FORBIDDEN (403)
    res_stats_l3 = await client.get(
        f"/api/v1/grading/assessment/{assessment.id}/stats/classes",
        headers=l3_headers,
    )
    assert res_stats_l3.status_code == 403

    # Owner (Lecturer 1) succeeds
    res_stats_l1 = await client.get(
        f"/api/v1/grading/assessment/{assessment.id}/stats/classes",
        headers=l1_headers,
    )
    assert res_stats_l1.status_code == 200
    assert res_stats_l1.json()["assessment_id"] == str(assessment.id)

    # 9b. Class AI Summary: GET /grading/assessment/{id}/class/{class_id}/ai-summary
    # Attacker (Lecturer 3) MUST BE FORBIDDEN (403)
    res_aisum_l3 = await client.get(
        f"/api/v1/grading/assessment/{assessment.id}/class/{section.id}/ai-summary",
        headers=l3_headers,
    )
    assert res_aisum_l3.status_code == 403

    # Owner querying an unrelated section MUST BE FORBIDDEN (403)
    res_aisum_unrelated = await client.get(
        f"/api/v1/grading/assessment/{assessment.id}/class/{unrelated_section.id}/ai-summary",
        headers=l1_headers,
    )
    assert res_aisum_unrelated.status_code == 403
    assert "SECTION_ASSESSMENT_MISMATCH" in res_aisum_unrelated.text

    # Owner querying their associated section succeeds
    res_aisum_l1 = await client.get(
        f"/api/v1/grading/assessment/{assessment.id}/class/{section.id}/ai-summary",
        headers=l1_headers,
    )
    assert res_aisum_l1.status_code == 200
    assert res_aisum_l1.json()["class_id"] == str(section.id)
