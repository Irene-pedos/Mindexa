"""
app/api/v1/routes/export.py

Phase 6C: Excel Export endpoints.
≤300 rows → synchronous bytes response
>300 rows → ExportJob created, Celery queued, poll via /exports/{job_id}
"""
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import ExportType
from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import (
    AdminUser,
    LecturerOrAdminUser,
    require_active_user,
    require_admin,
    require_lecturer_or_admin,
)
from app.schemas.export import (
    ExportJobResponse,
    ExportTemplateCreate,
    ExportTemplateResponse,
    ExportTemplateUpdate,
)
from app.services.export_service import ExportService, _SYNC_ROW_LIMIT

router = APIRouter(tags=["Excel Export"])


# ── Assessment Marksheet ──────────────────────────────────────────────────────


@router.get(
    "/lecturer/assessments/{assessment_id}/export/marksheet",
    summary="Export assessment mark sheet as Excel (sync ≤300 rows, else async job)",
)
async def export_assessment_marksheet(
    assessment_id: uuid.UUID,
    template_code: str = Query(default="default_marksheet"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
):
    service = ExportService(db)

    # Row count check: load result count first
    from sqlalchemy import func, select

    from app.db.models.result import AssessmentResult

    count_res = await db.execute(
        select(func.count()).select_from(AssessmentResult).where(
            AssessmentResult.assessment_id == assessment_id,
            AssessmentResult.is_released == True,  # noqa: E712
            AssessmentResult.is_deleted == False,  # noqa: E712
        )
    )
    row_count = count_res.scalar_one() or 0

    if row_count > _SYNC_ROW_LIMIT:
        job = await service.create_async_export_job(
            requester=current_user,
            export_type=ExportType.ASSESSMENT_MARKSHEET,
            assessment_id=assessment_id,
            template_code=template_code,
        )
        return ExportJobResponse.model_validate(job)

    xlsx_bytes = await service.export_assessment_marksheet(
        assessment_id=assessment_id,
        requester=current_user,
        template_code=template_code,
    )
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=marksheet_{assessment_id}.xlsx"},
    )


# ── Course Consolidated Marksheet ─────────────────────────────────────────────


@router.get(
    "/lecturer/courses/{course_id}/export/consolidated",
    summary="Export course consolidated mark sheet as Excel",
)
async def export_course_consolidated(
    course_id: uuid.UUID,
    period_id: uuid.UUID = Query(...),
    template_code: str = Query(default="default_course_marksheet"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
):
    service = ExportService(db)

    # Row count = number of enrolled students
    from sqlalchemy import func, select

    from app.db.models.academic import StudentEnrollment

    count_res = await db.execute(
        select(func.count()).select_from(StudentEnrollment).where(
            StudentEnrollment.course_id == course_id,
            StudentEnrollment.is_deleted == False,  # noqa: E712
        )
    )
    row_count = count_res.scalar_one() or 0

    if row_count > _SYNC_ROW_LIMIT:
        job = await service.create_async_export_job(
            requester=current_user,
            export_type=ExportType.COURSE_CONSOLIDATED,
            course_id=course_id,
            period_id=period_id,
            template_code=template_code,
        )
        return ExportJobResponse.model_validate(job)

    xlsx_bytes = await service.export_course_consolidated(
        course_id=course_id,
        period_id=period_id,
        requester=current_user,
        template_code=template_code,
    )
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=consolidated_{course_id}.xlsx"},
    )


# ── Export Job Polling ────────────────────────────────────────────────────────


@router.get(
    "/exports/{job_id}",
    response_model=ExportJobResponse,
    summary="Poll export job status",
)
async def get_export_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
) -> ExportJobResponse:
    from app.core.exceptions import NotFoundError, PermissionDeniedError
    from app.db.repositories.export_repo import ExportRepository

    repo = ExportRepository(db)
    job = await repo.get_job(job_id)
    if not job:
        raise NotFoundError(resource="ExportJob", resource_id=str(job_id))
    if job.requested_by_id != current_user.id:
        raise PermissionDeniedError(message="You do not own this export job.")
    return ExportJobResponse.model_validate(job)


@router.get(
    "/exports/{job_id}/download",
    summary="Download a completed export file",
)
async def download_export(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    import os

    from app.core.exceptions import NotFoundError, PermissionDeniedError, ValidationError
    from app.db.enums import ExportJobStatus
    from app.db.repositories.export_repo import ExportRepository

    repo = ExportRepository(db)
    job = await repo.get_job(job_id)
    if not job:
        raise NotFoundError(resource="ExportJob", resource_id=str(job_id))
    if job.requested_by_id != current_user.id:
        raise PermissionDeniedError(message="You do not own this export job.")
    if job.status != ExportJobStatus.DONE:
        raise ValidationError(message="Export is not ready for download.", field="status")
    if not job.file_path or not os.path.exists(job.file_path):
        raise NotFoundError(resource="ExportFile", resource_id=str(job_id))

    with open(job.file_path, "rb") as f:
        data = f.read()

    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=export_{job_id}.xlsx"},
    )


# ── Export Templates (Admin) ──────────────────────────────────────────────────


@router.get(
    "/admin/export-templates",
    response_model=List[ExportTemplateResponse],
    summary="List export templates",
)
async def list_export_templates(
    institution_id: Optional[uuid.UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> List[ExportTemplateResponse]:
    from app.db.repositories.export_repo import ExportRepository

    repo = ExportRepository(db)
    templates = await repo.list_templates(institution_id=institution_id)
    return [ExportTemplateResponse.model_validate(t) for t in templates]


@router.post(
    "/admin/export-templates",
    response_model=ExportTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an export template",
)
async def create_export_template(
    payload: ExportTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> ExportTemplateResponse:
    from app.db.repositories.export_repo import ExportRepository

    repo = ExportRepository(db)
    template = await repo.upsert_template(
        code=payload.code,
        name=payload.name,
        config_json=payload.config_json,
        is_default=payload.is_default,
        institution_id=payload.institution_id,
        created_by_id=current_user.id,
    )
    return ExportTemplateResponse.model_validate(template)


@router.put(
    "/admin/export-templates/{template_id}",
    response_model=ExportTemplateResponse,
    summary="Update an export template",
)
async def update_export_template(
    template_id: uuid.UUID,
    payload: ExportTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> ExportTemplateResponse:
    from app.core.exceptions import NotFoundError
    from app.db.repositories.export_repo import ExportRepository

    repo = ExportRepository(db)
    template = await repo.get_template(template_id)
    if not template:
        raise NotFoundError(resource="ExportTemplate", resource_id=str(template_id))

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(template, field, value)
    from app.db.base import utcnow
    template.updated_at = utcnow()
    await db.flush()

    return ExportTemplateResponse.model_validate(template)
