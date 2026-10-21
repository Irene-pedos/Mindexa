"""
backend/app/api/v1/routes/eligibility.py

Phase 6A: Eligibility, Reassessment, and Retake Engine routes.
Transport layer only: input parsing, auth/access checks, delegating to EligibilityService.
"""
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import UserRole
from app.core.exceptions import (
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.core.permissions import is_hod_of
from app.db.models.assessment import Assessment
from app.db.models.auth import User
from app.db.models.eligibility import RetakeRecord
from app.db.session import get_db
from app.dependencies.auth import (
    require_active_user,
    require_admin,
    require_lecturer_or_admin,
)
from app.schemas.eligibility import (
    AssessmentBlockedStudentsResponse,
    AttemptEligibilityOverrideCreate,
    AttemptEligibilityOverrideResponse,
    EligibilityPolicyResponse,
    EligibilityPolicyUpdate,
    LecturerCourseEligibilityResponse,
    PaymentConfirmationRequest,
    PaymentReferenceCreate,
    PaymentReferenceResponse,
    RetakeEnrollRequest,
    RetakeRecordResponse,
    StudentCourseEligibilityResponse,
)
from app.services.eligibility_service import EligibilityService

router = APIRouter(tags=["Eligibility"])


# ── Student Endpoints ────────────────────────────────────────────────────────


@router.get(
    "/student/eligibility/courses/{course_id}",
    response_model=StudentCourseEligibilityResponse,
    summary="Get explainable student eligibility status for a course",
)
async def get_student_course_eligibility(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
) -> StudentCourseEligibilityResponse:
    """Returns student's coursework average, pending marks, and summative eligibility."""
    service = EligibilityService(db)
    return await service.get_student_course_eligibility(
        student_id=current_user.id,
        course_id=course_id,
    )


@router.get(
    "/student/retakes",
    response_model=List[RetakeRecordResponse],
    summary="List all retake obligations for the current student",
)
async def list_student_retakes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
) -> List[RetakeRecordResponse]:
    """Returns student's retake records with payment and enrollment details."""
    service = EligibilityService(db)
    retakes = await service.repo.list_retakes_for_student(student_id=current_user.id)
    return [RetakeRecordResponse.model_validate(r) for r in retakes]


@router.post(
    "/student/retakes/{id}/payment-reference",
    response_model=RetakeRecordResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Attach payment reference information to a retake obligation",
)
async def attach_retake_payment_reference(
    id: uuid.UUID,
    payment_in: PaymentReferenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
) -> RetakeRecordResponse:
    """Student provides payment transaction reference for an institutional retake."""
    service = EligibilityService(db)
    retake = await service.attach_payment_reference(
        retake_id=id,
        student_id=current_user.id,
        external_reference=payment_in.external_reference,
        amount_text=payment_in.amount_text,
        notes=payment_in.notes,
    )
    await db.commit()
    # Refresh to load relationships
    reloaded = await service.repo.get_retake_record(retake.id)
    return RetakeRecordResponse.model_validate(reloaded or retake)


# ── Lecturer & HOD Endpoints ─────────────────────────────────────────────────


