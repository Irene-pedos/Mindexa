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

import structlog
from app.core.exceptions import AuthorizationError, NotFoundError
from app.db.enums import AttemptStatus, UserRole
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.session import get_db
from app.dependencies.auth import (require_active_user,
                                   require_lecturer_or_admin, require_student)
from app.schemas.attempt import (AttemptDetailResponse, AttemptListResponse,
                                 AttemptQuestionResponse,
                                 AttemptSectionSelectionResponse,
                                 AttemptStartRequest, AttemptStartResponse,
                                 AttemptSubmitRequest, AttemptSummary,
                                 AttemptSupervisorView, QuestionSelectRequest)
from app.services.attempt_service import AttemptService
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

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


# ── PAUSE ATTEMPT ─────────────────────────────────────────────────────────────


@router.post(
    "/{attempt_id}/pause",
    response_model=AttemptStartResponse,
    summary="Pause an active attempt",
)
async def pause_attempt(
    attempt_id: uuid.UUID,
    body: dict,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AttemptStartResponse:
    """
    Pause an active IN_PROGRESS attempt. Requires access_token for verification.
    """
    access_token = body.get("access_token")
    if not access_token:
        raise AuthorizationError("access_token is required", code="TOKEN_MISSING")
    try:
        access_token_uuid = uuid.UUID(str(access_token))
    except (TypeError, ValueError, AttributeError) as exc:
        raise AuthorizationError("access_token is invalid", code="TOKEN_MISSING") from exc

    service = AttemptService(db)
    attempt = await service.pause_attempt(
        attempt_id=attempt_id,
        student_id=current_user.id,
        access_token=access_token_uuid,
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
    await db.commit()

    # Dispatch background grading
    try:
        from app.workers.tasks.grading import trigger_grading_for_attempt
        trigger_grading_for_attempt.delay(str(attempt.id))
    except Exception as e:
        logger.warning(
            "Could not enqueue Celery grading task for attempt %s: %s",
            str(attempt.id),
            str(e),
        )

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
    from sqlalchemy import select, tuple_

    group_keys = [
        (a.assessment_id, a.group_id)
        for a in items
        if a.group_id is not None
    ]

    group_submissions: dict[tuple[uuid.UUID, uuid.UUID], GroupSubmission] = {}
    if group_keys:
        sub_stmt = select(GroupSubmission).where(
            tuple_(GroupSubmission.assessment_id, GroupSubmission.group_id).in_(group_keys)
        )
        sub_res = await db.execute(sub_stmt)
        for submission in sub_res.scalars().all():
            if submission.group_id is not None:
                group_submissions[(submission.assessment_id, submission.group_id)] = submission

    for a in items:
        summary = AttemptSummary.model_validate(a)
        if a.group_id is not None:
            submission = group_submissions.get((a.assessment_id, a.group_id))
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


def _attempt_options_without_key(question, q_type: str, attempt_id: uuid.UUID) -> list[dict] | None:
    """
    Options as sent to the student, stripped of anything grading treats as the key:
      - MATCHING: no match_value / match_key (the pairing is the answer; choices go
        separately in `match_choices`).
      - ORDERING: options shuffled per attempt and order_index hidden (the stored
        order is the answer).
      - CASE_STUDY: match_key carries sub-question marks and is kept.
    """
    options = list(question.options or [])
    if not options:
        return None

    import random

    if q_type == "ORDERING":
        random.Random(f"{attempt_id}:{question.id}:order").shuffle(options)

    hide_pairing = q_type == "MATCHING"
    return [
        {
            "id": str(opt.id),
            "text": opt.content,
            "option_text": opt.content,
            "match_key": None if hide_pairing else opt.match_key,
            "match_value": None,
            "option_text_right": None,
            "order_index": idx if q_type == "ORDERING" else opt.order_index,
        }
        for idx, opt in enumerate(options)
    ]


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

    Students: own attempts only; score hidden until the result is released.
    Lecturers/Admins: attempts of assessments they have access to.
    """
    repo = AttemptRepository(db)
    attempt = await repo.get_with_questions(attempt_id)
    if not attempt:
        raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

    is_student = current_user.role == UserRole.STUDENT.value
    if is_student and attempt.student_id != current_user.id:
        raise AuthorizationError("You do not own this attempt", code="ATTEMPT_OWNERSHIP_VIOLATION")
    if not is_student:
        from app.services.result_service import ResultService

        await ResultService(db).assert_lecturer_assessment_access(
            attempt.assessment_id, current_user
        )

    # Map assessment questions to attempt questions
    import random

    questions_data = []
    if attempt.assessment and attempt.assessment.assessment_questions:
        # Load sections for title lookup
        section_map = {s.id: s.title for s in attempt.assessment.sections}

        for aq in attempt.assessment.assessment_questions:
            if aq.question:
                q = aq.question
                q_type = getattr(q.question_type, "value", str(q.question_type)).upper()
                options_data = _attempt_options_without_key(q, q_type, attempt.id)
                match_choices = None
                if q_type == "MATCHING":
                    match_choices = [o.match_value for o in (q.options or []) if o.match_value]
                    random.Random(f"{attempt.id}:{q.id}:choices").shuffle(match_choices)
                questions_data.append({
                    "id": str(q.id),
                    "type": q.question_type.value,
                    "content": q.content,
                    "text": q.content,
                    "caseStudyContext": q.case_study_context,
                    "case_study_context": q.case_study_context,
                    "imageUrl": q.image_url,
                    "marks": aq.marks_override or q.marks,
                    "order_index": aq.order_index,
                    "assessment_section_id": str(aq.assessment_section_id) if aq.assessment_section_id else None,
                    "section_title": section_map.get(aq.assessment_section_id) if aq.assessment_section_id else "General",
                    "grading_mode": q.grading_mode.value if hasattr(q.grading_mode, 'value') else q.grading_mode,
                    "question_table_context": q.question_table_context,
                    "questionTableContext": q.question_table_context,
                    "requires_table_answer": bool(q.requires_table_answer),
                    "requiresTableAnswer": bool(q.requires_table_answer),
                    "answer_table_template": q.answer_table_template,
                    "answerTableTemplate": q.answer_table_template,
                    "options": options_data,
                    "match_choices": match_choices,
                })

    # Shuffling Logic: Shuffle within each section if enabled
    if attempt.assessment and attempt.assessment.randomize_questions:
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
    response.questions = [
        AttemptQuestionResponse.model_validate(q) if isinstance(q, dict) else q
        for q in questions_data
    ]

    if is_student and response.total_score is not None:
        from app.db.repositories.result_repo import ResultRepository

        result = await ResultRepository(db).get_by_attempt(attempt.id)
        if not (result and result.is_released):
            response.total_score = None

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


# ── CHOICE SECTION QUESTION SELECTION (Phase 2) ───────────────────────────────


@router.post(
    "/{attempt_id}/sections/{section_id}/select",
    response_model=AttemptSectionSelectionResponse,
    status_code=201,
    summary="Select a question in a choice-based section",
)
async def select_question(
    attempt_id: uuid.UUID,
    section_id: uuid.UUID,
    body: QuestionSelectRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AttemptSectionSelectionResponse:
    svc = AttemptService(db)
    selection = await svc.select_question(
        attempt_id=attempt_id,
        section_id=section_id,
        question_id=body.question_id,
        current_user=current_user,
    )
    return AttemptSectionSelectionResponse.model_validate(selection)


@router.delete(
    "/{attempt_id}/questions/{question_id}/select",
    status_code=204,
    summary="Deselect a question in a choice-based section",
)
async def deselect_question(
    attempt_id: uuid.UUID,
    question_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = AttemptService(db)
    await svc.deselect_question(
        attempt_id=attempt_id,
        question_id=question_id,
        current_user=current_user,
    )


student_attempt_router = APIRouter(tags=["Student Attempts"])


@student_attempt_router.post(
    "/student/attempts/{attempt_id}/sections/{section_id}/select",
    response_model=AttemptSectionSelectionResponse,
    status_code=201,
    summary="Select a question in a choice-based section (student alias)",
)
async def select_question_alias(
    attempt_id: uuid.UUID,
    section_id: uuid.UUID,
    body: QuestionSelectRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AttemptSectionSelectionResponse:
    svc = AttemptService(db)
    selection = await svc.select_question(
        attempt_id=attempt_id,
        section_id=section_id,
        question_id=body.question_id,
        current_user=current_user,
    )
    return AttemptSectionSelectionResponse.model_validate(selection)


@student_attempt_router.delete(
    "/student/attempts/{attempt_id}/questions/{question_id}/select",
    status_code=204,
    summary="Deselect a question in a choice-based section (student alias)",
)
async def deselect_question_alias(
    attempt_id: uuid.UUID,
    question_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = AttemptService(db)
    await svc.deselect_question(
        attempt_id=attempt_id,
        question_id=question_id,
        current_user=current_user,
    )

