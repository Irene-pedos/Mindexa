import uuid

from app.db.models.academic import (Campus, ClassGroup, ClassSection, College,
                                    Course, Department, Institution, Option,
                                    TeachingAssignment)
from app.db.schemas.academic import (AcademicPeriodResponse,
                                     ClassGroupResponse, CourseCreate,
                                     CourseResponse, DepartmentResponse,
                                     InstitutionResponse, OptionResponse)
from app.db.schemas.auth import UserResponse
from app.db.schemas.teaching_assignment import TeachingAssignmentDetailResponse
from app.db.session import get_db
from app.dependencies.auth import require_lecturer
from app.schemas.admin import AdminCourseListResponse
from app.schemas.lecturer import (AddStudentRequest, LecturerCourseDetail,
                                  LecturerDashboardResponse,
                                  StudentCourseRecordResponse, WorkspaceCreate,
                                  WorkspaceDetail, WorkspaceListItem,
                                  WorkspaceUpdate)
from app.services.lecturer_service import LecturerService
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/lecturers", tags=["Lecturers"])

@router.get(
    "",
    response_model=list[UserResponse],
    summary="List all active lecturers",
)
async def list_lecturers(
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    """Returns a list of all active lecturers for colleague selection."""
    service = LecturerService(db)
    return await service.list_lecturers()


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
    "/me/assignments",
    response_model=list[TeachingAssignmentDetailResponse],
    summary="List current lecturer's academic assignments",
)
async def list_my_assignments(
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db)
) -> list[TeachingAssignmentDetailResponse]:
    """Returns all active teaching assignments with names for the current lecturer."""
    # Use mappings() to get dict-like access which is safer for manual schema construction
    stmt = (
        select(
            TeachingAssignment,
            Institution.name.label("institution_name"),
            Campus.name.label("campus_name"),
            College.name.label("college_name"),
            Department.name.label("department_name"),
            Option.name.label("option_name"),
            Course.name.label("course_name"),
            Course.code.label("course_code"),
            ClassSection.name.label("class_section_name"),
            ClassGroup.name.label("class_group_name"),
            ClassGroup.level.label("class_group_level")
        )
        .outerjoin(Institution, TeachingAssignment.institution_id == Institution.id)
        .outerjoin(Campus, TeachingAssignment.campus_id == Campus.id)
        .outerjoin(College, TeachingAssignment.college_id == College.id)
        .outerjoin(Department, TeachingAssignment.department_id == Department.id)
        .outerjoin(Option, TeachingAssignment.option_id == Option.id)
        .outerjoin(Course, TeachingAssignment.course_id == Course.id)
        .outerjoin(ClassSection, TeachingAssignment.class_section_id == ClassSection.id)
        .outerjoin(ClassGroup, ClassSection.class_group_id == ClassGroup.id)
        .where(TeachingAssignment.lecturer_id == current_user.id, TeachingAssignment.is_active == True)
    )

    result = await db.execute(stmt)
    items = []

    for row in result.all():
        # assignment is the first element of the tuple
        assignment = row[0]

        # Build dictionary from model and join results
        data = assignment.model_dump()
        data.update({
            "institution_name": row.institution_name,
            "campus_name": row.campus_name,
            "college_name": row.college_name,
            "department_name": row.department_name,
            "option_name": row.option_name,
            "course_name": row.course_name,
            "course_code": row.course_code,
            "class_section_name": row.class_section_name,
            "class_group_name": row.class_group_name,
            "class_group_level": row.class_group_level
        })

        items.append(TeachingAssignmentDetailResponse(**data))

    return items


