import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, and_, or_, exists, not_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.db.models.academic import (
    TeachingAssignment, 
    Institution, 
    Department, 
    Campus, 
    College, 
    Option, 
    ClassGroup, 
    ClassSection, 
    AcademicPeriod,
    Course,
)
from app.db.schemas.teaching_assignment import TeachingAssignmentCreate, TeachingAssignmentResponse, TeachingAssignmentDetailResponse
from app.db.schemas.academic import (
    CampusCreate,
    CampusResponse,
    CollegeCreate,
    CollegeResponse,
    DepartmentCreate,
    DepartmentResponse,
    OptionCreate,
    OptionResponse,
    ClassGroupCreate,
    ClassGroupResponse,
    ClassSectionCreate,
    ClassSectionResponse,
    AcademicPeriodCreate,
    AcademicPeriodResponse,
    CourseCreate,
    CourseResponse,
)
from app.services.academic_period_service import AcademicPeriodService
from app.schemas.academic_structure import (
    AcademicPeriodItem,
    AcademicPeriodUpdate,
    AcademicStructureResponse,
    CampusUpdate,
    ClassGroupUpdate,
    ClassSectionUpdate,
    CollegeUpdate,
    DepartmentUpdate,
    InstitutionOverviewItem,
    OptionUpdate,
)
from app.services.academic_structure_service import AcademicStructureService
from app.services.teaching_assignment_service import TeachingAssignmentService
from app.db.repositories.notification_repo import NotificationRepository
from app.db.enums import NotificationType
from app.core import links as frontend_links
from app.core.logger import get_logger
from app.dependencies.auth import require_admin

logger = get_logger(__name__)

# Every endpoint here mutates institutional structure — admin only.
router = APIRouter(
    prefix="/admin/academic",
    tags=["Admin Academic"],
    dependencies=[Depends(require_admin)],
)

# ── Teaching Assignments ───────────────────────────────────────────────────

async def _link_course_department(db: AsyncSession, assignment: TeachingAssignment) -> None:
    """Give a department-less course the department it is being taught under.

    Moderation, the exam office and appeals all route by course.department_id, so a
    course without one makes every paper for it invisible to moderators.
    """
    course = await db.get(Course, assignment.course_id)
    if course and course.department_id is None and assignment.department_id:
        course.department_id = assignment.department_id
        logger.info(
            "course_department_linked",
            course_id=str(course.id),
            department_id=str(assignment.department_id),
        )


async def _send_assignment_notification(db: AsyncSession, assignment: TeachingAssignment):
    """Internal helper to notify lecturer of new assignment."""
    try:
        inst = await db.get(Institution, assignment.institution_id)
        dept = await db.get(Department, assignment.department_id)
        course = await db.get(Course, assignment.course_id)
        
        course_info = f" for {course.name} ({course.code})" if course else ""
        
        note_repo = NotificationRepository(db)
        await note_repo.create(
            recipient_id=assignment.lecturer_id,
            notification_type=NotificationType.TEACHING_ASSIGNMENT_CREATED,
            title="New Teaching Assignment",
            body=f"You have been assigned to the Department of {dept.name if dept else 'Academic Unit'} at {inst.name if inst else 'your institution'}{course_info} for the {assignment.academic_year} academic year.",
            action_url=frontend_links.lecturer_profile(),
            reference_id=assignment.id,
            reference_type="teaching_assignment"
        )
    except Exception as e:
        logger.warning(
            "assignment_notification_failed",
            assignment_id=str(assignment.id),
            error=str(e),
        )

@router.post("/assignments/bulk", response_model=List[TeachingAssignmentResponse], status_code=status.HTTP_201_CREATED)
async def create_bulk_assignments(
    body: List[TeachingAssignmentCreate],
    db: AsyncSession = Depends(get_db)
):
    """Create multiple teaching assignments at once and notify the lecturer.

    All or nothing: each assignment is validated first (lecturer, course, department, class,
    period must fit together, and no duplicates), and nothing is saved if any one is refused.
    """
    new_assignments = await TeachingAssignmentService(db).build(body)
    db.add_all(new_assignments)

    await db.flush() # Get IDs
    
    # Send notifications (Lecturer is the same for all in this context from UI)
    # But we iterate just in case of future varied usage
    for a in new_assignments:
        await _link_course_department(db, a)
        await _send_assignment_notification(db, a)
        
    await db.commit()
    for a in new_assignments:
        await db.refresh(a)
    return new_assignments

