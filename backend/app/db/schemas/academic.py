"""
app/db/schemas/academic.py

Academic structure schemas: institution, department, course, section, enrollment.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import Field, field_validator

from app.db.enums import (AcademicPeriodType, EnrollmentStatus,
                          LecturerAssignmentRole)
from app.db.schemas.base import (BaseAuditedResponse, BaseResponse,
                                 MindexaSchema)

# ─────────────────────────────────────────────────────────────────────────────
# INSTITUTION
# ─────────────────────────────────────────────────────────────────────────────

class InstitutionCreate(MindexaSchema):
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=20)
    timezone: str = Field(default="UTC", max_length=64)
    logo_url: Optional[str] = Field(default=None, max_length=500)


class InstitutionUpdate(MindexaSchema):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    timezone: Optional[str] = Field(default=None, max_length=64)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None


class InstitutionResponse(BaseAuditedResponse):
    name: str
    code: str
    timezone: str
    logo_url: Optional[str]
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
    department_id: Optional[uuid.UUID] = None
    code: str = Field(min_length=2, max_length=20)
    title: str = Field(min_length=2, max_length=255)
    description: Optional[str] = None


class SubjectResponse(BaseAuditedResponse):
    institution_id: uuid.UUID
    department_id: Optional[uuid.UUID]
    code: str
    title: str
    description: Optional[str]
    is_active: bool


# ─────────────────────────────────────────────────────────────────────────────
# COURSE
# ─────────────────────────────────────────────────────────────────────────────

class CourseCreate(MindexaSchema):
    institution_id: uuid.UUID
    department_id: Optional[uuid.UUID] = None
    academic_period_id: uuid.UUID
    code: str = Field(min_length=2, max_length=20)
    title: str = Field(min_length=2, max_length=255)
    description: Optional[str] = None
    credit_hours: Optional[int] = Field(default=None, ge=1, le=30)


class CourseUpdate(MindexaSchema):
    title: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str] = None
    credit_hours: Optional[int] = Field(default=None, ge=1, le=30)
    is_active: Optional[bool] = None


class CourseResponse(BaseAuditedResponse):
    institution_id: uuid.UUID
    department_id: Optional[uuid.UUID]
    academic_period_id: uuid.UUID
    code: str
    title: str
    description: Optional[str]
    credit_hours: Optional[int]
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
    capacity: Optional[int] = Field(default=None, ge=1)
    room: Optional[str] = Field(default=None, max_length=100)
    schedule_notes: Optional[str] = None


class ClassSectionResponse(BaseAuditedResponse):
    course_id: uuid.UUID
    name: str
    capacity: Optional[int]
    room: Optional[str]
    schedule_notes: Optional[str]
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
    withdrawal_reason: Optional[str] = Field(default=None, max_length=500)


class StudentEnrollmentResponse(BaseAuditedResponse):
    student_id: uuid.UUID
    class_section_id: uuid.UUID
    enrollment_status: str
    enrolled_at: datetime
    withdrawn_at: Optional[datetime]
    withdrawal_reason: Optional[str]


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
