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

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, NotFoundError, ConflictError, ValidationError
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


# ── LIST RESPONSES FOR GROUP ──────────────────────────────────────────────────


@router.get(
    "/group/{group_id}",
    response_model=AttemptSubmissionsResponse,
    summary="List all responses for a student group (collaboration)",
)
async def list_group_responses(
    group_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AttemptSubmissionsResponse:
    """
    Return all student responses for all members of a specific group.
    Allows group members to see each other's progress.
    """
    service = SubmissionService(db)
    responses = await service.list_responses_for_group(
        group_id=group_id,
        student_id=current_user.id
    )

    return AttemptSubmissionsResponse(
        attempt_id=group_id, # Reusing schema, use group_id as ID
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


# ── UPLOAD DELIVERABLE FILE ───────────────────────────────────────────────────


@router.post(
    "/upload",
    status_code=200,
    summary="Upload a file submission for a practical question",
)
async def upload_submission_file(
    attempt_id: uuid.UUID = Form(...),
    question_id: uuid.UUID = Form(...),
    access_token: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a student's answer file (deliverable) for a specific practical question.
    Validates attempt ownership and access token, writes file to dedicated submission path,
    and returns file metadata including the download URL.
    """
    from app.services.attempt_service import AttemptService
    from app.core.config import settings
    import os

    # 1. Validate the active attempt and access token
    attempt_service = AttemptService(db)
    attempt = await attempt_service.validate_active_attempt(
        attempt_id=attempt_id,
        student_id=current_user.id,
        access_token=access_token,
    )

    # 2. Check if the assessment is group work
    from app.db.repositories.assessment_repo import AssessmentRepository
    assessment_repo = AssessmentRepository(db)
    assessment = await assessment_repo.get_by_id_simple(attempt.assessment_id)
    if assessment and assessment.is_group_assessment:
        raise ValidationError(
            "Group-work answers must be saved through the shared group workspace.",
            code="GROUP_WORK_SHARED_SUBMISSION_REQUIRED",
        )

    # 3. Check if question belongs to the assessment
    in_assessment = await assessment_repo.question_in_assessment(
        attempt.assessment_id, question_id
    )
    if not in_assessment:
        raise ValidationError(
            "This question does not belong to the assessment",
            code="QUESTION_NOT_IN_ASSESSMENT",
        )

    # 4. Check if existing response is not finalised
    from app.db.repositories.submission_repo import SubmissionRepository
    submission_repo = SubmissionRepository(db)
    existing = await submission_repo.get_response(attempt_id, question_id)
    if existing and existing.is_final:
        raise ConflictError(
            "This answer has been locked after submission",
            code="RESPONSE_ALREADY_FINAL",
        )

    # 5. Validate file extension
    ext = os.path.splitext(file.filename)[1].lower()
    allowed = settings.ALLOWED_UPLOAD_EXTENSIONS
    if ext not in allowed:
        raise ValidationError(
            f"File extension {ext} is not allowed. Allowed types: {', '.join(allowed)}",
            code="INVALID_FILE_TYPE",
        )

    # 6. Validate file size (enforce server-side limit)
    content = await file.read()
    file_size = len(content)
    if file_size > settings.max_upload_size_bytes:
        raise ValidationError(
            f"File size exceeds the limit.",
            code="FILE_TOO_LARGE",
        )

    # 7. Create directory: uploads/submissions/{attempt_id}/{question_id}/
    relative_dir = os.path.join("submissions", str(attempt_id), str(question_id))
    absolute_dir = os.path.join(settings.UPLOAD_DIR, relative_dir)
    os.makedirs(absolute_dir, exist_ok=True)

    # 8. Generate safe unique filename
    safe_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(relative_dir, safe_name)
    absolute_path = os.path.join(settings.UPLOAD_DIR, file_path)

    # 9. Write file to disk
    with open(absolute_path, "wb") as f:
        f.write(content)

    # 10. Return the file access details
    # We expose /api/v1/submissions/download/{attempt_id}/{question_id}/{filename}
    download_url = f"/submissions/download/{attempt_id}/{question_id}/{safe_name}"
    return {
        "file_url": download_url,
        "filename": file.filename,
        "size_bytes": file_size,
    }


# ── DOWNLOAD DELIVERABLE FILE ─────────────────────────────────────────────────


@router.get(
    "/download/{attempt_id}/{question_id}/{filename}",
    summary="Download a submitted file",
)
async def download_submission_file(
    attempt_id: uuid.UUID,
    question_id: uuid.UUID,
    filename: str,
    current_user=Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Download a submitted deliverable file.
    Access controls:
    - Students: only their own attempt.
    - Lecturers/Admins: any attempt.
    """
    from app.db.repositories.attempt_repo import AttemptRepository
    from app.core.config import settings
    import os

    # 1. Fetch the attempt to check ownership/permissions
    attempt_repo = AttemptRepository(db)
    attempt = await attempt_repo.get_by_id_simple(attempt_id)
    if not attempt:
        raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

    # 2. Check permission
    from app.db.enums import UserRole
    if current_user.role == UserRole.STUDENT and attempt.student_id != current_user.id:
        raise AuthorizationError("Access denied to this file submission", code="ACCESS_DENIED")

    # 3. Locate the file on disk
    relative_path = os.path.join("submissions", str(attempt_id), str(question_id), filename)
    absolute_path = os.path.join(settings.UPLOAD_DIR, relative_path)

    # Validate directory traversal prevention
    absolute_path = os.path.abspath(absolute_path)
    allowed_base_dir = os.path.abspath(settings.UPLOAD_DIR)
    if not absolute_path.startswith(allowed_base_dir):
        raise AuthorizationError("Access denied", code="DIRECTORY_TRAVERSAL_PREVENTED")

    if not os.path.exists(absolute_path) or not os.path.isfile(absolute_path):
        raise NotFoundError("File not found on disk", code="FILE_NOT_FOUND")

    # Serve the file Response
    return FileResponse(
        path=absolute_path,
        filename=filename,
    )