@router.post("/assignments", response_model=TeachingAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: TeachingAssignmentCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new teaching assignment for a lecturer (validated like the bulk route)."""
    (new_assignment,) = await TeachingAssignmentService(db).build([body])
    db.add(new_assignment)
    await db.flush() # Get ID
    
    await _link_course_department(db, new_assignment)
    await _send_assignment_notification(db, new_assignment)

    await db.commit()
    await db.refresh(new_assignment)
    return new_assignment

from app.db.models.academic import (
    Institution, Campus, College, Department, Option, ClassSection, AcademicPeriod, Course
)

@router.get("/assignments", response_model=List[TeachingAssignmentDetailResponse])
async def get_assignments(
    lecturer_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db)
):
    """List teaching assignments, optionally filtered by lecturer."""
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
        .where(TeachingAssignment.is_active == True)
        .where(TeachingAssignment.is_deleted == False)  # noqa: E712
    )

    if lecturer_id:
        stmt = stmt.where(TeachingAssignment.lecturer_id == lecturer_id)
    
    result = await db.execute(stmt)
    rows = result.all()
    
    assignments = []
    for row in rows:
        assignment_obj, inst_name, camp_name, coll_name, dept_name, opt_name, crs_name, crs_code, sec_name, group_name, group_level = row
        assignment_dict = assignment_obj.model_dump()
        assignment_dict.update({
            "institution_name": inst_name,
            "campus_name": camp_name,
            "college_name": coll_name,
            "department_name": dept_name,
            "option_name": opt_name,
            "course_name": crs_name,
            "course_code": crs_code,
            "class_section_name": sec_name,
            "class_group_name": group_name,
            "class_group_level": group_level
        })
        assignments.append(assignment_dict)

    return assignments

@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_assignment(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Deactivate or remove a teaching assignment."""
    stmt = select(TeachingAssignment).where(TeachingAssignment.id == assignment_id)
    result = await db.execute(stmt)
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    assignment.is_active = False
    await db.commit()
    return None

# ── Academic Structure Management ──────────────────────────────────────────

@router.get("/structure", response_model=AcademicStructureResponse)
async def get_structure(institution_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """The whole organisation of one institution in a single response (inactive records included)."""
    return await AcademicStructureService(db).get_structure(institution_id)


@router.get("/overview", response_model=List[InstitutionOverviewItem])
async def get_structure_overview(db: AsyncSession = Depends(get_db)):
    """Per-institution counts (campuses, departments, classes, students, ...)."""
    return await AcademicStructureService(db).overview()


@router.post("/campuses", response_model=CampusResponse)
async def create_campus(body: CampusCreate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).create_campus(body)

@router.post("/colleges", response_model=CollegeResponse)
async def create_college(body: CollegeCreate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).create_college(body)

@router.post("/departments", response_model=DepartmentResponse)
async def create_department(body: DepartmentCreate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).create_department(body)

@router.post("/options", response_model=OptionResponse)
async def create_option(body: OptionCreate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).create_option(body)

@router.post("/class-groups", response_model=ClassGroupResponse)
async def create_class_group(body: ClassGroupCreate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).create_class_group(body)

@router.post("/sections", response_model=ClassSectionResponse)
async def create_section(body: ClassSectionCreate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).create_section(body)

# ── Update & Deactivate Academic Structure ────────────────────────────────────
# Bodies are validated schemas, so only name / status / the few editable details can change;
# ids, parents, codes and soft-delete flags can no longer be overwritten through these routes.

@router.patch("/campuses/{id}", response_model=CampusResponse)
async def update_campus(id: uuid.UUID, body: CampusUpdate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).update(Campus, id, "Campus", body.model_dump(exclude_unset=True))

@router.patch("/colleges/{id}", response_model=CollegeResponse)
async def update_college(id: uuid.UUID, body: CollegeUpdate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).update(College, id, "College", body.model_dump(exclude_unset=True))

@router.patch("/departments/{id}", response_model=DepartmentResponse)
async def update_department(id: uuid.UUID, body: DepartmentUpdate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).update(Department, id, "Department", body.model_dump(exclude_unset=True))

@router.patch("/options/{id}", response_model=OptionResponse)
async def update_option(id: uuid.UUID, body: OptionUpdate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).update(Option, id, "Programme", body.model_dump(exclude_unset=True))

@router.patch("/class-groups/{id}", response_model=ClassGroupResponse)
async def update_class_group(id: uuid.UUID, body: ClassGroupUpdate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).update(ClassGroup, id, "Year level", body.model_dump(exclude_unset=True))

@router.patch("/sections/{id}", response_model=ClassSectionResponse)
async def update_section(id: uuid.UUID, body: ClassSectionUpdate, db: AsyncSession = Depends(get_db)):
    return await AcademicStructureService(db).update(ClassSection, id, "Class", body.model_dump(exclude_unset=True))

@router.get("/academic-periods", response_model=List[AcademicPeriodItem])
async def get_all_periods(
    institution_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db)
):
    """List academic periods (newest first) with how many courses and assignments use each."""
    return await AcademicPeriodService(db).list_periods(institution_id)


@router.post("/academic-periods", response_model=AcademicPeriodResponse)
async def create_period(body: AcademicPeriodCreate, db: AsyncSession = Depends(get_db)):
    return await AcademicPeriodService(db).create(body)

@router.patch("/academic-periods/{id}", response_model=AcademicPeriodResponse)
async def update_period(id: uuid.UUID, body: AcademicPeriodUpdate, db: AsyncSession = Depends(get_db)):
    return await AcademicPeriodService(db).update(id, body)


@router.post("/courses", response_model=CourseResponse)
async def create_course(body: CourseCreate, db: AsyncSession = Depends(get_db)):
    from app.services.admin_service import AdminService
    from app.schemas.admin import AdminCourseCreate
    service = AdminService(db)
    # Map CourseCreate to AdminCourseCreate
    admin_body = AdminCourseCreate(**body.model_dump())
    course = await service.create_course(admin_body)
    
    # Return as CourseResponse
    # CourseResponse.model_validate(course) or just return
    return course
