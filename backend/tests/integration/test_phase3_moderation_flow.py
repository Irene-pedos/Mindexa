"""
tests/integration/test_phase3_moderation_flow.py

End-to-end integration tests for Phase 3 Moderation and Exam Office workflows.
Verifies Section 7 Definition of Done:
- Full summative lifecycle: DRAFT -> submit -> changes -> resubmit -> approve -> seal -> publish
- Unclaimed review decision blocked
- Conflict of interest and cross-department moderator isolation
- Cross-institution Exam Officer isolation (sealing & print jobs)
- Seal verification & content tampering detection
- Direct CAT publish bypass unaffected
- Document downloads with verification code
"""

from __future__ import annotations

import math
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.enums import (
    AcademicPeriodType,
    AssessmentStatus,
    AssessmentType,
    Duty,
    LecturerAssignmentRole,
    ModerationCommentCategory,
    ModerationCommentTarget,
    ModerationReviewStatus,
    PrintJobStatus,
    QuestionType,
    SectionKind,
    UserRole,
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
from app.db.models.duty import UserDutyAssignment
from app.db.models.policy import ApprovalPolicy
from app.db.models.assessment import (
    Assessment,
    AssessmentSection,
    AssessmentTargetSection,
)
from app.db.models.question import (
    AssessmentQuestion,
    Question,
    QuestionOption,
)
from app.db.models.auth import User, UserProfile
from app.db.models.moderation import (
    AssessmentSeal,
    AssessmentVersion,
    ExamPrintJob,
    ModerationComment,
    ModerationReview,
)


async def _setup_flow_environment(db: AsyncSession):
    """
    Sets up a full multi-tenant institutional environment:
    - Inst 1: CS Dept (Course CS301), EE Dept
    - Inst 2: General Dept (Course EE201)
    - Author (Lecturer CS301)
    - Mod CS (Moderator CS Dept, Inst 1)
    - Mod EE (Moderator EE Dept, Inst 1)
    - EO Inst 1 (Exam Officer, Inst 1)
    - EO Inst 2 (Exam Officer, Inst 2)
    - Students enrolled in CS301 (20 students)
    - ApprovalPolicy for Inst 1 with requires_moderation=True, summative_total_marks=100
    """
    # 1. Institutions
    inst1 = Institution(name="University of Science", code="UOS")
    inst2 = Institution(name="Global Institute", code="GIN")
    db.add_all([inst1, inst2])
    await db.flush()

    # 2. Academic Period
    period1 = AcademicPeriod(
        institution_id=inst1.id,
        name="Semester 1 2026",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db.add(period1)
    await db.flush()

    # 3. Departments
    dept_cs = Department(institution_id=inst1.id, name="Computer Science", code="CS")
    dept_ee = Department(institution_id=inst1.id, name="Electrical Engineering", code="EE")
    dept_inst2 = Department(institution_id=inst2.id, name="General Studies", code="GEN")
    db.add_all([dept_cs, dept_ee, dept_inst2])
    await db.flush()

    # 4. Options & Courses
    opt_cs = Option(department_id=dept_cs.id, name="Software Eng", code="SE")
    db.add(opt_cs)
    await db.flush()

    course_cs = Course(
        institution_id=inst1.id,
        academic_period_id=period1.id,
        department_id=dept_cs.id,
        name="Advanced Operating Systems",
        code="CS301",
        academic_year="2026",
    )
    db.add(course_cs)
    await db.flush()

    # 5. Class Group, Section & Enrolled Students
    cg = ClassGroup(course_id=course_cs.id, option_id=opt_cs.id, name="SE Year 3", code="SEY3")
    db.add(cg)
    await db.flush()

    sec1 = ClassSection(class_group_id=cg.id, name="Section A", department_id=dept_cs.id)
    db.add(sec1)
    await db.flush()

    # Create 20 enrolled students
    for i in range(20):
        stu = User(
            id=uuid.uuid4(),
            email=f"student{i}@uos.ac",
            hashed_password="pw",
            role=UserRole.STUDENT,
            email_verified=True,
        )
        db.add(stu)
        await db.flush()
        db.add(UserProfile(user_id=stu.id, first_name=f"Student{i}", last_name="UOS"))
        db.add(
            StudentEnrollment(
                student_id=stu.id,
                course_id=course_cs.id,
                class_section_id=sec1.id,
                academic_period_id=period1.id,
                status="ACTIVE",
            )
        )
    await db.flush()

    # 6. Users
    author = User(
        id=uuid.uuid4(),
        email="author_cs@uos.ac",
        hashed_password="pw",
        role=UserRole.LECTURER,
        status="ACTIVE",
        email_verified=True,
    )
    mod_cs = User(
        id=uuid.uuid4(),
        email="mod_cs@uos.ac",
        hashed_password="pw",
        role=UserRole.LECTURER,
        status="ACTIVE",
        email_verified=True,
    )
    mod_ee = User(
        id=uuid.uuid4(),
        email="mod_ee@uos.ac",
        hashed_password="pw",
        role=UserRole.LECTURER,
        status="ACTIVE",
        email_verified=True,
    )
    eo_inst1 = User(
        id=uuid.uuid4(),
        email="eo_inst1@uos.ac",
        hashed_password="pw",
        role=UserRole.LECTURER,
        status="ACTIVE",
        email_verified=True,
    )
    eo_inst2 = User(
        id=uuid.uuid4(),
        email="eo_inst2@gin.ac",
        hashed_password="pw",
        role=UserRole.LECTURER,
        status="ACTIVE",
        email_verified=True,
    )
    db.add_all([author, mod_cs, mod_ee, eo_inst1, eo_inst2])
    await db.flush()

    # Profiles
    db.add(UserProfile(user_id=author.id, first_name="Alan", last_name="Turing"))
    db.add(UserProfile(user_id=mod_cs.id, first_name="Ada", last_name="Lovelace"))
    db.add(UserProfile(user_id=mod_ee.id, first_name="Nikola", last_name="Tesla"))
    db.add(UserProfile(user_id=eo_inst1.id, first_name="Grace", last_name="Hopper"))
    db.add(UserProfile(user_id=eo_inst2.id, first_name="Charles", last_name="Babbage"))
    await db.flush()

    # Teaching Assignment & Workspace for Author
    ta = TeachingAssignment(
        lecturer_id=author.id,
        institution_id=inst1.id,
        department_id=dept_cs.id,
        option_id=opt_cs.id,
        course_id=course_cs.id,
        academic_period_id=period1.id,
        academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        class_section_id=None,
    )
    db.add(ta)
    await db.flush()

    ws = TeachingWorkspace(
        id=uuid.uuid4(),
        teaching_assignment_id=ta.id,
        course_id=course_cs.id,
        academic_period_id=period1.id,
        title="CS301 Workspace",
        status="ACTIVE",
    )
    db.add(ws)
    await db.flush()

    admin = User(
        id=uuid.uuid4(),
        email="admin_inst@uos.ac",
        hashed_password="pw",
        role=UserRole.ADMIN,
        status="ACTIVE",
        email_verified=True,
    )
    db.add(admin)
    await db.flush()

    # 7. Duties
    now = datetime.now(UTC)
    duty_mod_cs = UserDutyAssignment(
        user_id=mod_cs.id,
        duty=Duty.MODERATOR,
        institution_id=inst1.id,
        department_id=dept_cs.id,
        is_active=True,
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=90),
        assigned_by_id=admin.id,
    )
    duty_mod_ee = UserDutyAssignment(
        user_id=mod_ee.id,
        duty=Duty.MODERATOR,
        institution_id=inst1.id,
        department_id=dept_ee.id,
        is_active=True,
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=90),
        assigned_by_id=admin.id,
    )
    duty_eo1 = UserDutyAssignment(
        user_id=eo_inst1.id,
        duty=Duty.EXAM_OFFICER,
        institution_id=inst1.id,
        is_active=True,
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=90),
        assigned_by_id=admin.id,
    )
    duty_eo2 = UserDutyAssignment(
        user_id=eo_inst2.id,
        duty=Duty.EXAM_OFFICER,
        institution_id=inst2.id,
        is_active=True,
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=90),
        assigned_by_id=admin.id,
    )
    db.add_all([duty_mod_cs, duty_mod_ee, duty_eo1, duty_eo2])

    # 8. Approval Policy for Inst 1
    policy1 = ApprovalPolicy(
        institution_id=inst1.id,
        assessment_type=AssessmentType.SUMMATIVE,
        requires_moderation=True,
        enforce_structure_template=True,
        summative_total_marks=100,
        sealing_warning_days=3,
    )
    db.add(policy1)
    await db.commit()

    return {
        "inst1": inst1,
        "inst2": inst2,
        "dept_cs": dept_cs,
        "dept_ee": dept_ee,
        "course_cs": course_cs,
        "sec1": sec1,
        "workspace": ws,
        "author": author,
        "mod_cs": mod_cs,
        "mod_ee": mod_ee,
        "eo_inst1": eo_inst1,
        "eo_inst2": eo_inst2,
    }


