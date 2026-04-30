from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_lecturer
from app.schemas.lecturer import LecturerDashboardResponse
from app.schemas.admin import AdminCourseListResponse
from app.services.lecturer_service import LecturerService

router = APIRouter(prefix="/lecturers", tags=["Lecturers"])

@router.get(
    "/me/dashboard",
    response_model=LecturerDashboardResponse,
    summary="Get aggregated lecturer dashboard data",
)
async def get_lecturer_dashboard(
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> LecturerDashboardResponse:
    """
    Returns aggregated data for the lecturer dashboard:
    - Summary metrics (classes, upcoming assessments, pending grading)
    - Pending review queue
    - Recent student submissions
    """
    service = LecturerService(db)
    return await service.get_dashboard_data(current_user.id)


@router.get(
    "/me/courses",
    response_model=AdminCourseListResponse,
    summary="List lecturer's assigned courses",
)
async def list_my_courses(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseListResponse:
    """Returns a paginated list of courses assigned to the current lecturer."""
    from app.services.admin_service import AdminService
    service = AdminService(db)
    # We can reuse admin service logic but might need to filter by lecturer
    # For now we'll just list all courses as a placeholder, but in a real app
    # we would filter by LecturerCourseAssignment.
    items, total = await service.list_courses(page, page_size)
    return AdminCourseListResponse(items=items, total=total)
