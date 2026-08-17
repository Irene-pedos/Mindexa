"""
app/api/v1/routes/result.py

Assessment result routes.

Endpoints:
    GET  /results/attempt/{attempt_id}          → Student: get own released result
    GET  /results/lecturer/{attempt_id}         → Lecturer/Admin: get result (no release check)
    GET  /results/assessment/{assessment_id}    → Lecturer: list all results for assessment
    POST /results/calculate/{attempt_id}        → Trigger result calculation
    POST /results/release                       → Release results to students
    POST /results/{result_id}/clear-hold        → Clear integrity hold (admin/lecturer)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.models.auth import User
from app.db.repositories.result_repo import ResultRepository
from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin, require_student
from app.schemas.result import (
    AssessmentReleasePolicyRequest,
    AssessmentResultResponse,
    ClearIntegrityHoldRequest,
    ReleaseResultsRequest,
    ResultListResponse,
    ResultReleaseResponse,
    ResultSummary,
    ReleaseQueueResponse,
)
from app.services.result_service import ResultService

router = APIRouter(prefix="/results", tags=["Results"])


# ── STUDENT: GET OWN RESULT ───────────────────────────────────────────────────


@router.get(
    "/attempt/{attempt_id}",
    response_model=AssessmentResultResponse,
    summary="Get your own result (student)",
)
async def get_my_result(
    attempt_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResultResponse:
    """
    Returns the released result for the student's own attempt.
    404 is returned if the result has not been released yet
    (prevents timing attacks — student cannot determine if grading is done).
    """
    service = ResultService(db)
    result = await service.get_result_for_student(
        attempt_id=attempt_id,
        student_id=current_user.id,
    )
    return AssessmentResultResponse.model_validate(result)


@router.get(
    "/me",
    response_model=ResultListResponse,
    summary="List your own released results (student)",
)
async def list_my_results(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    include_pending: bool = Query(default=False),
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> ResultListResponse:
    """
    Returns a paginated list of results for the current student.
    By default this exposes released rows only. With include_pending=True it
    also includes submitted attempts whose marks are still under review or
    held for integrity audit, without exposing unreleased scores.
    """
    from sqlalchemy import func, not_, select
    from sqlalchemy.orm import selectinload

    from app.db.models.assessment import Assessment
    from app.db.models.attempt import AssessmentAttempt
    from app.db.models.result import AssessmentResult
    from app.db.enums import AttemptStatus

    if not include_pending:
        stmt = (
            select(AssessmentResult)
            .options(selectinload(AssessmentResult.attempt))
            .where(
                AssessmentResult.student_id == current_user.id,
                AssessmentResult.is_released,
                not_(AssessmentResult.is_deleted),
            )
            .order_by(AssessmentResult.released_at.desc())
        )

        count_stmt = select(func.count(AssessmentResult.id)).where(
            AssessmentResult.student_id == current_user.id,
            AssessmentResult.is_released,
            not_(AssessmentResult.is_deleted),
        )
        total = (await db.execute(count_stmt)).scalar_one()

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        items = result.scalars().all()

        summaries = []
        for r in items:
            summary = ResultSummary.model_validate(r)
            ass = await db.get(Assessment, r.assessment_id)
            if ass:
                summary.assessment_title = ass.title
                summary.assessment_type = ass.assessment_type.value if hasattr(ass.assessment_type, "value") else str(ass.assessment_type)
                summary.academic_year = ass.academic_year
                summary.course_code = ass.course_code
                summary.course_name = ass.course_name
                summary.released_at = r.released_at
                summary.submitted_at = r.attempt.submitted_at if r.attempt else None
                summary.student_status = "GRADED"
            summaries.append(summary)

        return ResultListResponse(
            items=summaries,
            total=total,
            page=page,
            page_size=page_size,
        )

    # ── When include_pending=True: Include all student results and submitted attempts ──
    results_stmt = (
        select(AssessmentResult)
        .options(selectinload(AssessmentResult.attempt))
        .where(
            AssessmentResult.student_id == current_user.id,
            AssessmentResult.is_deleted == False,  # noqa: E712
        )
        .order_by(AssessmentResult.calculated_at.desc())
    )
    res_exec = await db.execute(results_stmt)
    all_results = list(res_exec.scalars().all())

    handled_assessment_ids = {r.assessment_id for r in all_results}
    handled_attempt_ids = {r.attempt_id for r in all_results if r.attempt_id}

    attempts_stmt = (
        select(AssessmentAttempt)
        .options(
            selectinload(AssessmentAttempt.assessment).selectinload(Assessment.course),
            selectinload(AssessmentAttempt.result),
        )
        .where(
            AssessmentAttempt.student_id == current_user.id,
            AssessmentAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED]),
            AssessmentAttempt.is_deleted == False,  # noqa: E712
        )
        .order_by(AssessmentAttempt.submitted_at.desc().nullslast(), AssessmentAttempt.created_at.desc())
    )
    attempts_result = await db.execute(attempts_stmt)
    attempts = list(attempts_result.scalars().all())

    summaries = []
    # 1. Add all AssessmentResults
    for r in all_results:
        ass = await db.get(Assessment, r.assessment_id)
        released = bool(r.is_released)
        held = bool(r.integrity_hold)
        max_score = r.max_score if r.max_score else float(ass.total_marks or 0) if ass else 0.0

        status = "GRADED" if released else "INTEGRITY_HOLD" if held else "PENDING_RELEASE"
        submitted_at = r.attempt.submitted_at if r.attempt else r.calculated_at

        summaries.append(ResultSummary(
            id=r.id,
            attempt_id=r.attempt_id,
            group_submission_id=r.group_submission_id,
            is_group_result=r.is_group_result,
            student_id=r.student_id,
            assessment_id=r.assessment_id,
            assessment_title=ass.title if ass else "Assessment",
            assessment_type=ass.assessment_type.value if ass and hasattr(ass.assessment_type, "value") else str(ass.assessment_type) if ass else None,
            academic_year=ass.academic_year if ass else None,
            course_code=ass.course_code if ass else None,
            course_name=ass.course_name if ass else None,
            submitted_at=submitted_at,
            released_at=r.released_at if released else None,
            student_status=status,
            total_score=r.total_score if released else 0.0,
            max_score=max_score,
            percentage=r.percentage if released else 0.0,
            letter_grade=r.letter_grade if released else None,
            is_passing=r.is_passing if released else False,
            is_released=released,
            integrity_hold=held,
            graded_question_count=r.graded_question_count,
            total_question_count=r.total_question_count,
        ))

    # 2. Add any submitted attempts that do not yet have an AssessmentResult row
    for attempt in attempts:
        if attempt.id in handled_attempt_ids or attempt.assessment_id in handled_assessment_ids:
            continue
        ass = attempt.assessment
        held = bool(attempt.is_flagged or (attempt.integrity_risk_score and attempt.integrity_risk_score >= 70.0))
        status = "AUTO_SUBMITTED" if attempt.status == AttemptStatus.AUTO_SUBMITTED else "INTEGRITY_HOLD" if held else "SUBMITTED"
        max_score = float(ass.total_marks or 0) if ass else 0.0

        summaries.append(ResultSummary(
            id=attempt.id,
            attempt_id=attempt.id,
            is_group_result=bool(attempt.group_id is not None),
            student_id=attempt.student_id,
            assessment_id=attempt.assessment_id,
            assessment_title=ass.title if ass else "Assessment",
            assessment_type=ass.assessment_type.value if ass and hasattr(ass.assessment_type, "value") else str(ass.assessment_type) if ass else None,
            academic_year=ass.academic_year if ass else None,
            course_code=ass.course_code if ass else None,
            course_name=ass.course_name if ass else None,
            submitted_at=attempt.submitted_at,
            released_at=None,
            student_status=status,
            total_score=0.0,
            max_score=max_score,
            percentage=0.0,
            letter_grade=None,
            is_passing=False,
            is_released=False,
            integrity_hold=held,
            graded_question_count=0,
            total_question_count=0,
        ))

    total = len(summaries)
    start = (page - 1) * page_size
    paged = summaries[start:start + page_size]

    return ResultListResponse(
        items=paged,
        total=total,
        page=page,
        page_size=page_size,
    )


# ── LECTURER: GET RESULT (NO RELEASE CHECK) ───────────────────────────────────


@router.get(
    "/lecturer/{attempt_id}",
    response_model=AssessmentResultResponse,
    summary="Get result for an attempt (lecturer/admin — no release check)",
)
async def get_result_for_lecturer(
    attempt_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResultResponse:
    """
    Lecturers and admins can view results regardless of release status.
    Includes per-question breakdown and integrity hold status.
    """
    service = ResultService(db)
    result = await service.get_result_for_lecturer(attempt_id=attempt_id)
    return AssessmentResultResponse.model_validate(result)


# ── LIST RESULTS FOR ASSESSMENT ───────────────────────────────────────────────


@router.get(
    "/assessment/{assessment_id}",
    response_model=ResultListResponse,
    summary="List all results for an assessment (lecturer/admin)",
)
async def list_results_for_assessment(
    assessment_id: uuid.UUID,
    class_section_id: uuid.UUID | None = Query(default=None),
    is_released: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> ResultListResponse:
    repo = ResultRepository(db)
    items, total = await repo.list_by_assessment(
        assessment_id=assessment_id,
        class_section_id=class_section_id,
        is_released=is_released,
        page=page,
        page_size=page_size,
    )
    return ResultListResponse(
        items=[ResultSummary.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


# ── CALCULATE RESULT ──────────────────────────────────────────────────────────


@router.post(
    "/calculate/{attempt_id}",
    response_model=AssessmentResultResponse,
    summary="Trigger result calculation for an attempt",
)
async def calculate_result(
    attempt_id: uuid.UUID,
    allow_partial: bool = Query(default=False, description="Allow calculation on partially graded attempt"),
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResultResponse:
    """
    (Re)calculate the result for a submitted attempt.

    Safe to call multiple times — idempotent.
    Requires all questions to be finalized unless allow_partial=True is specified.
    Result is NOT released to the student until POST /results/release is called.
    """
    service = ResultService(db)
    result, created = await service.calculate_result(
        attempt_id=attempt_id,
        allow_partial=allow_partial,
    )
    enriched = await service.get_result_for_lecturer(attempt_id=result.id)
    return AssessmentResultResponse.model_validate(enriched)


# ── RELEASE RESULTS ───────────────────────────────────────────────────────────


@router.post(
    "/release",
    response_model=ResultReleaseResponse,
    summary="Release results to students",
)
async def release_results(
    body: ReleaseResultsRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> ResultReleaseResponse:
    """
    Release calculated results to students.

    If attempt_ids is provided: release only those specific results.
    If attempt_ids is None: release all releasable results for the assessment.

    Results with integrity_hold=True are skipped and reported in the response.
    """
    service = ResultService(db)
    release_data = await service.release_results(
        assessment_id=body.assessment_id,
        released_by_id=current_user.id,
        attempt_ids=body.attempt_ids,
        class_section_id=body.class_section_id,
    )
    return ResultReleaseResponse(**release_data)


@router.post(
    "/assessment/{assessment_id}/trigger-release",
    response_model=ResultReleaseResponse,
    summary="Trigger immediate result release for an assessment",
)
async def trigger_immediate_release(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> ResultReleaseResponse:
    """
    Triggers an immediate release of all eligible results for the given assessment.
    Used by the immediate release workflow in the lecturer UI.
    """
    service = ResultService(db)
    release_data = await service.release_results(
        assessment_id=assessment_id,
        released_by_id=current_user.id,
        attempt_ids=None, # None means all eligible
    )
    return ResultReleaseResponse(**release_data)


@router.patch(
    "/assessment/{assessment_id}/release-policy",
    response_model=dict,
    summary="Update the assessment's result release policy",
)
async def update_release_policy(
    assessment_id: uuid.UUID,
    body: AssessmentReleasePolicyRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Update the release policy (manual, immediate, scheduled) for an assessment.
    """
    from app.core.exceptions import ValidationError
    from app.db.enums import ResultReleaseMode
    from app.db.models.assessment import Assessment

    # 1. Fetch assessment
    assessment = await db.get(Assessment, assessment_id)
    if not assessment:
        raise NotFoundError("Assessment", str(assessment_id))

    # 2. Map frontend string policy to Enum
    policy_map = {
        "immediate": ResultReleaseMode.IMMEDIATE,
        "scheduled": ResultReleaseMode.SCHEDULED,
        "hold": ResultReleaseMode.MANUAL
    }
    
    enum_policy = policy_map.get(body.policy.lower())
    if not enum_policy:
         try:
             enum_policy = ResultReleaseMode(body.policy.upper())
         except ValueError as err:
             raise ValidationError(f"Invalid policy: {body.policy}", code="INVALID_POLICY") from err

    # 3. Update fields
    assessment.result_release_mode = enum_policy
    assessment.result_release_at = body.release_date
    assessment.updated_by_id = current_user.id
    
    db.add(assessment)
    await db.commit()
    
    return {
        "message": "Release policy updated successfully",
        "assessment_id": str(assessment_id),
        "policy": enum_policy.value,
        "release_date": body.release_date.isoformat() if body.release_date else None
    }


