"""
app/db/repositories/teaching_assignment_repo.py

Lookups the teaching-assignment rules need.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.academic import (
    ClassGroup,
    CourseDepartment,
    Option,
    TeachingAssignment,
)


class TeachingAssignmentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def find_active(
        self,
        lecturer_id: uuid.UUID,
        course_id: uuid.UUID | None,
        class_section_id: uuid.UUID | None,
        academic_period_id: uuid.UUID | None,
    ) -> TeachingAssignment | None:
        """The live assignment with the same lecturer, course, class and period, if any."""
        stmt = select(TeachingAssignment).where(
            TeachingAssignment.lecturer_id == lecturer_id,
            TeachingAssignment.is_active.is_(True),
            TeachingAssignment.is_deleted.is_(False),
            TeachingAssignment.course_id.is_(None)
            if course_id is None
            else TeachingAssignment.course_id == course_id,
            TeachingAssignment.class_section_id.is_(None)
            if class_section_id is None
            else TeachingAssignment.class_section_id == class_section_id,
            TeachingAssignment.academic_period_id.is_(None)
            if academic_period_id is None
            else TeachingAssignment.academic_period_id == academic_period_id,
        )
        return (await self.db.execute(stmt)).scalars().first()

    async def course_department_ids(self, course_id: uuid.UUID) -> set[uuid.UUID]:
        rows = await self.db.execute(
            select(CourseDepartment.department_id).where(CourseDepartment.course_id == course_id)
        )
        return set(rows.scalars().all())

    async def section_option_and_department(
        self, class_group_id: uuid.UUID | None
    ) -> tuple[uuid.UUID, uuid.UUID] | None:
        """(option id, department id) of a year level, or None when it has no programme."""
        if class_group_id is None:
            return None
        row = (
            await self.db.execute(
                select(Option.id, Option.department_id)
                .join(ClassGroup, ClassGroup.option_id == Option.id)
                .where(ClassGroup.id == class_group_id)
            )
        ).first()
        return (row[0], row[1]) if row else None
