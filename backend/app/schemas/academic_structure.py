"""
app/schemas/academic_structure.py

Admin view of an institution's academic structure.

The structure is returned as flat lists (one per level) in a single response, parents
referenced by id, so the client can draw any shape of organisation (with or without
campuses, colleges, programmes or year levels) without one request per node.
"""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.db.enums import AcademicPeriodType, LocationType
from app.db.schemas.base import MindexaSchema


def _clean_code(value: str) -> str:
    return value.strip().upper()


class StructureInstitution(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    timezone: str
    is_active: bool
    settings: dict | None = None


class StructureCampus(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    is_active: bool


class StructureCollege(BaseModel):
    id: uuid.UUID
    campus_id: uuid.UUID | None = None
    name: str
    code: str
    is_active: bool


class StructureDepartment(BaseModel):
    id: uuid.UUID
    campus_id: uuid.UUID | None = None
    college_id: uuid.UUID | None = None
    name: str
    code: str
    is_active: bool
    course_count: int = 0


class StructureProgram(BaseModel):
    id: uuid.UUID
    department_id: uuid.UUID
    name: str
    code: str
    is_active: bool


class StructureLevel(BaseModel):
    id: uuid.UUID
    option_id: uuid.UUID
    name: str
    code: str
    level: int | None = None
    is_active: bool


class StructureClass(BaseModel):
    id: uuid.UUID
    class_group_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    name: str
    academic_year: str | None = None
    capacity: int | None = None
    location_type: str | None = None
    room: str | None = None
    is_active: bool
    student_count: int = 0


class AcademicStructureResponse(BaseModel):
    institution: StructureInstitution
    campuses: list[StructureCampus]
    colleges: list[StructureCollege]
    departments: list[StructureDepartment]
    programs: list[StructureProgram]
    levels: list[StructureLevel]
    classes: list[StructureClass]


class InstitutionOverviewItem(BaseModel):
    """Per-institution counts for the institutions registry."""

    institution_id: uuid.UUID
    campuses: int = 0
    colleges: int = 0
    departments: int = 0
    programs: int = 0
    classes: int = 0
    students: int = 0
    courses: int = 0


# ── Validated updates (replace the previous raw-dict PATCH bodies) ────────────
# `code` is deliberately not editable: it is the stable identifier other systems refer to.


class _NamedUpdate(MindexaSchema):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    is_active: bool | None = None


class CampusUpdate(_NamedUpdate):
    pass


class CollegeUpdate(_NamedUpdate):
    pass


class DepartmentUpdate(_NamedUpdate):
    pass


class OptionUpdate(_NamedUpdate):
    pass


class ClassGroupUpdate(_NamedUpdate):
    level: int | None = Field(default=None, ge=0, le=99)


class ClassSectionUpdate(MindexaSchema):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None
    capacity: int | None = Field(default=None, ge=0, le=100000)
    room: str | None = Field(default=None, max_length=100)
    location_type: LocationType | None = None
    schedule_notes: str | None = Field(default=None, max_length=2000)

    @field_validator("room", "schedule_notes")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        return value or None


# ── Academic periods ──────────────────────────────────────────────────────────


class AcademicPeriodUpdate(MindexaSchema):
    """Every field optional; the service re-checks the dates and names against the stored row."""

    name: str | None = Field(default=None, min_length=2, max_length=255)
    period_type: AcademicPeriodType | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None


class AcademicPeriodItem(BaseModel):
    """A period with how much of the system already depends on it."""

    id: uuid.UUID
    institution_id: uuid.UUID
    name: str
    period_type: str
    start_date: date
    end_date: date
    is_active: bool
    course_count: int = 0
    assignment_count: int = 0
