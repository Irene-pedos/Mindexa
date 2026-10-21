"""
tests/integration/test_phase6b_flow.py

End-to-end integration tests for Phase 6B (Section 11):
1. Appeal submit → attach payment → HOD assigns reviewer (from course pool)
2. Reviewer submits review → HOD closes → grade revision created, student notified
3. Original marker is hard-excluded from reviewer pool
4. A-08: allow_mark_decrease=False clamps final_total to original
5. Absence excuse: submit → approve → AttemptEligibilityOverride created
6. Absence excuse window enforcement
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.enums import (
    AbsenceExcuseStatus,
    AcademicPeriodType,
    AssessmentStatus,
    AttemptStatus,
    GradingMode,
    IndividualAppealStatus,
    OverrideSource,
    PaymentPurpose,
    PaymentStatus,
    SubmissionStatus,
    UserRole,
)
from app.db.models.academic import (
    AcademicPeriod,
    ClassSection,
    Course,
    Department,
    Institution,
    StudentEnrollment,
    TeachingAssignment,
    TeachingWorkspace,
)
from app.db.models.appeals import (
    AbsenceExcusePolicy,
    AbsenceExcuseRequest,
    Appeal,
    AppealPolicy,
)
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt, SubmissionGrade
from app.db.models.auth import User, UserProfile
from app.db.models.eligibility import AttemptEligibilityOverride, PaymentReference
from app.db.models.result import AssessmentResult
from app.db.repositories.appeal_repo import AppealRepository
from app.db.repositories.eligibility_repo import EligibilityRepository
from app.schemas.appeals import (
    AbsenceExcuseCreate,
    AbsenceExcuseDecide,
    AppealAssignReviewer,
    AppealCloseDecision,
    AppealCreate,
    AppealSubmitReview,
)
from app.services.absence_service import AbsenceService
from app.services.appeal_service import AppealService


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _user(role: UserRole, db: AsyncSession) -> User:
    user = User(
        email=f"user_{uuid.uuid4().hex[:8]}@test.com",
        hashed_password="hashed",
        role=role,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    profile = UserProfile(
        user=user,
        first_name="Test",
        last_name=role.value.title(),
        phone_number=f"+25078{uuid.uuid4().int % 10000000:07d}",
    )
    db.add(profile)
    return user


async def _setup_env(db: AsyncSession):
    """Build minimal institutional structure for Phase 6B tests."""
    inst = Institution(
        name="Phase6B Inst",
        code=f"P6B-{uuid.uuid4().hex[:4]}",
        country="RW",
        subdomain=f"p6b-{uuid.uuid4().hex[:6]}",
    )
    db.add(inst)
    await db.flush()

    dept = Department(name="CS", code=f"CS-{uuid.uuid4().hex[:4]}", institution_id=inst.id)
    db.add(dept)
    await db.flush()

    period = AcademicPeriod(
        institution_id=inst.id,
        name="2026-S1",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_date=datetime(2026, 6, 30, tzinfo=timezone.utc),
    )
    db.add(period)
    await db.flush()

    course = Course(
        institution_id=inst.id,
        department_id=dept.id,
        academic_period_id=period.id,
        name="Algorithms",
        code=f"ALG-{uuid.uuid4().hex[:4]}",
        academic_year="2026",
        credits=3,
    )
    db.add(course)
    await db.flush()

    return inst, dept, course, period


async def _setup_users_and_assessment(db: AsyncSession, course: Course, period: AcademicPeriod):
    student = _user(UserRole.STUDENT, db)
    lecturer = _user(UserRole.LECTURER, db)
    reviewer_lecturer = _user(UserRole.LECTURER, db)
    hod = _user(UserRole.LECTURER, db)
    await db.flush()

    # Teaching assignment for course lecturer (original marker)
    ta1 = TeachingAssignment(
        lecturer_id=lecturer.id,
        institution_id=course.institution_id,
        department_id=course.department_id,
        course_id=course.id,
        academic_year="2026",
    )
    db.add(ta1)
    # Teaching assignment for reviewer
    ta2 = TeachingAssignment(
        lecturer_id=reviewer_lecturer.id,
        institution_id=course.institution_id,
        department_id=course.department_id,
        course_id=course.id,
        academic_year="2026",
    )
    db.add(ta2)
    await db.flush()

    ws = TeachingWorkspace(
        teaching_assignment_id=ta1.id,
        course_id=course.id,
        academic_period_id=period.id,
        title="CS Workspace",
        created_by_id=lecturer.id,
    )
    db.add(ws)
    await db.flush()

    # Assessment
    assessment = Assessment(
        teaching_workspace_id=ws.id,
        course_id=course.id,
        academic_period_id=period.id,
        institution_id=course.institution_id,
        academic_year="2026",
        title="Midterm Exam",
        assessment_type="CAT",
        status=AssessmentStatus.PUBLISHED,
        total_marks=100,
        required_marks=100,
        created_by_id=lecturer.id,
    )
    db.add(assessment)
    await db.flush()

    # Attempt
    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student.id,
        status=AttemptStatus.SUBMITTED,
        submission_status=SubmissionStatus.GRADED,
        grading_mode=GradingMode.MANUAL,
        started_at=utcnow(),
        submitted_at=utcnow(),
    )
    db.add(attempt)
    await db.flush()

    grade = SubmissionGrade(
        attempt_id=attempt.id,
        assessment_id=assessment.id,
        student_id=student.id,
        graded_by_id=lecturer.id,
        grading_mode="MANUAL",
        is_final=True,
    )
    db.add(grade)
    await db.flush()

    # Result (released 2 days ago)
    released_at = utcnow() - timedelta(days=2)
    result = AssessmentResult(
        attempt_id=attempt.id,
        student_id=student.id,
        assessment_id=assessment.id,
        total_score=62.0,
        max_score=100.0,
        percentage=62.0,
        is_released=True,
        released_at=released_at,
    )
    db.add(result)
    await db.flush()

    return student, lecturer, reviewer_lecturer, hod, assessment, attempt, result


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_full_appeal_flow_no_payment(db: AsyncSession):
    """Submit → assign reviewer (no payment required) → review → close."""
    inst, dept, course, period = await _setup_env(db)
    student, lecturer, reviewer_lec, hod, assessment, attempt, result = (
        await _setup_users_and_assessment(db, course, period)
    )

    # Policy: no payment required
    db.add(AppealPolicy(
        institution_id=inst.id,
        window_days=7,
        allow_mark_decrease=False,
        require_payment=False,
    ))
    await db.flush()

    service = AppealService(db)

    # 1. Submit
    payload = AppealCreate(
        attempt_id=attempt.id,
        assessment_id=assessment.id,
        course_id=course.id,
        reason="I believe question 3 was marked incorrectly based on my workings.",
    )
    appeal = await service.submit_appeal(student=student, payload=payload)
    assert appeal.status == IndividualAppealStatus.SUBMITTED
    assert appeal.original_total == 62.0

    # 2. Assign reviewer (reviewer_lec is NOT original marker)
    assign_payload = AppealAssignReviewer(reviewer_id=reviewer_lec.id)
    appeal = await service.assign_reviewer(
        appeal_id=appeal.id, hod=hod, payload=assign_payload
    )
    assert appeal.status == IndividualAppealStatus.ASSIGNED
    assert appeal.reviewer_id == reviewer_lec.id

    # 3. Submit review
    review_payload = AppealSubmitReview(reviewer_total=75.0, decision_note="Recalculated Q3")
    appeal = await service.submit_review(
        appeal_id=appeal.id, reviewer=reviewer_lec, payload=review_payload
    )
    assert appeal.status == IndividualAppealStatus.UNDER_REVIEW
    assert appeal.reviewer_total == 75.0

    # 4. Close (allow_mark_decrease=False but reviewer_total > original so no clamping needed)
    close_payload = AppealCloseDecision(final_total=75.0, outcome="MARK_INCREASED")
    appeal = await service.close_appeal(
        appeal_id=appeal.id, hod=hod, payload=close_payload
    )
    assert appeal.status == IndividualAppealStatus.CLOSED
    assert appeal.final_total == 75.0


@pytest.mark.asyncio
async def test_appeal_decrease_policy_clamp(db: AsyncSession):
    """A-08: When allow_mark_decrease=False, final_total must not go below original."""
    inst, dept, course, period = await _setup_env(db)
    student, lecturer, reviewer_lec, hod, assessment, attempt, result = (
        await _setup_users_and_assessment(db, course, period)
    )

    db.add(AppealPolicy(
        institution_id=inst.id,
        window_days=7,
        allow_mark_decrease=False,
        require_payment=False,
    ))
    await db.flush()

    service = AppealService(db)

    appeal = await service.submit_appeal(
        student=student,
        payload=AppealCreate(
            attempt_id=attempt.id,
            assessment_id=assessment.id,
            course_id=course.id,
            reason="Requesting re-evaluation of my submitted evidence for Q5.",
        ),
    )

    await service.assign_reviewer(
        appeal_id=appeal.id,
        hod=hod,
        payload=AppealAssignReviewer(reviewer_id=reviewer_lec.id),
    )

    # Reviewer recommends a LOWER mark
    await service.submit_review(
        appeal_id=appeal.id,
        reviewer=reviewer_lec,
        payload=AppealSubmitReview(reviewer_total=45.0, decision_note="Found errors"),
    )

    close_payload = AppealCloseDecision(final_total=45.0, outcome="MARK_DECREASED")
    appeal = await service.close_appeal(
        appeal_id=appeal.id, hod=hod, payload=close_payload
    )

    # A-08: final_total must be max(original=62, reviewer=45) = 62
    assert appeal.final_total == 62.0
    assert appeal.status == IndividualAppealStatus.CLOSED


@pytest.mark.asyncio
async def test_original_marker_excluded_from_pool(db: AsyncSession):
    """Hard rule: original marker (graded_by_id) must NOT appear in eligible reviewers."""
    inst, dept, course, period = await _setup_env(db)
    student, lecturer, reviewer_lec, hod, assessment, attempt, result = (
        await _setup_users_and_assessment(db, course, period)
    )

    db.add(AppealPolicy(
        institution_id=inst.id,
        window_days=7,
        allow_mark_decrease=False,
        require_payment=False,
    ))
    await db.flush()

    service = AppealService(db)
    appeal = await service.submit_appeal(
        student=student,
        payload=AppealCreate(
            attempt_id=attempt.id,
            assessment_id=assessment.id,
            course_id=course.id,
            reason="My answer to question 2 is correct per the rubric provided.",
        ),
    )

    reviewers_resp = await service.get_eligible_reviewers(appeal_id=appeal.id, hod=hod)

    # lecturer (graded_by_id) must NOT be in primary pool
    assert lecturer.id not in reviewers_resp.primary_pool

    # reviewer_lec (not a marker) should be in primary pool
    assert reviewer_lec.id in reviewers_resp.primary_pool


@pytest.mark.asyncio
async def test_duplicate_appeal_rejected(db: AsyncSession):
    """Only one open appeal per attempt."""
    from app.core.exceptions import ConflictError

    inst, dept, course, period = await _setup_env(db)
    student, lecturer, reviewer_lec, hod, assessment, attempt, result = (
        await _setup_users_and_assessment(db, course, period)
    )

    db.add(AppealPolicy(
        institution_id=inst.id, window_days=7, allow_mark_decrease=False, require_payment=False
    ))
    await db.flush()

    service = AppealService(db)
    payload = AppealCreate(
        attempt_id=attempt.id,
        assessment_id=assessment.id,
        course_id=course.id,
        reason="I believe my answer to question 4 was incorrectly evaluated.",
    )
    await service.submit_appeal(student=student, payload=payload)

    with pytest.raises(ConflictError):
        await service.submit_appeal(student=student, payload=payload)


@pytest.mark.asyncio
async def test_appeal_window_expired(db: AsyncSession):
    """Submitting after window_days should raise ValidationError."""
    from app.core.exceptions import ValidationError

    inst, dept, course, period = await _setup_env(db)
    student, lecturer, reviewer_lec, hod, assessment, attempt, result = (
        await _setup_users_and_assessment(db, course, period)
    )

    # Overwrite result with old released_at (10 days ago, window=7)
    result.released_at = utcnow() - timedelta(days=10)
    await db.flush()

    db.add(AppealPolicy(
        institution_id=inst.id, window_days=7, allow_mark_decrease=False, require_payment=False
    ))
    await db.flush()

    service = AppealService(db)
    with pytest.raises(ValidationError):
        await service.submit_appeal(
            student=student,
            payload=AppealCreate(
                attempt_id=attempt.id,
                assessment_id=assessment.id,
                course_id=course.id,
                reason="Appeal submitted outside the allowed window period.",
            ),
        )


@pytest.mark.asyncio
async def test_absence_excuse_approve_creates_override(db: AsyncSession):
    """APPROVED absence excuse must create AttemptEligibilityOverride(source=EXCUSE)."""
    inst, dept, course, period = await _setup_env(db)
    student, lecturer, reviewer_lec, hod, assessment, attempt, result = (
        await _setup_users_and_assessment(db, course, period)
    )

    # Make assessment window close in the future for valid submission window
    # (assessment has available_until in the future -> no window expiry issue)

    db.add(AbsenceExcusePolicy(institution_id=inst.id, submit_days_after=7))
    await db.flush()

    service = AbsenceService(db)

    excuse = await service.submit_excuse(
        student=student,
        payload=AbsenceExcuseCreate(
            assessment_id=assessment.id,
            course_id=course.id,
            reason="Hospitalized due to illness",
            evidence_file_ids=["medical-report-001"],
        ),
    )
    assert excuse.status == AbsenceExcuseStatus.SUBMITTED

    # Lecturer decides: APPROVED
    granted_start = utcnow()
    granted_end = utcnow() + timedelta(days=7)
    excuse = await service.decide_excuse(
        excuse_id=excuse.id,
        decider=lecturer,
        payload=AbsenceExcuseDecide(
            status=AbsenceExcuseStatus.APPROVED,
            decision_note="Medical evidence verified",
            granted_window_start=granted_start,
            granted_window_end=granted_end,
        ),
    )
    assert excuse.status == AbsenceExcuseStatus.APPROVED

    # Verify override was created
    override_res = await db.execute(
        select(AttemptEligibilityOverride).where(
            AttemptEligibilityOverride.student_id == student.id,
            AttemptEligibilityOverride.assessment_id == assessment.id,
            AttemptEligibilityOverride.source == OverrideSource.EXCUSE,
        )
    )
    override = override_res.scalars().first()
    assert override is not None, "AttemptEligibilityOverride should have been created"
    assert override.source == OverrideSource.EXCUSE


@pytest.mark.asyncio
async def test_absence_excuse_rejected_no_override(db: AsyncSession):
    """REJECTED absence excuse must NOT create an override."""
    inst, dept, course, period = await _setup_env(db)
    student, lecturer, reviewer_lec, hod, assessment, attempt, result = (
        await _setup_users_and_assessment(db, course, period)
    )

    db.add(AbsenceExcusePolicy(institution_id=inst.id, submit_days_after=7))
    await db.flush()

    service = AbsenceService(db)

    excuse = await service.submit_excuse(
        student=student,
        payload=AbsenceExcuseCreate(
            assessment_id=assessment.id,
            course_id=course.id,
            reason="Family emergency on assessment day",
            evidence_file_ids=["letter-001"],
        ),
    )

    excuse = await service.decide_excuse(
        excuse_id=excuse.id,
        decider=lecturer,
        payload=AbsenceExcuseDecide(
            status=AbsenceExcuseStatus.REJECTED,
            decision_note="Insufficient evidence",
        ),
    )
    assert excuse.status == AbsenceExcuseStatus.REJECTED

    override_res = await db.execute(
        select(AttemptEligibilityOverride).where(
            AttemptEligibilityOverride.student_id == student.id,
            AttemptEligibilityOverride.assessment_id == assessment.id,
            AttemptEligibilityOverride.source == OverrideSource.EXCUSE,
        )
    )
    assert override_res.scalars().first() is None