@router.get(
    "/me/workspaces",
    response_model=list[WorkspaceListItem],
    summary="List lecturer's operational teaching workspaces",
)
async def list_my_workspaces(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> list[WorkspaceListItem]:
    """Returns a paginated list of operational workspaces assigned to the lecturer."""
    service = LecturerService(db)
    items, total = await service.list_workspaces(current_user.id, page, page_size)
    return items


@router.post(
    "/me/workspaces/initialize",
    response_model=WorkspaceDetail,
    summary="Initialize an operational teaching workspace",
)
async def initialize_workspace(
    body: WorkspaceCreate,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceDetail:
    """Creates an operational workspace linked to a valid teaching assignment."""
    service = LecturerService(db)
    workspace = await service.initialize_workspace(current_user.id, body)
    return await service.get_workspace_detail(current_user.id, workspace.id)


@router.get(
    "/me/workspaces/{workspace_id}",
    response_model=WorkspaceDetail,
    summary="Get operational workspace details",
)
async def get_workspace_detail(
    workspace_id: uuid.UUID,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceDetail:
    """Returns detailed operational data for a specific teaching workspace."""
    service = LecturerService(db)
    return await service.get_workspace_detail(current_user.id, workspace_id)


@router.patch(
    "/me/workspaces/{workspace_id}",
    response_model=WorkspaceDetail,
    summary="Update an operational workspace",
)
async def update_workspace(
    workspace_id: uuid.UUID,
    body: WorkspaceUpdate,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceDetail:
    """Updates editable workspace metadata for the owning lecturer."""
    service = LecturerService(db)
    await service.update_workspace(current_user.id, workspace_id, body)
    return await service.get_workspace_detail(current_user.id, workspace_id)


@router.delete(
    "/me/workspaces/{workspace_id}",
    summary="Archive/Suspend an operational workspace",
)
async def delete_workspace(
    workspace_id: uuid.UUID,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
):
    """Soft deletes/archives an operational workspace."""
    service = LecturerService(db)
    # Generic implementation for now (could add more checks)
    ws = await service.workspace_repo.get_by_id(workspace_id)
    if not ws or ws.teaching_assignment.lecturer_id != current_user.id:
         from app.core.exceptions import NotFoundError
         raise NotFoundError("Workspace", str(workspace_id))

    ws.soft_delete()
    await db.commit()
    return {"success": True, "message": "Workspace archived successfully"}


@router.post(
    "/me/workspaces/{workspace_id}/students",
    summary="Enroll a student in the workspace section",
)
async def enroll_student(
    workspace_id: uuid.UUID,
    body: AddStudentRequest,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
):
    """Enrolls a student in the specific section tied to this workspace."""
    service = LecturerService(db)
    await service.add_student_to_workspace(current_user.id, workspace_id, body.email)
    return {"success": True, "message": "Student enrolled in workspace successfully"}


@router.get(
    "/me/workspaces/{workspace_id}/students/{student_id}/record",
    response_model=StudentCourseRecordResponse,
    summary="Get student's performance record in this workspace",
)
async def get_student_record(
    workspace_id: uuid.UUID,
    student_id: uuid.UUID,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> StudentCourseRecordResponse:
    """Returns comprehensive performance data for a student within the scope of this workspace."""
    service = LecturerService(db)
    return await service.get_student_workspace_record(current_user.id, workspace_id, student_id)


@router.get(
    "/me/institutions",
    response_model=list[InstitutionResponse],
    summary="List institutions the current lecturer has assignments in",
)
async def list_my_institutions(
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> list[InstitutionResponse]:
    """Returns institutions where the lecturer has active teaching assignments."""
    stmt = (
        select(Institution)
        .join(TeachingAssignment, TeachingAssignment.institution_id == Institution.id)
        .where(
            TeachingAssignment.lecturer_id == current_user.id,
            TeachingAssignment.is_active == True,
            Institution.is_active == True
        )
        .distinct()
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get(
    "/me/departments",
    response_model=list[DepartmentResponse],
    summary="List lecturer's assigned departments in an institution",
)
async def list_my_departments(
    institution_id: uuid.UUID = Query(...),
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db)
) -> list[DepartmentResponse]:
    """Returns departments where the lecturer has active teaching assignments."""
    stmt = (
        select(Department)
        .join(TeachingAssignment, TeachingAssignment.department_id == Department.id)
        .where(
            TeachingAssignment.lecturer_id == current_user.id,
            TeachingAssignment.institution_id == institution_id,
            TeachingAssignment.is_active == True,
            Department.is_active == True
        )
        .distinct()
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get(
    "/me/options",
    response_model=list[OptionResponse],
    summary="List lecturer's assigned programs/options in a department",
)
async def list_my_options(
    department_id: uuid.UUID = Query(...),
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db)
) -> list[OptionResponse]:
    """Returns programs where the lecturer has active teaching assignments."""
    stmt = (
        select(Option)
        .join(TeachingAssignment, TeachingAssignment.option_id == Option.id)
        .where(
            TeachingAssignment.lecturer_id == current_user.id,
            TeachingAssignment.department_id == department_id,
            TeachingAssignment.is_active == True,
            Option.is_active == True
        )
        .distinct()
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get(
    "/me/classes",
    response_model=list[ClassGroupResponse],
    summary="List assigned class levels for an option",
)
async def list_option_classes(
    option_id: uuid.UUID = Query(...),
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db)
) -> list[ClassGroupResponse]:
    """Returns class levels assigned to the lecturer for a specific program."""
    from app.db.models.academic import ClassGroup

    # Try to find specific classes/levels linked via teaching assignments (if assigned to a section)
    stmt = (
        select(ClassGroup)
        .join(ClassSection, ClassSection.class_group_id == ClassGroup.id)
        .join(TeachingAssignment, TeachingAssignment.class_section_id == ClassSection.id)
        .where(
            TeachingAssignment.lecturer_id == current_user.id,
            TeachingAssignment.option_id == option_id,
            TeachingAssignment.is_active == True
        )
        .distinct()
    )
    result = await db.execute(stmt)
    items = list(result.scalars().all())

    # Fallback: if no specific section assigned, show all class groups (levels) for the assigned option
    if not items:
        stmt_fallback = (
            select(ClassGroup)
            .join(TeachingAssignment, TeachingAssignment.option_id == ClassGroup.option_id)
            .where(
                TeachingAssignment.lecturer_id == current_user.id,
                TeachingAssignment.option_id == option_id,
                TeachingAssignment.is_active == True,
                ClassGroup.is_active == True
            )
            .distinct()
        )
        result = await db.execute(stmt_fallback)
        items = list(result.scalars().all())

    return items


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


