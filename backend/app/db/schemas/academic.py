"""
app/db/schemas/academic.py

Academic structure schemas: institution, department, course, section, enrollment.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import Field, field_validator

from app.db.enums import AcademicPeriodType, EnrollmentStatus, LecturerAssignmentRole
from app.db.schemas.base import BaseAuditedResponse, MindexaSchema

# ─────────────────────────────────────────────────────────────────────────────
# INSTITUTION
# ─────────────────────────────────────────────────────────────────────────────

class InstitutionCreate(MindexaSchema):
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=20)
    timezone: str = Field(default="UTC", max_length=64)
    logo_url: str | None = Field(default=None)
    settings: dict | None = None
    integrations: dict | None = None


class InstitutionUpdate(MindexaSchema):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    timezone: str | None = Field(default=None, max_length=64)
    logo_url: str | None = Field(default=None)
    is_active: bool | None = None
    settings: dict | None = None
    integrations: dict | None = None


class InstitutionResponse(BaseAuditedResponse):
    name: str
    code: str
    timezone: str
    logo_url: str | None
    is_active: bool
    settings: dict | None
    integrations: dict | None

InstitutionResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# ACADEMIC PERIOD
# ─────────────────────────────────────────────────────────────────────────────

class AcademicPeriodCreate(MindexaSchema):
    institution_id: uuid.UUID
    name: str = Field(min_length=2, max_length=255)
    period_type: AcademicPeriodType
    start_date: date
    end_date: date

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v: date, info: object) -> date:
        data = getattr(info, "data", {})
        start = data.get("start_date")
        if start and v <= start:
            raise ValueError("end_date must be after start_date.")
        return v


class AcademicPeriodResponse(BaseAuditedResponse):
    institution_id: uuid.UUID
    name: str
    period_type: str
    start_date: date
    end_date: date
    is_active: bool

AcademicPeriodResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# SUBJECT
# ─────────────────────────────────────────────────────────────────────────────

class SubjectCreate(MindexaSchema):
    institution_id: uuid.UUID
    department_id: uuid.UUID | None = None
    code: str = Field(min_length=2, max_length=20)
    title: str = Field(min_length=2, max_length=255)
    description: str | None = None


class SubjectResponse(BaseAuditedResponse):
    institution_id: uuid.UUID
    department_id: uuid.UUID | None
    code: str
    title: str
    description: str | None
    is_active: bool

SubjectResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# CAMPUS
# ─────────────────────────────────────────────────────────────────────────────

class CampusCreate(MindexaSchema):
    institution_id: uuid.UUID
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=20)


class CampusResponse(BaseAuditedResponse):
    institution_id: uuid.UUID
    name: str
    code: str
    is_active: bool

CampusResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# COLLEGE
# ─────────────────────────────────────────────────────────────────────────────

class CollegeCreate(MindexaSchema):
    campus_id: uuid.UUID
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=20)


class CollegeResponse(BaseAuditedResponse):
    campus_id: uuid.UUID
    name: str
    code: str
    is_active: bool

CollegeResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# DEPARTMENT
# ─────────────────────────────────────────────────────────────────────────────

class DepartmentCreate(MindexaSchema):
    institution_id: uuid.UUID
    campus_id: uuid.UUID | None = None
    college_id: uuid.UUID | None = None
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=20)


class DepartmentResponse(BaseAuditedResponse):
    institution_id: uuid.UUID
    campus_id: uuid.UUID | None = None
    college_id: uuid.UUID | None = None
    name: str
    code: str
    is_active: bool

DepartmentResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# OPTION
# ─────────────────────────────────────────────────────────────────────────────

class OptionCreate(MindexaSchema):
    department_id: uuid.UUID
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=20)


class OptionResponse(BaseAuditedResponse):
    department_id: uuid.UUID
    name: str
    code: str
    is_active: bool

OptionResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# CLASS GROUP
# ─────────────────────────────────────────────────────────────────────────────

class ClassGroupCreate(MindexaSchema):
    option_id: uuid.UUID
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=20)
    level: int | None = None


class ClassGroupResponse(BaseAuditedResponse):
    option_id: uuid.UUID
    name: str
    code: str
    level: int | None
    is_active: bool

ClassGroupResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# COURSE
# ─────────────────────────────────────────────────────────────────────────────

class CourseCreate(MindexaSchema):
    institution_id: uuid.UUID
    department_ids: list[uuid.UUID] | None = Field(default=None, description="Departments offering this course")
    option_ids: list[uuid.UUID] | None = Field(default=None, description="Options this course is offered to")
    class_group_ids: list[uuid.UUID] | None = Field(default=None, description="Classes this course is offered to")
    academic_period_id: uuid.UUID | None = None
    academic_year: str = Field(min_length=9, max_length=20)
    code: str = Field(min_length=2, max_length=20)
    title: str = Field(min_length=2, max_length=255)
    description: str | None = None
    credit_hours: int | None = Field(default=None, ge=1, le=30)

CourseCreate.model_rebuild()


class CourseUpdate(MindexaSchema):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    credit_hours: int | None = Field(default=None, ge=1, le=30)
    is_active: bool | None = None
    department_ids: list[uuid.UUID] | None = None
    option_ids: list[uuid.UUID] | None = None
    class_group_ids: list[uuid.UUID] | None = None

CourseUpdate.model_rebuild()


class CourseResponse(BaseAuditedResponse):
    institution_id: uuid.UUID
    academic_period_id: uuid.UUID | None = None
    academic_year: str
    code: str
    title: str = Field(validation_alias="name")
    description: str | None
    credit_hours: int | None
    is_active: bool
    department_ids: list[uuid.UUID] = []
    option_ids: list[uuid.UUID] = []
    class_group_ids: list[uuid.UUID] = []

CourseResponse.model_rebuild()


class CourseSummaryResponse(MindexaSchema):
    """Minimal course info embedded in other responses."""

    id: uuid.UUID
    code: str
    title: str = Field(validation_alias="name")

CourseSummaryResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# CLASS SECTION
# ─────────────────────────────────────────────────────────────────────────────

class ClassSectionCreate(MindexaSchema):
    course_id: uuid.UUID
    name: str = Field(min_length=1, max_length=100)
    capacity: int | None = Field(default=None, ge=1)
    room: str | None = Field(default=None, max_length=100)
    schedule_notes: str | None = None


class ClassSectionResponse(BaseAuditedResponse):
    course_id: uuid.UUID
    name: str
    capacity: int | None
    room: str | None
    schedule_notes: str | None
    is_active: bool

ClassSectionResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# ENROLLMENT
# ─────────────────────────────────────────────────────────────────────────────

class StudentEnrollRequest(MindexaSchema):
    """Request body to enroll one student into a class section."""

    student_id: uuid.UUID
    class_section_id: uuid.UUID


class EnrollmentStatusUpdate(MindexaSchema):
    """Request to change an enrollment's status (withdraw, defer, etc.)."""

    enrollment_status: EnrollmentStatus
    withdrawal_reason: str | None = Field(default=None, max_length=500)


class StudentEnrollmentResponse(BaseAuditedResponse):
    student_id: uuid.UUID
    class_section_id: uuid.UUID
    enrollment_status: str
    enrolled_at: datetime
    withdrawn_at: datetime | None
    withdrawal_reason: str | None

StudentEnrollmentResponse.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# LECTURER ASSIGNMENT
# ─────────────────────────────────────────────────────────────────────────────

class LecturerAssignRequest(MindexaSchema):
    """Request to assign a lecturer to a course."""

    lecturer_id: uuid.UUID
    course_id: uuid.UUID
    assignment_role: LecturerAssignmentRole = LecturerAssignmentRole.MAIN_LECTURER


class LecturerCourseAssignmentResponse(BaseAuditedResponse):
    lecturer_id: uuid.UUID
    course_id: uuid.UUID
    assignment_role: str
    assigned_at: datetime
    is_active: bool

LecturerCourseAssignmentResponse.model_rebuild()
