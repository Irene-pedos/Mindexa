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
from app.db.repositories.notification_repo import NotificationRepository
from app.db.enums import NotificationType

router = APIRouter(prefix="/admin/academic", tags=["Admin Academic"])

# ── Teaching Assignments ───────────────────────────────────────────────────

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
            action_url="/lecturer/profile",
            reference_id=assignment.id,
            reference_type="teaching_assignment"
        )
    except Exception as e:
        print(f"Failed to send assignment notification: {e}")

@router.post("/assignments/bulk", response_model=List[TeachingAssignmentResponse], status_code=status.HTTP_201_CREATED)
async def create_bulk_assignments(
    body: List[TeachingAssignmentCreate],
    db: AsyncSession = Depends(get_db)
):
    """Create multiple teaching assignments at once and notify the lecturer."""
    new_assignments = []
    for item in body:
        assignment = TeachingAssignment(**item.model_dump())
        db.add(assignment)
        new_assignments.append(assignment)
    
    await db.flush() # Get IDs
    
    # Send notifications (Lecturer is the same for all in this context from UI)
    # But we iterate just in case of future varied usage
    for a in new_assignments:
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
    """Create a new teaching assignment for a lecturer."""
    new_assignment = TeachingAssignment(**body.model_dump())
    db.add(new_assignment)
    await db.flush() # Get ID
    
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

@router.post("/campuses", response_model=CampusResponse)
async def create_campus(body: CampusCreate, db: AsyncSession = Depends(get_db)):
    new_campus = Campus(**body.model_dump())
    db.add(new_campus)
    await db.commit()
    await db.refresh(new_campus)
    return new_campus

@router.post("/colleges", response_model=CollegeResponse)
async def create_college(body: CollegeCreate, db: AsyncSession = Depends(get_db)):
    new_college = College(**body.model_dump())
    db.add(new_college)
    await db.commit()
    await db.refresh(new_college)
    return new_college

@router.post("/departments", response_model=DepartmentResponse)
async def create_department(body: DepartmentCreate, db: AsyncSession = Depends(get_db)):
    new_dept = Department(**body.model_dump())
    db.add(new_dept)
    await db.commit()
    await db.refresh(new_dept)
    return new_dept

@router.post("/options", response_model=OptionResponse)
async def create_option(body: OptionCreate, db: AsyncSession = Depends(get_db)):
    new_opt = Option(**body.model_dump())
    db.add(new_opt)
    await db.commit()
    await db.refresh(new_opt)
    return new_opt

@router.post("/class-groups", response_model=ClassGroupResponse)
async def create_class_group(body: ClassGroupCreate, db: AsyncSession = Depends(get_db)):
    new_group = ClassGroup(**body.model_dump())
    db.add(new_group)
    await db.commit()
    await db.refresh(new_group)
    return new_group

@router.post("/sections", response_model=ClassSectionResponse)
async def create_section(body: ClassSectionCreate, db: AsyncSession = Depends(get_db)):
    new_section = ClassSection(**body.model_dump())
    db.add(new_section)
    await db.commit()
    await db.refresh(new_section)
    return new_section

# ── Update & Deactivate Academic Structure ────────────────────────────────────

@router.patch("/campuses/{id}", response_model=CampusResponse)
async def update_campus(id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db)):
    campus = await db.get(Campus, id)
    if not campus: raise HTTPException(status_code=404, detail="Campus not found")
    for k, v in body.items():
        if hasattr(campus, k): setattr(campus, k, v)
    await db.commit()
    await db.refresh(campus)
    return campus

@router.patch("/colleges/{id}", response_model=CollegeResponse)
async def update_college(id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db)):
    college = await db.get(College, id)
    if not college: raise HTTPException(status_code=404, detail="College not found")
    for k, v in body.items():
        if hasattr(college, k): setattr(college, k, v)
    await db.commit()
    await db.refresh(college)
    return college

@router.patch("/departments/{id}", response_model=DepartmentResponse)
async def update_department(id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db)):
    department = await db.get(Department, id)
    if not department: raise HTTPException(status_code=404, detail="Department not found")
    for k, v in body.items():
        if hasattr(department, k): setattr(department, k, v)
    await db.commit()
    await db.refresh(department)
    return department

@router.patch("/options/{id}", response_model=OptionResponse)
async def update_option(id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db)):
    option = await db.get(Option, id)
    if not option: raise HTTPException(status_code=404, detail="Option not found")
    for k, v in body.items():
        if hasattr(option, k): setattr(option, k, v)
    await db.commit()
    await db.refresh(option)
    return option

@router.patch("/class-groups/{id}", response_model=ClassGroupResponse)
async def update_class_group(id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db)):
    class_group = await db.get(ClassGroup, id)
    if not class_group: raise HTTPException(status_code=404, detail="Class Group not found")
    for k, v in body.items():
        if hasattr(class_group, k): setattr(class_group, k, v)
    await db.commit()
    await db.refresh(class_group)
    return class_group

@router.patch("/sections/{id}", response_model=ClassSectionResponse)
async def update_section(id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db)):
    section = await db.get(ClassSection, id)
    if not section: raise HTTPException(status_code=404, detail="Section not found")
    for k, v in body.items():
        if hasattr(section, k): setattr(section, k, v)
    await db.commit()
    await db.refresh(section)
    return section

@router.get("/academic-periods", response_model=List[AcademicPeriodResponse])
async def get_all_periods(
    institution_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db)
):
    """List all academic periods for admin management."""
    stmt = select(AcademicPeriod)
    if institution_id:
        stmt = stmt.where(AcademicPeriod.institution_id == institution_id)
    
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/academic-periods", response_model=AcademicPeriodResponse)
async def create_period(body: AcademicPeriodCreate, db: AsyncSession = Depends(get_db)):
    new_period = AcademicPeriod(**body.model_dump())
    db.add(new_period)
    await db.commit()
    await db.refresh(new_period)
    return new_period

@router.patch("/academic-periods/{id}", response_model=AcademicPeriodResponse)
async def update_period(id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db)):
    period = await db.get(AcademicPeriod, id)
    if not period: raise HTTPException(status_code=404, detail="Period not found")
    for k, v in body.items():
        if hasattr(period, k): setattr(period, k, v)
    await db.commit()
    await db.refresh(period)
    return period


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
