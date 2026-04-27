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
    logo_url: str | None = Field(default=None, max_length=500)


class InstitutionUpdate(MindexaSchema):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    timezone: str | None = Field(default=None, max_length=64)
    logo_url: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class InstitutionResponse(BaseAuditedResponse):
    name: str
    code: str
    timezone: str
    logo_url: str | None
    is_active: bool


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


# ─────────────────────────────────────────────────────────────────────────────
# COURSE
# ─────────────────────────────────────────────────────────────────────────────

class CourseCreate(MindexaSchema):
    institution_id: uuid.UUID
    department_id: uuid.UUID | None = None
    academic_period_id: uuid.UUID
    code: str = Field(min_length=2, max_length=20)
    title: str = Field(min_length=2, max_length=255)
    description: str | None = None
    credit_hours: int | None = Field(default=None, ge=1, le=30)


class CourseUpdate(MindexaSchema):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    credit_hours: int | None = Field(default=None, ge=1, le=30)
    is_active: bool | None = None


class CourseResponse(BaseAuditedResponse):
    institution_id: uuid.UUID
    department_id: uuid.UUID | None
    academic_period_id: uuid.UUID
    code: str
    title: str
    description: str | None
    credit_hours: int | None
    is_active: bool


class CourseSummaryResponse(MindexaSchema):
    """Minimal course info embedded in other responses."""

    id: uuid.UUID
    code: str
    title: str


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


# ─────────────────────────────────────────────────────────────────────────────
# LECTURER ASSIGNMENT
# ─────────────────────────────────────────────────────────────────────────────

class LecturerAssignRequest(MindexaSchema):
    """Request to assign a lecturer to a course."""

    lecturer_id: uuid.UUID
    course_id: uuid.UUID
    assignment_role: LecturerAssignmentRole = LecturerAssignmentRole.PRIMARY


class LecturerCourseAssignmentResponse(BaseAuditedResponse):
    lecturer_id: uuid.UUID
    course_id: uuid.UUID
    assignment_role: str
    assigned_at: datetime
    is_active: bool
