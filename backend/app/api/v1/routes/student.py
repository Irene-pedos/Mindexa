from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_student
from app.schemas.admin import AdminCourseListItem
from app.schemas.student import StudentDashboardResponse, StudentScheduleResponse
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
    "/me/courses",
    response_model=list[AdminCourseListItem],
    summary="List student's enrolled courses",
)
async def list_my_courses(
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> list[AdminCourseListItem]:
    """Returns a list of all courses the current student is enrolled in."""
    service = StudentService(db)
    courses = await service.list_courses(current_user.id)
    
    items = []
    for c in courses:
        items.append(AdminCourseListItem(
            id=c.id,
            code=c.code,
            title=c.name,
            lecturer_name="Primary Lecturer", # Simplified for now
            student_count=0, # Not needed for student view
            status="Active"
        ))
    return items


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
    "/me/courses/{course_id}",
    response_model=dict,
    summary="Get detailed course information",
)
async def get_course_detail(
    course_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Returns detailed information for a specific course."""
    service = StudentService(db)
    course = await service.get_course_detail(current_user.id, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or not enrolled",
        )
    return course
