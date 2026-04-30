from __future__ import annotations

import uuid
from typing import List, Tuple
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.academic import Course, ClassSection, StudentEnrollment

class CourseRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_all(
        self, page: int = 1, page_size: int = 20
    ) -> Tuple[List[Course], int]:
        filters = [Course.is_deleted == False]
        
        count_result = await self.db.execute(
            select(func.count(Course.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(Course)
            .where(*filters)
            .order_by(Course.code.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def count_active(self) -> int:
        result = await self.db.execute(
            select(func.count(Course.id)).where(
                Course.is_deleted == False
            )
        )
        return result.scalar_one()

    async def get_student_count(self, course_id: uuid.UUID) -> int:
        # Count students across all sections of this course
        result = await self.db.execute(
            select(func.count(StudentEnrollment.id))
            .join(ClassSection, ClassSection.id == StudentEnrollment.class_section_id)
            .where(
                ClassSection.course_id == course_id,
                StudentEnrollment.is_deleted == False
            )
        )
        return result.scalar_one()

    async def list_by_student(
        self, student_id: uuid.UUID
    ) -> list[Course]:
        """List all courses where the student has an active enrollment in any section."""
        result = await self.db.execute(
            select(Course)
            .join(ClassSection, ClassSection.course_id == Course.id)
            .join(StudentEnrollment, StudentEnrollment.class_section_id == ClassSection.id)
            .where(
                StudentEnrollment.student_id == student_id,
                StudentEnrollment.is_deleted == False,
                Course.is_deleted == False
            )
            .order_by(Course.code.asc())
            .distinct()
        )
        return list(result.scalars().all())