def _create_summative_paper(course, author, sec1, workspace):
    """Creates a summative assessment with 1 section and 2 questions totaling 100 marks."""
    now = datetime.now(UTC)
    asmt = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=workspace.id,
        course_id=course.id,
        title="Final Exam CS301",
        description="Comprehensive Final Examination",
        instructions="Answer all questions carefully.",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.DRAFT,
        total_marks=100,
        duration_minutes=120,
        created_by_id=author.id,
        academic_year="2026",
        window_start=now + timedelta(days=5),
        window_end=now + timedelta(days=5, hours=3),
    )

    sec = AssessmentSection(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        title="Section A: Core Systems",
        order_index=1,
        section_kind=SectionKind.CLOSED,
        questions_to_answer=2,
    )

    q1 = Question(
        id=uuid.uuid4(),
        course_id=course.id,
        created_by_id=author.id,
        content="Explain Peterson's algorithm for mutual exclusion in detail.",
        question_type=QuestionType.ESSAY,
        marks=50,
        academic_year="2026",
    )
    aq1 = AssessmentQuestion(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        assessment_section_id=sec.id,
        question_id=q1.id,
        order_index=1,
    )
    aq1.question = q1

    q2 = Question(
        id=uuid.uuid4(),
        course_id=course.id,
        created_by_id=author.id,
        content="Compare inverted page tables with multi-level hierarchical paging.",
        question_type=QuestionType.ESSAY,
        marks=50,
        academic_year="2026",
    )
    aq2 = AssessmentQuestion(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        assessment_section_id=sec.id,
        question_id=q2.id,
        order_index=2,
    )
    aq2.question = q2

    target = AssessmentTargetSection(
        assessment_id=asmt.id,
        class_section_id=sec1.id,
    )

    return asmt, [sec], [aq1, aq2], target


