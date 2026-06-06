"""
app/api/v1/routes/academic.py

Cascading hierarchy routes for academic onboarding and assignments.
"""

import uuid
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.academic import Institution, Campus, College, Department, Option, ClassGroup, ClassSection, Course, AcademicPeriod
from app.db.schemas.academic import (
    InstitutionResponse,
    CampusResponse,
    CollegeResponse,
    DepartmentResponse,
    OptionResponse,
    ClassGroupResponse,
    ClassSectionResponse,
    CourseResponse,
    AcademicPeriodResponse,
)
from app.db.session import get_db

router = APIRouter(prefix="/academic-hierarchy", tags=["Academic Hierarchy"])


@router.get("/levels", response_model=List[int])
async def get_levels(
    institution_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db)
):
    """List all distinct academic levels defined in the system or institution."""
    from sqlalchemy import func
    stmt = select(func.distinct(ClassGroup.level)).where(ClassGroup.level != None)
    if institution_id:
        # Join through Option and Department to filter by institution
        stmt = stmt.join(Option).join(Department).where(Department.institution_id == institution_id)
        
    result = await db.execute(stmt)
    # Sort levels numerically
    levels = sorted([row for row in result.scalars().all()])
    return levels


@router.get("/institutions", response_model=List[InstitutionResponse])
async def get_institutions(db: AsyncSession = Depends(get_db)):
    """List all active institutions."""
    stmt = select(Institution).where(Institution.is_active == True)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/campuses", response_model=List[CampusResponse])
async def get_campuses(
    institution_id: uuid.UUID, 
    db: AsyncSession = Depends(get_db)
):
    """List campuses within an institution."""
    stmt = select(Campus).where(
        Campus.institution_id == institution_id,
        Campus.is_active == True
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/colleges", response_model=List[CollegeResponse])
async def get_colleges(
    institution_id: uuid.UUID | None = None,
    campus_id: uuid.UUID | None = None, 
    db: AsyncSession = Depends(get_db)
):
    """List colleges within a campus or institution."""
    stmt = select(College).where(College.is_active == True)
    if campus_id:
        stmt = stmt.where(College.campus_id == campus_id)
    elif institution_id:
        stmt = stmt.where(College.institution_id == institution_id)
    else:
        return []
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/departments", response_model=List[DepartmentResponse])
async def get_departments(
    institution_id: uuid.UUID | None = None,
    campus_id: uuid.UUID | None = None,
    college_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db)
):
    """List departments within an institution, campus, or college."""
    stmt = select(Department).where(Department.is_active == True)
    if college_id:
        stmt = stmt.where(Department.college_id == college_id)
    elif campus_id:
        stmt = stmt.where(Department.campus_id == campus_id)
    elif institution_id:
        stmt = stmt.where(Department.institution_id == institution_id)
    else:
        return []

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/options", response_model=List[OptionResponse])
async def get_options(
    department_id: uuid.UUID, 
    db: AsyncSession = Depends(get_db)
):
    """List academic options/programs within a department."""
    stmt = select(Option).where(
        Option.department_id == department_id,
        Option.is_active == True
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/class-groups", response_model=List[ClassGroupResponse])
async def get_class_groups(
    option_id: uuid.UUID, 
    db: AsyncSession = Depends(get_db)
):
    """List class groups (levels) within an option."""
    stmt = select(ClassGroup).where(
        ClassGroup.option_id == option_id,
        ClassGroup.is_active == True
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/sections", response_model=List[ClassSectionResponse])
async def get_sections(
    class_group_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    course_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db)
):
    """List specific sections within a class group, department, or for a specific course."""
    stmt = select(ClassSection).where(ClassSection.is_active == True)
    if class_group_id:
        stmt = stmt.where(ClassSection.class_group_id == class_group_id)
    if department_id:
        stmt = stmt.where(ClassSection.department_id == department_id)
    if course_id:
        from app.db.models.academic import TeachingAssignment
        stmt = stmt.join(TeachingAssignment, TeachingAssignment.class_section_id == ClassSection.id).where(
            TeachingAssignment.course_id == course_id
        ).distinct()

    if not class_group_id and not department_id and not course_id:
        return []

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/courses", response_model=List[CourseResponse])
async def get_courses(
    department_id: uuid.UUID, 
    db: AsyncSession = Depends(get_db)
):
    """List modules/courses within a department."""
    from app.db.models.academic import CourseDepartment
    
    stmt = (
        select(Course)
        .join(CourseDepartment, CourseDepartment.course_id == Course.id)
        .where(
            CourseDepartment.department_id == department_id,
            Course.is_active == True
        )
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/academic-periods", response_model=List[AcademicPeriodResponse])
async def get_periods(
    institution_id: uuid.UUID | None = None, 
    db: AsyncSession = Depends(get_db)
):
    """List academic periods (semesters) within an institution, or all if none provided."""
    stmt = select(AcademicPeriod).where(AcademicPeriod.is_active == True)
    if institution_id:
        stmt = stmt.where(AcademicPeriod.institution_id == institution_id)
        
    result = await db.execute(stmt)
    return result.scalars().all()
