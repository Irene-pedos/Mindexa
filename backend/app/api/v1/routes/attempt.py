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
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, NotFoundError
from app.db.enums import AttemptStatus, UserRole
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.session import get_db
from app.dependencies.auth import require_active_user, require_lecturer_or_admin, require_student
from app.schemas.attempt import (
    AttemptListResponse,
    AttemptDetailResponse,
    AttemptStartRequest,
    AttemptStartResponse,
    AttemptSubmitRequest,
    AttemptSummary,
    AttemptSupervisorView,
)
from app.services.attempt_service import AttemptService

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

    now = datetime.now(UTC)
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

    now = datetime.now(UTC)
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
    response_model=AttemptDetailResponse,
    summary="Voluntarily submit an attempt",
)
async def submit_attempt(
    attempt_id: uuid.UUID,
    body: AttemptSubmitRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> any:
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

    # Dispatch background grading
    from app.workers.tasks.grading import trigger_grading_for_attempt
    trigger_grading_for_attempt.delay(str(attempt.id))

    return AttemptDetailResponse.model_validate(attempt)


# ── LIST MY ATTEMPTS ──────────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=AttemptListResponse,
    summary="List the current student's attempts",
)
async def list_my_attempts(
    status: AttemptStatus | None = Query(default=None),
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
    
    summaries = []
    from app.db.models.attempt import GroupSubmission
    from sqlalchemy import select
    
    for a in items:
        summary = AttemptSummary.model_validate(a)
        if a.group_id:
            sub_stmt = select(GroupSubmission).where(
                GroupSubmission.assessment_id == a.assessment_id,
                GroupSubmission.group_id == a.group_id
            )
            sub_res = await db.execute(sub_stmt)
            submission = sub_res.scalar_one_or_none()
            if submission:
                summary.group_submission_id = submission.id
                summary.group_submission_status = submission.status
        summaries.append(summary)

    return AttemptListResponse(
        items=summaries,
        total=total,
        page=page,
        page_size=page_size,
    )


# ── GET ATTEMPT ───────────────────────────────────────────────────────────────


@router.get(
    "/{attempt_id}",
    response_model=AttemptDetailResponse,
    summary="Get attempt detail",
)
async def get_attempt(
    attempt_id: uuid.UUID,
    current_user=Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> any:
    """
    Return attempt detail.

    Students: can only access their own attempts.
    Lecturers/Admins: can access any attempt.
    """
    repo = AttemptRepository(db)
    attempt = await repo.get_with_questions(attempt_id)
    if not attempt:
        raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

    if current_user.role == UserRole.STUDENT.value and attempt.student_id != current_user.id:
        raise AuthorizationError("You do not own this attempt", code="ATTEMPT_OWNERSHIP_VIOLATION")

    # Map assessment questions to attempt questions
    questions_data = []
    if attempt.assessment and attempt.assessment.assessment_questions:
        # Load sections for title lookup
        section_map = {s.id: s.title for s in attempt.assessment.sections}
        
        for aq in attempt.assessment.assessment_questions:
            if aq.question:
                q = aq.question
                questions_data.append({
                    "id": str(q.id),
                    "type": q.question_type.value,
                    "content": q.content,
                    "text": q.content,
                    "imageUrl": q.image_url,
                    "marks": aq.marks_override or q.marks,
                    "order_index": aq.order_index,
                    "assessment_section_id": str(aq.assessment_section_id) if aq.assessment_section_id else None,
                    "section_title": section_map.get(aq.assessment_section_id) if aq.assessment_section_id else "General",
                    "options": [
                        {
                            "id": str(opt.id),
                            "text": opt.content,
                            "option_text": opt.content,
                            "match_value": opt.match_value,
                            "option_text_right": opt.match_value,
                            "order_index": opt.order_index
                        }
                        for opt in (q.options or [])
                    ] if q.options else None
                })

    # Shuffling Logic: Shuffle within each section if enabled
    if attempt.assessment and attempt.assessment.randomize_questions:
        import random
        # Seed with attempt ID for stability per attempt
        rng = random.Random(str(attempt.id))
        
        # Group by section
        by_section = {}
        for qd in questions_data:
            sid = qd["assessment_section_id"]
            if sid not in by_section:
                by_section[sid] = []
            by_section[sid].append(qd)
            
        # Shuffle each group and re-assemble
        shuffled_questions = []
        # Sort sections by original order of first question to maintain section flow
        sorted_sids = sorted(by_section.keys(), key=lambda sid: min(q["order_index"] for q in by_section[sid]))
        
        for sid in sorted_sids:
            section_qs = by_section[sid]
            rng.shuffle(section_qs)
            shuffled_questions.extend(section_qs)
        
        questions_data = shuffled_questions
    else:
        # Sort by order_index
        questions_data.sort(key=lambda x: x["order_index"])

    response = AttemptDetailResponse.model_validate(attempt)
    response.questions = questions_data

    # Populate group-work specific fields
    if attempt.group_id:
        # Get the group submission for this assessment/group
        from app.db.models.attempt import GroupSubmission, StudentGroupMember
        from app.db.models.auth import User, UserProfile
        from sqlalchemy import select

        # Get submission status/id
        sub_stmt = select(GroupSubmission).where(
            GroupSubmission.assessment_id == attempt.assessment_id,
            GroupSubmission.group_id == attempt.group_id
        )
        sub_res = await db.execute(sub_stmt)
        submission = sub_res.scalar_one_or_none()
        if submission:
            response.group_submission_id = submission.id
            response.group_submission_status = submission.status

        # Get question distribution mode from assessment
        if attempt.assessment:
            response.question_distribution_mode = attempt.assessment.question_distribution_mode

        # Populate group members
        members_stmt = (
            select(UserProfile.display_name, UserProfile.first_name, UserProfile.last_name, User.id)
            .join(User, User.id == UserProfile.user_id)
            .join(StudentGroupMember, StudentGroupMember.student_id == User.id)
            .where(StudentGroupMember.group_id == attempt.group_id)
        )
        members_res = await db.execute(members_stmt)
        response.group_members = [
            {
                "id": str(m.id),
                "name": m.display_name or f"{m.first_name} {m.last_name}",
            }
            for m in members_res.all()
        ]

    return response


# ── LIST ATTEMPTS FOR ASSESSMENT (Supervisor) ─────────────────────────────────


@router.get(
    "/assessment/{assessment_id}",
    response_model=list[AttemptSupervisorView],
    summary="List all attempts for an assessment (supervisor view)",
)
async def list_attempts_for_assessment(
    assessment_id: uuid.UUID,
    status: AttemptStatus | None = Query(default=None),
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