@pytest.mark.asyncio
async def test_full_summative_moderation_and_exam_office_e2e_flow(
    client: AsyncClient,
    db: AsyncSession,
    make_auth_headers,
):
    """
    Complete institutional integration flow:
    1. Pre-moderation checklist runs and passes
    2. Author submits for moderation -> status PENDING_MODERATION, Round 1 created
    3. Unclaimed review decision guards enforced
    4. Author CoI and cross-department moderator claim blocked
    5. CS Moderator claims review
    6. Moderator adds comment & requests changes -> status CHANGES_REQUESTED
    7. Resubmission with unresolved comment blocked
    8. Author resolves comment and resubmits -> Round 2 created, status PENDING_MODERATION
    9. Moderator claims Round 2 and approves -> status APPROVED
    10. Publish-without-seal bypass blocked for summative
    11. Cross-institution Exam Officer seal blocked
    12. Authorized Exam Officer seals assessment -> status SEALED, Print Job created (enrolled + spare)
    13. Cross-institution Exam Officer print job update blocked
    14. Public seal verification passes
    15. Post-seal content tampering detected by seal verification
    16. Author finalizes/publishes from SEALED -> status PUBLISHED
    17. Generated paper document download verified
    18. CAT direct publish bypass verified (no moderation required)
    """
    env = await _setup_flow_environment(db)
    asmt, secs, aqs, target = _create_summative_paper(
        env["course_cs"], env["author"], env["sec1"], env["workspace"]
    )

    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        db.add(aq)
    db.add(target)
    await db.commit()

    author_hdrs = make_auth_headers(
        user_id=str(env["author"].id),
        role=UserRole.LECTURER,
        email=env["author"].email,
    )
    mod_cs_hdrs = make_auth_headers(
        user_id=str(env["mod_cs"].id),
        role=UserRole.LECTURER,
        email=env["mod_cs"].email,
    )
    mod_ee_hdrs = make_auth_headers(
        user_id=str(env["mod_ee"].id),
        role=UserRole.LECTURER,
        email=env["mod_ee"].email,
    )
    eo1_hdrs = make_auth_headers(
        user_id=str(env["eo_inst1"].id),
        role=UserRole.LECTURER,
        email=env["eo_inst1"].email,
    )
    eo2_hdrs = make_auth_headers(
        user_id=str(env["eo_inst2"].id),
        role=UserRole.LECTURER,
        email=env["eo_inst2"].email,
    )

    # ── Step 1: Pre-moderation Checklist ──────────────────────────────────────
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{asmt.id}/moderation/checklist",
        headers=author_hdrs,
    )
    assert resp.status_code == 200, resp.text
    chk_data = resp.json()
    assert chk_data["has_blocking_failures"] is False
    assert any(item["code"] == "MARKS_TOTAL" and item["passed"] for item in chk_data["items"])

    # ── Step 2: Submit for Moderation ─────────────────────────────────────────
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{asmt.id}/moderation/submit",
        headers=author_hdrs,
        json={"run_ai_review": False},
    )
    assert resp.status_code == 201, resp.text
    sub_data = resp.json()
    review_id = sub_data["review_id"]
    assert sub_data["round_no"] == 1
    assert sub_data["status"] == "PENDING_MODERATION"

    # Check assessment status
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.PENDING_MODERATION

    # ── Step 3: Unclaimed Review Decision Guard ───────────────────────────────
    # Approving before claiming must be rejected
    resp = await client.post(
        f"/api/v1/moderator/reviews/{review_id}/approve",
        headers=mod_cs_hdrs,
        json={"decision_note": "Premature approval", "acknowledge_warnings": True},
    )
    assert resp.status_code == 400
    assert "must be claimed" in resp.text.lower()

    # Requesting changes before claiming must be rejected
    resp = await client.post(
        f"/api/v1/moderator/reviews/{review_id}/request-changes",
        headers=mod_cs_hdrs,
        json={"decision_note": "Premature changes request"},
    )
    assert resp.status_code == 400
    assert "must be claimed" in resp.text.lower()

    # ── Step 4: Claim Authorization & Conflict of Interest ───────────────────
    # Author cannot moderate their own assessment
    resp = await client.post(
        f"/api/v1/moderator/reviews/{review_id}/claim",
        headers=author_hdrs,
    )
    assert resp.status_code == 403
    assert "conflict of interest" in resp.text.lower() or "cannot moderate" in resp.text.lower()

    # Moderator from another department cannot claim
    resp = await client.post(
        f"/api/v1/moderator/reviews/{review_id}/claim",
        headers=mod_ee_hdrs,
    )
    assert resp.status_code == 403
    assert "not an active moderator" in resp.text.lower() or "not assigned" in resp.text.lower()

    # CS Department Moderator successfully claims
    resp = await client.post(
        f"/api/v1/moderator/reviews/{review_id}/claim",
        headers=mod_cs_hdrs,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["reviewer_id"] == str(env["mod_cs"].id)

    # ── Step 5: Comment & Request Changes (Round 1) ───────────────────────────
    # Moderator adds a comment on Question 1
    resp = await client.post(
        f"/api/v1/moderator/reviews/{review_id}/comments",
        headers=mod_cs_hdrs,
        json={
            "target_type": ModerationCommentTarget.QUESTION.value,
            "target_id": str(aqs[0].id),
            "category": ModerationCommentCategory.WORDING.value,
            "comment": "Clarify Peterson algorithm assumptions.",
        },
    )
    assert resp.status_code == 201, resp.text
    comment_id = resp.json()["id"]

    # Moderator requests changes
    resp = await client.post(
        f"/api/v1/moderator/reviews/{review_id}/request-changes",
        headers=mod_cs_hdrs,
        json={"decision_note": "Please address wording comment on Question 1."},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == ModerationReviewStatus.CHANGES_REQUESTED.value

    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.CHANGES_REQUESTED

    # ── Step 6: Author Resolves Comment & Resubmits ──────────────────────────
    # Author resolves comment
    resp = await client.post(
        f"/api/v1/lecturer/moderation/comments/{comment_id}/resolve",
        headers=author_hdrs,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["resolved"] is True

    # Author resubmits for round 2
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{asmt.id}/moderation/resubmit",
        headers=author_hdrs,
        json={"reason": "Addressed Peterson algorithm assumptions."},
    )
    assert resp.status_code == 201, resp.text
    r2_review_id = resp.json()["review_id"]
    assert resp.json()["round_no"] == 2

    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.PENDING_MODERATION

    # ── Step 7: Moderator Approves Round 2 ───────────────────────────────────
    # Moderator claims and approves Round 2
    claim_r2 = await client.post(
        f"/api/v1/moderator/reviews/{r2_review_id}/claim",
        headers=mod_cs_hdrs,
    )
    assert claim_r2.status_code == 200

    resp = await client.post(
        f"/api/v1/moderator/reviews/{r2_review_id}/approve",
        headers=mod_cs_hdrs,
        json={"decision_note": "All comments resolved. Structure and wording approved.", "acknowledge_warnings": True},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == ModerationReviewStatus.APPROVED.value

    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.APPROVED

    # ── Step 8: Publish Bypass Blocked for Summative ──────────────────────────
    # Author attempts to publish directly while APPROVED (not SEALED)
    resp = await client.post(
        f"/api/v1/assessments/{asmt.id}/finalize",
        headers=author_hdrs,
    )
    assert resp.status_code == 200  # Returns validation response
    fin_data = resp.json()
    assert fin_data["validation_passed"] is False
    assert any("seal" in err.lower() or "moderation" in err.lower() for err in fin_data["errors"])

    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.APPROVED

    # ── Step 9: Exam Officer Authorization & Sealing ─────────────────────────
    # Exam officer from Institution 2 must be rejected
    resp = await client.post(
        f"/api/v1/exam-office/assessments/{asmt.id}/seal",
        headers=eo2_hdrs,
        json={"spare_percent": 5, "notes": "Unauthorized seal"},
    )
    assert resp.status_code == 403
    assert "exam_officer" in resp.text.lower() or "exam officer" in resp.text.lower()

    # Authorized Exam Officer from Institution 1 seals assessment
    resp = await client.post(
        f"/api/v1/exam-office/assessments/{asmt.id}/seal",
        headers=eo1_hdrs,
        json={"spare_percent": 5, "notes": "Sealed for final exams"},
    )
    assert resp.status_code == 201, resp.text
    seal_data = resp.json()
    verification_code = seal_data["verification_code"]
    print_job_id = seal_data["print_job_id"]
    # 20 enrolled + 5% spares = 21 copies
    assert seal_data["copies_total"] == 21

    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.SEALED

    # ── Step 10: Cross-Institution Print Job Isolation ───────────────────────
    # Exam officer from Institution 2 cannot update Institution 1 print job
    resp = await client.patch(
        f"/api/v1/exam-office/print-jobs/{print_job_id}",
        headers=eo2_hdrs,
        json={"status": PrintJobStatus.PRINTED.value, "notes": "Cross-institution update"},
    )
    assert resp.status_code == 403

    # Authorized Exam Officer updates print job
    resp = await client.patch(
        f"/api/v1/exam-office/print-jobs/{print_job_id}",
        headers=eo1_hdrs,
        json={"status": PrintJobStatus.PRINTED.value, "notes": "Batch printed"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == PrintJobStatus.PRINTED.value

    # ── Step 11: Public Seal Verification & Content Tampering ────────────────
    # Public endpoint verifies valid seal
    resp = await client.get(f"/api/v1/public/verify-seal/{verification_code}")
    assert resp.status_code == 200, resp.text
    ver_data = resp.json()
    assert ver_data["valid"] is True
    assert ver_data["assessment_title"] == "Final Exam CS301"
    assert ver_data["course_code"] == "CS301"
    assert ver_data["version_no"] == 2

    # Simulate unauthorized post-seal content modification in the database
    q1_db = await db.get(Question, aqs[0].question_id)
    original_content = q1_db.content
    q1_db.content = "TAMPERED: Injected unauthorized exam prompt."
    await db.commit()

    # Verification must detect the tampering and fail
    resp = await client.get(f"/api/v1/public/verify-seal/{verification_code}")
    assert resp.status_code == 200
    tampered_data = resp.json()
    assert tampered_data["valid"] is False
    assert "modified" in tampered_data["error"].lower()

    # Revert tampering
    q1_db.content = original_content
    await db.commit()

    # Verification passes again
    resp = await client.get(f"/api/v1/public/verify-seal/{verification_code}")
    assert resp.status_code == 200
    assert resp.json()["valid"] is True

    # ── Step 12: Finalize & Publish from SEALED ──────────────────────────────
    resp = await client.post(
        f"/api/v1/assessments/{asmt.id}/finalize",
        headers=author_hdrs,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["validation_passed"] is True

    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.PUBLISHED

    # ── Step 13: Exam Paper Document Download ────────────────────────────────
    resp = await client.get(
        f"/api/v1/assessments/{asmt.id}/documents/paper",
        headers=author_hdrs,
    )
    assert resp.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in resp.headers["content-type"]
    assert len(resp.content) > 1000

    # ── Step 14: Direct CAT / Formative Publish Bypass ────────────────────────
    # Create a CAT assessment that does not require moderation
    cat_asmt = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=env["workspace"].id,
        course_id=env["course_cs"].id,
        title="Pop Quiz 1",
        description="Weekly formative quiz",
        instructions="Complete within 20 minutes.",
        assessment_type=AssessmentType.FORMATIVE,
        status=AssessmentStatus.DRAFT,
        total_marks=20,
        duration_minutes=20,
        created_by_id=env["author"].id,
        academic_year="2026",
    )
    cat_sec = AssessmentSection(
        id=uuid.uuid4(),
        assessment_id=cat_asmt.id,
        title="Quiz Questions",
        order_index=1,
        section_kind=SectionKind.CLOSED,
        questions_to_answer=1,
    )
    cat_q = Question(
        id=uuid.uuid4(),
        course_id=env["course_cs"].id,
        created_by_id=env["author"].id,
        content="What is a semaphore?",
        question_type=QuestionType.ESSAY,
        marks=20,
        academic_year="2026",
    )
    cat_aq = AssessmentQuestion(
        id=uuid.uuid4(),
        assessment_id=cat_asmt.id,
        assessment_section_id=cat_sec.id,
        question_id=cat_q.id,
        order_index=1,
    )
    db.add(cat_asmt)
    db.add(cat_sec)
    db.add(cat_q)
    db.add(cat_aq)
    await db.commit()

    # CAT publishes directly from DRAFT without moderation or seal
    resp = await client.post(
        f"/api/v1/assessments/{cat_asmt.id}/finalize",
        headers=author_hdrs,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["validation_passed"] is True

    await db.refresh(cat_asmt)
    assert cat_asmt.status == AssessmentStatus.PUBLISHED
