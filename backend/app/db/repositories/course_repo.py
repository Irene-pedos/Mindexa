from __future__ import annotations

import uuid
from typing import List, Tuple
from sqlalchemy import func, select, and_, or_, exists
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.academic import Course, ClassSection, StudentEnrollment

class CourseRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_filtered(
        self,
        page: int = 1,
        page_size: int = 20,
        *,
        search: str | None = None,
        status: str | None = None,
        language: str | None = None,
        institution_id: uuid.UUID | None = None,
    ) -> Tuple[List[Course], int]:
        """One page of the catalog, with search / status / language applied across ALL courses
        (not just the rows of the current page)."""
        filters = [Course.is_deleted == False]  # noqa: E712
        if search:
            term = f"%{search.strip()}%"
            filters.append(or_(Course.name.ilike(term), Course.code.ilike(term)))
        if status == "active":
            filters.append(Course.is_active == True)  # noqa: E712
        elif status == "suspended":
            filters.append(Course.is_active == False)  # noqa: E712
        if language:
            filters.append(Course.language == language)
        if institution_id:
            filters.append(Course.institution_id == institution_id)

        total = (await self.db.execute(select(func.count(Course.id)).where(*filters))).scalar_one()
        result = await self.db.execute(
            select(Course)
            .where(*filters)
            .order_by(Course.code.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def catalog_summary(self) -> dict[str, int]:
        """Whole-catalog figures for the admin KPI strip."""
        from app.db.models.academic import TeachingAssignment

        live = Course.is_deleted == False  # noqa: E712

        async def count(*extra) -> int:  # type: ignore[no-untyped-def]
            return int((await self.db.execute(select(func.count(Course.id)).where(live, *extra))).scalar_one() or 0)

        assigned = exists().where(
            TeachingAssignment.course_id == Course.id,
            TeachingAssignment.is_active == True,  # noqa: E712
            TeachingAssignment.is_deleted == False,  # noqa: E712
        )
        return {
            "total": await count(),
            "active": await count(Course.is_active == True),  # noqa: E712
            "suspended": await count(Course.is_active == False),  # noqa: E712
            "ai_restricted": await count(Course.language == "RW"),
            "unassigned": await count(~assigned),
        }

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
        from app.db.models.academic import TeachingAssignment
        # Count students across all sections of this course via assignments
        result = await self.db.execute(
            select(func.count(func.distinct(StudentEnrollment.id)))
            .join(ClassSection, ClassSection.id == StudentEnrollment.class_section_id)
            .join(TeachingAssignment, TeachingAssignment.class_section_id == ClassSection.id)
            .where(
                TeachingAssignment.course_id == course_id,
                StudentEnrollment.is_deleted == False
            )
        )
        return result.scalar_one()

    async def list_by_student(
        self, student_id: uuid.UUID
    ) -> list[Course]:
        """List all courses where the student has an active enrollment in any section."""
        from app.db.models.academic import TeachingAssignment
        result = await self.db.execute(
            select(Course)
            .join(TeachingAssignment, TeachingAssignment.course_id == Course.id)
            .join(ClassSection, ClassSection.id == TeachingAssignment.class_section_id)
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

    async def create(self, course: Course) -> Course:
        self.db.add(course)
        await self.db.flush()
        return course

    async def get_by_id(self, course_id: uuid.UUID) -> Course | None:
        result = await self.db.execute(
            select(Course).where(Course.id == course_id, Course.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def delete(self, course_id: uuid.UUID) -> bool:
        course = await self.get_by_id(course_id)
        if course:
            course.soft_delete()
            await self.db.flush()
            return True
        return False

