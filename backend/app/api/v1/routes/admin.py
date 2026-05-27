from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.schemas.auth import (
    UserApproveRequest,
    UserResponse,
)
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.schemas.admin import (
    AdminAnalyticsResponse,
    AdminBulkUserApproveRequest,
    AdminBulkUserStatusUpdateRequest,
    AdminCourseAssignmentRequest,
    AdminCourseListResponse,
    AdminDashboardResponse,
    AdminUserListResponse,
    AdminUserStatusUpdate,
    AdminUserCreate,
    AdminCourseCreate,
    AdminCourseUpdate,
    AdminAnalyticsResponse,
    AdminIntegrityOverview,
    SystemSettingsSchema,
)
from app.db.schemas.academic import (
    CourseResponse,
    InstitutionCreate,
    InstitutionUpdate,
    InstitutionResponse,
)
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["Admin"])

@router.get(
    "/settings",
    response_model=SystemSettingsSchema,
    summary="Get platform-wide system settings",
)
async def get_system_settings(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SystemSettingsSchema:
    service = AdminService(db)
    return await service.get_system_settings()


@router.patch(
    "/settings",
    response_model=SystemSettingsSchema,
    summary="Update platform-wide system settings",
)
async def update_system_settings(
    body: SystemSettingsSchema,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SystemSettingsSchema:
    service = AdminService(db)
    return await service.update_system_settings(body)

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
    "/analytics",
    response_model=AdminAnalyticsResponse,
    summary="Get detailed platform analytics",
)
async def get_admin_analytics(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAnalyticsResponse:
    """Returns detailed usage, user distribution, and integrity analytics."""
    service = AdminService(db)
    return await service.get_analytics_data()

@router.get(
    "/integrity-overview",
    response_model=AdminIntegrityOverview,
    summary="Get global integrity overview",
)
async def get_admin_integrity_overview(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIntegrityOverview:
    """Returns summary stats and recent flags for the integrity dashboard."""
    service = AdminService(db)
    return await service.get_integrity_overview()

@router.get(
    "/users",
    response_model=AdminUserListResponse,
    summary="List all platform users",
)
async def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    role: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListResponse:
    """Returns a paginated list of all users on the platform."""
    service = AdminService(db)
    items, total = await service.list_users(page, page_size, role=role, status=status)
    return AdminUserListResponse(items=items, total=total)


@router.patch(
    "/users/bulk-approve",
    status_code=status.HTTP_200_OK,
    summary="Approve multiple user accounts at once",
)
async def bulk_approve_users(
    body: AdminBulkUserApproveRequest,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Updates status and email verification for multiple users."""
    from app.core.constants import UserStatus
    service = AdminService(db)
    count = await service.bulk_approve_users(body.user_ids, UserStatus(body.status.upper()))
    return {"message": f"Successfully approved {count} users", "count": count}


@router.patch(
    "/users/bulk-status",
    status_code=status.HTTP_200_OK,
    summary="Update status for multiple users at once",
)
async def bulk_update_user_status(
    body: AdminBulkUserStatusUpdateRequest,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Updates status for multiple users (SUSPENDED, ACTIVE, etc.)."""
    from app.core.constants import UserStatus
    service = AdminService(db)
    count = await service.bulk_update_user_status(body.user_ids, UserStatus(body.status.upper()))
    return {"message": f"Successfully updated {count} users", "count": count}


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user account (Admin only)",
)
async def create_user(
    body: AdminUserCreate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Creates a new user account and profile."""
    service = AdminService(db)
    return await service.create_user(body)

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


@router.delete(
    "/courses/{course_id}",
    summary="Suspend a course (Admin)",
)
async def delete_course(
    course_id: uuid.UUID,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Soft deletes/suspends a course."""
    service = AdminService(db)
    await service.delete_course(course_id)
    return {"success": True, "message": "Course suspended successfully"}


@router.post(
    "/courses",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new official course (Admin)",
)
async def create_course(
    body: AdminCourseCreate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CourseResponse:
    """Creates a new official module/course."""
    service = AdminService(db)
    return await service.create_course(body)


@router.patch(
    "/courses/{course_id}",
    response_model=CourseResponse,
    summary="Update course metadata (Admin)",
)
async def update_course(
    course_id: uuid.UUID,
    body: AdminCourseUpdate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CourseResponse:
    """Updates course details."""
    service = AdminService(db)
    return await service.update_course(course_id, body)


@router.get(
    "/lecturers",
    response_model=list[UserResponse],
    summary="List all active lecturers",
)
async def list_lecturers(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    """Returns a list of all active lecturers for assignment."""
    service = AdminService(db)
    return await service.list_lecturers()

# ── Institution Management ────────────────────────────────────────────────────

@router.post(
    "/institutions",
    response_model=InstitutionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new institution",
)
async def create_institution(
    body: InstitutionCreate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> InstitutionResponse:
    service = AdminService(db)
    return await service.create_institution(body)


@router.patch(
    "/institutions/{institution_id}",
    response_model=InstitutionResponse,
    summary="Update institution settings and branding",
)
async def update_institution(
    institution_id: uuid.UUID,
    body: InstitutionUpdate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> InstitutionResponse:
    service = AdminService(db)
    return await service.update_institution(institution_id, body)


@router.get(
    "/institutions",
    response_model=list[InstitutionResponse],
    summary="List all institutions for admin",
)
async def list_institutions(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[InstitutionResponse]:
    service = AdminService(db)
    return await service.list_institutions()
