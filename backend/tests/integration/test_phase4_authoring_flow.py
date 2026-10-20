"""
backend/tests/integration/test_phase4_authoring_flow.py

End-to-end integration test for Phase 4:
- Collaborator assignment scoped to course (R-01)
- Author delegations scoped to department (R-09)
- Active delegate permissions and audit log recording acting_under_delegation_id
- Version snapshotting and field-level diff calculation
- Audited post-approval edits (NOTIFY and REQUIRE_REAPPROVAL paths)
- Seal superseding on post-approval edit and public verification invalidation
- Attempt start blocking (A-10) for content changes

Governing source of truth: MINDEXA_INSTITUTIONAL_WORKFLOWS_SPEC.md Section 8.
"""
from datetime import date, datetime, timedelta, timezone
import json
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    AssessmentType,
    PostApprovalEditMode,
    PostStartEditMode,
    UserRole,
)
from app.db.enums import (
    AcademicPeriodType,
    AssessmentStatus,
    AttemptStatus,
    CollaboratorRole,
    DelegationStatus,
    Duty,
    GradingMode,
    ModerationReviewStatus,
    NotificationType,
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
from app.db.models.assessment import (
    Assessment,
    AssessmentSection,
    AssessmentTargetSection,
)
from app.db.models.attempt import AssessmentAttempt
from app.db.models.audit import AuditLog
from app.db.models.authoring import AssessmentCollaborator, AuthorDelegation
from app.db.models.auth import User, UserProfile
from app.db.models.duty import UserDutyAssignment
from app.db.models.moderation import (
    AssessmentSeal,
    AssessmentVersion,
    ExamPrintJob,
    ModerationReview,
)
from app.db.models.policy import ApprovalPolicy
from app.db.models.question import (
    AssessmentQuestion,
    Question,
    QuestionOption,
)
from app.services.moderation_service import compute_canonical_hash, serialize_assessment_content


async def _setup_phase4_environment(db: AsyncSession):
    """Setup institutional environment for Phase 4."""
    # 1. Institutions & Campuses
    inst = Institution(name="Institute of Technology", code="IOT")
    db.add(inst)
    await db.flush()

    campus = Campus(institution_id=inst.id, name="Main Campus", code="MC")
    db.add(campus)
    await db.flush()

    # 2. Period
    period = AcademicPeriod(
        institution_id=inst.id,
        name="2026 Academic Year",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db.add(period)
    await db.flush()

    # 3. Departments
    dept_cs = Department(institution_id=inst.id, name="Computer Science", code="CS")
    dept_ee = Department(institution_id=inst.id, name="Electrical Engineering", code="EE")
    db.add_all([dept_cs, dept_ee])
    await db.flush()

    # 4. Course
    course = Course(
        institution_id=inst.id,
        academic_period_id=period.id,
        department_id=dept_cs.id,
        name="Network Security",
        code="CS401",
        academic_year="2026",
    )
    db.add(course)
    await db.flush()

    # Unrelated Course (different department)
    course_ee = Course(
        institution_id=inst.id,
        academic_period_id=period.id,
        department_id=dept_ee.id,
        name="Circuits 101",
        code="EE101",
        academic_year="2026",
    )
    db.add(course_ee)
    await db.flush()

    # 5. Class Group & Section
    opt = Option(department_id=dept_cs.id, name="Computer Science", code="CS_DEG")
    db.add(opt)
    await db.flush()
    cg = ClassGroup(option_id=opt.id, name="CS Year 4", code="CSY4")
    db.add(cg)
    await db.flush()
    sec = ClassSection(class_group_id=cg.id, name="Section A", department_id=dept_cs.id)
    db.add(sec)
    await db.flush()

    # 6. Users
    author = User(id=uuid.uuid4(), email="author_net@iot.ac", hashed_password="pw", role=UserRole.LECTURER, status="ACTIVE", email_verified=True)
    co_author = User(id=uuid.uuid4(), email="coauthor_net@iot.ac", hashed_password="pw", role=UserRole.LECTURER, status="ACTIVE", email_verified=True)
    unassigned_lecturer = User(id=uuid.uuid4(), email="unassigned@iot.ac", hashed_password="pw", role=UserRole.LECTURER, status="ACTIVE", email_verified=True)
    delegate_cs = User(id=uuid.uuid4(), email="delegate_cs@iot.ac", hashed_password="pw", role=UserRole.LECTURER, status="ACTIVE", email_verified=True)
    delegate_ee = User(id=uuid.uuid4(), email="delegate_ee@iot.ac", hashed_password="pw", role=UserRole.LECTURER, status="ACTIVE", email_verified=True)
    hod_cs = User(id=uuid.uuid4(), email="hod_cs@iot.ac", hashed_password="pw", role=UserRole.LECTURER, status="ACTIVE", email_verified=True)
    moderator_cs = User(id=uuid.uuid4(), email="mod_cs@iot.ac", hashed_password="pw", role=UserRole.LECTURER, status="ACTIVE", email_verified=True)
    exam_officer = User(id=uuid.uuid4(), email="eo_iot@iot.ac", hashed_password="pw", role=UserRole.ADMIN, status="ACTIVE", email_verified=True)
    student = User(id=uuid.uuid4(), email="student1@iot.ac", hashed_password="pw", role=UserRole.STUDENT, status="ACTIVE", email_verified=True)

    db.add_all([author, co_author, unassigned_lecturer, delegate_cs, delegate_ee, hod_cs, moderator_cs, exam_officer, student])
    await db.flush()

    for u, fn, ln in [
        (author, "Author", "Lecturer"),
        (co_author, "Co", "Author"),
        (unassigned_lecturer, "Unassigned", "Lecturer"),
        (delegate_cs, "Delegate", "CS"),
        (delegate_ee, "Delegate", "EE"),
        (hod_cs, "HOD", "CS"),
        (moderator_cs, "Mod", "CS"),
        (exam_officer, "Exam", "Officer"),
        (student, "Student", "One"),
    ]:
        db.add(UserProfile(user_id=u.id, first_name=fn, last_name=ln))

    # 7. Teaching Assignments
    # Author taught CS401
    ta_author = TeachingAssignment(
        lecturer_id=author.id,
        institution_id=inst.id,
        department_id=dept_cs.id,
        course_id=course.id,
        academic_year="2026",
        is_active=True,
    )
    # Co-author also taught CS401 (R-01)
    ta_coauthor = TeachingAssignment(
        lecturer_id=co_author.id,
        institution_id=inst.id,
        department_id=dept_cs.id,
        course_id=course.id,
        academic_year="2026",
        is_active=True,
    )
    # Delegate CS belongs to CS department
    ta_del_cs = TeachingAssignment(
        lecturer_id=delegate_cs.id,
        institution_id=inst.id,
        department_id=dept_cs.id,
        course_id=course.id,
        academic_year="2026",
        is_active=True,
    )
    # Delegate EE belongs to EE department
    ta_del_ee = TeachingAssignment(
        lecturer_id=delegate_ee.id,
        institution_id=inst.id,
        department_id=dept_ee.id,
        course_id=course_ee.id,
        academic_year="2026",
        is_active=True,
    )
    db.add_all([ta_author, ta_coauthor, ta_del_cs, ta_del_ee])
    await db.flush()

    # Student enrollment
    db.add(
        StudentEnrollment(
            student_id=student.id,
            course_id=course.id,
            class_section_id=sec.id,
            academic_period_id=period.id,
            status="ACTIVE",
        )
    )

    # 8. Duties
    db.add(UserDutyAssignment(user_id=hod_cs.id, duty=Duty.DEPARTMENT_HEAD, institution_id=inst.id, department_id=dept_cs.id, assigned_by_id=exam_officer.id, is_active=True))
    db.add(UserDutyAssignment(user_id=moderator_cs.id, duty=Duty.MODERATOR, institution_id=inst.id, department_id=dept_cs.id, assigned_by_id=exam_officer.id, is_active=True))
    db.add(UserDutyAssignment(user_id=exam_officer.id, duty=Duty.EXAM_OFFICER, institution_id=inst.id, assigned_by_id=exam_officer.id, is_active=True))

    # 9. ApprovalPolicy (SUMMATIVE requires moderation, default NOTIFY)
    policy = ApprovalPolicy(
        institution_id=inst.id,
        assessment_type=AssessmentType.SUMMATIVE,
        requires_moderation=True,
        summative_total_marks=100,
        post_approval_edit_mode=PostApprovalEditMode.NOTIFY,
        post_start_edit_mode=PostStartEditMode.BLOCK,
        sealing_warning_days=3,
        is_active=True,
    )
    db.add(policy)

    # 10. Teaching Workspace
    ws = TeachingWorkspace(
        teaching_assignment_id=ta_author.id,
        course_id=course.id,
        academic_period_id=period.id,
        title="Network Security Workspace",
        is_active=True,
    )
    db.add(ws)
    await db.flush()

    # 11. Assessments
    assessment = Assessment(
        id=uuid.uuid4(),
        title="Network Security Final Exam",
        instructions="All questions mandatory.",
        assessment_type=AssessmentType.SUMMATIVE,
        academic_year="2026",
        status=AssessmentStatus.DRAFT,
        teaching_workspace_id=ws.id,
        course_id=course.id,
        created_by_id=author.id,
        total_marks=100,
        passing_marks=50,
        duration_minutes=120,
        window_start=datetime.now(timezone.utc) + timedelta(days=10),
        window_end=datetime.now(timezone.utc) + timedelta(days=10, hours=3),
    )
    unrelated_assessment = Assessment(
        id=uuid.uuid4(),
        title="Unrelated EE Exam",
        instructions="Circuits exam.",
        assessment_type=AssessmentType.SUMMATIVE,
        academic_year="2026",
        status=AssessmentStatus.DRAFT,
        teaching_workspace_id=ws.id,
        course_id=course_ee.id,
        created_by_id=uuid.uuid4(),
        total_marks=100,
        passing_marks=50,
        duration_minutes=120,
        window_start=datetime.now(timezone.utc) + timedelta(days=10),
        window_end=datetime.now(timezone.utc) + timedelta(days=10, hours=3),
    )
    db.add_all([assessment, unrelated_assessment])
    await db.flush()

    # Target section
    db.add(AssessmentTargetSection(assessment_id=assessment.id, class_section_id=sec.id))

    # Sections & Questions
    sec_a = AssessmentSection(assessment_id=assessment.id, title="Section A - Cryptography", allocated_marks=50, order_index=0)
    sec_b = AssessmentSection(assessment_id=assessment.id, title="Section B - Protocols", allocated_marks=50, order_index=1)
    db.add_all([sec_a, sec_b])
    await db.flush()

    q1 = Question(created_by_id=author.id, content="Explain RSA encryption.", course_id=course.id, question_type="SHORT_ANSWER", default_marks=50)
    q2 = Question(created_by_id=author.id, content="Explain TLS handshake.", course_id=course.id, question_type="SHORT_ANSWER", default_marks=50)
    db.add_all([q1, q2])
    await db.flush()

    aq1 = AssessmentQuestion(assessment_id=assessment.id, question_id=q1.id, assessment_section_id=sec_a.id, marks_override=50, order_index=0)
    aq2 = AssessmentQuestion(assessment_id=assessment.id, question_id=q2.id, assessment_section_id=sec_b.id, marks_override=50, order_index=0)
    db.add_all([aq1, aq2])

    await db.commit()

    return {
        "inst": inst,
        "course": course,
        "dept_cs": dept_cs,
        "author": author,
        "co_author": co_author,
        "unassigned_lecturer": unassigned_lecturer,
        "delegate_cs": delegate_cs,
        "delegate_ee": delegate_ee,
        "hod_cs": hod_cs,
        "moderator_cs": moderator_cs,
        "exam_officer": exam_officer,
        "student": student,
        "assessment": assessment,
        "unrelated_assessment": unrelated_assessment,
        "policy": policy,
    }


@pytest.mark.asyncio
async def test_full_phase4_authoring_and_delegation_flow(
    client: AsyncClient,
    db: AsyncSession,
    make_auth_headers,
):
    """
    Complete Phase 4 end-to-end integration test:
    1. Collaborator addition enforces course teaching assignment (R-01)
    2. Co-author can edit assessment draft
    3. Author delegation enforces department scope (R-09)
    4. HOD can create author delegation
    5. Delegate edits assessment; AuditLog records acting_under_delegation_id
    6. Delegate cannot edit unrelated assessments
    7. Summative assessment is approved and sealed
    8. Public seal verification passes
    9. Post-approval edit by delegate validates reason length (min 10 chars)
    10. Post-approval edit in NOTIFY mode creates new version, supersedes seal, and logs audit
    11. Public seal verification fails once seal is superseded
    12. Version history and structured diff endpoints return changes
    13. Once student attempt has started, content edits are blocked (A-10)
    14. REQUIRE_REAPPROVAL policy returns assessment to PENDING_MODERATION
    """
    env = await _setup_phase4_environment(db)
    assessment_id = str(env["assessment"].id)
    def u_headers(u: User) -> dict[str, str]:
        return make_auth_headers(user_id=str(u.id), role=u.role, email=u.email)

    author_h = u_headers(env["author"])
    co_author_h = u_headers(env["co_author"])
    unassigned_h = u_headers(env["unassigned_lecturer"])
    delegate_cs_h = u_headers(env["delegate_cs"])
    hod_cs_h = u_headers(env["hod_cs"])
    mod_cs_h = u_headers(env["moderator_cs"])
    eo_h = u_headers(env["exam_officer"])

    # ── Step 1: Adding unassigned lecturer to collaborators fails (R-01) ───────
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/collaborators",
        headers=author_h,
        json={"lecturer_id": str(env["unassigned_lecturer"].id)},
    )
    assert resp.status_code == 400
    assert "not assigned to teach this course" in resp.text

    # ── Step 2: Adding assigned lecturer succeeds ─────────────────────────────
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/collaborators",
        headers=author_h,
        json={"lecturer_id": str(env["co_author"].id), "role": "CO_AUTHOR"},
    )
    assert resp.status_code == 201
    collab_data = resp.json()
    assert collab_data["lecturer_id"] == str(env["co_author"].id)
    assert collab_data["role"] == "CO_AUTHOR"

    # Non-owner cannot add collaborators
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/collaborators",
        headers=co_author_h,
        json={"lecturer_id": str(env["delegate_cs"].id)},
    )
    assert resp.status_code == 403

    # ── Step 3: Co-author can edit draft assessment ───────────────────────────
    resp = await client.put(
        f"/api/v1/assessments/{assessment_id}",
        headers=co_author_h,
        json={"title": "Network Security Final Exam (Co-Authored)"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Network Security Final Exam (Co-Authored)"

    # ── Step 4: Author delegation to wrong department rejected (R-09) ─────────
    now = datetime.now(timezone.utc)
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/delegations",
        headers=author_h,
        json={
            "delegate_id": str(env["delegate_ee"].id),
            "reason": "Traveling for conference",
            "valid_from": now.isoformat(),
            "valid_to": (now + timedelta(days=5)).isoformat(),
        },
    )
    assert resp.status_code == 403
    assert "same department" in resp.text

    # ── Step 5: HOD creates delegation for delegate in same department ─────────
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/delegations",
        headers=hod_cs_h,
        json={
            "delegate_id": str(env["delegate_cs"].id),
            "reason": "Primary author is attending overseas symposium, HOD delegating responsibility",
            "valid_from": (now - timedelta(minutes=5)).isoformat(),
            "valid_to": (now + timedelta(days=7)).isoformat(),
        },
    )
    assert resp.status_code == 201
    delegation_data = resp.json()
    delegation_id = delegation_data["id"]
    assert delegation_data["delegate_id"] == str(env["delegate_cs"].id)
    assert delegation_data["status"] == "ACTIVE"

    # ── Step 6: Active delegate edits assessment draft & audit records delegation_id
    resp = await client.put(
        f"/api/v1/assessments/{assessment_id}",
        headers=delegate_cs_h,
        json={"instructions": "All questions mandatory. Closed book, no notes allowed."},
    )
    assert resp.status_code == 200

    # Delegate cannot edit unrelated assessments
    unrelated_id = str(env["unrelated_assessment"].id)
    resp = await client.put(
        f"/api/v1/assessments/{unrelated_id}",
        headers=delegate_cs_h,
        json={"instructions": "Unauthorized edit attempt"},
    )
    assert resp.status_code == 403

    # ── Step 7: Moderation, approval, and sealing ─────────────────────────────
    # Submit for moderation
    resp = await client.post(f"/api/v1/lecturer/assessments/{assessment_id}/moderation/submit", headers=author_h)
    assert resp.status_code == 201
    round_id = resp.json()["review_id"]

    # Moderator claims and approves
    await client.post(f"/api/v1/moderator/reviews/{round_id}/claim", headers=mod_cs_h)
    resp = await client.post(f"/api/v1/moderator/reviews/{round_id}/approve", headers=mod_cs_h, json={"decision_note": "Approved."})
    assert resp.status_code == 200

    # Exam Officer seals assessment
    resp = await client.post(f"/api/v1/exam-office/assessments/{assessment_id}/seal", headers=eo_h)
    assert resp.status_code == 201
    seal_code = resp.json()["verification_code"]
    assert seal_code is not None

    # Public seal verification passes
    resp = await client.get(f"/api/v1/public/verify-seal/{seal_code}")
    assert resp.status_code == 200
    assert resp.json()["valid"] is True
    assert resp.json()["version_no"] == 1

    # ── Step 8: Post-approval edit by delegate validates reason ───────────────
    # Short reason (< 10 chars) rejected with 422
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/post-approval-edit",
        headers=delegate_cs_h,
        json={"reason": "short", "title": "New Title"},
    )
    assert resp.status_code == 422

    # ── Step 9: Post-approval edit in NOTIFY mode (R-10) ───────────────────────
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/post-approval-edit",
        headers=delegate_cs_h,
        json={
            "reason": "Updated exam title and added calculator permission to instructions.",
            "reprint_required": True,
            "title": "Network Security Final Exam (Official v2)",
            "instructions": "All questions mandatory. Non-programmable calculators allowed.",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Network Security Final Exam (Official v2)"

    # Verify AuditLog records acting_under_delegation_id
    audit_res = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.entity_id == uuid.UUID(assessment_id),
            AuditLog.action == "post_approval_edit",
        )
        .order_by(AuditLog.created_at.desc())
    )
    audit_entry = audit_res.scalars().first()
    assert audit_entry is not None
    assert str(audit_entry.acting_under_delegation_id) == str(delegation_id)

    # ── Step 10: Previous seal is superseded and public verification fails ─────
    resp = await client.get(f"/api/v1/public/verify-seal/{seal_code}")
    assert resp.status_code == 200
    assert resp.json()["valid"] is False
    assert "superseded" in resp.json()["error"]

    # ── Step 11: Version history, structured diff, and IDOR prevention ────────
    # IDOR check: unrelated lecturer cannot access versions or diffs
    resp_idor_v = await client.get(f"/api/v1/lecturer/assessments/{assessment_id}/versions", headers=unassigned_h)
    assert resp_idor_v.status_code == 403
    resp_idor_d = await client.get(f"/api/v1/lecturer/assessments/{assessment_id}/versions/1/diff/2", headers=unassigned_h)
    assert resp_idor_d.status_code == 403
    resp_idor_c = await client.get(f"/api/v1/lecturer/assessments/{assessment_id}/collaborators", headers=unassigned_h)
    assert resp_idor_c.status_code == 403
    resp_idor_del = await client.get(f"/api/v1/lecturer/assessments/{assessment_id}/delegations", headers=unassigned_h)
    assert resp_idor_del.status_code == 403

    # Unversioned direct edit bypass check: normal wizard update rejected with POST_APPROVAL_EDIT_REQUIRED
    resp_bypass = await client.put(
        f"/api/v1/assessments/{assessment_id}",
        headers=author_h,
        json={"title": "Bypass Attempt Title"},
    )
    assert resp_bypass.status_code == 409
    assert resp_bypass.json()["error"]["code"] == "POST_APPROVAL_EDIT_REQUIRED"

    resp = await client.get(f"/api/v1/lecturer/assessments/{assessment_id}/versions", headers=author_h)
    assert resp.status_code == 200
    versions = resp.json()
    assert len(versions) >= 2
    assert versions[0]["version_no"] == 2
    assert versions[1]["version_no"] == 1

    resp = await client.get(f"/api/v1/lecturer/assessments/{assessment_id}/versions/1/diff/2", headers=author_h)
    assert resp.status_code == 200
    diff_data = resp.json()
    assert diff_data["total_changes"] >= 2
    changed_fields = {c["field"] for c in diff_data["changes"]}
    assert "title" in changed_fields
    assert "instructions" in changed_fields

    # ── Step 12: Attempt start blocking (A-10) and ALLOW_WITH_NOTICE ──────────
    # Student starts attempt
    attempt = AssessmentAttempt(
        id=uuid.uuid4(),
        assessment_id=uuid.UUID(assessment_id),
        student_id=env["student"].id,
        status=AttemptStatus.IN_PROGRESS,
        grading_mode=GradingMode.AUTO,
        started_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    await db.commit()

    # Content change (total_marks) is now blocked
    resp = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/post-approval-edit",
        headers=author_h,
        json={
            "reason": "Attempting to change total marks mid-exam",
            "total_marks": 80,
        },
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "EDIT_BLOCKED_ATTEMPTS_STARTED"

    # Cosmetic update under ALLOW_WITH_NOTICE dispatches student notice
    env["policy"].post_start_edit_mode = PostStartEditMode.ALLOW_WITH_NOTICE
    db.add(env["policy"])
    await db.commit()

    resp_notice = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/post-approval-edit",
        headers=author_h,
        json={
            "reason": "Correcting typo in examination instructions",
            "instructions": "All questions are strictly mandatory. Answer carefully.",
            "notice_banner": "Notice: Instructions clarified.",
        },
    )
    assert resp_notice.status_code == 200

    from app.db.models.notification import Notification
    stmt_notif = select(Notification).where(
        Notification.recipient_id == env["student"].id,
        Notification.notification_type == NotificationType.ASSESSMENT_UPDATE_NOTICE,
    )
    res_notif = await db.execute(stmt_notif)
    notif_entry = res_notif.scalars().first()
    assert notif_entry is not None
    assert "Notice: Instructions clarified." in notif_entry.body

    # ── Step 13: REQUIRE_REAPPROVAL policy returns to PENDING_MODERATION ───────
    # Update policy to REQUIRE_REAPPROVAL
    policy = env["policy"]
    policy.post_approval_edit_mode = PostApprovalEditMode.REQUIRE_REAPPROVAL
    db.add(policy)
    # Remove in-progress attempt so edit can be processed
    await db.delete(attempt)
    await db.commit()

    resp = await client.post(
        f"/api/v1/lecturer/assessments/{assessment_id}/post-approval-edit",
        headers=author_h,
        json={
            "reason": "Substantial revision requiring full moderator re-approval",
            "title": "Network Security Final Exam (v3 Re-moderation)",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == AssessmentStatus.PENDING_MODERATION.value