# ── CLEAR INTEGRITY HOLD ──────────────────────────────────────────────────────


@router.post(
    "/{result_id}/clear-hold",
    response_model=dict,
    summary="Clear an integrity hold on a result",
)
async def clear_integrity_hold(
    result_id: uuid.UUID,
    body: ClearIntegrityHoldRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Clear the integrity hold on a result, making it eligible for release.

    Must only be called after the underlying integrity flag has been
    resolved (DISMISSED or the hold is determined to be unfounded).

    Requires a written justification.
    """
    service = ResultService(db)
    await service.clear_integrity_hold(
        result_id=result_id,
        cleared_by_id=current_user.id,
    )
    return {
        "message": "Integrity hold cleared. Result is now eligible for release.",
        "result_id": str(result_id),
        "cleared_by": str(current_user.id),
    }


@router.get(
    "/assessment/{assessment_id}/release-queue",
    response_model=ReleaseQueueResponse,
    summary="Get results release readiness queue for an assessment by class section",
)
async def get_release_readiness_queue(
    assessment_id: uuid.UUID,
    class_section_id: uuid.UUID = Query(...),
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> ReleaseQueueResponse:
    from app.db.models.academic import StudentEnrollment
    from app.db.models.auth import User as DBUser, UserProfile
    from app.db.models.attempt import AssessmentAttempt, StudentResponse, SubmissionGrade
    from app.db.models.result import AssessmentResult
    from sqlalchemy import select, func

    # 1. Fetch active enrollments with user display names
    stmt = (
        select(
            DBUser.id,
            DBUser.email,
            UserProfile.display_name,
            UserProfile.first_name,
            UserProfile.last_name,
        )
        .outerjoin(UserProfile, UserProfile.user_id == DBUser.id)
        .join(StudentEnrollment, StudentEnrollment.student_id == DBUser.id)
        .where(
            StudentEnrollment.class_section_id == class_section_id,
            StudentEnrollment.is_deleted == False
        )
    )
    res = await db.execute(stmt)
    students = res.all()

    if not students:
        return ReleaseQueueResponse(items=[], class_fully_graded=True)

    student_ids = [s[0] for s in students]

    # 2. Pre-fetch attempts
    attempt_stmt = (
        select(AssessmentAttempt)
        .where(
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.student_id.in_(student_ids),
            AssessmentAttempt.is_deleted == False
        )
    )
    attempt_res = await db.execute(attempt_stmt)
    attempts = {a.student_id: a for a in attempt_res.scalars().all()}

    # 3. Pre-fetch results
    result_stmt = (
        select(AssessmentResult)
        .where(
            AssessmentResult.assessment_id == assessment_id,
            AssessmentResult.student_id.in_(student_ids),
            AssessmentResult.is_deleted == False
        )
    )
    result_res = await db.execute(result_stmt)
    results = {r.student_id: r for r in result_res.scalars().all()}

    # 4. Pre-fetch count of responses per attempt
    resp_count_stmt = (
        select(StudentResponse.attempt_id, func.count(StudentResponse.id))
        .join(AssessmentAttempt, AssessmentAttempt.id == StudentResponse.attempt_id)
        .where(
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.student_id.in_(student_ids),
            AssessmentAttempt.is_deleted == False,
            StudentResponse.is_deleted == False
        )
        .group_by(StudentResponse.attempt_id)
    )
    resp_counts_res = await db.execute(resp_count_stmt)
    resp_counts = dict(resp_counts_res.all())

    # 5. Pre-fetch count of finalized grades per attempt
    final_count_stmt = (
        select(SubmissionGrade.attempt_id, func.count(SubmissionGrade.id))
        .join(AssessmentAttempt, AssessmentAttempt.id == SubmissionGrade.attempt_id)
        .where(
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.student_id.in_(student_ids),
            SubmissionGrade.is_final == True,
            AssessmentAttempt.is_deleted == False,
            SubmissionGrade.is_deleted == False
        )
        .group_by(SubmissionGrade.attempt_id)
    )
    final_counts_res = await db.execute(final_count_stmt)
    final_counts = dict(final_counts_res.all())

    # Check if all attempts/results are fully graded
    class_fully_graded = True
    for s in students:
        student_id = s[0]
        result = results.get(student_id)
        attempt = attempts.get(student_id)
        if result:
            if result.total_question_count > 0:
                if result.graded_question_count < result.total_question_count:
                    class_fully_graded = False
            elif not result.is_group_result:
                class_fully_graded = False
        elif attempt:
            tot = resp_counts.get(attempt.id, 0)
            fin = final_counts.get(attempt.id, 0)
            if fin < tot or tot == 0:
                class_fully_graded = False
        else:
            class_fully_graded = False

    # Populate response items list
    items = []
    for s in students:
        student_id = s[0]
        email = s[1]
        display_name = s[2]
        first_name = s[3]
        last_name = s[4]

        full_name = f"{first_name or ''} {last_name or ''}".strip()
        student_name = display_name or full_name or email or f"Student {student_id}"

        attempt = attempts.get(student_id)
        result = results.get(student_id)

        attempt_id = attempt.id if attempt else (result.attempt_id if result else None)
        tot = result.total_question_count if (result and result.total_question_count > 0) else (resp_counts.get(attempt_id, 0) if attempt_id else 0)
        fin = result.graded_question_count if (result and result.graded_question_count > 0) else (final_counts.get(attempt_id, 0) if attempt_id else 0)

        integrity_hold = result.integrity_hold if result else False
        is_released = result.is_released if result else False

        total_score = result.total_score if result else None
        max_score = result.max_score if result else None
        percentage = result.percentage if result else None
        letter_grade = result.letter_grade.value if (result and result.letter_grade) else None

        has_submission = (attempt_id is not None) or (result is not None)
        can_release = (
            class_fully_graded and
            has_submission and
            not is_released and
            not integrity_hold and
            (fin >= tot and tot > 0)
        )

        status = "NOT_SUBMITTED"
        if has_submission:
            if is_released:
                status = "RELEASED"
            elif integrity_hold:
                status = "INTEGRITY_HOLD"
            elif fin < tot or tot == 0:
                status = "GRADING_IN_PROGRESS"
            elif can_release:
                status = "PENDING_RELEASE"
            else:
                status = "AWAITING_CLASS_COMPLETION"

        items.append({
            "student_id": student_id,
            "student_name": student_name,
            "attempt_id": attempt_id,
            "graded_question_count": fin,
            "total_question_count": tot,
            "integrity_hold": integrity_hold,
            "is_released": is_released,
            "can_release": can_release,
            "status": status,
            "total_score": total_score,
            "max_score": max_score,
            "percentage": percentage,
            "letter_grade": letter_grade,
        })

    return ReleaseQueueResponse(items=items, class_fully_graded=class_fully_graded)
