"""
app/services/academic_structure_service.py

Admin management of an institution's academic structure.

Only an institution and a department are strictly required by the data model: campuses and
colleges are optional parents of a department, and a class may hang directly off a department
(no programme or year level). This service keeps whatever shape the institution chose
consistent: parents must belong to the same institution, codes are unique per scope (reported
as a readable 409, not a database error), and a class under a year level always knows its
department.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, TypeVar

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.db.models.academic import (
    Campus,
    ClassGroup,
    ClassSection,
    College,
    Department,
    Institution,
    Option,
)
from app.db.repositories.academic_structure_repo import AcademicStructureRepository
from app.db.schemas.academic import (
    CampusCreate,
    ClassGroupCreate,
    ClassSectionCreate,
    CollegeCreate,
    DepartmentCreate,
    OptionCreate,
)
from app.schemas.academic_structure import (
    AcademicStructureResponse,
    InstitutionOverviewItem,
    StructureCampus,
    StructureClass,
    StructureCollege,
    StructureDepartment,
    StructureInstitution,
    StructureLevel,
    StructureProgram,
)

logger = get_logger(__name__)

T = TypeVar("T")


def _code(value: str) -> str:
    return value.strip().upper()


class AcademicStructureService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = AcademicStructureRepository(db)

    # ── reads ─────────────────────────────────────────────────────────────────

    async def get_structure(self, institution_id: uuid.UUID) -> AcademicStructureResponse:
        institution = await self.repo.get_institution(institution_id)
        if institution is None:
            raise NotFoundError("Institution", str(institution_id))

        snap = await self.repo.snapshot(institution_id)
        return AcademicStructureResponse(
            institution=StructureInstitution(
                id=institution.id,
                name=institution.name,
                code=institution.code,
                timezone=institution.timezone,
                is_active=institution.is_active,
                settings=institution.settings or {},
            ),
            campuses=[
                StructureCampus(id=c.id, name=c.name, code=c.code, is_active=c.is_active)
                for c in snap["campuses"]
            ],
            colleges=[
                StructureCollege(
                    id=c.id, campus_id=c.campus_id, name=c.name, code=c.code, is_active=c.is_active
                )
                for c in snap["colleges"]
            ],
            departments=[
                StructureDepartment(
                    id=d.id,
                    campus_id=d.campus_id,
                    college_id=d.college_id,
                    name=d.name,
                    code=d.code,
                    is_active=d.is_active,
                    course_count=int(snap["course_counts"].get(d.id, 0)),
                )
                for d in snap["departments"]
            ],
            programs=[
                StructureProgram(
                    id=o.id,
                    department_id=o.department_id,
                    name=o.name,
                    code=o.code,
                    is_active=o.is_active,
                )
                for o in snap["programs"]
            ],
            levels=[
                StructureLevel(
                    id=g.id,
                    option_id=g.option_id,
                    name=g.name,
                    code=g.code,
                    level=g.level,
                    is_active=g.is_active,
                )
                for g in snap["levels"]
            ],
            classes=[
                StructureClass(
                    id=s.id,
                    class_group_id=s.class_group_id,
                    department_id=s.department_id,
                    name=s.name,
                    academic_year=s.academic_year,
                    capacity=s.capacity,
                    location_type=getattr(s.location_type, "value", s.location_type),
                    room=s.room,
                    is_active=s.is_active,
                    student_count=int(snap["student_counts"].get(s.id, 0)),
                )
                for s in snap["classes"]
            ],
        )

    async def overview(self) -> list[InstitutionOverviewItem]:
        return [InstitutionOverviewItem(**row) for row in await self.repo.overview()]

    # ── helpers ───────────────────────────────────────────────────────────────

    async def _live(self, model: type[T], entity_id: uuid.UUID | None, label: str) -> T:
        row = await self.db.get(model, entity_id) if entity_id else None
        if row is None or getattr(row, "is_deleted", False):
            raise NotFoundError(f"{label} not found.")
        return row

    async def _institution(self, institution_id: uuid.UUID) -> Institution:
        institution = await self.repo.get_institution(institution_id)
        if institution is None:
            raise NotFoundError("Institution not found.")
        return institution

    async def _save(self, row: Any, *, what: str) -> Any:
        """Persist a new row; a unique-constraint hit becomes a readable 409.

        The message names no level on purpose: each institution calls its levels something
        different ("department" / "division" / "track"), and the server does not know which.
        """
        self.db.add(row)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            code = getattr(row, "code", None)
            logger.info(
                "academic_structure_duplicate", what=what, code=code, error=str(exc.orig)[:160]
            )
            detail = (
                f"The code '{code}' is already used here. Choose a different code."
                if code
                else "This name is already used here."
            )
            raise AlreadyExistsError(detail=detail) from exc
        await self.db.refresh(row)
        logger.info("academic_structure_created", what=what, id=str(row.id))
        return row

    async def _ensure_code_free(self, model: Any, code: str, **scope: uuid.UUID | None) -> None:
        """Reject a code already used in the same place.

        The database's unique constraints list the campus and college, and Postgres treats NULLs
        as different, so an institution with no campuses could otherwise hold two "ICT" departments.
        """
        conditions = [model.code == code, model.is_deleted.is_(False)]
        for field, value in scope.items():
            column = getattr(model, field)
            conditions.append(column.is_(None) if value is None else column == value)
        if (await self.db.execute(select(model.id).where(*conditions))).first():
            raise AlreadyExistsError(
                detail=f"The code '{code}' is already used here. Choose a different code."
            )

    # ── create ────────────────────────────────────────────────────────────────

    async def create_campus(self, body: CampusCreate) -> Campus:
        await self._institution(body.institution_id)
        campus = Campus(institution_id=body.institution_id, name=body.name, code=_code(body.code))
        return await self._save(campus, what="campus")

    async def create_college(self, body: CollegeCreate) -> College:
        await self._institution(body.institution_id)
        if body.campus_id:
            campus = await self._live(Campus, body.campus_id, "Campus")
            if campus.institution_id != body.institution_id:
                raise ValidationError("That campus belongs to a different institution.")
        await self._ensure_code_free(
            College, _code(body.code), institution_id=body.institution_id, campus_id=body.campus_id
        )
        college = College(
            institution_id=body.institution_id,
            campus_id=body.campus_id,
            name=body.name,
            code=_code(body.code),
        )
        return await self._save(college, what="college")

    async def create_department(self, body: DepartmentCreate) -> Department:
        await self._institution(body.institution_id)
        campus_id = body.campus_id
        if body.college_id:
            college = await self._live(College, body.college_id, "College")
            if college.institution_id != body.institution_id:
                raise ValidationError("That college belongs to a different institution.")
            if campus_id and college.campus_id and college.campus_id != campus_id:
                raise ValidationError(
                    "The department's campus does not match its college's campus."
                )
            campus_id = campus_id or college.campus_id
        if campus_id:
            campus = await self._live(Campus, campus_id, "Campus")
            if campus.institution_id != body.institution_id:
                raise ValidationError("That campus belongs to a different institution.")
        await self._ensure_code_free(
            Department,
            _code(body.code),
            institution_id=body.institution_id,
            campus_id=campus_id,
            college_id=body.college_id,
        )
        department = Department(
            institution_id=body.institution_id,
            campus_id=campus_id,
            college_id=body.college_id,
            name=body.name,
            code=_code(body.code),
        )
        return await self._save(department, what="department")

    async def create_option(self, body: OptionCreate) -> Option:
        await self._live(Department, body.department_id, "Department")
        option = Option(department_id=body.department_id, name=body.name, code=_code(body.code))
        return await self._save(option, what="programme")

    async def create_class_group(self, body: ClassGroupCreate) -> ClassGroup:
        await self._live(Option, body.option_id, "Programme")
        group = ClassGroup(
            option_id=body.option_id, name=body.name, code=_code(body.code), level=body.level
        )
        return await self._save(group, what="year level")

    async def create_section(self, body: ClassSectionCreate) -> ClassSection:
        data = body.model_dump()
        group_id = data.get("class_group_id")
        department_id = data.get("department_id")

        if not group_id and not department_id:
            raise ValidationError("A class must belong to a year level or to a department.")

        if group_id:
            group = await self._live(ClassGroup, group_id, "Year level")
            option = await self._live(Option, group.option_id, "Programme")
            if department_id and option.department_id != department_id:
                raise ValidationError("That year level does not belong to the selected department.")
            # keep the department on the class so it is reachable from either side
            department_id = option.department_id
        else:
            await self._live(Department, department_id, "Department")

        data["department_id"] = department_id
        # same default the model applies, so the duplicate check compares like with like
        academic_year = data.get("academic_year") or str(datetime.now().year)  # noqa: DTZ005

        # Classes directly under a department have no year level, so the database's unique
        # constraint (which includes the year level) cannot catch duplicates: check here.
        if not group_id:
            clash = await self.db.execute(
                select(ClassSection.id).where(
                    ClassSection.department_id == department_id,
                    ClassSection.class_group_id.is_(None),
                    func.lower(ClassSection.name) == data["name"].strip().lower(),
                    ClassSection.is_deleted.is_(False),
                    ClassSection.academic_year == academic_year,
                )
            )
            if clash.first():
                raise AlreadyExistsError(
                    detail=f"A class named '{data['name']}' already exists here."
                )

        section = ClassSection(**data)
        return await self._save(section, what="class")

    # ── update ────────────────────────────────────────────────────────────────

    async def update(
        self, model: type[T], entity_id: uuid.UUID, label: str, changes: dict[str, Any]
    ) -> T:
        """Apply validated, whitelisted changes (the request schema decides which fields exist)."""
        row = await self._live(model, entity_id, label)
        for field, value in changes.items():
            if field == "name" and value is None:
                continue  # a name can be changed but never cleared
            setattr(row, field, value)
        await self.db.commit()
        await self.db.refresh(row)
        logger.info(
            "academic_structure_updated", what=label, id=str(entity_id), fields=sorted(changes)
        )
        return row
