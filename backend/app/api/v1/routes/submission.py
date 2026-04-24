"""
app/api/v1/routes/submission.py

Student answer submission routes.

Endpoints:
    POST /submissions           → Save or update an answer (student)
    GET  /submissions/{attempt} → List all responses for an attempt
    GET  /submissions/logs/{id} → Get audit log for a response (lecturer/admin)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, NotFoundError
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.submission_repo import SubmissionRepository
from app.db.session import get_db
from app.dependencies.auth import require_active_user, require_lecturer_or_admin, require_student
from app.schemas.submission import (
    AttemptSubmissionsResponse,
    SubmissionLogEntry,
    SubmissionResponse,
    SubmitAnswerRequest,
)
from app.services.submission_service import SubmissionService

router = APIRouter(prefix="/submissions", tags=["Submissions"])


# ── SAVE ANSWER ───────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=SubmissionResponse,
    status_code=200,
    summary="Save or update a student answer",
)
async def save_answer(
    body: SubmitAnswerRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """
    Save (create or update) a student's answer for a specific question.

    Can be called multiple times:
        - autosave: change_type='autosave'
        - manual save: change_type='manual_save'

    Every call appends an immutable StudentResponseLog entry.
    Answers cannot be updated after the attempt is submitted (is_final=True).

    The access_token in the body must match the attempt's current token.
    """
    service = SubmissionService(db)
    response, created = await service.save_answer(
        attempt_id=body.attempt_id,
        question_id=body.question_id,
        student_id=current_user.id,
        access_token=body.access_token,
        answer_type=body.answer_type,
        change_type=body.change_type,
        answer_text=body.answer_text,
        selected_option_ids=body.selected_option_ids,
        ordered_option_ids=body.ordered_option_ids,
        match_pairs_json=body.match_pairs_json,
        fill_blank_answers=body.fill_blank_answers,
        file_url=body.file_url,
        time_spent_seconds=body.time_spent_seconds,
        is_skipped=body.is_skipped,
    )
    return SubmissionResponse.model_validate(response)


# ── LIST RESPONSES FOR ATTEMPT ────────────────────────────────────────────────


@router.get(
    "/attempt/{attempt_id}",
    response_model=AttemptSubmissionsResponse,
    summary="List all responses for an attempt",
)
async def list_responses(
    attempt_id: uuid.UUID,
    current_user=Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> AttemptSubmissionsResponse:
    """
    Return all student responses for an attempt.

    Students: own attempt only.
    Lecturers/Admins: any attempt.
    """
    attempt_repo = AttemptRepository(db)
    attempt = await attempt_repo.get_by_id_simple(attempt_id)
    if not attempt:
        raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

    from app.db.enums import UserRole
    if current_user.role == UserRole.STUDENT and attempt.student_id != current_user.id:
        raise AuthorizationError("Attempt ownership violation", code="ATTEMPT_OWNERSHIP_VIOLATION")

    repo = SubmissionRepository(db)
    responses = await repo.list_responses_for_attempt(attempt_id)

    return AttemptSubmissionsResponse(
        attempt_id=attempt_id,
        submissions=[SubmissionResponse.model_validate(r) for r in responses],
        total=len(responses),
    )


# ── GET AUDIT LOG (Lecturer/Admin) ────────────────────────────────────────────


@router.get(
    "/logs/{response_id}",
    response_model=list[SubmissionLogEntry],
    summary="Get the answer change audit log for a response (lecturer/admin)",
)
async def get_response_logs(
    response_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> list[SubmissionLogEntry]:
    """
    Return the full immutable audit trail for a response.
    Shows every autosave and manual save with before/after values.
    Only accessible to lecturers and admins.
    """
    repo = SubmissionRepository(db)
    response = await repo.get_response_by_id(response_id)
    if not response:
        raise NotFoundError("Response not found", code="RESPONSE_NOT_FOUND")

    logs = await repo.list_logs_for_response(response_id)
    return [SubmissionLogEntry.model_validate(log) for log in logs]
