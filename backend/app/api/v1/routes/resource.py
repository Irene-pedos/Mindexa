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
from app.db.schemas.resource import (
    LecturerMaterialResponse, 
    LecturerMaterialCreate,
    StudentResourceResponse
)
from app.db.repositories.resource_repo import ResourceRepository
from app.db.repositories.workspace_repo import WorkspaceRepository
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
    teaching_workspace_id: uuid.UUID = Form(...),
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
    Upload a file (lecture notes, rubric, etc.) for a teaching workspace or assessment.
    """
    service = ResourceService(db)
    from app.db.schemas.resource import LecturerMaterialCreate
    metadata = LecturerMaterialCreate(
        teaching_workspace_id=teaching_workspace_id,
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
    "/workspaces/{workspace_id}/materials",
    response_model=List[LecturerMaterialResponse],
    summary="List materials for a specific workspace",
)
async def list_workspace_materials(
    workspace_id: uuid.UUID,
    current_user=Depends(require_verified_email),
    db: AsyncSession = Depends(get_db),
) -> List[LecturerMaterialResponse]:
    """
    Returns all current materials uploaded for a specific teaching workspace.
    - Lecturers: Can see materials for their assigned workspaces.
    - Students: Can see materials for workspaces they are enrolled in.
    """
    # 1. Authorization check
    if current_user.role == UserRole.STUDENT:
        student_svc = StudentService(db)
        # Check if student is enrolled in this workspace
        workspace = await student_svc.get_workspace_detail(current_user.id, workspace_id)
        if not workspace:
            raise AuthorizationError("You are not enrolled in this workspace")
    elif current_user.role == UserRole.LECTURER:
        # Check if lecturer owns this workspace
        ws_repo = WorkspaceRepository(db)
        ws = await ws_repo.get_by_id(workspace_id)
        if not ws or ws.teaching_assignment.lecturer_id != current_user.id:
            raise AuthorizationError("You do not have access to this workspace")
    elif current_user.role != UserRole.ADMIN:
        raise RoleRequiredError(["student", "lecturer", "admin"])

    service = ResourceService(db)
    materials = await service.list_workspace_materials(workspace_id)
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
    Checks if student is enrolled in the workspace before allowing download.
    """
    service = ResourceService(db)
    material = await service.get_material(material_id)
    if not material:
        raise NotFoundError("Material not found")

    # Authorization check
    if current_user.role == UserRole.STUDENT:
        # Only allow download if material is student visible and student is enrolled in workspace
        if not material.is_student_visible:
            raise AuthorizationError("This material is not visible to students")

        student_svc = StudentService(db)
        workspace = await student_svc.get_workspace_detail(current_user.id, material.teaching_workspace_id)
        if not workspace:
            raise AuthorizationError("You are not enrolled in this teaching workspace")

    # In a real app, we'd use a cloud storage URL, but for local we return the file from disk
    absolute_path = os.path.join(settings.UPLOAD_DIR, material.file_path)
    if not os.path.exists(absolute_path):
        raise NotFoundError("File not found on disk")

    return FileResponse(
        path=absolute_path,
        filename=material.original_filename,
        media_type=material.mime_type,
    )


@router.delete(
    "/{material_id}",
    summary="Delete a lecturer material",
)
async def delete_material(
    material_id: uuid.UUID,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-deletes a lecturer material.
    """
    service = ResourceService(db)
    success = await service.delete_lecturer_material(current_user.id, material_id)
    if not success:
        raise NotFoundError("Material not found or unauthorized")
    
    return {"success": True, "message": "Material deleted successfully"}


# ── Student Resources ──────────────────────────────────────────────────

@router.post(
    "/student-resources",
    response_model=StudentResourceResponse,
    summary="Upload a personal study resource",
)
async def upload_student_resource(
    subject_tag: str = Form(None),
    file: UploadFile = File(...),
    current_user=Depends(require_verified_email),
    db: AsyncSession = Depends(get_db),
) -> StudentResourceResponse:
    """
    Upload a personal file for study support.
    Only available to the logged-in student.
    """
    service = ResourceService(db)
    resource = await service.upload_student_resource(
        current_user.id, file, subject_tag
    )
    return StudentResourceResponse.model_validate(resource)


@router.get(
    "/student-resources",
    response_model=List[StudentResourceResponse],
    summary="List your personal study resources",
)
async def list_student_resources(
    current_user=Depends(require_verified_email),
    db: AsyncSession = Depends(get_db),
) -> List[StudentResourceResponse]:
    """
    Returns all personal study materials uploaded by the current student.
    """
    service = ResourceService(db)
    resources = await service.list_student_resources(current_user.id)
    return [StudentResourceResponse.model_validate(r) for r in resources]


@router.get(
    "/student-resources/download/{resource_id}",
    summary="Download a personal study resource",
)
async def download_student_resource_file(
    resource_id: uuid.UUID,
    current_user=Depends(require_verified_email),
    db: AsyncSession = Depends(get_db),
):
    """
    Downloads a personal study resource. 
    Only available to the owner student.
    """
    service = ResourceService(db)
    resource = await service.repo.get_student_resource(resource_id)
    if not resource:
        raise NotFoundError("Resource not found")

    if resource.student_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise AuthorizationError("You do not have permission to access this resource")

    absolute_path = os.path.join(settings.UPLOAD_DIR, resource.file_path)
    if not os.path.exists(absolute_path):
        raise NotFoundError("File not found on disk")

    return FileResponse(
        path=absolute_path,
        filename=resource.original_filename,
        media_type=resource.mime_type,
    )


@router.delete(
    "/student-resources/{resource_id}",
    summary="Delete a personal study resource",
)
async def delete_student_resource(
    resource_id: uuid.UUID,
    current_user=Depends(require_verified_email),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-deletes a personal study resource.
    """
    service = ResourceService(db)
    success = await service.delete_student_resource(current_user.id, resource_id)
    if not success:
        raise NotFoundError("Resource not found or unauthorized")
    
    return {"success": True, "message": "Resource deleted successfully"}
