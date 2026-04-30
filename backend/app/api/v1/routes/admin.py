from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.schemas.auth import (
    UserApproveRequest,
    UserResponse,
)
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.schemas.admin import (
    AdminCourseAssignmentRequest,
    AdminCourseListResponse,
    AdminDashboardResponse,
    AdminUserListResponse,
    AdminUserStatusUpdate,
)
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["Admin"])

@router.get(
    "/dashboard",
    response_model=AdminDashboardResponse,
    summary="Get aggregated admin dashboard data",
)
async def get_admin_dashboard(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardResponse:
    """Returns platform-wide metrics and recent activity for the admin dashboard."""
    service = AdminService(db)
    return await service.get_dashboard_data()

@router.get(
    "/users",
    response_model=AdminUserListResponse,
    summary="List all platform users",
)
async def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListResponse:
    """Returns a paginated list of all users on the platform."""
    service = AdminService(db)
    items, total = await service.list_users(page, page_size)
    return AdminUserListResponse(items=items, total=total)

@router.get(
    "/courses",
    response_model=AdminCourseListResponse,
    summary="List all platform courses",
)
async def list_courses(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminCourseListResponse:
    """Returns a paginated list of all courses on the platform."""
    service = AdminService(db)
    items, total = await service.list_courses(page, page_size)
    return AdminCourseListResponse(items=items, total=total)

@router.patch(
    "/users/{user_id}/approve",
    response_model=UserResponse,
    summary="Approve a user account (e.g. Lecturer)",
)
async def approve_user(
    user_id: uuid.UUID,
    body: UserApproveRequest,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Updates user status and stamps approval metadata."""
    service = AdminService(db)
    return await service.approve_user(user_id, body)

@router.patch(
    "/users/{user_id}/status",
    response_model=UserResponse,
    summary="Update user status (SUSPENDED, ACTIVE, GRADUATED)",
)
async def update_user_status(
    user_id: uuid.UUID,
    body: AdminUserStatusUpdate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Updates a user's account status."""
    from app.core.constants import UserStatus
    service = AdminService(db)
    return await service.update_user_status(user_id, UserStatus(body.status.upper()))

@router.post(
    "/users/{user_id}/courses",
    response_model=UserResponse,
    summary="Assign courses to a lecturer",
)
async def assign_courses(
    user_id: uuid.UUID,
    body: AdminCourseAssignmentRequest,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Assigns a list of courses to the specified lecturer."""
    service = AdminService(db)
    return await service.assign_courses_to_lecturer(user_id, body.course_ids)
