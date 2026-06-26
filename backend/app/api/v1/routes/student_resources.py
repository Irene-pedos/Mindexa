from __future__ import annotations
import uuid
import os
import mimetypes
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_student
from app.db.schemas.resource import StudentResourceResponse
from app.db.repositories.resource_repo import ResourceRepository
from app.services.resource_service import ResourceService
from app.core.exceptions import ValidationError, NotFoundError, AuthorizationError
from app.core.config import settings

router = APIRouter(prefix="/student/resources", tags=["Student Resources"])

@router.post(
    "/upload",
    response_model=StudentResourceResponse,  # BUG-03 fix: return full schema, not bare dict
    status_code=status.HTTP_201_CREATED,
    summary="Upload a personal study resource",
)
async def upload_student_resource(
    subject_tag: str = Form(None),
    file: UploadFile = File(...),
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudentResourceResponse:
    """
    Upload a personal file (PDF, DOCX, TXT only, max 10MB) for study support.
    Returns the full StudentResourceResponse so the UI can immediately reflect
    the upload without a separate GET call.
    """
    # 1. Validate file extension
    ext = os.path.splitext(file.filename)[1].lower()
    allowed = [".pdf", ".docx", ".txt"]
    if ext not in allowed:
        raise ValidationError(
            f"File extension {ext} is not allowed. Only {', '.join(allowed)} are permitted.",
            code="INVALID_FILE_TYPE",
        )

    # 2. Validate file size (enforce server-side limit from settings)
    content = await file.read()
    if len(content) > settings.max_student_upload_size_bytes:
        raise ValidationError(
            f"File size exceeds the {settings.MAX_STUDENT_UPLOAD_SIZE_MB}MB limit.",
            code="FILE_TOO_LARGE",
        )
    await file.seek(0)  # Reset file pointer for service layer

    service = ResourceService(db)
    resource = await service.upload_student_resource(
        current_user.id, file, subject_tag
    )

    return StudentResourceResponse.model_validate(resource)


@router.get(
    "",
    response_model=List[StudentResourceResponse],
    summary="List student's uploaded resources",
)
async def list_student_resources(
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> List[StudentResourceResponse]:
    """
    Returns a list of all personal study materials uploaded by the current student.
    """
    service = ResourceService(db)
    resources = await service.list_student_resources(current_user.id)
    return [StudentResourceResponse.model_validate(r) for r in resources]


@router.get(
    "/download/{resource_id}",
    summary="Download a personal study resource",  # BUG-04 fix: missing download endpoint
)
async def download_student_resource(
    resource_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    """
    Stream the file for a student's personal study resource.
    Enforces ownership — students can only download their own resources.
    """
    repo = ResourceRepository(db)
    resource = await repo.get_student_resource(resource_id)

    if not resource:
        raise NotFoundError("Resource not found")

    if resource.student_id != current_user.id:
        raise AuthorizationError("You do not have access to this resource")

    # Build absolute path from stored relative file_path
    absolute_path = os.path.join(settings.UPLOAD_DIR, resource.file_path)
    if not os.path.exists(absolute_path):
        raise NotFoundError("File not found on server")

    # Determine media type
    media_type, _ = mimetypes.guess_type(resource.original_filename)
    media_type = media_type or resource.mime_type or "application/octet-stream"

    return FileResponse(
        path=absolute_path,
        filename=resource.original_filename,
        media_type=media_type,
    )


@router.delete(
    "/{resource_id}",
    summary="Delete a personal study resource",
)
async def delete_student_resource(
    resource_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    """
    Deletes a personal study resource and its chunks.
    """
    service = ResourceService(db)
    success = await service.delete_student_resource(current_user.id, resource_id)
    if not success:
        raise NotFoundError("Resource not found or unauthorized")

    return {"success": True, "message": "Resource deleted successfully"}
