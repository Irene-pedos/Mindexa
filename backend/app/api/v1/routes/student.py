from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_student
from app.schemas.student import StudentDashboardResponse, StudentScheduleResponse, StudentCourseListItem
from app.services.student_service import StudentService

router = APIRouter(prefix="/students", tags=["Students"])

@router.get(
    "/me/dashboard",
    response_model=StudentDashboardResponse,
    summary="Get aggregated student dashboard data",
)
async def get_student_dashboard(
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudentDashboardResponse:
    """
    Returns aggregated data for the student dashboard:
    - Performance summary (GPA, credits)
    - Active/paused attempts
    - Recent results
    - Upcoming assessments
    """
    service = StudentService(db)
    return await service.get_dashboard_data(current_user.id)


@router.get(
    "/me/workspaces",
    response_model=list[StudentCourseListItem],
    summary="List student's enrolled teaching workspaces",
)
async def list_my_workspaces(
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> list[StudentCourseListItem]:
    """Returns a list of all teaching workspaces the current student is enrolled in."""
    service = StudentService(db)
    return await service.list_workspaces(current_user.id)


@router.get(
    "/me/schedule",
    response_model=StudentScheduleResponse,
    summary="Get student academic schedule",
)
async def get_student_schedule(
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudentScheduleResponse:
    """
    Returns a list of all upcoming academic events for the current student.
    """
    service = StudentService(db)
    return await service.get_schedule_data(current_user.id)


@router.get(
    "/me/workspaces/{workspace_id}",
    response_model=dict,
    summary="Get detailed workspace information",
)
async def get_workspace_detail(
    workspace_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Returns detailed operational data for a specific teaching workspace."""
    service = StudentService(db)
    workspace = await service.get_workspace_detail(current_user.id, workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or not enrolled",
        )
    return workspace