@router.get(
    "/lecturer/courses/{course_id}/eligibility",
    response_model=LecturerCourseEligibilityResponse,
    summary="Get cohort-wide eligibility breakdown for a course",
)
async def get_lecturer_course_cohort_eligibility(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> LecturerCourseEligibilityResponse:
    """Lecturer / HOD overview of student coursework averages and exam readiness."""
    service = EligibilityService(db)
    return await service.get_lecturer_course_cohort_eligibility(course_id=course_id)


@router.get(
    "/lecturer/assessments/{id}/blocked-students",
    response_model=AssessmentBlockedStudentsResponse,
    summary="List blocked students for an assessment with denial reasons",
)
async def get_assessment_blocked_students(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> AssessmentBlockedStudentsResponse:
    """Returns students blocked from starting an assessment and pending reassessment warnings."""
    service = EligibilityService(db)
    return await service.get_assessment_blocked_students(assessment_id=id)


@router.post(
    "/hod/eligibility-overrides",
    response_model=AttemptEligibilityOverrideResponse,
    status_code=status.HTTP_201_CREATED,
    summary="HOD override allowing an attempt despite normal eligibility block",
)
async def create_hod_override(
    override_in: AttemptEligibilityOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> AttemptEligibilityOverrideResponse:
    """HOD grants single-student attempt permission with mandatory reason (A-11)."""
    service = EligibilityService(db)
    assessment, course = await service._resolve_assessment_and_course(override_in.assessment_id)

    # Verify caller is HOD of course department or Admin
    is_admin_user = current_user.role in [UserRole.ADMIN.value, UserRole.ADMIN]
    if not is_admin_user:
        if not course.department_id or not await is_hod_of(db, current_user, course.department_id):
            raise PermissionDeniedError("Only the Head of Department or Admin can grant eligibility overrides.")

    override = await service.create_hod_override(
        student_id=override_in.student_id,
        assessment_id=override_in.assessment_id,
        reason=override_in.reason,
        granted_by=current_user,
        allowed_window_start=override_in.allowed_window_start,
        allowed_window_end=override_in.allowed_window_end,
    )
    await db.commit()
    return AttemptEligibilityOverrideResponse.model_validate(override)


# ── Administrative & Finance Endpoints ───────────────────────────────────────


@router.get(
    "/admin/eligibility-policy",
    response_model=EligibilityPolicyResponse,
    summary="Get eligibility policy thresholds for an institution / department",
)
async def get_eligibility_policy(
    institution_id: uuid.UUID = Query(...),
    department_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> EligibilityPolicyResponse:
    """Retrieve institutional eligibility policy."""
    service = EligibilityService(db)
    policy = await service.get_policy(institution_id=institution_id, department_id=department_id)
    return EligibilityPolicyResponse.model_validate(policy)


@router.put(
    "/admin/eligibility-policy",
    response_model=EligibilityPolicyResponse,
    summary="Update eligibility policy thresholds",
)
async def update_eligibility_policy(
    policy_in: EligibilityPolicyUpdate,
    institution_id: uuid.UUID = Query(...),
    department_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> EligibilityPolicyResponse:
    """Update institutional eligibility thresholds."""
    service = EligibilityService(db)
    update_data = policy_in.model_dump(exclude_unset=True)
    # Remove institution_id / department_id from update_data if present
    update_data.pop("institution_id", None)
    update_data.pop("department_id", None)

    policy = await service.update_policy(
        institution_id=institution_id,
        department_id=department_id,
        **update_data,
    )
    await db.commit()
    return EligibilityPolicyResponse.model_validate(policy)


@router.post(
    "/admin/payment-references/{id}/confirm",
    response_model=PaymentReferenceResponse,
    summary="Confirm or reject an external payment reference",
)
async def confirm_payment_reference(
    id: uuid.UUID,
    confirm_in: PaymentConfirmationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> PaymentReferenceResponse:
    """Admin or finance user confirms offline or external payment confirmation."""
    is_admin_user = current_user.role in [UserRole.ADMIN.value, UserRole.ADMIN]
    if not is_admin_user:
        raise PermissionDeniedError("Only finance or administrative users can confirm payments.")

    service = EligibilityService(db)
    confirmed = await service.confirm_payment_reference(
        payment_id=id,
        status=confirm_in.status,
        confirmed_by=current_user,
        notes=confirm_in.notes,
    )
    await db.commit()
    return PaymentReferenceResponse.model_validate(confirmed)


@router.post(
    "/admin/retakes/{id}/enroll",
    response_model=RetakeRecordResponse,
    summary="Finalize retake enrolment into next academic period",
)
async def enroll_retake(
    id: uuid.UUID,
    enroll_in: RetakeEnrollRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> RetakeRecordResponse:
    """Admin or HOD finalizes retake student enrollment after payment is confirmed."""
    service = EligibilityService(db)
    retake = await service.repo.get_retake_record(id)
    if not retake:
        raise NotFoundError(f"Retake record {id} not found.")

    is_admin_user = current_user.role in [UserRole.ADMIN.value, UserRole.ADMIN]
    if not is_admin_user:
        dept_id = retake.course.department_id if retake.course else None
        if not dept_id or not await is_hod_of(db, current_user, dept_id):
            raise PermissionDeniedError("Only the Head of Department or Admin can finalize retake enrollment.")

    enrolled = await service.enroll_retake(
        retake_id=id,
        target_period_id=enroll_in.target_period_id,
        target_course_id=enroll_in.target_course_id,
    )
    await db.commit()
    reloaded = await service.repo.get_retake_record(enrolled.id)
    return RetakeRecordResponse.model_validate(reloaded or enrolled)
