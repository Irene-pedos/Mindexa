"""
app/db/repositories/academic_structure_repo.py

Read model for the admin "academic structure" screens: the whole organisation of one
institution in a handful of queries (inactive records included, so they can be re-activated),
plus per-institution counts for the institutions registry.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import EnrollmentStatus
from app.db.models.academic import (
    Campus,
    ClassGroup,
    ClassSection,
    College,
    Course,
    CourseDepartment,
    Department,
    Institution,
    Option,
    StudentEnrollment,
)


class AcademicStructureRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── scoping helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _department_ids(institution_id: uuid.UUID) -> Select[tuple[uuid.UUID]]:
        return select(Department.id).where(
            Department.institution_id == institution_id,
            Department.is_deleted.is_(False),
        )

    def _group_ids(self, institution_id: uuid.UUID) -> Select[tuple[uuid.UUID]]:
        return (
            select(ClassGroup.id)
            .join(Option, Option.id == ClassGroup.option_id)
            .where(
                Option.department_id.in_(self._department_ids(institution_id)),
                Option.is_deleted.is_(False),
                ClassGroup.is_deleted.is_(False),
            )
        )

    def _section_filter(self, institution_id: uuid.UUID) -> ColumnElement[bool]:
        """A class belongs to an institution through its department or through its year level."""
        return or_(
            ClassSection.department_id.in_(self._department_ids(institution_id)),
            ClassSection.class_group_id.in_(self._group_ids(institution_id)),
        )

    # ── single institution ────────────────────────────────────────────────────

    async def get_institution(self, institution_id: uuid.UUID) -> Institution | None:
        result = await self.db.execute(
            select(Institution).where(
                Institution.id == institution_id, Institution.is_deleted.is_(False)
            )
        )
        return result.scalar_one_or_none()

    async def snapshot(self, institution_id: uuid.UUID) -> dict[str, Any]:
        """Every live record of the institution's structure, active or not."""
        scalars = lambda stmt: self.db.execute(stmt)  # noqa: E731 - tiny local alias

        campuses = (
            (
                await scalars(
                    select(Campus)
                    .where(Campus.institution_id == institution_id, Campus.is_deleted.is_(False))
                    .order_by(Campus.name)
                )
            )
            .scalars()
            .all()
        )
        colleges = (
            (
                await scalars(
                    select(College)
                    .where(College.institution_id == institution_id, College.is_deleted.is_(False))
                    .order_by(College.name)
                )
            )
            .scalars()
            .all()
        )
        departments = (
            (
                await scalars(
                    select(Department)
                    .where(
                        Department.institution_id == institution_id,
                        Department.is_deleted.is_(False),
                    )
                    .order_by(Department.name)
                )
            )
            .scalars()
            .all()
        )
        programs = (
            (
                await scalars(
                    select(Option)
                    .where(
                        Option.department_id.in_(self._department_ids(institution_id)),
                        Option.is_deleted.is_(False),
                    )
                    .order_by(Option.name)
                )
            )
            .scalars()
            .all()
        )
        levels = (
            (
                await scalars(
                    select(ClassGroup)
                    .where(ClassGroup.id.in_(self._group_ids(institution_id)))
                    .order_by(ClassGroup.level.asc().nulls_last(), ClassGroup.name)
                )
            )
            .scalars()
            .all()
        )
        classes = (
            (
                await scalars(
                    select(ClassSection)
                    .where(self._section_filter(institution_id), ClassSection.is_deleted.is_(False))
                    .order_by(ClassSection.name)
                )
            )
            .scalars()
            .all()
        )

        student_counts = (
            dict(
                (
                    await scalars(
                        select(StudentEnrollment.class_section_id, func.count(StudentEnrollment.id))
                        .where(
                            StudentEnrollment.class_section_id.in_([c.id for c in classes]),
                            StudentEnrollment.enrollment_status == EnrollmentStatus.ACTIVE.value,
                            StudentEnrollment.is_deleted.is_(False),
                        )
                        .group_by(StudentEnrollment.class_section_id)
                    )
                ).all()
            )
            if classes
            else {}
        )

        course_counts = (
            dict(
                (
                    await scalars(
                        select(
                            CourseDepartment.department_id,
                            func.count(func.distinct(CourseDepartment.course_id)),
                        )
                        .join(Course, Course.id == CourseDepartment.course_id)
                        .where(
                            CourseDepartment.department_id.in_([d.id for d in departments]),
                            Course.is_deleted.is_(False),
                        )
                        .group_by(CourseDepartment.department_id)
                    )
                ).all()
            )
            if departments
            else {}
        )

        return {
            "campuses": campuses,
            "colleges": colleges,
            "departments": departments,
            "programs": programs,
            "levels": levels,
            "classes": classes,
            "student_counts": student_counts,
            "course_counts": course_counts,
        }

    # ── all institutions ──────────────────────────────────────────────────────

    async def overview(self) -> list[dict[str, Any]]:
        """Counts per institution (a handful of institutions, so one pass each is fine)."""
        institutions = (
            (await self.db.execute(select(Institution.id).where(Institution.is_deleted.is_(False))))
            .scalars()
            .all()
        )

        async def count(stmt: Select[Any]) -> int:
            return int((await self.db.execute(stmt)).scalar_one() or 0)

        rows: list[dict[str, Any]] = []
        for iid in institutions:
            section_ids = select(ClassSection.id).where(
                self._section_filter(iid),
                ClassSection.is_deleted.is_(False),
                ClassSection.is_active.is_(True),
            )
            rows.append(
                {
                    "institution_id": iid,
                    "campuses": await count(
                        select(func.count(Campus.id)).where(
                            Campus.institution_id == iid,
                            Campus.is_deleted.is_(False),
                            Campus.is_active.is_(True),
                        )
                    ),
                    "colleges": await count(
                        select(func.count(College.id)).where(
                            College.institution_id == iid,
                            College.is_deleted.is_(False),
                            College.is_active.is_(True),
                        )
                    ),
                    "departments": await count(
                        select(func.count(Department.id)).where(
                            Department.institution_id == iid,
                            Department.is_deleted.is_(False),
                            Department.is_active.is_(True),
                        )
                    ),
                    "programs": await count(
                        select(func.count(Option.id)).where(
                            Option.department_id.in_(self._department_ids(iid)),
                            Option.is_deleted.is_(False),
                            Option.is_active.is_(True),
                        )
                    ),
                    "classes": await count(
                        select(func.count(ClassSection.id)).where(ClassSection.id.in_(section_ids))
                    ),
                    "students": await count(
                        select(func.count(func.distinct(StudentEnrollment.student_id))).where(
                            StudentEnrollment.class_section_id.in_(section_ids),
                            StudentEnrollment.enrollment_status == EnrollmentStatus.ACTIVE.value,
                            StudentEnrollment.is_deleted.is_(False),
                        )
                    ),
                    "courses": await count(
                        select(func.count(Course.id)).where(
                            Course.institution_id == iid,
                            Course.is_deleted.is_(False),
                            Course.is_active.is_(True),
                        )
                    ),
                }
            )
        return rows
