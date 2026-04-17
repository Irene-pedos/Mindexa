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
from typing import Optional

from app.db.repositories.result_repo import ResultRepository
from app.db.session import get_db
from app.dependencies.auth import (require_active_user,
                                   require_lecturer_or_admin, require_student)
from app.schemas.result import (AssessmentResultResponse,
                                ClearIntegrityHoldRequest,
                                ReleaseResultsRequest, ResultBreakdownItem,
                                ResultListResponse, ResultReleaseResponse,
                                ResultSummary)
from app.services.result_service import ResultService
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/results", tags=["Results"])


# ── STUDENT: GET OWN RESULT ───────────────────────────────────────────────────


@router.get(
    "/attempt/{attempt_id}",
    response_model=AssessmentResultResponse,
    summary="Get your own result (student)",
)
async def get_my_result(
    attempt_id: uuid.UUID,
    current_user=Depends(require_student),
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


# ── LECTURER: GET RESULT (NO RELEASE CHECK) ───────────────────────────────────


@router.get(
    "/lecturer/{attempt_id}",
    response_model=AssessmentResultResponse,
    summary="Get result for an attempt (lecturer/admin — no release check)",
)
async def get_result_for_lecturer(
    attempt_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
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
    is_released: Optional[bool] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> ResultListResponse:
    repo = ResultRepository(db)
    items, total = await repo.list_by_assessment(
        assessment_id=assessment_id,
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
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResultResponse:
    """
    (Re)calculate the result for a submitted attempt.

    Safe to call multiple times — idempotent.
    Used after all grades are finalised.
    Result is NOT released to the student until POST /results/release is called.
    """
    service = ResultService(db)
    result, created = await service.calculate_result(attempt_id=attempt_id)
    await db.commit()
    return AssessmentResultResponse.model_validate(result)


# ── RELEASE RESULTS ───────────────────────────────────────────────────────────


@router.post(
    "/release",
    response_model=ResultReleaseResponse,
    summary="Release results to students",
)
async def release_results(
    body: ReleaseResultsRequest,
    current_user=Depends(require_lecturer_or_admin),
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
    )
    await db.commit()
    return ResultReleaseResponse(**release_data)


# ── CLEAR INTEGRITY HOLD ──────────────────────────────────────────────────────


@router.post(
    "/{result_id}/clear-hold",
    response_model=dict,
    summary="Clear an integrity hold on a result",
)
async def clear_integrity_hold(
    result_id: uuid.UUID,
    body: ClearIntegrityHoldRequest,
    current_user=Depends(require_lecturer_or_admin),
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
    await db.commit()
    return {
        "message": "Integrity hold cleared. Result is now eligible for release.",
        "result_id": str(result_id),
        "cleared_by": str(current_user.id),
    }
