import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_lecturer
from app.schemas.admin import AdminCourseListResponse
from app.schemas.lecturer import LecturerDashboardResponse, LecturerCourseDetail
from app.services.lecturer_service import LecturerService

from app.db.schemas.academic import (
    CourseCreate,
    CourseResponse,
    InstitutionResponse,
    AcademicPeriodResponse,
    DepartmentResponse,
    OptionResponse,
    ClassGroupResponse,
)
from app.schemas.lecturer import (
    AddStudentRequest,
    StudentCourseRecordResponse,
)

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
    service = LecturerService(db)
    items, total = await service.list_lecturer_courses(current_user.id, page, page_size)
    return AdminCourseListResponse(items=items, total=total)


@router.post(
    "/me/courses",
    response_model=CourseResponse,
    summary="Create a new course",
)
async def create_course(
    body: CourseCreate,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> CourseResponse:
    """Creates a new course and assigns the current lecturer as primary."""
    service = LecturerService(db)
    return await service.create_course(current_user.id, body)


@router.get(
    "/me/courses/{course_id}",
    response_model=LecturerCourseDetail,
    summary="Get course detail and roster",
)
async def get_course_detail(
    course_id: uuid.UUID,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> LecturerCourseDetail:
    """Returns details for a specific course including the student roster."""
    service = LecturerService(db)
    return await service.get_course_detail(current_user.id, course_id)


@router.delete(
    "/me/courses/{course_id}",
    summary="Delete a course",
)
async def delete_course(
    course_id: uuid.UUID,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
):
    """Soft deletes a course. Only the primary lecturer can perform this."""
    service = LecturerService(db)
    await service.delete_course(current_user.id, course_id)
    return {"success": True, "message": "Course deleted successfully"}


@router.post(
    "/me/courses/{course_id}/students",
    summary="Enroll a student in the course",
)
async def enroll_student(
    course_id: uuid.UUID,
    body: AddStudentRequest,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
):
    """Enrolls a student in the course by email."""
    service = LecturerService(db)
    await service.add_student_to_course(current_user.id, course_id, body.email)
    return {"success": True, "message": "Student enrolled successfully"}


@router.get(
    "/me/courses/{course_id}/students/{student_id}/record",
    response_model=StudentCourseRecordResponse,
    summary="Get student's course performance record",
)
async def get_student_record(
    course_id: uuid.UUID,
    student_id: uuid.UUID,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> StudentCourseRecordResponse:
    """Returns comprehensive performance data for a student in a specific course."""
    service = LecturerService(db)
    return await service.get_student_course_record(current_user.id, course_id, student_id)


@router.get(
    "/me/institutions",
    response_model=list[InstitutionResponse],
    summary="List institutions the current lecturer belongs to",
)
async def list_my_institutions(
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> list[InstitutionResponse]:
    from app.db.models.academic import Institution, LecturerInstitution
    result = await db.execute(
        select(Institution)
        .join(LecturerInstitution, LecturerInstitution.institution_id == Institution.id)
        .where(LecturerInstitution.lecturer_id == current_user.id, Institution.is_active == True)
    )
    return list(result.scalars().all())


@router.get(
    "/me/departments",
    response_model=list[DepartmentResponse],
    summary="List lecturer's departments in an institution",
)
async def list_my_departments(
    institution_id: uuid.UUID = Query(...),
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db)
) -> list[DepartmentResponse]:
    from app.db.models.academic import Department, LecturerDepartment
    result = await db.execute(
        select(Department)
        .join(LecturerDepartment, LecturerDepartment.department_id == Department.id)
        .where(
            LecturerDepartment.lecturer_id == current_user.id,
            Department.institution_id == institution_id,
            Department.is_active == True
        )
    )
    return list(result.scalars().all())


@router.get(
    "/me/options",
    response_model=list[OptionResponse],
    summary="List lecturer's options in a department",
)
async def list_my_options(
    department_id: uuid.UUID = Query(...),
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db)
) -> list[OptionResponse]:
    from app.db.models.academic import Option, LecturerOption
    result = await db.execute(
        select(Option)
        .join(LecturerOption, LecturerOption.option_id == Option.id)
        .where(
            LecturerOption.lecturer_id == current_user.id,
            Option.department_id == department_id,
            Option.is_active == True
        )
    )
    return list(result.scalars().all())


@router.get(
    "/me/classes",
    response_model=list[ClassGroupResponse],
    summary="List all class groups in an option",
)
async def list_option_classes(
    option_id: uuid.UUID = Query(...),
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db)
) -> list[ClassGroupResponse]:
    """Classes are usually open to any lecturer teaching that option."""
    from app.db.models.academic import ClassGroup
    result = await db.execute(
        select(ClassGroup).where(
            ClassGroup.option_id == option_id,
            ClassGroup.is_active == True
        )
    )
    return list(result.scalars().all())


@router.get(
    "/institutions",
    response_model=list[InstitutionResponse],
    summary="List all institutions",
)
async def list_institutions(
    db: AsyncSession = Depends(get_db),
) -> list[InstitutionResponse]:
    """Returns a list of all active institutions."""
    from app.db.models.academic import Institution
    result = await db.execute(
        select(Institution).where(Institution.is_active == True)
    )
    return list(result.scalars().all())


@router.get(
    "/departments",
    response_model=list[DepartmentResponse],
    summary="List departments for an institution",
)
async def list_departments(
    institution_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db)
) -> list[DepartmentResponse]:
    """Returns a list of departments in a specific institution."""
    from app.db.models.academic import Department
    result = await db.execute(
        select(Department).where(
            Department.institution_id == institution_id,
            Department.is_active == True
        )
    )
    return list(result.scalars().all())


@router.get(
    "/options",
    response_model=list[OptionResponse],
    summary="List options for a department",
)
async def list_options(
    department_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db)
) -> list[OptionResponse]:
    """Returns a list of options in a specific department."""
    from app.db.models.academic import Option
    result = await db.execute(
        select(Option).where(
            Option.department_id == department_id,
            Option.is_active == True
        )
    )
    return list(result.scalars().all())


@router.get(
    "/classes",
    response_model=list[ClassGroupResponse],
    summary="List class groups for an option",
)
async def list_classes(
    option_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db)
) -> list[ClassGroupResponse]:
    """Returns a list of class groups in a specific option."""
    from app.db.models.academic import ClassGroup
    result = await db.execute(
        select(ClassGroup).where(
            ClassGroup.option_id == option_id,
            ClassGroup.is_active == True
        )
    )
    return list(result.scalars().all())


@router.get(
    "/academic-periods",
    response_model=list[AcademicPeriodResponse],
    summary="List all academic periods",
)
async def list_periods(
    db: AsyncSession = Depends(get_db),
) -> list[AcademicPeriodResponse]:
    """Returns a list of all active academic periods."""
    from app.db.models.academic import AcademicPeriod
    result = await db.execute(
        select(AcademicPeriod).where(AcademicPeriod.is_active == True)
    )
    return list(result.scalars().all())


