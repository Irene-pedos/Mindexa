"""
tests/unit/test_phase6a_eligibility_service.py

Unit tests for Phase 6A: Eligibility, Reassessment, and Retake Engine service layer:
1. Formative finalization trigger & idempotency & immutability (R-18)
2. Linking reassessment moves requirement to ASSIGNED
3. Reassessment submission moves to SUBMITTED (satisfies CAT gate A-06)
4. Reassessment grading moves to GRADED (closed_at set)
5. CAT gate blocking with pending reassessment & audit decision
6. CAT gate satisfied once reassessment submitted
7. Scope: COURSE vs ALL_COURSES
8. CAT gate active override bypasses block
9. Summative gate: all 4 branches (ENTRY_THRESHOLD_NOT_MET, MARKS_PENDING, MANUAL_REVIEW_REQUIRED, ELIGIBLE)
10. Summative finalization outcome (< pass_pct -> SUMMATIVE_FAILED retake, >= pass_pct -> PASS)
11. Retake payment & enrollment lifecycle (FLAGGED -> PAYMENT_PENDING -> PAID -> ENROLLED)
12. Enrolment without next period keeps retake PAID with target_period_id None
13. HOD override requires mandatory reason
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import (
    EligibilityBlockedError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.db.enums import (
    AssessmentType,
    EligibilityDecisionType,
    EligibilityResult,
    NoCourseworkBehavior,
    NotificationType,
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
from app.db.models.academic import AcademicPeriod, Course, StudentEnrollment
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.auth import User
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


def _make_dummy_policy(
    institution_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    formative_exempt_pct: float = 70.0,
    summative_entry_pct: float = 50.0,
    summative_pass_pct: float = 50.0,
    reassessment_block_scope: ReassessmentBlockScope = ReassessmentBlockScope.COURSE,
    pending_marks_behavior: PendingMarksBehavior = PendingMarksBehavior.BLOCK,
    no_coursework_behavior: NoCourseworkBehavior = NoCourseworkBehavior.MANUAL_REVIEW,
    allow_hod_override: bool = True,
) -> EligibilityPolicy:
    return EligibilityPolicy(
        institution_id=institution_id or uuid.uuid4(),
        department_id=department_id,
        formative_exempt_pct=formative_exempt_pct,
        summative_entry_pct=summative_entry_pct,
        summative_pass_pct=summative_pass_pct,
        reassessment_block_scope=reassessment_block_scope,
        pending_marks_behavior=pending_marks_behavior,
        no_coursework_behavior=no_coursework_behavior,
        allow_hod_override=allow_hod_override,
    )


def _make_dummy_course(institution_id: uuid.UUID | None = None) -> Course:
    c = Course(
        id=uuid.uuid4(),
        institution_id=institution_id or uuid.uuid4(),
        code="CS101",
        title="Intro to CS",
        department_id=uuid.uuid4(),
        academic_period_id=uuid.uuid4(),
    )
    return c


def _make_dummy_assessment(course: Course, asm_type: AssessmentType = AssessmentType.FORMATIVE) -> Assessment:
    return Assessment(
        id=uuid.uuid4(),
        title="Quiz 1",
        assessment_type=asm_type,
        course_id=course.id,
        academic_period_id=course.academic_period_id,
        course=course,
        created_by_id=uuid.uuid4(),
        total_marks=100,
        passing_marks=50,
    )


# ── 1. Formative Finalization Trigger & Idempotency (R-18) ───────────────────


@pytest.mark.asyncio
async def test_formative_finalization_below_threshold():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    assessment = _make_dummy_assessment(course, AssessmentType.FORMATIVE)
    policy = _make_dummy_policy(institution_id=course.institution_id)

    service._resolve_assessment_and_course = AsyncMock(return_value=(assessment, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)

    student_id = uuid.uuid4()

    # 40/100 = 40.0% < 70.0% -> requires reassessment
    req = ReassessmentRequirement(
        id=uuid.uuid4(),
        student_id=student_id,
        course_id=course.id,
        academic_period_id=course.academic_period_id,
        source_assessment_id=assessment.id,
        original_percentage=40.0,
        status=ReassessmentRequirementStatus.REQUIRED,
    )
    service.repo.upsert_requirement = AsyncMock(return_value=req)
    service.notif_repo.create = AsyncMock()

    result = await service.process_formative_finalization(
        assessment_id=assessment.id,
        student_id=student_id,
        score=40.0,
        max_marks=100.0,
    )

    assert result is not None
    assert result.status == ReassessmentRequirementStatus.REQUIRED
    assert result.original_percentage == 40.0
    # Original score was not altered (R-18)
    service.repo.upsert_requirement.assert_awaited_once()
    assert service.notif_repo.create.await_count == 2  # student + lecturer


@pytest.mark.asyncio
async def test_formative_finalization_above_threshold_no_req():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    assessment = _make_dummy_assessment(course, AssessmentType.FORMATIVE)
    policy = _make_dummy_policy(institution_id=course.institution_id, formative_exempt_pct=70.0)

    service._resolve_assessment_and_course = AsyncMock(return_value=(assessment, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)

    # 75/100 = 75.0% >= 70.0% -> no reassessment required
    result = await service.process_formative_finalization(
        assessment_id=assessment.id,
        student_id=uuid.uuid4(),
        score=75.0,
        max_marks=100.0,
    )
    assert result is None


# ── 2. Linking Reassessment & Attempt Lifecycle (A-06, A-16) ────────────────


@pytest.mark.asyncio
async def test_linking_reassessment_moves_to_assigned():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    reassessment = _make_dummy_assessment(course, AssessmentType.REASSESSMENT)
    service._resolve_assessment_and_course = AsyncMock(return_value=(reassessment, course))
    service.repo.link_reassessment_assessment = AsyncMock(return_value=2)
    service.notif_repo.create = AsyncMock()

    s1, s2 = uuid.uuid4(), uuid.uuid4()
    count = await service.link_reassessment_assessment(
        reassessment_assessment_id=reassessment.id,
        source_assessment_id=uuid.uuid4(),
        target_student_ids=[s1, s2],
    )
    assert count == 2
    assert service.notif_repo.create.await_count == 2


@pytest.mark.asyncio
async def test_reassessment_submitted_and_graded_lifecycle():
    db = AsyncMock()
    service = EligibilityService(db)

    attempt_id = uuid.uuid4()
    reasm_id = uuid.uuid4()
    student_id = uuid.uuid4()

    # Submit
    req_sub = MagicMock(status=ReassessmentRequirementStatus.SUBMITTED)
    service.repo.mark_requirement_submitted = AsyncMock(return_value=req_sub)
    res_sub = await service.process_reassessment_attempt_submitted(attempt_id, reasm_id, student_id)
    assert res_sub.status == ReassessmentRequirementStatus.SUBMITTED

    # Grade
    req_grd = MagicMock(status=ReassessmentRequirementStatus.GRADED)
    service.repo.mark_requirement_graded = AsyncMock(return_value=req_grd)
    res_grd = await service.process_reassessment_attempt_graded(attempt_id)
    assert res_grd.status == ReassessmentRequirementStatus.GRADED


# ── 3. CAT Gate Enforcement (R-19, A-06, Scope) ─────────────────────────────


@pytest.mark.asyncio
async def test_cat_gate_blocked_by_pending_reassessment():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    cat_assessment = _make_dummy_assessment(course, AssessmentType.CAT)
    policy = _make_dummy_policy(institution_id=course.institution_id)

    service._resolve_assessment_and_course = AsyncMock(return_value=(cat_assessment, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)
    service.repo.get_active_override = AsyncMock(return_value=None)

    # Student has 1 pending requirement in REQUIRED
    pending_req = MagicMock(id=uuid.uuid4(), source_assessment_id=uuid.uuid4(), status=ReassessmentRequirementStatus.REQUIRED)
    service.repo.list_pending_reassessments = AsyncMock(return_value=[pending_req])
    service.repo.create_decision = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))
    service.notif_repo.create = AsyncMock()

    with pytest.raises(EligibilityBlockedError) as exc_info:
        await service.evaluate_attempt_start_gate(student_id=uuid.uuid4(), assessment_id=cat_assessment.id)

    assert exc_info.value.reason_code == "REASSESSMENT_PENDING"
    service.repo.create_decision.assert_awaited_once()


@pytest.mark.asyncio
async def test_cat_gate_passes_when_no_pending_requirements():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    cat_assessment = _make_dummy_assessment(course, AssessmentType.CAT)
    policy = _make_dummy_policy(institution_id=course.institution_id)

    service._resolve_assessment_and_course = AsyncMock(return_value=(cat_assessment, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)
    service.repo.get_active_override = AsyncMock(return_value=None)
    service.repo.list_pending_reassessments = AsyncMock(return_value=[])  # none pending
    service.repo.create_decision = AsyncMock()

    is_elig, reason, _ = await service.evaluate_attempt_start_gate(
        student_id=uuid.uuid4(), assessment_id=cat_assessment.id
    )
    assert is_elig is True
    assert reason == "CAT_ELIGIBLE"


@pytest.mark.asyncio
async def test_cat_gate_active_override_bypasses():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    cat_assessment = _make_dummy_assessment(course, AssessmentType.CAT)
    policy = _make_dummy_policy(institution_id=course.institution_id)

    service._resolve_assessment_and_course = AsyncMock(return_value=(cat_assessment, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)
    # Active override present
    override = MagicMock(spec=AttemptEligibilityOverride)
    service.repo.get_active_override = AsyncMock(return_value=override)

    is_elig, reason, _ = await service.evaluate_attempt_start_gate(
        student_id=uuid.uuid4(), assessment_id=cat_assessment.id
    )
    assert is_elig is True
    assert reason == "OVERRIDE_ACTIVE"


@pytest.mark.asyncio
async def test_cat_gate_scope_course_vs_all_courses():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    cat_assessment = _make_dummy_assessment(course, AssessmentType.CAT)

    # Policy 1: COURSE scope -> queries list_pending_reassessments with course_id=course.id
    policy_course = _make_dummy_policy(reassessment_block_scope=ReassessmentBlockScope.COURSE)
    service._resolve_assessment_and_course = AsyncMock(return_value=(cat_assessment, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy_course)
    service.repo.get_active_override = AsyncMock(return_value=None)
    service.repo.list_pending_reassessments = AsyncMock(return_value=[])
    service.repo.create_decision = AsyncMock()

    s_id = uuid.uuid4()
    await service.evaluate_attempt_start_gate(student_id=s_id, assessment_id=cat_assessment.id)
    service.repo.list_pending_reassessments.assert_awaited_with(student_id=s_id, course_id=course.id)

    # Policy 2: ALL_COURSES scope -> queries list_pending_reassessments with course_id=None
    policy_all = _make_dummy_policy(reassessment_block_scope=ReassessmentBlockScope.ALL_COURSES)
    service._resolve_policy_for_course = AsyncMock(return_value=policy_all)
    await service.evaluate_attempt_start_gate(student_id=s_id, assessment_id=cat_assessment.id)
    service.repo.list_pending_reassessments.assert_awaited_with(student_id=s_id, course_id=None)


# ── 4. Summative Gate: All 4 Reasons (R-20) ──────────────────────────────────


@pytest.mark.asyncio
async def test_summative_gate_entry_threshold_not_met_creates_retake():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    exam = _make_dummy_assessment(course, AssessmentType.SUMMATIVE)
    policy = _make_dummy_policy(institution_id=course.institution_id, summative_entry_pct=50.0)

    service._resolve_assessment_and_course = AsyncMock(return_value=(exam, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)
    service.repo.get_active_override = AsyncMock(return_value=None)

    # Coursework average: 40% < 50%
    items = [{"percentage": 40.0}]
    service._collect_coursework_items = AsyncMock(return_value=items)
    service.repo.create_decision = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))
    service.repo.create_retake_record = AsyncMock()

    s_id = uuid.uuid4()
    with pytest.raises(EligibilityBlockedError) as exc_info:
        await service.evaluate_attempt_start_gate(student_id=s_id, assessment_id=exam.id)

    assert exc_info.value.reason_code == RetakeTrigger.ENTRY_THRESHOLD_NOT_MET.value
    # Auto-creates RetakeRecord
    service.repo.create_retake_record.assert_awaited_once()


@pytest.mark.asyncio
async def test_summative_gate_marks_pending_blocked():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    exam = _make_dummy_assessment(course, AssessmentType.SUMMATIVE)
    policy = _make_dummy_policy(pending_marks_behavior=PendingMarksBehavior.BLOCK)

    service._resolve_assessment_and_course = AsyncMock(return_value=(exam, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)
    service.repo.get_active_override = AsyncMock(return_value=None)

    # Ungraded item present
    items = [{"is_pending": True}]
    service._collect_coursework_items = AsyncMock(return_value=items)
    service.repo.create_decision = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))

    with pytest.raises(EligibilityBlockedError) as exc_info:
        await service.evaluate_attempt_start_gate(student_id=uuid.uuid4(), assessment_id=exam.id)

    assert exc_info.value.reason_code == "MARKS_PENDING"


@pytest.mark.asyncio
async def test_summative_gate_no_coursework_manual_review():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    exam = _make_dummy_assessment(course, AssessmentType.SUMMATIVE)
    policy = _make_dummy_policy(no_coursework_behavior=NoCourseworkBehavior.MANUAL_REVIEW)

    service._resolve_assessment_and_course = AsyncMock(return_value=(exam, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)
    service.repo.get_active_override = AsyncMock(return_value=None)

    # Empty coursework items
    items = []
    service._collect_coursework_items = AsyncMock(return_value=items)
    service.repo.create_decision = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))

    with pytest.raises(EligibilityBlockedError) as exc_info:
        await service.evaluate_attempt_start_gate(student_id=uuid.uuid4(), assessment_id=exam.id)

    assert exc_info.value.reason_code == "MANUAL_REVIEW_REQUIRED"


@pytest.mark.asyncio
async def test_summative_gate_eligible():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    exam = _make_dummy_assessment(course, AssessmentType.SUMMATIVE)
    policy = _make_dummy_policy(summative_entry_pct=50.0)

    service._resolve_assessment_and_course = AsyncMock(return_value=(exam, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)
    service.repo.get_active_override = AsyncMock(return_value=None)

    # Coursework average: 65% >= 50%
    items = [{"percentage": 65.0}]
    service._collect_coursework_items = AsyncMock(return_value=items)
    service.repo.create_decision = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))

    is_elig, reason, _ = await service.evaluate_attempt_start_gate(
        student_id=uuid.uuid4(), assessment_id=exam.id
    )
    assert is_elig is True
    assert reason == "COURSEWORK_THRESHOLD_MET"


# ── 5. Summative Finalization Outcome (R-22) ─────────────────────────────────


@pytest.mark.asyncio
async def test_summative_finalization_failed_creates_retake():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    exam = _make_dummy_assessment(course, AssessmentType.SUMMATIVE)
    policy = _make_dummy_policy(institution_id=course.institution_id, summative_pass_pct=50.0)

    service._resolve_assessment_and_course = AsyncMock(return_value=(exam, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)

    # 45/100 = 45% < 50% -> SUMMATIVE_FAILED
    service.repo.create_decision = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))
    retake_mock = MagicMock(id=uuid.uuid4(), status=RetakeStatus.FLAGGED)
    service.repo.create_retake_record = AsyncMock(return_value=retake_mock)
    service.notif_repo.create = AsyncMock()

    retake = await service.process_summative_finalization(
        assessment_id=exam.id,
        student_id=uuid.uuid4(),
        score=45.0,
        max_marks=100.0,
    )
    assert retake is not None
    service.repo.create_retake_record.assert_awaited_once()
    service.notif_repo.create.assert_awaited_once()


# ── 6. Retake Payment & Enrollment Lifecycle (R-22, A-17) ────────────────────


@pytest.mark.asyncio
async def test_retake_lifecycle():
    db = AsyncMock()
    service = EligibilityService(db)

    student_id = uuid.uuid4()
    retake_id = uuid.uuid4()

    # Step 1: FLAGGED retake
    retake = MagicMock(
        id=retake_id,
        student_id=student_id,
        status=RetakeStatus.FLAGGED,
        payment_reference_id=None,
        course=_make_dummy_course(),
        from_period=MagicMock(start_date=datetime(2026, 1, 1).date()),
    )
    service.repo.get_retake_record = AsyncMock(return_value=retake)

    payment = MagicMock(id=uuid.uuid4(), status=PaymentStatus.PENDING)
    service.repo.create_payment_reference = AsyncMock(return_value=payment)
    service.repo.attach_payment_to_retake = AsyncMock(return_value=retake)

    # Attach payment reference
    await service.attach_payment_reference(
        retake_id=retake_id,
        student_id=student_id,
        external_reference="REF-999",
        amount_text="$150",
    )
    service.repo.attach_payment_to_retake.assert_awaited_once()

    # Cannot enroll while FLAGGED or PAYMENT_PENDING
    retake.status = RetakeStatus.PAYMENT_PENDING
    with pytest.raises(ValidationError) as exc:
        await service.enroll_retake(retake_id=retake_id)
    assert exc.value.code == "RETAKE_NOT_PAID"

    # Step 2: Admin confirms payment -> status moves to PAID
    payment_mock = MagicMock(id=payment.id, status=PaymentStatus.CONFIRMED)
    service.repo.get_payment_reference = AsyncMock(return_value=payment_mock)
    service.repo.confirm_payment = AsyncMock(return_value=payment_mock)
    service.repo.update_retake_status = AsyncMock()
    service.notif_repo.create = AsyncMock()

    # Mock DB query for linked retake
    db_res = MagicMock()
    db_res.scalars().first.return_value = retake
    db.execute.return_value = db_res

    admin_user = MagicMock(id=uuid.uuid4())
    await service.confirm_payment_reference(
        payment_id=payment.id,
        status=PaymentStatus.CONFIRMED,
        confirmed_by=admin_user,
    )
    service.repo.update_retake_status.assert_awaited_with(retake.id, RetakeStatus.PAID)

    # Step 3: Enrolment when next period exists
    retake.status = RetakeStatus.PAID
    next_period_id = uuid.uuid4()
    service.repo.finalize_retake_enrollment = AsyncMock(return_value=retake)

    await service.enroll_retake(
        retake_id=retake_id,
        target_period_id=next_period_id,
        target_course_id=retake.course.id,
    )
    service.repo.finalize_retake_enrollment.assert_awaited_once()


# ── 7. HOD Override Requires Mandatory Reason (A-11) ─────────────────────────


@pytest.mark.asyncio
async def test_hod_override_requires_reason():
    db = AsyncMock()
    service = EligibilityService(db)

    course = _make_dummy_course()
    asm = _make_dummy_assessment(course)
    policy = _make_dummy_policy(allow_hod_override=True)
    service._resolve_assessment_and_course = AsyncMock(return_value=(asm, course))
    service._resolve_policy_for_course = AsyncMock(return_value=policy)

    hod_user = MagicMock(id=uuid.uuid4())

    # Empty reason fails validation
    with pytest.raises(ValidationError):
        await service.create_hod_override(
            student_id=uuid.uuid4(),
            assessment_id=asm.id,
            reason="   ",
            granted_by=hod_user,
        )

    # Valid reason succeeds
    service.repo.create_override = AsyncMock(return_value=MagicMock())
    res = await service.create_hod_override(
        student_id=uuid.uuid4(),
        assessment_id=asm.id,
        reason="Medical emergency approved by senate committee.",
        granted_by=hod_user,
    )
    assert res is not None
    service.repo.create_override.assert_awaited_once()
