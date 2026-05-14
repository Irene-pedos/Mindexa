"""
app/api/v1/routes/resource.py

Routes for lecturer materials and student resources.
"""

import uuid
import os
from typing import List

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_lecturer, require_verified_email
from app.db.schemas.resource import LecturerMaterialResponse, LecturerMaterialCreate
from app.services.resource_service import ResourceService
from app.services.student_service import StudentService
from app.db.enums import ResourceCategory, UserRole
from app.core.config import settings
from app.core.exceptions import NotFoundError, AuthorizationError, RoleRequiredError

router = APIRouter(prefix="/resources", tags=["Resources"])


@router.post(
    "/lecturer-materials",
    response_model=LecturerMaterialResponse,
    summary="Upload a lecturer material file",
)
async def upload_material(
    course_id: uuid.UUID = Form(None),
    assessment_id: uuid.UUID = Form(None),
    material_category: ResourceCategory = Form(ResourceCategory.GENERAL),
    display_name: str = Form(None),
    description: str = Form(None),
    is_student_visible: bool = Form(False),
    file: UploadFile = File(...),
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> LecturerMaterialResponse:
    """
    Upload a file (lecture notes, rubric, etc.) for a course or assessment.
    """
    service = ResourceService(db)
    metadata = LecturerMaterialCreate(
        course_id=course_id,
        assessment_id=assessment_id,
        material_category=material_category,
        display_name=display_name,
        description=description,
        is_student_visible=is_student_visible,
    )
    material = await service.upload_lecturer_material(current_user.id, file, metadata)
    return LecturerMaterialResponse.model_validate(material)


@router.get(
    "/courses/{course_id}/materials",
    response_model=List[LecturerMaterialResponse],
    summary="List materials for a specific course",
)
async def list_course_materials(
    course_id: uuid.UUID,
    current_user=Depends(require_verified_email),
    db: AsyncSession = Depends(get_db),
) -> List[LecturerMaterialResponse]:
    """
    Returns all current materials uploaded for a specific course.
    - Lecturers: Can see materials for their assigned courses.
    - Students: Can see materials for courses they are enrolled in.
    """
    # 1. Authorization check
    if current_user.role == UserRole.STUDENT:
        student_svc = StudentService(db)
        # Check if student is enrolled in this course
        enrollment = await student_svc.get_course_detail(current_user.id, course_id)
        if not enrollment:
            raise AuthorizationError("You are not enrolled in this course")
    elif current_user.role == UserRole.LECTURER:
        # For now we allow all lecturers to see materials, but we could restrict
        # it to only assigned lecturers if needed.
        pass
    elif current_user.role != UserRole.ADMIN:
        raise RoleRequiredError(["student", "lecturer", "admin"])

    service = ResourceService(db)
    materials = await service.list_course_materials(course_id)
    # Filter for student visibility if current user is a student
    if current_user.role == UserRole.STUDENT:
        materials = [m for m in materials if m.is_student_visible]
        
    return [LecturerMaterialResponse.model_validate(m) for m in materials]


@router.get(
    "/download/{material_id}",
    summary="Download a lecturer material",
)
async def download_material(
    material_id: uuid.UUID,
    current_user=Depends(require_verified_email),
    db: AsyncSession = Depends(get_db),
):
    """
    Downloads a lecturer material. 
    Checks if student is enrolled before allowing download.
    """
    service = ResourceService(db)
    material = await service.get_material(material_id)
    if not material:
        raise NotFoundError("Material not found")

    # Authorization check
    if current_user.role == UserRole.STUDENT:
        student_svc = StudentService(db)
        # Only allow download if material is student visible and student is enrolled
        if not material.is_student_visible:
            raise AuthorizationError("This material is not visible to students")

        enrollment = await student_svc.get_course_detail(current_user.id, material.course_id)
        if not enrollment:
            raise AuthorizationError("You are not enrolled in this course")

    # In a real app, we'd use a cloud storage URL, but for local we return the file from disk
    absolute_path = os.path.join(settings.UPLOAD_DIR, material.file_path)
    if not os.path.exists(absolute_path):
        raise NotFoundError("File not found on disk")

    return FileResponse(
        path=absolute_path,
        filename=material.original_filename,
        media_type=material.mime_type,
    )
