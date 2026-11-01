"""Lookups used to validate and complete a student's academic onboarding."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import ClassSectionStatus
from app.db.models.academic import (
    AcademicPeriod,
    Campus,
    ClassGroup,
    ClassSection,
    College,
    Department,
    Institution,
    Option,
    StudentEnrollment,
)


class OnboardingRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_institution(self, institution_id: uuid.UUID) -> Institution | None:
        row = await self.db.get(Institution, institution_id)
        return None if row is None or row.is_deleted else row

    async def get_department(self, department_id: uuid.UUID) -> Department | None:
        row = await self.db.get(Department, department_id)
        return None if row is None or row.is_deleted else row

    async def get_option(self, option_id: uuid.UUID) -> Option | None:
        row = await self.db.get(Option, option_id)
        return None if row is None or row.is_deleted else row

    async def get_campus(self, campus_id: uuid.UUID) -> Campus | None:
        row = await self.db.get(Campus, campus_id)
        return None if row is None or row.is_deleted else row

    async def get_college(self, college_id: uuid.UUID) -> College | None:
        row = await self.db.get(College, college_id)
        return None if row is None or row.is_deleted else row

    async def get_class_group(self, class_group_id: uuid.UUID) -> ClassGroup | None:
        row = await self.db.get(ClassGroup, class_group_id)
        return None if row is None or row.is_deleted or not row.is_active else row

    async def get_section(self, section_id: uuid.UUID) -> ClassSection | None:
        row = await self.db.get(ClassSection, section_id)
        if row is None or row.is_deleted or not row.is_active:
            return None
        return row if row.status == ClassSectionStatus.ACTIVE else None

    async def count_option_groups(self, option_id: uuid.UUID) -> int:
        stmt = select(func.count(ClassGroup.id)).where(
            ClassGroup.option_id == option_id,
            ClassGroup.is_active == True,  # noqa: E712
            ClassGroup.is_deleted == False,  # noqa: E712
        )
        return (await self.db.execute(stmt)).scalar_one()

    async def count_group_sections(self, class_group_id: uuid.UUID) -> int:
        stmt = select(func.count(ClassSection.id)).where(
            ClassSection.class_group_id == class_group_id,
            ClassSection.is_active == True,  # noqa: E712
            ClassSection.is_deleted == False,  # noqa: E712
            ClassSection.status == ClassSectionStatus.ACTIVE,
        )
        return (await self.db.execute(stmt)).scalar_one()

    async def current_year_name(self, institution_id: uuid.UUID, today: date) -> str | None:
        """Name of the academic year running today (the semester's parent, or the year itself)."""
        period = (
            await self.db.execute(
                select(AcademicPeriod)
                .where(
                    AcademicPeriod.institution_id == institution_id,
                    AcademicPeriod.is_deleted == False,  # noqa: E712
                    AcademicPeriod.is_active == True,  # noqa: E712
                    AcademicPeriod.start_date <= today,
                    AcademicPeriod.end_date >= today,
                )
                .order_by(AcademicPeriod.parent_id.is_(None), AcademicPeriod.start_date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if period is None:
            return None
        if period.parent_id is not None:
            parent = await self.db.get(AcademicPeriod, period.parent_id)
            if parent is not None:
                return parent.name
        return period.name

    async def get_active_enrollment(
        self, student_id: uuid.UUID, class_section_id: uuid.UUID
    ) -> StudentEnrollment | None:
        stmt = select(StudentEnrollment).where(
            StudentEnrollment.student_id == student_id,
            StudentEnrollment.class_section_id == class_section_id,
            StudentEnrollment.is_deleted == False,  # noqa: E712
        )
        return (await self.db.execute(stmt)).scalars().first()
