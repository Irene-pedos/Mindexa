"""
tests/unit/test_phase3_moderation.py

Comprehensive tests for Phase 3: Moderation and Exam Office workflows.
Spec Sections 7 and 3.6:
    - Status state machine transitions (legal and illegal)
    - Automated checklist (MARKS_TOTAL, MARKS_DISTRIBUTION, STRUCTURE, QUESTIONS_COMPLETE, WORDING_AI)
    - Conflict of interest enforcement (A-14)
    - Department scope enforcement for moderators
    - Unlimited review rounds (R-08)
    - Exam office sealing, verification code generation, and QR code embedding
    - Seal revocation and verification failure
    - Tampered content hash verification failure
    - Print job copies math (A-13) and status lifecycle
    - Sealing deadline background check with injected clock (R-09, Spec 7.5)
    - Document generation (moderation form, exam paper with QR, marking scheme)
    - Direct publish for CAT / Formative unaffected (R-04)
    - Publish bypass blocked for SUMMATIVE when requires_moderation=True
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    AssessmentType,
    Duty,
    OverAnswerPolicy,
    SectionKind,
    UserRole,
)
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    PermissionDeniedError,
)
from app.db.base import utcnow
from app.db.enums import (
    AssessmentStatus,
    EnrollmentStatus,
    ModerationCommentCategory,
    ModerationCommentTarget,
    ModerationReviewStatus,
    NotificationType,
    PrintJobStatus,
    QuestionType,
    ScheduleState,
)
from app.db.models.academic import (
    ClassSection,
    Course,
    Department,
    Institution,
    StudentEnrollment,
    TeachingAssignment,
    TeachingWorkspace,
)
from app.db.models.assessment import (
    Assessment,
    AssessmentSection,
    AssessmentTargetSection,
)
from app.db.models.auth import User
from app.db.models.duty import UserDutyAssignment
from app.db.models.moderation import (
    AssessmentSeal,
    AssessmentVersion,
    ExamPrintJob,
    ModerationComment,
    ModerationReview,
)
from app.db.models.policy import ApprovalPolicy
from app.db.models.question import AssessmentQuestion, Question, QuestionOption
from app.services.assessment_service import AssessmentService
from app.services.moderation_checklist_service import (
    ChecklistSeverity,
    ModerationChecklistService,
)
from app.services.moderation_document_service import ModerationDocumentService
from app.services.moderation_service import (
    ModerationService,
    compute_canonical_hash,
    serialize_assessment_content,
)
from app.services.seal_service import SealService
from app.workers.tasks.sealing_deadline import run_check_sealing_deadlines


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURES & HELPERS
# ─────────────────────────────────────────────────────────────────────────────

_COURSE_WORKSPACES: dict[uuid.UUID, uuid.UUID] = {}

async def _setup_institutional_env(db: AsyncSession):
    """Create test hierarchy: institution, departments, lecturers, moderator, exam officer, courses."""
    inst = Institution(
        id=uuid.uuid4(),
        name="Tech University",
        code=f"TU_{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db.add(inst)

    dept_cs = Department(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="Computer Science",
        code=f"CS_{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    dept_math = Department(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="Mathematics",
        code=f"MATH_{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    db.add_all([dept_cs, dept_math])

    admin = User(
        id=uuid.uuid4(),
        email=f"admin_{uuid.uuid4().hex[:6]}@tu.ac",
        hashed_password="hash",
        role=UserRole.ADMIN.value,
        status="ACTIVE",
        email_verified=True,
    )
    # Author Lecturer
    author = User(
        id=uuid.uuid4(),
        email=f"author_{uuid.uuid4().hex[:6]}@tu.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status="ACTIVE",
        email_verified=True,
    )
    # Moderator for CS
    mod_cs = User(
        id=uuid.uuid4(),
        email=f"mod_cs_{uuid.uuid4().hex[:6]}@tu.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status="ACTIVE",
        email_verified=True,
    )
    # Moderator for Math
    mod_math = User(
        id=uuid.uuid4(),
        email=f"mod_math_{uuid.uuid4().hex[:6]}@tu.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status="ACTIVE",
        email_verified=True,
    )
    # Exam Officer
    exam_officer = User(
        id=uuid.uuid4(),
        email=f"eo_{uuid.uuid4().hex[:6]}@tu.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status="ACTIVE",
        email_verified=True,
    )
    db.add_all([admin, author, mod_cs, mod_math, exam_officer])

    now = datetime.now(UTC)
    # Assign duties
    duty_mod_cs = UserDutyAssignment(
        id=uuid.uuid4(),
        user_id=mod_cs.id,
        duty=Duty.MODERATOR,
        institution_id=inst.id,
        department_id=dept_cs.id,
        is_active=True,
        valid_from=now - timedelta(days=1),
        assigned_by_id=admin.id,
    )
    duty_mod_math = UserDutyAssignment(
        id=uuid.uuid4(),
        user_id=mod_math.id,
        duty=Duty.MODERATOR,
        institution_id=inst.id,
        department_id=dept_math.id,
        is_active=True,
        valid_from=now - timedelta(days=1),
        assigned_by_id=admin.id,
    )
    duty_eo = UserDutyAssignment(
        id=uuid.uuid4(),
        user_id=exam_officer.id,
        duty=Duty.EXAM_OFFICER,
        institution_id=inst.id,
        is_active=True,
        valid_from=now - timedelta(days=1),
        assigned_by_id=admin.id,
    )
    db.add_all([duty_mod_cs, duty_mod_math, duty_eo])

    # Policies
    policy_summative = ApprovalPolicy(
        id=uuid.uuid4(),
        institution_id=inst.id,
        assessment_type=AssessmentType.SUMMATIVE,
        requires_moderation=True,
        enforce_structure_template=True,
        summative_total_marks=100,
        sealing_warning_days=3,
        is_active=True,
    )
    policy_cat = ApprovalPolicy(
        id=uuid.uuid4(),
        institution_id=inst.id,
        assessment_type=AssessmentType.CAT,
        requires_moderation=False,
        is_active=True,
    )
    db.add_all([policy_summative, policy_cat])

    # Course
    course_cs = Course(
        id=uuid.uuid4(),
        institution_id=inst.id,
        department_id=dept_cs.id,
        code="CS301",
        name="Operating Systems",
        academic_year="2026-2027",
        credit_hours=3,
    )
    course_math = Course(
        id=uuid.uuid4(),
        institution_id=inst.id,
        department_id=dept_math.id,
        code="MATH201",
        name="Linear Algebra",
        academic_year="2026-2027",
        credit_hours=3,
    )
    db.add_all([course_cs, course_math])
    await db.flush()

    teaching_assignment_cs = TeachingAssignment(
        id=uuid.uuid4(),
        lecturer_id=author.id,
        institution_id=inst.id,
        department_id=dept_cs.id,
        course_id=course_cs.id,
        academic_year="2026-2027",
        is_active=True,
    )
    teaching_assignment_math = TeachingAssignment(
        id=uuid.uuid4(),
        lecturer_id=author.id,
        institution_id=inst.id,
        department_id=dept_math.id,
        course_id=course_math.id,
        academic_year="2026-2027",
        is_active=True,
    )
    db.add_all([teaching_assignment_cs, teaching_assignment_math])
    await db.flush()

    workspace_cs = TeachingWorkspace(
        id=uuid.uuid4(),
        teaching_assignment_id=teaching_assignment_cs.id,
        course_id=course_cs.id,
        title="CS Workspace",
        status="ACTIVE",
    )
    workspace_math = TeachingWorkspace(
        id=uuid.uuid4(),
        teaching_assignment_id=teaching_assignment_math.id,
        course_id=course_math.id,
        title="Math Workspace",
        status="ACTIVE",
    )
    db.add_all([workspace_cs, workspace_math])
    await db.commit()

    _COURSE_WORKSPACES[course_cs.id] = workspace_cs.id
    _COURSE_WORKSPACES[course_math.id] = workspace_math.id

    return {
        "inst": inst,
        "admin": admin,
        "dept_cs": dept_cs,
        "dept_math": dept_math,
        "author": author,
        "mod_cs": mod_cs,
        "mod_math": mod_math,
        "exam_officer": exam_officer,
        "course_cs": course_cs,
        "course_math": course_math,
        "workspace_cs": workspace_cs,
        "workspace_math": workspace_math,
    }


def _build_valid_summative_paper(
    course: Course,
    author: User,
    total_marks: int = 100,
    workspace_id: uuid.UUID | None = None,
) -> tuple[Assessment, list[AssessmentSection], list[AssessmentQuestion]]:
    """Helper to construct a structurally valid 3-section summative assessment (100 marks)."""
    ws_id = workspace_id or _COURSE_WORKSPACES.get(course.id) or uuid.uuid4()
    asmt = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=ws_id,
        title="Final Exam",
        course_id=course.id,
        academic_year="2026-2027",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.DRAFT,
        total_marks=total_marks,
        duration_minutes=120,
        created_by_id=author.id,
        instructions="Read instructions carefully.",
    )

    # Section A: CLOSED, compulsory 40 marks
    sec_a = AssessmentSection(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        title="Section A",
        section_kind=SectionKind.CLOSED,
        questions_to_answer=None,
        order_index=1,
    )
    # Section B: MIXED, choose 2 of 3 questions (15 marks each -> 30 marks)
    sec_b = AssessmentSection(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        title="Section B",
        section_kind=SectionKind.MIXED,
        questions_to_answer=2,
        order_index=2,
    )
    # Section C: OPEN, choose 1 of 2 questions (30 marks each -> 30 marks)
    sec_c = AssessmentSection(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        title="Section C",
        section_kind=SectionKind.OPEN,
        questions_to_answer=1,
        order_index=3,
    )

    sections = [sec_a, sec_b, sec_c]
    aqs = []

    # Section A: 4 questions x 10 marks = 40 marks
    for i in range(4):
        q = Question(
            id=uuid.uuid4(),
            course_id=course.id,
            content=f"Section A MCQ Question #{i+1}",
            question_type=QuestionType.MCQ,
            marks=10,
            created_by_id=author.id,
        )
        opt1 = QuestionOption(id=uuid.uuid4(), question_id=q.id, content="Choice 1", is_correct=True, order_index=1)
        opt2 = QuestionOption(id=uuid.uuid4(), question_id=q.id, content="Choice 2", is_correct=False, order_index=2)
        q.options = [opt1, opt2]
        aq = AssessmentQuestion(
            id=uuid.uuid4(),
            assessment_id=asmt.id,
            question_id=q.id,
            assessment_section_id=sec_a.id,
            order_index=i+1,
        )
        aq.question = q
        aqs.append(aq)

    # Section B: 3 questions x 15 marks = pool size 3, N=2 (effective = 30 marks)
    for i in range(3):
        q = Question(
            id=uuid.uuid4(),
            course_id=course.id,
            content=f"Section B Problem #{i+1}",
            question_type=QuestionType.SHORT_ANSWER,
            marks=15,
            created_by_id=author.id,
        )
        aq = AssessmentQuestion(
            id=uuid.uuid4(),
            assessment_id=asmt.id,
            question_id=q.id,
            assessment_section_id=sec_b.id,
            order_index=i+1,
        )
        aq.question = q
        aqs.append(aq)

    # Section C: 2 questions x 30 marks = pool size 2, N=1 (effective = 30 marks)
    for i in range(2):
        q = Question(
            id=uuid.uuid4(),
            course_id=course.id,
            content=f"Section C Essay #{i+1}",
            question_type=QuestionType.ESSAY,
            marks=30,
            created_by_id=author.id,
        )
        aq = AssessmentQuestion(
            id=uuid.uuid4(),
            assessment_id=asmt.id,
            question_id=q.id,
            assessment_section_id=sec_c.id,
            order_index=i+1,
        )
        aq.question = q
        aqs.append(aq)

    asmt.sections = sections
    asmt.assessment_questions = aqs
    asmt.course = course
    return asmt, sections, aqs


# ─────────────────────────────────────────────────────────────────────────────
# TESTS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_checklist_validation_marks_and_structure(db: AsyncSession):
    """Test automated pre-moderation checklist with matching marks and structure."""
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])

    result = await ModerationChecklistService.run(asmt, policy_total=100)
    assert not result.has_blocking_failures
    assert any(it.code == "MARKS_TOTAL" and it.passed for it in result.items)
    assert any(it.code == "MARKS_DISTRIBUTION" and it.passed for it in result.items)
    assert any(it.code == "QUESTIONS_COMPLETE" and it.passed for it in result.items)


@pytest.mark.asyncio
async def test_checklist_fails_on_unequal_choice_pool_marks(db: AsyncSession):
    """Test checklist fails with blocking issue if questions in choice pool have differing marks."""
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])

    # Modify one question in Section B to have 20 marks instead of 15
    sec_b_aqs = [aq for aq in aqs if aq.assessment_section_id == secs[1].id]
    sec_b_aqs[0].question.marks = 20

    result = await ModerationChecklistService.run(asmt, policy_total=100)
    assert result.has_blocking_failures
    dist_item = next(it for it in result.items if it.code == "MARKS_DISTRIBUTION")
    assert not dist_item.passed
    assert "equal marks" in dist_item.message.lower()


@pytest.mark.asyncio
async def test_full_summative_moderation_and_exam_office_lifecycle(db: AsyncSession):
    """
    End-to-end integration test of the full summative workflow:
    DRAFT -> submit -> PENDING_MODERATION
    claim by moderator
    request changes -> CHANGES_REQUESTED
    author resolves comment
    resubmit -> PENDING_MODERATION
    approve -> APPROVED
    exam officer seals -> SEALED + print job created
    publish -> PUBLISHED
    """
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    mod_svc = ModerationService(db)
    seal_svc = SealService(db)
    asmt_svc = AssessmentService(db)

    # 1. Author submits for moderation
    review, chk = await mod_svc.submit_for_moderation(asmt.id, env["author"])
    assert review.status == ModerationReviewStatus.OPEN
    assert review.round_no == 1
    assert asmt.status == AssessmentStatus.PENDING_MODERATION

    # Verify version snapshot created
    v1 = await mod_svc.repo.get_latest_version(asmt.id)
    assert v1 is not None
    assert v1.version_no == 1
    assert v1.content_hash

    # 2. Moderator claims review
    claimed = await mod_svc.claim_review(review.id, env["mod_cs"])
    assert claimed.reviewer_id == env["mod_cs"].id

    # 3. Moderator adds comment
    comment = await mod_svc.add_comment(
        review_id=review.id,
        current_user=env["mod_cs"],
        target_type=ModerationCommentTarget.QUESTION,
        target_id=aqs[0].id,
        category=ModerationCommentCategory.WORDING,
        comment="Please clarify the stem of Question 1.",
    )
    assert not comment.resolved

    # 4. Moderator requests changes
    decided_round1 = await mod_svc.request_changes(
        review_id=review.id,
        current_user=env["mod_cs"],
        decision_note="Wording adjustments needed on Question 1.",
    )
    assert decided_round1.status == ModerationReviewStatus.CHANGES_REQUESTED
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.CHANGES_REQUESTED

    # 5. Author resolves comment
    resolved_comment = await mod_svc.resolve_comment(comment.id, env["author"])
    assert resolved_comment.resolved

    # 6. Author resubmits
    r2_review, r2_chk = await mod_svc.resubmit_for_moderation(
        assessment_id=asmt.id,
        current_user=env["author"],
        reason="Updated Question 1 stem wording",
    )
    assert r2_review.round_no == 2
    assert r2_review.status == ModerationReviewStatus.OPEN
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.PENDING_MODERATION

    # Version 2 created
    v2 = await mod_svc.repo.get_latest_version(asmt.id)
    assert v2.version_no == 2

    # 7. Moderator claims and approves Round 2
    await mod_svc.claim_review(r2_review.id, env["mod_cs"])
    approved_review = await mod_svc.approve_review(
        review_id=r2_review.id,
        current_user=env["mod_cs"],
        decision_note="All questions clear and verified.",
    )
    assert approved_review.status == ModerationReviewStatus.APPROVED
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.APPROVED

    # 8. Exam Officer seals the assessment
    seal, print_job = await seal_svc.seal_assessment(
        assessment_id=asmt.id,
        current_user=env["exam_officer"],
        spare_percent=5,
        notes="First batch printing",
    )
    assert seal.verification_code.startswith("SEAL-")
    assert print_job.status == PrintJobStatus.REQUESTED
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.SEALED

    # 9. Verify seal public check works
    verify_res = await seal_svc.verify_seal(seal.verification_code)
    assert verify_res["valid"] is True
    assert verify_res["assessment_title"] == "Final Exam"
    assert verify_res["course_code"] == "CS301"

    # 10. Author publishes from SEALED
    fin_res = await asmt_svc.finalize_assessment(asmt.id, env["author"])
    assert fin_res.validation_passed is True
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.PUBLISHED


@pytest.mark.asyncio
async def test_publish_without_seal_blocked_for_summative(db: AsyncSession):
    """
    Test that publishing directly from DRAFT or APPROVED without SEALED
    is blocked for SUMMATIVE when requires_moderation=True.
    """
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    asmt_svc = AssessmentService(db)

    # Attempt to publish from DRAFT directly
    fin_draft = await asmt_svc.finalize_assessment(asmt.id, env["author"])
    assert fin_draft.validation_passed is False
    assert any("requires moderation approval and an active exam office seal" in err for err in fin_draft.errors)


@pytest.mark.asyncio
async def test_cat_publishes_directly_without_moderation(db: AsyncSession):
    """
    Rule R-04: CAT / formative has no approval path and publishes directly from DRAFT.
    """
    env = await _setup_institutional_env(db)
    # Create CAT assessment
    asmt = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=env["workspace_cs"].id,
        title="CAT 1",
        course_id=env["course_cs"].id,
        academic_year="2026-2027",
        assessment_type=AssessmentType.CAT,
        status=AssessmentStatus.DRAFT,
        total_marks=20,
        created_by_id=env["author"].id,
    )
    sec = AssessmentSection(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        title="Section 1",
        section_kind=SectionKind.MIXED,
        order_index=1,
    )
    q = Question(
        id=uuid.uuid4(),
        course_id=env["course_cs"].id,
        content="Short answer question",
        question_type=QuestionType.SHORT_ANSWER,
        marks=20,
        created_by_id=env["author"].id,
    )
    aq = AssessmentQuestion(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        question_id=q.id,
        assessment_section_id=sec.id,
        order_index=1,
    )
    aq.question = q

    db.add_all([asmt, sec, q, aq])
    await db.commit()

    asmt_svc = AssessmentService(db)
    fin_res = await asmt_svc.finalize_assessment(asmt.id, env["author"])
    assert fin_res.validation_passed is True
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.PUBLISHED


@pytest.mark.asyncio
async def test_moderator_conflict_of_interest_rejected(db: AsyncSession):
    """
    Rule A-14: A moderator cannot moderate an assessment they authored or co-authored.
    """
    env = await _setup_institutional_env(db)
    # Give the author moderator duty as well
    author_mod_duty = UserDutyAssignment(
        id=uuid.uuid4(),
        user_id=env["author"].id,
        duty=Duty.MODERATOR,
        institution_id=env["inst"].id,
        department_id=env["dept_cs"].id,
        is_active=True,
        valid_from=datetime.now(UTC) - timedelta(days=1),
        assigned_by_id=env["admin"].id,
    )
    db.add(author_mod_duty)
    await db.commit()

    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    mod_svc = ModerationService(db)
    review, chk = await mod_svc.submit_for_moderation(asmt.id, env["author"])

    # Author tries to claim their own assessment review
    with pytest.raises(PermissionDeniedError, match="Conflict of Interest"):
        await mod_svc.claim_review(review.id, env["author"])


@pytest.mark.asyncio
async def test_cross_department_moderator_denied(db: AsyncSession):
    """Moderator from Mathematics cannot claim or moderate a Computer Science assessment."""
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    mod_svc = ModerationService(db)
    review, chk = await mod_svc.submit_for_moderation(asmt.id, env["author"])

    # Math moderator tries to claim CS assessment
    with pytest.raises(PermissionDeniedError, match="not an active moderator for department"):
        await mod_svc.claim_review(review.id, env["mod_math"])


@pytest.mark.asyncio
async def test_unlimited_moderation_rounds(db: AsyncSession):
    """Rule R-08: No limit on moderation rounds. Verify 5 consecutive rounds."""
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    mod_svc = ModerationService(db)

    # Initial submission (Round 1)
    rev, chk = await mod_svc.submit_for_moderation(asmt.id, env["author"])
    assert rev.round_no == 1

    # Cycle through 4 revision rounds
    for r in range(1, 5):
        await mod_svc.claim_review(rev.id, env["mod_cs"])
        c = await mod_svc.add_comment(
            review_id=rev.id,
            current_user=env["mod_cs"],
            target_type=ModerationCommentTarget.ASSESSMENT,
            target_id=asmt.id,
            category=ModerationCommentCategory.OTHER,
            comment=f"Round {r} revision request",
        )
        await mod_svc.request_changes(rev.id, env["mod_cs"], f"Fix items for round {r}")
        await mod_svc.resolve_comment(c.id, env["author"])
        rev, chk = await mod_svc.resubmit_for_moderation(
            asmt.id, env["author"], reason=f"Fixed for round {r}"
        )
        assert rev.round_no == r + 1

    # Final approval at Round 5
    await mod_svc.claim_review(rev.id, env["mod_cs"])
    approved = await mod_svc.approve_review(rev.id, env["mod_cs"], "Approved on round 5")
    assert approved.status == ModerationReviewStatus.APPROVED


@pytest.mark.asyncio
async def test_seal_revocation_and_verification_failure(db: AsyncSession):
    """Test that a revoked seal fails verification with revocation reason."""
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    asmt.status = AssessmentStatus.APPROVED
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    seal_svc = SealService(db)
    seal, job = await seal_svc.seal_assessment(asmt.id, env["exam_officer"])

    # Revoke seal
    revoked = await seal_svc.revoke_seal(asmt.id, env["exam_officer"], "Discovered question error")
    assert revoked.revoked_at is not None

    # Public verification should now fail
    res = await seal_svc.verify_seal(seal.verification_code)
    assert res["valid"] is False
    assert "revoked" in res["error"].lower()


@pytest.mark.asyncio
async def test_tampered_content_hash_fails_verification(db: AsyncSession):
    """Test that if the stored version hash no longer matches the seal hash, verification fails."""
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    asmt.status = AssessmentStatus.APPROVED
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    seal_svc = SealService(db)
    seal, job = await seal_svc.seal_assessment(asmt.id, env["exam_officer"])

    # Manually alter the version's content_hash to simulate content tampering
    v = await db.get(AssessmentVersion, seal.version_id)
    v.content_hash = "0" * 64
    await db.commit()

    res = await seal_svc.verify_seal(seal.verification_code)
    assert res["valid"] is False
    assert "integrity check failed" in res["error"].lower()


@pytest.mark.asyncio
async def test_print_copies_calculation_with_spares(db: AsyncSession):
    """
    Test print job spare percent calculation (Rule A-13).
    Formula: copies_total = enrolled_count + ceil(enrolled_count * spare_percent / 100)
    """
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    asmt.status = AssessmentStatus.APPROVED
    db.add(asmt)

    # Create class section
    sec = ClassSection(
        id=uuid.uuid4(),
        department_id=env["dept_cs"].id,
        name="CS Year 3 Section A",
        academic_year="2026-2027",
    )
    db.add(sec)
    await db.flush()

    # Create target section
    t_sec = AssessmentTargetSection(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        class_section_id=sec.id,
        added_by_id=env["author"].id,
    )
    db.add(t_sec)

    # Create and enroll 42 active students in this section
    students = [
        User(
            id=uuid.uuid4(),
            email=f"s_{i}_{uuid.uuid4().hex[:6]}@tu.ac",
            hashed_password="hash",
            role=UserRole.STUDENT.value,
            status="ACTIVE",
            email_verified=True,
        )
        for i in range(42)
    ]
    db.add_all(students)
    await db.flush()

    for s in students:
        enr = StudentEnrollment(
            id=uuid.uuid4(),
            student_id=s.id,
            class_section_id=sec.id,
            enrollment_status=EnrollmentStatus.ACTIVE,
        )
        db.add(enr)
    await db.commit()

    seal_svc = SealService(db)
    seal, job = await seal_svc.seal_assessment(asmt.id, env["exam_officer"], spare_percent=5)

    # 42 + ceil(42 * 0.05) = 42 + ceil(2.1) = 42 + 3 = 45 copies
    assert job.enrolled_count == 42
    assert job.spare_percent == 5
    assert job.copies_total == 45


@pytest.mark.asyncio
async def test_sealing_deadline_task_with_injected_clock(db: AsyncSession):
    """
    Test periodic sealing deadline check (R-09, Spec 7.5) using injected clock:
    - 2 days before window_start with warning_days=3 -> AT_RISK
    - at or after window_start -> SHIFT_REQUIRED
    """
    env = await _setup_institutional_env(db)
    base_time = datetime(2026, 11, 10, 10, 0, tzinfo=UTC)

    # Assessment 1: starts in 2 days (policy warning is 3 days) -> should become AT_RISK
    asmt_at_risk, _, _ = _build_valid_summative_paper(env["course_cs"], env["author"])
    asmt_at_risk.window_start = base_time + timedelta(days=2)
    asmt_at_risk.schedule_state = ScheduleState.ON_TRACK

    # Assessment 2: started 1 hour ago -> should become SHIFT_REQUIRED
    asmt_shift, _, _ = _build_valid_summative_paper(env["course_cs"], env["author"])
    asmt_shift.window_start = base_time - timedelta(hours=1)
    asmt_shift.schedule_state = ScheduleState.ON_TRACK

    db.add_all([asmt_at_risk, asmt_shift])
    await db.commit()

    res = await run_check_sealing_deadlines(db, now=base_time)
    assert res["updated_at_risk"] >= 1
    assert res["updated_shift_required"] >= 1

    await db.refresh(asmt_at_risk)
    await db.refresh(asmt_shift)
    assert asmt_at_risk.schedule_state == ScheduleState.AT_RISK
    assert asmt_shift.schedule_state == ScheduleState.SHIFT_REQUIRED


@pytest.mark.asyncio
async def test_document_generation_moderation_form_paper_and_scheme(db: AsyncSession):
    """
    Verify DOCX generation for moderation form, exam paper (with QR), and marking scheme.
    """
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    asmt.status = AssessmentStatus.APPROVED
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    seal_svc = SealService(db)
    seal, job = await seal_svc.seal_assessment(asmt.id, env["exam_officer"])

    review = ModerationReview(
        id=uuid.uuid4(),
        assessment_id=asmt.id,
        round_no=1,
        status=ModerationReviewStatus.APPROVED,
        checklist_result={"items": [{"code": "MARKS_TOTAL", "passed": True, "severity": "BLOCKING"}]},
        decision_note="All clear.",
        decided_at=datetime.now(UTC),
    )

    # 1. Moderation Form
    mod_doc_bytes = ModerationDocumentService.generate_moderation_form(
        assessment=asmt, review=review, moderator_name="Dr. Moderator"
    )
    assert len(mod_doc_bytes) > 1000
    assert mod_doc_bytes[:4] == b"PK\x03\x04"  # Standard ZIP/DOCX header

    # 2. Exam Paper with Seal and QR code
    paper_bytes = ModerationDocumentService.generate_exam_paper(
        assessment=asmt, seal=seal
    )
    assert len(paper_bytes) > 1000
    assert paper_bytes[:4] == b"PK\x03\x04"

    # 3. Marking Scheme
    scheme_bytes = ModerationDocumentService.generate_marking_scheme(
        assessment=asmt
    )
    assert len(scheme_bytes) > 1000
    assert scheme_bytes[:4] == b"PK\x03\x04"


@pytest.mark.asyncio
async def test_unclaimed_review_cannot_be_decided(db: AsyncSession):
    """
    Verify that an unclaimed review (reviewer_id=None) cannot be approved
    or have changes requested without being claimed first.
    """
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    mod_svc = ModerationService(db)
    review, chk = await mod_svc.submit_for_moderation(asmt.id, env["author"])
    assert review.reviewer_id is None

    # Attempting to approve an unclaimed review must be rejected
    with pytest.raises(BadRequestError, match="Review must be claimed"):
        await mod_svc.approve_review(review.id, env["mod_cs"])

    # Attempting to request changes on an unclaimed review must be rejected
    with pytest.raises(BadRequestError, match="Review must be claimed"):
        await mod_svc.request_changes(review.id, env["mod_cs"], decision_note="Fix section C")


@pytest.mark.asyncio
async def test_cross_institution_exam_officer_denied(db: AsyncSession):
    """
    Verify that an Exam Officer from Institution B cannot update print jobs
    or download exam documents belonging to Institution A.
    """
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    asmt.status = AssessmentStatus.APPROVED
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    seal_svc = SealService(db)
    seal, job = await seal_svc.seal_assessment(asmt.id, env["exam_officer"])

    # Create Institution B and Exam Officer for Institution B
    from app.db.models.academic import Institution
    inst_b = Institution(name="External University", code=f"EXT_{uuid.uuid4().hex[:6]}")
    db.add(inst_b)
    await db.flush()

    eo_b = User(
        id=uuid.uuid4(),
        email=f"eo_b_{uuid.uuid4().hex[:6]}@external.edu",
        role="lecturer",
        is_active=True,
        hashed_password="hash",
    )
    db.add(eo_b)
    await db.flush()

    duty_eo_b = UserDutyAssignment(
        user_id=eo_b.id,
        duty=Duty.EXAM_OFFICER,
        institution_id=inst_b.id,
        is_active=True,
        assigned_by_id=env["admin"].id,
    )
    db.add(duty_eo_b)
    await db.commit()

    # Exam Officer B must be denied print job update on Institution A's print job
    with pytest.raises(PermissionDeniedError, match="Action requires active EXAM_OFFICER duty"):
        await seal_svc.update_print_job(job.id, eo_b, PrintJobStatus.PRINTED)

    # Exam Officer B must be denied downloading Institution A's exam paper
    with pytest.raises(PermissionDeniedError, match="Unauthorized to download assessment documents"):
        await seal_svc.get_document(asmt.id, "paper", eo_b)


@pytest.mark.asyncio
async def test_post_seal_content_tampering_fails_verification(db: AsyncSession):
    """
    Verify that modifying assessment questions or content after sealing
    causes public seal verification to fail due to content hash mismatch.
    """
    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    asmt.status = AssessmentStatus.APPROVED
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    seal_svc = SealService(db)
    seal, job = await seal_svc.seal_assessment(asmt.id, env["exam_officer"])

    # Initially seal verification passes
    initial_ver = await seal_svc.verify_seal(seal.verification_code)
    assert initial_ver["valid"] is True

    # Tamper with question content in DB after sealing
    first_aq = aqs[0]
    first_aq.question.content = "TAMPERED: Altered question text after exam sealing."
    db.add(first_aq.question)
    await db.commit()

    # Seal verification must now detect content mismatch
    tampered_ver = await seal_svc.verify_seal(seal.verification_code)
    assert tampered_ver["valid"] is False
    assert "Assessment content has been modified since it was sealed" in tampered_ver["error"]


@pytest.mark.asyncio
async def test_window_rescheduling_resets_schedule_state(db: AsyncSession):
    """
    Verify that an assessment placed in SHIFT_REQUIRED or AT_RISK resets
    back to ON_TRACK when its window is rescheduled into the future.
    """
    from app.services.assessment_service import AssessmentService
    from app.schemas.assessment import AssessmentGeneralUpdate
    from app.workers.tasks.sealing_deadline import run_check_sealing_deadlines

    env = await _setup_institutional_env(db)
    now = datetime.now(UTC)

    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    asmt.status = AssessmentStatus.DRAFT
    asmt.window_start = now - timedelta(hours=1)
    asmt.window_end = now + timedelta(hours=2)
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    # Run deadline check: window has started without seal -> SHIFT_REQUIRED
    res1 = await run_check_sealing_deadlines(db, now=now)
    assert res1["updated_shift_required"] >= 1

    await db.refresh(asmt)
    assert asmt.schedule_state == ScheduleState.SHIFT_REQUIRED

    # Lecturer reschedules window to 7 days in future
    future_start = now + timedelta(days=7)
    future_end = now + timedelta(days=7, hours=3)
    asmt_svc = AssessmentService(db)
    await asmt_svc.update_wizard_step(
        assessment_id=asmt.id,
        current_user=env["author"],
        step=1,
        data=AssessmentGeneralUpdate(window_start=future_start, window_end=future_end),
    )

    await db.refresh(asmt)
    assert asmt.schedule_state == ScheduleState.ON_TRACK


@pytest.mark.asyncio
async def test_ai_wording_review_execution_and_skip(db: AsyncSession):
    """
    Verify that WORDING_AI checklist runs through AIGateway when providers exist,
    and returns an honest skipped status when no providers are configured.
    """
    from unittest.mock import AsyncMock, patch
    from app.services.moderation_checklist_service import ModerationChecklistService
    from app.core.ai.providers import AICompletionResponse

    env = await _setup_institutional_env(db)
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    await db.commit()

    # Case 1: No providers available -> skipped honestly
    with patch("app.core.ai.provider_factory.get_ai_providers", return_value=[]):
        chk_item = await ModerationChecklistService._run_ai_wording_review(asmt, db, run_ai_review=True)
        assert chk_item.code == "WORDING_AI"
        assert chk_item.passed is True
        assert chk_item.details["status"] == "skipped"
        assert chk_item.details["reason"] == "no_providers"

    # Case 2: Providers present -> completes through gateway
    mock_provider = AsyncMock()
    mock_provider.name = "groq"
    mock_resp = AICompletionResponse(
        content="Clarity is sound. Minor suggestion: clarify question 2 prompt.",
        provider="groq",
        model="gpt-mock",
        prompt_tokens=100,
        completion_tokens=20,
        total_tokens=120,
    )

    with patch("app.core.ai.provider_factory.get_ai_providers", return_value=[mock_provider]):
        with patch("app.core.ai.gateway.AIGateway.complete", new_callable=AsyncMock) as mock_complete:
            mock_complete.return_value = mock_resp
            chk_item = await ModerationChecklistService._run_ai_wording_review(asmt, db, run_ai_review=True)
            assert chk_item.code == "WORDING_AI"
            assert chk_item.passed is True
            assert chk_item.details["status"] == "completed"
            assert "Clarity is sound" in chk_item.details["feedback"]
            mock_complete.assert_called_once()


@pytest.mark.asyncio
async def test_public_seal_verification_rate_limiting_tier():
    """
    Test H-01: Public seal verification endpoints are routed to 'verify_seal' tier
    with limit 20 per minute.
    """
    from app.middleware.rate_limit import (
        _resolve_tier,
        _limit_for_tier,
        _check_in_memory_rate_limit,
    )
    from app.core.config import settings

    # 1. Tier resolution
    assert _resolve_tier("/api/v1/public/verify-seal/SEAL-ABC123XYZ") == "verify_seal"
    assert _resolve_tier("/public/verify-seal/SEAL-ABC123XYZ") == "verify_seal"
    assert _resolve_tier("/api/v1/assessments/verify/SEAL-ABC123XYZ") == "verify_seal"
    assert _resolve_tier("/assessments/verify/SEAL-ABC123XYZ") == "verify_seal"

    # 2. Limit resolution
    limit = _limit_for_tier("verify_seal")
    assert limit == 20
    assert limit == settings.RATE_LIMIT_VERIFY_SEAL_PER_MINUTE

    # 3. Rate limiting enforcement
    test_ip = f"198.51.100.{uuid.uuid4().hex[:4]}"
    for _ in range(20):
        count, remaining = await _check_in_memory_rate_limit(
            ip=test_ip, tier="verify_seal", limit=20, window_seconds=60
        )
    assert count == 20

    # 21st request exceeds the limit
    count, remaining = await _check_in_memory_rate_limit(
        ip=test_ip, tier="verify_seal", limit=20, window_seconds=60
    )
    assert count > 20


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN HAS NO IMPLICIT MODERATION / EXAM-OFFICE POWERS (spec §13.1)
# CONFLICT OF INTEREST COVERS COLLABORATORS AND DELEGATES (A-14)
# ─────────────────────────────────────────────────────────────────────────────


def _add_paper(db: AsyncSession, env: dict, status: AssessmentStatus | None = None) -> Assessment:
    asmt, secs, aqs = _build_valid_summative_paper(env["course_cs"], env["author"])
    if status is not None:
        asmt.status = status
    db.add(asmt)
    for s in secs:
        db.add(s)
    for aq in aqs:
        db.add(aq.question)
        for opt in (aq.question.options or []):
            db.add(opt)
        db.add(aq)
    return asmt


async def _submitted_cs_review(db: AsyncSession, env: dict) -> tuple[Assessment, ModerationReview]:
    asmt = _add_paper(db, env)
    await db.commit()
    review, _ = await ModerationService(db).submit_for_moderation(asmt.id, env["author"])
    return asmt, review


@pytest.mark.asyncio
async def test_admin_without_duty_cannot_claim_review(db: AsyncSession):
    env = await _setup_institutional_env(db)
    _, review = await _submitted_cs_review(db, env)

    with pytest.raises(PermissionDeniedError, match="not an active moderator"):
        await ModerationService(db).claim_review(review.id, env["admin"])


@pytest.mark.asyncio
async def test_admin_cannot_decide_review_claimed_by_moderator(db: AsyncSession):
    env = await _setup_institutional_env(db)
    _, review = await _submitted_cs_review(db, env)
    mod_svc = ModerationService(db)
    await mod_svc.claim_review(review.id, env["mod_cs"])

    with pytest.raises(PermissionDeniedError, match="Only the claiming reviewer"):
        await mod_svc.approve_review(
            review_id=review.id, current_user=env["admin"], decision_note="override"
        )


@pytest.mark.asyncio
async def test_admin_cannot_submit_for_moderation(db: AsyncSession):
    env = await _setup_institutional_env(db)
    asmt = _add_paper(db, env)
    await db.commit()

    with pytest.raises(PermissionDeniedError, match="Only the author"):
        await ModerationService(db).submit_for_moderation(asmt.id, env["admin"])


@pytest.mark.asyncio
async def test_admin_without_exam_officer_duty_cannot_seal_or_download(db: AsyncSession):
    env = await _setup_institutional_env(db)
    asmt = _add_paper(db, env, AssessmentStatus.APPROVED)
    await db.commit()

    seal_svc = SealService(db)
    with pytest.raises(PermissionDeniedError, match="EXAM_OFFICER"):
        await seal_svc.seal_assessment(asmt.id, env["admin"])
    with pytest.raises(PermissionDeniedError, match="Unauthorized to download"):
        await seal_svc.get_document(asmt.id, "paper", env["admin"])


@pytest.mark.asyncio
async def test_admin_with_exam_officer_duty_can_seal(db: AsyncSession):
    env = await _setup_institutional_env(db)
    db.add(
        UserDutyAssignment(
            user_id=env["admin"].id,
            duty=Duty.EXAM_OFFICER,
            institution_id=env["inst"].id,
            is_active=True,
            valid_from=datetime.now(UTC) - timedelta(days=1),
            assigned_by_id=env["admin"].id,
        )
    )
    asmt = _add_paper(db, env, AssessmentStatus.APPROVED)
    await db.commit()

    seal, _ = await SealService(db).seal_assessment(asmt.id, env["admin"])
    assert seal.verification_code


@pytest.mark.asyncio
async def test_collaborator_moderator_conflict_of_interest(db: AsyncSession):
    from app.db.models.authoring import AssessmentCollaborator

    env = await _setup_institutional_env(db)
    asmt, review = await _submitted_cs_review(db, env)
    db.add(
        AssessmentCollaborator(
            assessment_id=asmt.id,
            lecturer_id=env["mod_cs"].id,
            added_by_id=env["author"].id,
            is_active=True,
        )
    )
    await db.commit()

    with pytest.raises(PermissionDeniedError, match="Conflict of Interest"):
        await ModerationService(db).claim_review(review.id, env["mod_cs"])


@pytest.mark.asyncio
async def test_delegate_moderator_conflict_of_interest(db: AsyncSession):
    from app.db.enums import DelegationStatus
    from app.db.models.authoring import AuthorDelegation

    env = await _setup_institutional_env(db)
    asmt, review = await _submitted_cs_review(db, env)
    now = datetime.now(UTC)
    db.add(
        AuthorDelegation(
            assessment_id=asmt.id,
            delegator_id=env["author"].id,
            delegate_id=env["mod_cs"].id,
            created_by_id=env["author"].id,
            reason="Author on leave",
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=7),
            status=DelegationStatus.ACTIVE,
        )
    )
    await db.commit()

    with pytest.raises(PermissionDeniedError, match="Conflict of Interest"):
        await ModerationService(db).claim_review(review.id, env["mod_cs"])


@pytest.mark.asyncio
async def test_collaborator_can_resolve_comment_but_outsider_cannot(db: AsyncSession):
    """Anyone allowed to resubmit (author, collaborator, delegate) can resolve comments."""
    from app.db.models.authoring import AssessmentCollaborator

    env = await _setup_institutional_env(db)
    asmt, review = await _submitted_cs_review(db, env)
    mod_svc = ModerationService(db)
    await mod_svc.claim_review(review.id, env["mod_cs"])
    comment = await mod_svc.add_comment(
        review_id=review.id,
        current_user=env["mod_cs"],
        target_type=ModerationCommentTarget.ASSESSMENT,
        target_id=None,
        category=ModerationCommentCategory.WORDING,
        comment="Clarify the instructions.",
    )

    # Exam officer is unrelated to the paper
    with pytest.raises(PermissionDeniedError, match="Only the author"):
        await mod_svc.resolve_comment(comment.id, env["exam_officer"])

    db.add(
        AssessmentCollaborator(
            assessment_id=asmt.id,
            lecturer_id=env["mod_math"].id,
            added_by_id=env["author"].id,
            is_active=True,
        )
    )
    await db.commit()

    resolved = await mod_svc.resolve_comment(comment.id, env["mod_math"])
    assert resolved.resolved is True


@pytest.mark.asyncio
async def test_conflict_of_interest_rechecked_at_approval(db: AsyncSession):
    """A moderator added as collaborator after claiming may no longer approve."""
    from app.db.models.authoring import AssessmentCollaborator

    env = await _setup_institutional_env(db)
    asmt, review = await _submitted_cs_review(db, env)
    mod_svc = ModerationService(db)
    await mod_svc.claim_review(review.id, env["mod_cs"])

    db.add(
        AssessmentCollaborator(
            assessment_id=asmt.id,
            lecturer_id=env["mod_cs"].id,
            added_by_id=env["author"].id,
            is_active=True,
        )
    )
    await db.commit()

    with pytest.raises(PermissionDeniedError, match="Conflict of Interest"):
        await mod_svc.approve_review(
            review_id=review.id, current_user=env["mod_cs"], decision_note="Looks good"
        )


@pytest.mark.asyncio
async def test_request_changes_with_note_only_reaches_the_author(db: AsyncSession):
    """A moderator who writes feedback only in the decision note must not be rejected,
    and the author must be told what to change (status, notification and a comment)."""
    from app.db.enums import NotificationType
    from app.db.models.notification import Notification

    env = await _setup_institutional_env(db)
    asmt, review = await _submitted_cs_review(db, env)
    mod_svc = ModerationService(db)
    await mod_svc.claim_review(review.id, env["mod_cs"])

    asmt.draft_is_complete = True  # as left by finalizing the paper before submission
    await db.commit()

    note = "Section A must be closed questions only, and add Sections B and C."
    decided = await mod_svc.request_changes(review.id, env["mod_cs"], decision_note=note)

    assert decided.status == ModerationReviewStatus.CHANGES_REQUESTED
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.CHANGES_REQUESTED
    assert asmt.draft_is_complete is False  # editing tools reopen with the status

    db.expire(review, ["comments"])  # the author reads this in a fresh request, not the moderator's session
    overview = await mod_svc.get_moderation_overview(asmt.id, env["author"])
    comments = [c for r in overview["rounds"] for c in r["comments"]]
    assert [c["comment"] for c in comments] == [note]

    notices = (
        await db.execute(
            select(Notification).where(
                Notification.recipient_id == env["author"].id,
                Notification.notification_type == NotificationType.MODERATION_CHANGES_REQUESTED,
            )
        )
    ).scalars().all()
    assert len(notices) == 1
    assert note[:40] in notices[0].body


@pytest.mark.asyncio
async def test_request_changes_without_any_feedback_is_rejected(db: AsyncSession):
    env = await _setup_institutional_env(db)
    _, review = await _submitted_cs_review(db, env)
    mod_svc = ModerationService(db)
    await mod_svc.claim_review(review.id, env["mod_cs"])

    with pytest.raises(BadRequestError, match="Explain what must change"):
        await mod_svc.request_changes(review.id, env["mod_cs"], decision_note="   ")


@pytest.mark.asyncio
async def test_claiming_a_review_notifies_the_author(db: AsyncSession):
    from app.db.enums import NotificationType
    from app.db.models.notification import Notification

    env = await _setup_institutional_env(db)
    asmt, review = await _submitted_cs_review(db, env)
    await ModerationService(db).claim_review(review.id, env["mod_cs"])

    notices = (
        await db.execute(
            select(Notification).where(
                Notification.recipient_id == env["author"].id,
                Notification.notification_type == NotificationType.MODERATION_STARTED,
            )
        )
    ).scalars().all()
    assert len(notices) == 1
    assert notices[0].reference_id == asmt.id


@pytest.mark.asyncio
async def test_failing_notification_never_rolls_back_the_decision(db: AsyncSession, monkeypatch):
    """A rejected notification used to abort the whole 'request changes' transaction."""
    env = await _setup_institutional_env(db)
    asmt, review = await _submitted_cs_review(db, env)
    mod_svc = ModerationService(db)
    await mod_svc.claim_review(review.id, env["mod_cs"])

    async def broken_create(**_kwargs):
        raise RuntimeError('invalid input value for enum notificationtype: "MODERATION_CHANGES_REQUESTED"')

    monkeypatch.setattr(mod_svc.notification_repo, "create", broken_create)

    decided = await mod_svc.request_changes(review.id, env["mod_cs"], decision_note="Fix section A.")

    assert decided.status == ModerationReviewStatus.CHANGES_REQUESTED
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.CHANGES_REQUESTED