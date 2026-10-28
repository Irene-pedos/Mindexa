"""
app/services/teaching_assignment_service.py

Creating teaching assignments (lecturer <-> course, optionally for one class, in one period).

The routes used to save whatever they were given. This checks that every part of an assignment
fits together before anything is stored, and that the same lecturer is not given the same course
and class twice, with messages an administrator can act on.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.db.enums import UserRole
from app.db.models.academic import (
    AcademicPeriod,
    ClassSection,
    Course,
    Department,
    TeachingAssignment,
)
from app.db.models.auth import User, UserProfile
from app.db.repositories.teaching_assignment_repo import TeachingAssignmentRepository
from app.db.schemas.teaching_assignment import TeachingAssignmentCreate

logger = get_logger(__name__)


class TeachingAssignmentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = TeachingAssignmentRepository(db)

    async def _lecturer_label(self, user: User) -> str:
        """A person's name for messages. Queried explicitly: touching `user.profile` would lazy-load
        inside async code, which is not allowed."""
        profile = (
            (await self.db.execute(select(UserProfile).where(UserProfile.user_id == user.id)))
            .scalars()
            .first()
        )
        first = getattr(profile, "first_name", "") or ""
        last = getattr(profile, "last_name", "") or ""
        return f"{first} {last}".strip() or user.email

    async def build(self, items: list[TeachingAssignmentCreate]) -> list[TeachingAssignment]:
        """Validate every item and return unsaved assignments; raises on the first problem.

        All or nothing: nothing is added to the session unless every item is valid.
        """
        built: list[TeachingAssignment] = []
        seen: set[tuple[uuid.UUID, uuid.UUID | None, uuid.UUID | None, uuid.UUID | None]] = set()

        for item in items:
            lecturer = await self.db.get(User, item.lecturer_id)
            if lecturer is None or getattr(lecturer, "is_deleted", False):
                raise NotFoundError("Lecturer not found.")
            if lecturer.role != UserRole.LECTURER:
                raise ValidationError(
                    f"{await self._lecturer_label(lecturer)} is not a lecturer account."
                )

            department = await self.db.get(Department, item.department_id)
            if department is None or department.is_deleted or not department.is_active:
                raise ValidationError("That department is missing or suspended.")
            if department.institution_id != item.institution_id:
                raise ValidationError("The department does not belong to the selected institution.")

            data = item.model_dump()

            course = None
            if item.course_id:
                course = await self.db.get(Course, item.course_id)
                if course is None or course.is_deleted:
                    raise NotFoundError("Course not found.")
                if not course.is_active:
                    raise ValidationError(
                        f"{course.code} is suspended. Reactivate it before assigning a lecturer."
                    )
                if course.institution_id != item.institution_id:
                    raise ValidationError(f"{course.code} belongs to a different institution.")
                offered_by = await self.repo.course_department_ids(course.id)
                if course.department_id:
                    offered_by.add(course.department_id)
                if offered_by and item.department_id not in offered_by:
                    raise ValidationError(f"{course.code} is not offered by that department.")

            if item.academic_period_id:
                period = await self.db.get(AcademicPeriod, item.academic_period_id)
                if period is None or period.is_deleted or not period.is_active:
                    raise ValidationError("That academic period is missing or closed.")
                if period.institution_id != item.institution_id:
                    raise ValidationError("The academic period belongs to a different institution.")

            section: ClassSection | None = None
            if item.class_section_id:
                section = await self.db.get(ClassSection, item.class_section_id)
                if section is None or section.is_deleted or not section.is_active:
                    raise ValidationError("That class is missing or suspended.")
                option_and_dept = await self.repo.section_option_and_department(
                    section.class_group_id
                )
                section_department = (
                    option_and_dept[1] if option_and_dept else section.department_id
                )
                if section_department != item.department_id:
                    raise ValidationError("That class does not belong to the selected department.")
                if option_and_dept and not data.get("option_id"):
                    data["option_id"] = option_and_dept[0]

            # a department sits under its college / campus, so fill those in
            data["campus_id"] = data.get("campus_id") or department.campus_id
            data["college_id"] = data.get("college_id") or department.college_id

            key = (item.lecturer_id, item.course_id, item.class_section_id, item.academic_period_id)
            existing = await self.repo.find_active(*key)
            if key in seen or existing is not None:
                where = f" for class {section.name}" if item.class_section_id and section else ""
                what = course.code if course else "this teaching context"
                who = await self._lecturer_label(lecturer)
                raise AlreadyExistsError(
                    detail=f"{who} is already assigned to {what}{where} in that period."
                )
            seen.add(key)
            built.append(TeachingAssignment(**data))

        return built
