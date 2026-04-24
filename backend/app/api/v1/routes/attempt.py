"""
app/api/v1/routes/attempt.py

Assessment Attempt API routes.

Endpoints:
    POST   /attempts/start              → Start a new attempt (student)
    POST   /attempts/{id}/resume        → Resume a PAUSED attempt (student)
    POST   /attempts/{id}/submit        → Submit an attempt voluntarily (student)
    GET    /attempts/{id}               → Get attempt detail (student/supervisor)
    GET    /attempts/me                 → List student's own attempts
    GET    /attempts/assessment/{id}    → List all attempts for an assessment (supervisor)

Security:
    Students can only access their own attempts.
    Supervisors/admins can list all attempts for assessments they supervise.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core.exceptions import AuthorizationError, NotFoundError
from app.db.enums import AttemptStatus, UserRole
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.session import get_db
from app.dependencies.auth import (require_active_user,
                                   require_lecturer_or_admin, require_student)
from app.schemas.attempt import (AttemptListResponse, AttemptResponse,
                                 AttemptStartRequest, AttemptStartResponse,
                                 AttemptSubmitRequest, AttemptSummary,
                                 AttemptSupervisorView)
from app.services.attempt_service import AttemptService
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/attempts", tags=["Attempts"])


# ── START ATTEMPT ─────────────────────────────────────────────────────────────


@router.post(
    "/start",
    response_model=AttemptStartResponse,
    status_code=201,
    summary="Start a new assessment attempt",
)
async def start_attempt(
    body: AttemptStartRequest,
    request: Request,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AttemptStartResponse:
    """
    Create a new IN_PROGRESS attempt for the authenticated student.

    Validates:
        - Assessment is ACTIVE and within window.
        - Student has attempts remaining.
        - No existing active attempt for this assessment.
        - Password matches if assessment is password-protected.

    Returns the attempt ID and access_token required for all subsequent requests.
    """
    service = AttemptService(db)
    attempt = await service.start_attempt(
        student_id=current_user.id,
        assessment_id=body.assessment_id,
        access_password=body.access_password,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    now = datetime.now(timezone.utc)
    seconds_remaining = 0
    if attempt.expires_at:
        seconds_remaining = max(0, int((attempt.expires_at - now).total_seconds()))

    return AttemptStartResponse(
        id=attempt.id,
        assessment_id=attempt.assessment_id,
        attempt_number=attempt.attempt_number,
        status=attempt.status,
        started_at=attempt.started_at or now,
        expires_at=attempt.expires_at or now,
        access_token=attempt.access_token or uuid.uuid4(),
        seconds_remaining=seconds_remaining,
    )


# ── RESUME ATTEMPT ────────────────────────────────────────────────────────────


@router.post(
    "/{attempt_id}/resume",
    response_model=AttemptStartResponse,
    summary="Resume a paused attempt",
)
async def resume_attempt(
    attempt_id: uuid.UUID,
    body: dict,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AttemptStartResponse:
    """
    Resume a PAUSED attempt. Requires the original access_token for verification.
    Issues a new access_token on success (session rotation).
    """
    access_token = body.get("access_token")
    if not access_token:
        raise AuthorizationError("access_token is required", code="TOKEN_MISSING")

    service = AttemptService(db)
    attempt = await service.resume_attempt(
        attempt_id=attempt_id,
        student_id=current_user.id,
        access_token=uuid.UUID(str(access_token)),
    )

    now = datetime.now(timezone.utc)
    seconds_remaining = 0
    if attempt.expires_at:
        seconds_remaining = max(0, int((attempt.expires_at - now).total_seconds()))

    return AttemptStartResponse(
        id=attempt.id,
        assessment_id=attempt.assessment_id,
        attempt_number=attempt.attempt_number,
        status=attempt.status,
        started_at=attempt.started_at or now,
        expires_at=attempt.expires_at or now,
        access_token=attempt.access_token or uuid.uuid4(),
        seconds_remaining=seconds_remaining,
    )


# ── SUBMIT ATTEMPT ────────────────────────────────────────────────────────────


@router.post(
    "/{attempt_id}/submit",
    response_model=AttemptResponse,
    summary="Voluntarily submit an attempt",
)
async def submit_attempt(
    attempt_id: uuid.UUID,
    body: AttemptSubmitRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AttemptResponse:
    """
    Submit the attempt. Locks all responses (is_final=True).
    Requires confirm=True and the valid access_token.
    """
    service = AttemptService(db)
    attempt = await service.submit_attempt(
        attempt_id=attempt_id,
        student_id=current_user.id,
        access_token=body.access_token,
    )
    return AttemptResponse.model_validate(attempt)


# ── GET ATTEMPT ───────────────────────────────────────────────────────────────


@router.get(
    "/{attempt_id}",
    response_model=AttemptResponse,
    summary="Get attempt detail",
)
async def get_attempt(
    attempt_id: uuid.UUID,
    current_user=Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> AttemptResponse:
    """
    Return attempt detail.

    Students: can only access their own attempts.
    Lecturers/Admins: can access any attempt.
    """
    repo = AttemptRepository(db)
    attempt = await repo.get_by_id_simple(attempt_id)
    if not attempt:
        raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

    if current_user.role == UserRole.STUDENT.value and attempt.student_id != current_user.id:
        raise AuthorizationError("You do not own this attempt", code="ATTEMPT_OWNERSHIP_VIOLATION")

    return AttemptResponse.model_validate(attempt)


# ── LIST MY ATTEMPTS ──────────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=AttemptListResponse,
    summary="List the current student's attempts",
)
async def list_my_attempts(
    status: Optional[AttemptStatus] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AttemptListResponse:
    repo = AttemptRepository(db)
    items, total = await repo.list_by_student(
        student_id=current_user.id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return AttemptListResponse(
        items=[AttemptSummary.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


# ── LIST ATTEMPTS FOR ASSESSMENT (Supervisor) ─────────────────────────────────


@router.get(
    "/assessment/{assessment_id}",
    response_model=list[AttemptSupervisorView],
    summary="List all attempts for an assessment (supervisor view)",
)
async def list_attempts_for_assessment(
    assessment_id: uuid.UUID,
    status: Optional[AttemptStatus] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AttemptSupervisorView]:
    repo = AttemptRepository(db)
    items, _ = await repo.list_by_assessment(
        assessment_id=assessment_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return [AttemptSupervisorView.model_validate(a) for a in items]
