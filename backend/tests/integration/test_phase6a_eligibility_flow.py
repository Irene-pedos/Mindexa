"""
tests/integration/test_phase6a_eligibility_flow.py

End-to-end integration tests for Phase 6A: Eligibility, Reassessment, and Retake Engine (Section 10):
1. Admin Policy management: GET and PUT /api/v1/admin/eligibility-policy
2. Student eligibility overview: GET /api/v1/student/eligibility/courses/{course_id}
3. Lecturer cohort overview: GET /api/v1/lecturer/courses/{course_id}/eligibility
4. Lecturer blocked students: GET /api/v1/lecturer/assessments/{id}/blocked-students
5. HOD override: POST /api/v1/hod/eligibility-overrides (permission checks, active window, decision record)
6. Retake obligations lifecycle:
   - Student lists retakes: GET /api/v1/student/retakes
   - Student submits payment reference: POST /api/v1/student/retakes/{id}/payment-reference
   - Admin confirms payment: POST /api/v1/admin/payment-references/{id}/confirm
   - Admin finalizes enrollment in next period: POST /api/v1/admin/retakes/{id}/enroll
7. Gate evaluation integration:
   - Formative failure creates ReassessmentRequirement
   - CAT gate blocks student when requirement is pending
   - HOD override unblocks CAT attempt start
   - Summative gate blocks when coursework average is below threshold
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any, Dict

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.enums import (
    AcademicPeriodType,
    AssessmentStatus,
    AssessmentType,
    AttemptStatus,
    Duty,
    EligibilityDecisionType,
    EligibilityResult,
    NoCourseworkBehavior,
    OverrideSource,
    PaymentPurpose,
    PaymentStatus,
    PendingMarksBehavior,
    ReassessmentBlockScope,
    ReassessmentRequirementStatus,
    RetakeStatus,
    RetakeTrigger,
    UserRole,
)
from app.db.models.academic import (
    AcademicPeriod,
    Campus,
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
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.auth import User, UserProfile
from app.db.models.duty import UserDutyAssignment
from app.db.models.eligibility import (
    AttemptEligibilityOverride,
    EligibilityDecision,
    EligibilityPolicy,
    PaymentReference,
    ReassessmentRequirement,
    RetakeRecord,
)
from app.db.models.result import AssessmentResult
from app.services.eligibility_service import EligibilityService


async def _create_test_user(
    db: AsyncSession,
    role: UserRole,
    email: str,
    first_name: str,
    last_name: str,
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="hashed_pw_test",
        role=role,
        status="ACTIVE",
        email_verified=True,
    )
    db.add(user)
    await db.flush()
    profile = UserProfile(
        user_id=user.id,
        first_name=first_name,
        last_name=last_name,
    )
    db.add(profile)
    await db.flush()
    return user


async def _setup_phase6a_env(db: AsyncSession) -> Dict[str, Any]:
    inst = Institution(
        id=uuid.uuid4(),
        name="Kigali Institute of Science",
        code=f"KIS-{uuid.uuid4().hex[:4].upper()}",
    )
    db.add(inst)
    await db.flush()

    campus = Campus(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="Main Campus",
        code=f"MC-{uuid.uuid4().hex[:3].upper()}",
    )
    db.add(campus)
    await db.flush()

    period = AcademicPeriod(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="2026 Semester 1",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
    )
    next_period = AcademicPeriod(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="2026 Semester 2",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=date(2026, 7, 1),
        end_date=date(2026, 12, 31),
    )
    db.add_all([period, next_period])
    await db.flush()

    dept = Department(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="Computer Engineering",
        code=f"CE-{uuid.uuid4().hex[:3].upper()}",
    )
    db.add(dept)
    await db.flush()

    course = Course(
        id=uuid.uuid4(),
        institution_id=inst.id,
        academic_period_id=period.id,
        department_id=dept.id,
        name="Distributed Systems",
        code=f"CS401-{uuid.uuid4().hex[:4].upper()}",
        academic_year="2026",
    )
    db.add(course)
    await db.flush()

    opt = Option(
        id=uuid.uuid4(),
        department_id=dept.id,
        name="Software Engineering",
        code=f"SE-{uuid.uuid4().hex[:3].upper()}",
    )
    db.add(opt)
    await db.flush()

    cg = ClassGroup(
        id=uuid.uuid4(),
        course_id=course.id,
        option_id=opt.id,
        name="Year 4 Group",
        code=f"Y4-{uuid.uuid4().hex[:3]}",
    )
    db.add(cg)
    await db.flush()

    sec = ClassSection(
        id=uuid.uuid4(),
        class_group_id=cg.id,
        name="Section 1",
        department_id=dept.id,
    )
    db.add(sec)
    await db.flush()

    # Users
    admin = await _create_test_user(db, UserRole.ADMIN, f"admin-{uuid.uuid4().hex[:6]}@kis.ac", "Admin", "KIS")
    hod = await _create_test_user(db, UserRole.LECTURER, f"hod-{uuid.uuid4().hex[:6]}@kis.ac", "Dept", "Head")
    lecturer = await _create_test_user(db, UserRole.LECTURER, f"lec-{uuid.uuid4().hex[:6]}@kis.ac", "Lead", "Lecturer")
    student = await _create_test_user(db, UserRole.STUDENT, f"student-{uuid.uuid4().hex[:6]}@kis.ac", "Eric", "Mugisha")

    # Enroll student
    enrollment = StudentEnrollment(
        id=uuid.uuid4(),
        student_id=student.id,
        course_id=course.id,
        class_section_id=sec.id,
        academic_period_id=period.id,
        status="ACTIVE",
    )
    db.add(enrollment)

    # Assign lecturer to course
    ta = TeachingAssignment(
        id=uuid.uuid4(),
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        class_section_id=sec.id,
        academic_period_id=period.id,
        academic_year="2026",
    )
    db.add(ta)
    await db.flush()

    ws = TeachingWorkspace(
        id=uuid.uuid4(),
        teaching_assignment_id=ta.id,
        course_id=course.id,
        academic_period_id=period.id,
        title="CS401 Workspace",
        status="ACTIVE",
    )
    db.add(ws)
    await db.flush()

    # HOD duty assignment
    now = datetime.now(UTC)
    hod_duty = UserDutyAssignment(
        id=uuid.uuid4(),
        user_id=hod.id,
        duty=Duty.DEPARTMENT_HEAD,
        institution_id=inst.id,
        department_id=dept.id,
        is_active=True,
        valid_from=now - timedelta(days=10),
        valid_to=now + timedelta(days=365),
        assigned_by_id=admin.id,
    )
    db.add(hod_duty)

    # Institutional Policy
    policy = EligibilityPolicy(
        id=uuid.uuid4(),
        institution_id=inst.id,
        department_id=None,
        formative_exempt_pct=70.0,
        summative_entry_pct=50.0,
        summative_pass_pct=50.0,
        reassessment_block_scope=ReassessmentBlockScope.COURSE,
        pending_marks_behavior=PendingMarksBehavior.BLOCK,
        no_coursework_behavior=NoCourseworkBehavior.MANUAL_REVIEW,
    )
    db.add(policy)
    await db.commit()

    return {
        "inst": inst,
        "campus": campus,
        "period": period,
        "next_period": next_period,
        "dept": dept,
        "course": course,
        "sec": sec,
        "admin": admin,
        "hod": hod,
        "lecturer": lecturer,
        "student": student,
        "policy": policy,
        "workspace": ws,
    }


# ── 1. Admin Policy Endpoints ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_eligibility_policy_get_and_put(
    client: AsyncClient,
    db: AsyncSession,
    make_auth_headers,
):
    env = await _setup_phase6a_env(db)
    admin = env["admin"]
    inst = env["inst"]
    admin_hdr = make_auth_headers(user_id=str(admin.id), role=UserRole.ADMIN, email=admin.email)

    # GET policy
    resp = await client.get(
        f"/api/v1/admin/eligibility-policy?institution_id={inst.id}",
        headers=admin_hdr,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["formative_exempt_pct"] == 70.0
    assert data["summative_entry_pct"] == 50.0

    # PUT policy (update formative to 75.0% and block scope to ALL_COURSES)
    update_payload = {
        "formative_exempt_pct": 75.0,
        "reassessment_block_scope": "ALL_COURSES",
    }
    put_resp = await client.put(
        f"/api/v1/admin/eligibility-policy?institution_id={inst.id}",
        json=update_payload,
        headers=admin_hdr,
    )
    assert put_resp.status_code == 200, put_resp.text
    updated_data = put_resp.json()
    assert updated_data["formative_exempt_pct"] == 75.0
    assert updated_data["reassessment_block_scope"] == "ALL_COURSES"


# ── 2. Student & Lecturer Eligibility Overviews ──────────────────────────────


@pytest.mark.asyncio
async def test_student_and_lecturer_eligibility_overviews(
    client: AsyncClient,
    db: AsyncSession,
    make_auth_headers,
):
    env = await _setup_phase6a_env(db)
    student = env["student"]
    lecturer = env["lecturer"]
    course = env["course"]

    # Create a Formative Assessment with 40% (failed -> reassessment required)
    formative = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=env["workspace"].id,
        created_by_id=lecturer.id,
        course_id=course.id,
        academic_year="2026",
        title="Formative Quiz 1",
        assessment_type=AssessmentType.FORMATIVE,
        status=AssessmentStatus.PUBLISHED,
        total_marks=50,
    )
    db.add(formative)
    await db.flush()

    # Trigger formative finalization (below 70% threshold)
    service = EligibilityService(db)
    req = await service.process_formative_finalization(
        assessment_id=formative.id,
        student_id=student.id,
        score=20.0,
        max_marks=50.0,
    )
    await db.commit()
    assert req is not None
    assert req.status == ReassessmentRequirementStatus.REQUIRED

    # Student checks own eligibility
    stu_hdr = make_auth_headers(user_id=str(student.id), role=UserRole.STUDENT, email=student.email)
    s_resp = await client.get(
        f"/api/v1/student/eligibility/courses/{course.id}",
        headers=stu_hdr,
    )
    assert s_resp.status_code == 200, s_resp.text
    s_data = s_resp.json()
    assert len(s_data["pending_reassessments"]) == 1
    assert s_data["pending_reassessments"][0]["source_assessment_title"] == "Formative Quiz 1"

    # Lecturer checks cohort eligibility
    lec_hdr = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER, email=lecturer.email)
    l_resp = await client.get(
        f"/api/v1/lecturer/courses/{course.id}/eligibility",
        headers=lec_hdr,
    )
    assert l_resp.status_code == 200, l_resp.text
    l_data = l_resp.json()
    assert l_data["total_enrolled"] >= 1
    assert any(s["pending_reassessments_count"] >= 1 for s in l_data["students"])

    # Create a CAT assessment and check blocked students
    cat = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=env["workspace"].id,
        created_by_id=lecturer.id,
        course_id=course.id,
        academic_year="2026",
        title="Midterm CAT",
        assessment_type=AssessmentType.CAT,
        status=AssessmentStatus.PUBLISHED,
        total_marks=50,
    )
    db.add(cat)
    await db.commit()

    b_resp = await client.get(
        f"/api/v1/lecturer/assessments/{cat.id}/blocked-students",
        headers=lec_hdr,
    )
    assert b_resp.status_code == 200, b_resp.text
    b_data = b_resp.json()
    assert len(b_data["blocked_students"]) == 1
    assert b_data["blocked_students"][0]["student_id"] == str(student.id)
    assert b_data["blocked_students"][0]["reason_code"] == "REASSESSMENT_PENDING"


# ── 3. HOD Override Flow ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_hod_override_flow(
    client: AsyncClient,
    db: AsyncSession,
    make_auth_headers,
):
    env = await _setup_phase6a_env(db)
    student = env["student"]
    hod = env["hod"]
    lecturer = env["lecturer"]
    course = env["course"]

    # Create CAT assessment
    cat = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=env["workspace"].id,
        created_by_id=lecturer.id,
        course_id=course.id,
        academic_year="2026",
        title="Midterm CAT 2",
        assessment_type=AssessmentType.CAT,
        status=AssessmentStatus.PUBLISHED,
        total_marks=50,
    )
    db.add(cat)

    # Formative failure
    formative = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=env["workspace"].id,
        created_by_id=lecturer.id,
        course_id=course.id,
        academic_year="2026",
        title="Formative Quiz 2",
        assessment_type=AssessmentType.FORMATIVE,
        status=AssessmentStatus.PUBLISHED,
        total_marks=50,
    )
    db.add(formative)
    await db.flush()

    service = EligibilityService(db)
    await service.process_formative_finalization(
        assessment_id=formative.id,
        student_id=student.id,
        score=20.0,
        max_marks=50.0,
    )
    await db.commit()

    # Non-HOD lecturer attempting override should be 403 Forbidden
    lec_hdr = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER, email=lecturer.email)
    fail_payload = {
        "student_id": str(student.id),
        "assessment_id": str(cat.id),
        "reason": "Trying to bypass as non-HOD lecturer",
    }
    fail_resp = await client.post(
        "/api/v1/hod/eligibility-overrides",
        json=fail_payload,
        headers=lec_hdr,
    )
    assert fail_resp.status_code == 403, fail_resp.text

    # HOD with valid reason grants override
    hod_hdr = make_auth_headers(user_id=str(hod.id), role=UserRole.LECTURER, email=hod.email)
    now = datetime.now(UTC)
    override_payload = {
        "student_id": str(student.id),
        "assessment_id": str(cat.id),
        "reason": "Department approved medical concession; student will sit reassessment next week.",
        "allowed_window_start": now.isoformat(),
        "allowed_window_end": (now + timedelta(hours=48)).isoformat(),
    }
    ov_resp = await client.post(
        "/api/v1/hod/eligibility-overrides",
        json=override_payload,
        headers=hod_hdr,
    )
    assert ov_resp.status_code == 201, ov_resp.text
    ov_data = ov_resp.json()
    assert ov_data["student_id"] == str(student.id)
    assert ov_data["assessment_id"] == str(cat.id)
    assert ov_data["source"] == OverrideSource.HOD_OVERRIDE.value
    assert ov_data["revoked_at"] is None

    # Check blocked students again: should now be 0 because override is active
    b_resp = await client.get(
        f"/api/v1/lecturer/assessments/{cat.id}/blocked-students",
        headers=hod_hdr,
    )
    assert b_resp.status_code == 200, b_resp.text
    b_data2 = b_resp.json()
    assert len(b_data2["blocked_students"]) == 0


# ── 4. Retake Lifecycle: Payment & Enrollment Flow ───────────────────────────


@pytest.mark.asyncio
async def test_retake_payment_and_enrollment_lifecycle(
    client: AsyncClient,
    db: AsyncSession,
    make_auth_headers,
):
    env = await _setup_phase6a_env(db)
    student = env["student"]
    admin = env["admin"]
    course = env["course"]
    next_period = env["next_period"]

    # Create a Summative Assessment
    exam = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=env["workspace"].id,
        created_by_id=admin.id,
        course_id=course.id,
        academic_year="2026",
        title="Final Exam",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.PUBLISHED,
        total_marks=100,
    )
    db.add(exam)
    await db.flush()

    # Student fails exam: 40/100 = 40% < 50% pass threshold -> SUMMATIVE_FAILED retake
    service = EligibilityService(db)
    retake = await service.process_summative_finalization(
        assessment_id=exam.id,
        student_id=student.id,
        score=40.0,
        max_marks=100.0,
    )
    await db.commit()
    assert retake is not None
    assert retake.status == RetakeStatus.FLAGGED

    # Student lists retakes
    stu_hdr = make_auth_headers(user_id=str(student.id), role=UserRole.STUDENT, email=student.email)
    r_list_resp = await client.get("/api/v1/student/retakes", headers=stu_hdr)
    assert r_list_resp.status_code == 200, r_list_resp.text
    retakes_list = r_list_resp.json()
    assert len(retakes_list) == 1
    assert retakes_list[0]["id"] == str(retake.id)
    assert retakes_list[0]["status"] == RetakeStatus.FLAGGED.value

    # Student attaches payment reference
    pay_payload = {
        "external_reference": "MTN-MOMO-20261022-9988",
        "amount_text": "30,000 RWF",
        "notes": "Paid via MTN Mobile Money agent",
    }
    attach_resp = await client.post(
        f"/api/v1/student/retakes/{retake.id}/payment-reference",
        json=pay_payload,
        headers=stu_hdr,
    )
    assert attach_resp.status_code == 201, attach_resp.text
    attached_data = attach_resp.json()
    assert attached_data["status"] == RetakeStatus.PAYMENT_PENDING.value
    payment_ref_id = attached_data["payment_reference_id"]
    assert payment_ref_id is not None

    # Admin confirms payment
    admin_hdr = make_auth_headers(user_id=str(admin.id), role=UserRole.ADMIN, email=admin.email)
    confirm_payload = {
        "status": "CONFIRMED",
        "notes": "Verified receipt in institutional bank portal",
    }
    conf_resp = await client.post(
        f"/api/v1/admin/payment-references/{payment_ref_id}/confirm",
        json=confirm_payload,
        headers=admin_hdr,
    )
    assert conf_resp.status_code == 200, conf_resp.text
    conf_data = conf_resp.json()
    assert conf_data["status"] == PaymentStatus.CONFIRMED.value

    # Retake status is now PAID
    r_reloaded = await service.repo.get_retake_record(retake.id)
    assert r_reloaded.status == RetakeStatus.PAID

    # Admin finalizes enrollment in next period
    enroll_payload = {
        "target_period_id": str(next_period.id),
        "target_course_id": str(course.id),
    }
    enroll_resp = await client.post(
        f"/api/v1/admin/retakes/{retake.id}/enroll",
        json=enroll_payload,
        headers=admin_hdr,
    )
    assert enroll_resp.status_code == 200, enroll_resp.text
    enrolled_data = enroll_resp.json()
    assert enrolled_data["status"] == RetakeStatus.ENROLLED.value
    assert enrolled_data["target_period_id"] == str(next_period.id)

    # Verify StudentEnrollment row was created with is_retake = True
    enrollment_stmt = select(StudentEnrollment).where(
        StudentEnrollment.student_id == student.id,
        StudentEnrollment.is_retake == True,
    )
    enr_res = await db.execute(enrollment_stmt)
    new_enrollment = enr_res.scalar_one_or_none()
    assert new_enrollment is not None
    assert new_enrollment.retake_record_id == retake.id
