"""
app/api/v1/routes/appeals.py

Phase 6B: Individual Appeals and Absence Excuse routes.
Transport layer only — all business logic lives in AppealService / AbsenceService.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import AbsenceExcuseStatus, IndividualAppealStatus
from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import (
    ActiveUser,
    AdminUser,
    LecturerOrAdminUser,
    StudentUser,
    require_active_user,
    require_admin,
    require_lecturer_or_admin,
    require_student,
)
from app.schemas.appeals import (
    AbsenceExcuseCreate,
    AbsenceExcuseDecide,
    AbsenceExcuseListResponse,
    AbsenceExcusePolicyResponse,
    AbsenceExcusePolicyUpdate,
    AbsenceExcuseResponse,
    AppealAssignReviewer,
    AppealCloseDecision,
    AppealCreate,
    AppealListResponse,
    AppealPaymentAttach,
    AppealPolicyResponse,
    AppealPolicyUpdate,
    AppealResponse,
    AppealSubmitReview,
    EligibleReviewersResponse,
)
from app.services.absence_service import AbsenceService
from app.services.appeal_service import AppealService

router = APIRouter(tags=["Appeals & Excuses"])


# ── Appeal Policy (Admin) ─────────────────────────────────────────────────────


@router.get(
    "/admin/appeal-policy",
    response_model=AppealPolicyResponse,
    summary="Get institutional appeal policy",
)
async def get_appeal_policy(
    institution_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AppealPolicyResponse:
    service = AppealService(db)
    policy = await service.get_or_default_policy(institution_id)
    return AppealPolicyResponse.model_validate(policy)


@router.put(
    "/admin/appeal-policy",
    response_model=AppealPolicyResponse,
    summary="Create or update institutional appeal policy",
)
async def upsert_appeal_policy(
    institution_id: uuid.UUID = Query(...),
    payload: AppealPolicyUpdate = ...,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AppealPolicyResponse:
    service = AppealService(db)
    policy = await service.upsert_policy(
        institution_id,
        **payload.model_dump(exclude_none=True),
    )
    return AppealPolicyResponse.model_validate(policy)


# ── Student: Submit & Manage Appeals ─────────────────────────────────────────


@router.post(
    "/student/appeals",
    response_model=AppealResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an individual grade appeal",
)
async def submit_appeal(
    payload: AppealCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
) -> AppealResponse:
    service = AppealService(db)
    appeal = await service.submit_appeal(student=current_user, payload=payload)
    return AppealResponse.model_validate(appeal)


@router.get(
    "/student/appeals",
    response_model=AppealListResponse,
    summary="List current student's appeals",
)
async def list_student_appeals(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
) -> AppealListResponse:
    service = AppealService(db)
    items = await service.repo.list_appeals_for_student(
        student_id=current_user.id, limit=limit, offset=offset
    )
    return AppealListResponse(
        items=[AppealResponse.model_validate(a) for a in items],
        total=len(items),
        limit=limit,
        offset=offset,
    )


@router.get(
    "/student/appeals/{appeal_id}",
    response_model=AppealResponse,
    summary="Get a single appeal by ID",
)
async def get_student_appeal(
    appeal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
) -> AppealResponse:
    from app.core.exceptions import NotFoundError, PermissionDeniedError

    service = AppealService(db)
    appeal = await service.repo.get_appeal(appeal_id)
    if not appeal:
        raise NotFoundError(resource="Appeal", resource_id=str(appeal_id))
    if appeal.student_id != current_user.id:
        raise PermissionDeniedError(message="You do not own this appeal.")
    return AppealResponse.model_validate(appeal)


@router.post(
    "/student/appeals/{appeal_id}/payment-reference",
    response_model=AppealResponse,
    summary="Attach a payment reference to a pending appeal",
)
async def attach_appeal_payment(
    appeal_id: uuid.UUID,
    payload: AppealPaymentAttach,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
) -> AppealResponse:
    service = AppealService(db)
    appeal = await service.attach_payment(
        student=current_user,
        appeal_id=appeal_id,
        payment_reference_id=payload.payment_reference_id,
    )
    return AppealResponse.model_validate(appeal)


@router.post(
    "/student/appeals/{appeal_id}/withdraw",
    response_model=AppealResponse,
    summary="Withdraw an open appeal",
)
async def withdraw_appeal(
    appeal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
) -> AppealResponse:
    service = AppealService(db)
    appeal = await service.withdraw_appeal(student=current_user, appeal_id=appeal_id)
    return AppealResponse.model_validate(appeal)


# ── HOD: Appeal Management ────────────────────────────────────────────────────


@router.get(
    "/hod/appeals",
    response_model=AppealListResponse,
    summary="List all appeals in HOD's institution / department",
)
async def list_hod_appeals(
    institution_id: uuid.UUID = Query(...),
    department_id: Optional[uuid.UUID] = Query(default=None),
    status_filter: Optional[IndividualAppealStatus] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_lecturer_or_admin),
) -> AppealListResponse:
    service = AppealService(db)
    items = await service.repo.list_appeals_for_hod(
        institution_id=institution_id,
        department_id=department_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return AppealListResponse(
        items=[AppealResponse.model_validate(a) for a in items],
        total=len(items),
        limit=limit,
        offset=offset,
    )


@router.get(
    "/hod/appeals/{appeal_id}/eligible-reviewers",
    response_model=EligibleReviewersResponse,
    summary="Get eligible reviewer pool for an appeal",
)
async def get_eligible_reviewers(
    appeal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> EligibleReviewersResponse:
    service = AppealService(db)
    return await service.get_eligible_reviewers(appeal_id=appeal_id, hod=current_user)


@router.post(
    "/hod/appeals/{appeal_id}/assign",
    response_model=AppealResponse,
    summary="Assign a reviewer to an appeal",
)
async def assign_reviewer(
    appeal_id: uuid.UUID,
    payload: AppealAssignReviewer,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> AppealResponse:
    service = AppealService(db)
    appeal = await service.assign_reviewer(
        appeal_id=appeal_id, hod=current_user, payload=payload
    )
    return AppealResponse.model_validate(appeal)


@router.post(
    "/hod/appeals/{appeal_id}/close",
    response_model=AppealResponse,
    summary="Close appeal with a final decision",
)
async def close_appeal(
    appeal_id: uuid.UUID,
    payload: AppealCloseDecision,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> AppealResponse:
    service = AppealService(db)
    appeal = await service.close_appeal(
        appeal_id=appeal_id, hod=current_user, payload=payload
    )
    return AppealResponse.model_validate(appeal)


# ── Lecturer: Review Queue ────────────────────────────────────────────────────


@router.get(
    "/lecturer/review-queue",
    response_model=AppealListResponse,
    summary="List appeals assigned to the current lecturer for review",
)
async def lecturer_review_queue(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> AppealListResponse:
    service = AppealService(db)
    items = await service.repo.list_reviews_for_lecturer(
        reviewer_id=current_user.id, limit=limit, offset=offset
    )
    return AppealListResponse(
        items=[AppealResponse.model_validate(a) for a in items],
        total=len(items),
        limit=limit,
        offset=offset,
    )


@router.post(
    "/lecturer/appeals/{appeal_id}/submit-review",
    response_model=AppealResponse,
    summary="Submit a grade review for an assigned appeal",
)
async def submit_appeal_review(
    appeal_id: uuid.UUID,
    payload: AppealSubmitReview,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> AppealResponse:
    service = AppealService(db)
    appeal = await service.submit_review(
        appeal_id=appeal_id, reviewer=current_user, payload=payload
    )
    return AppealResponse.model_validate(appeal)


# ── Absence Excuse Policy (Admin) ─────────────────────────────────────────────


@router.get(
    "/admin/absence-excuse-policy",
    response_model=AbsenceExcusePolicyResponse,
    summary="Get institutional absence excuse policy",
)
async def get_excuse_policy(
    institution_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AbsenceExcusePolicyResponse:
    service = AbsenceService(db)
    policy = await service.get_or_default_policy(institution_id)
    return AbsenceExcusePolicyResponse.model_validate(policy)


@router.put(
    "/admin/absence-excuse-policy",
    response_model=AbsenceExcusePolicyResponse,
    summary="Create or update institutional absence excuse policy",
)
async def upsert_excuse_policy(
    institution_id: uuid.UUID = Query(...),
    payload: AbsenceExcusePolicyUpdate = ...,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AbsenceExcusePolicyResponse:
    service = AbsenceService(db)
    policy = await service.upsert_policy(
        institution_id,
        **payload.model_dump(exclude_none=True),
    )
    return AbsenceExcusePolicyResponse.model_validate(policy)


# ── Student: Submit & Manage Excuses ──────────────────────────────────────────


@router.post(
    "/student/excuses",
    response_model=AbsenceExcuseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an absence excuse request",
)
async def submit_excuse(
    payload: AbsenceExcuseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
) -> AbsenceExcuseResponse:
    service = AbsenceService(db)
    excuse = await service.submit_excuse(student=current_user, payload=payload)
    return AbsenceExcuseResponse.model_validate(excuse)


@router.get(
    "/student/excuses",
    response_model=AbsenceExcuseListResponse,
    summary="List current student's absence excuse requests",
)
async def list_student_excuses(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
) -> AbsenceExcuseListResponse:
    service = AbsenceService(db)
    items = await service.list_for_student(
        student_id=current_user.id, limit=limit, offset=offset
    )
    return AbsenceExcuseListResponse(
        items=[AbsenceExcuseResponse.model_validate(e) for e in items],
        total=len(items),
        limit=limit,
        offset=offset,
    )


@router.post(
    "/student/excuses/{excuse_id}/withdraw",
    response_model=AbsenceExcuseResponse,
    summary="Withdraw a submitted absence excuse",
)
async def withdraw_excuse(
    excuse_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
) -> AbsenceExcuseResponse:
    service = AbsenceService(db)
    excuse = await service.withdraw_excuse(student=current_user, excuse_id=excuse_id)
    return AbsenceExcuseResponse.model_validate(excuse)


# ── Lecturer: Course Excuse Queue ─────────────────────────────────────────────


@router.get(
    "/lecturer/excuses",
    response_model=AbsenceExcuseListResponse,
    summary="List absence excuses for a course (lecturer view)",
)
async def list_lecturer_excuses(
    course_id: uuid.UUID = Query(...),
    status_filter: Optional[AbsenceExcuseStatus] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_lecturer_or_admin),
) -> AbsenceExcuseListResponse:
    service = AbsenceService(db)
    items = await service.list_for_course(
        course_id=course_id, status=status_filter, limit=limit, offset=offset
    )
    return AbsenceExcuseListResponse(
        items=[AbsenceExcuseResponse.model_validate(e) for e in items],
        total=len(items),
        limit=limit,
        offset=offset,
    )


@router.post(
    "/lecturer/excuses/{excuse_id}/decide",
    response_model=AbsenceExcuseResponse,
    summary="Decide on an absence excuse (Lecturer)",
)
async def lecturer_decide_excuse(
    excuse_id: uuid.UUID,
    payload: AbsenceExcuseDecide,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> AbsenceExcuseResponse:
    service = AbsenceService(db)
    excuse = await service.decide_excuse(
        excuse_id=excuse_id, decider=current_user, payload=payload
    )
    return AbsenceExcuseResponse.model_validate(excuse)


# ── HOD: Institution / Department Excuse Queue ────────────────────────────────


@router.get(
    "/hod/excuses",
    response_model=AbsenceExcuseListResponse,
    summary="List absence excuses for HOD's institution / department",
)
async def list_hod_excuses(
    institution_id: uuid.UUID = Query(...),
    department_id: Optional[uuid.UUID] = Query(default=None),
    status_filter: Optional[AbsenceExcuseStatus] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_lecturer_or_admin),
) -> AbsenceExcuseListResponse:
    service = AbsenceService(db)
    items = await service.list_for_institution(
        institution_id=institution_id,
        department_id=department_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return AbsenceExcuseListResponse(
        items=[AbsenceExcuseResponse.model_validate(e) for e in items],
        total=len(items),
        limit=limit,
        offset=offset,
    )


@router.post(
    "/hod/excuses/{excuse_id}/decide",
    response_model=AbsenceExcuseResponse,
    summary="Decide on an absence excuse (HOD)",
)
async def hod_decide_excuse(
    excuse_id: uuid.UUID,
    payload: AbsenceExcuseDecide,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> AbsenceExcuseResponse:
    service = AbsenceService(db)
    excuse = await service.decide_excuse(
        excuse_id=excuse_id, decider=current_user, payload=payload
    )
    return AbsenceExcuseResponse.model_validate(excuse)
