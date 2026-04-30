"""
app/db/models/academic.py

Academic structure models for Mindexa.
Strictly SQLModel-based ORM pattern.
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import Field, Relationship

from app.db.base import AuditedBaseModel, BaseModel, utcnow
from app.db.enums import AcademicPeriodType, EnrollmentStatus, LecturerAssignmentRole
from app.db.mixins import composite_index

if TYPE_CHECKING:
    from app.db.models.assessment import Assessment, AssessmentTargetSection


# ─────────────────────────────────────────────────────────────────────────────
# INSTITUTION
# ─────────────────────────────────────────────────────────────────────────────


class Institution(BaseModel, table=True):
    """Top-level organisational unit."""

    __tablename__ = "institution"
    __table_args__ = (
        UniqueConstraint("code", name="uq_institution_code"),
        composite_index("institution", "is_active"),
    )

    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)
    logo_url: Optional[str] = Field(default=None, nullable=True, max_length=500)
    timezone: str = Field(default="UTC", nullable=False, max_length=64)
    is_active: bool = Field(default=True, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    departments: List["Department"] = Relationship(back_populates="institution")
    academic_periods: List["AcademicPeriod"] = Relationship(back_populates="institution")
    subjects: List["Subject"] = Relationship(back_populates="institution")
    courses: List["Course"] = Relationship(back_populates="institution")


# ─────────────────────────────────────────────────────────────────────────────
# DEPARTMENT
# ─────────────────────────────────────────────────────────────────────────────


class Department(BaseModel, table=True):
    """Organisational subdivision within an institution."""

    __tablename__ = "department"
    __table_args__ = (
        UniqueConstraint("institution_id", "code", name="uq_department_inst_code"),
        composite_index("department", "institution_id"),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)
    head_lecturer_id: Optional[uuid.UUID] = Field(default=None, nullable=True)
    is_active: bool = Field(default=True, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="departments")
    courses: List["Course"] = Relationship(back_populates="department")
    subjects: List["Subject"] = Relationship(back_populates="department")


# ─────────────────────────────────────────────────────────────────────────────
# ACADEMIC PERIOD
# ─────────────────────────────────────────────────────────────────────────────


class AcademicPeriod(BaseModel, table=True):
    """Semester / trimester / year scope."""

    __tablename__ = "academic_period"
    __table_args__ = (
        UniqueConstraint("institution_id", "name", name="uq_academic_period_inst_name"),
        composite_index("academic_period", "institution_id"),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    name: str = Field(nullable=False, max_length=255)
    period_type: AcademicPeriodType = Field(nullable=False)
    start_date: date = Field(nullable=False)
    end_date: date = Field(nullable=False)
    is_active: bool = Field(default=False, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="academic_periods")
    courses: List["Course"] = Relationship(back_populates="academic_period")


# ─────────────────────────────────────────────────────────────────────────────
# SUBJECT
# ─────────────────────────────────────────────────────────────────────────────


class Subject(BaseModel, table=True):
    """A named academic discipline."""

    __tablename__ = "subject"
    __table_args__ = (
        UniqueConstraint("institution_id", "title", name="uq_subject_inst_title"),
        composite_index("subject", "institution_id"),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    department_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("department.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )
    title: str = Field(nullable=False, max_length=255, index=True)
    description: Optional[str] = Field(default=None, nullable=True)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="subjects")
    department: Optional["Department"] = Relationship(back_populates="subjects")
    course_subjects: List["CourseSubject"] = Relationship(back_populates="subject")


# ─────────────────────────────────────────────────────────────────────────────
# COURSE
# ─────────────────────────────────────────────────────────────────────────────


class Course(BaseModel, table=True):
    """A subject offering within a specific period."""

    __tablename__ = "course"
    __table_args__ = (
        UniqueConstraint(
            "institution_id", "code", "academic_period_id", name="uq_course_inst_code_period"
        ),
        composite_index("course", "institution_id"),
        composite_index("course", "academic_period_id"),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    department_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("department.id", ondelete="RESTRICT"),
            nullable=True,
            index=True,
        )
    )
    academic_period_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_period.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)
    description: Optional[str] = Field(default=None, nullable=True)
    credit_hours: Optional[int] = Field(default=None, nullable=True)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="courses")
    department: Optional["Department"] = Relationship(back_populates="courses")
    academic_period: Optional["AcademicPeriod"] = Relationship(back_populates="courses")
    class_sections: List["ClassSection"] = Relationship(back_populates="course")
    course_subjects: List["CourseSubject"] = Relationship(back_populates="course")
    lecturer_assignments: List["LecturerCourseAssignment"] = Relationship(back_populates="course")
    assessments: List["Assessment"] = Relationship(back_populates="course")


# ─────────────────────────────────────────────────────────────────────────────
# COURSE SUBJECT (junction)
# ─────────────────────────────────────────────────────────────────────────────


class CourseSubject(BaseModel, table=True):
    """Junction table: Course ↔ Subject."""

    __tablename__ = "course_subject"
    __table_args__ = (
        UniqueConstraint("course_id", "subject_id", name="uq_course_subject_course_subject"),
        composite_index("course_subject", "course_id"),
        composite_index("course_subject", "subject_id"),
    )

    course_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    subject_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("subject.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    is_primary: bool = Field(default=False, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    course: Optional["Course"] = Relationship(back_populates="course_subjects")
    subject: Optional["Subject"] = Relationship(back_populates="course_subjects")


# ─────────────────────────────────────────────────────────────────────────────
# CLASS SECTION
# ─────────────────────────────────────────────────────────────────────────────


class ClassSection(BaseModel, table=True):
    """A specific group of students within a course offering."""

    __tablename__ = "class_section"
    __table_args__ = (
        UniqueConstraint("course_id", "name", name="uq_class_section_course_name"),
        composite_index("class_section", "course_id", "is_active"),
    )

    course_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    name: str = Field(nullable=False, max_length=100)
    capacity: Optional[int] = Field(default=None, nullable=True)
    room: Optional[str] = Field(default=None, nullable=True, max_length=100)
    schedule_notes: Optional[str] = Field(default=None, nullable=True)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    course: Optional["Course"] = Relationship(back_populates="class_sections")
    enrollments: List["StudentEnrollment"] = Relationship(back_populates="class_section")
    assessment_targets: List["AssessmentTargetSection"] = Relationship(back_populates="class_section")


# ─────────────────────────────────────────────────────────────────────────────
# LECTURER COURSE ASSIGNMENT
# ─────────────────────────────────────────────────────────────────────────────


class LecturerCourseAssignment(AuditedBaseModel, table=True):
    """Junction table: Lecturer ↔ Course with a defined role."""

    __tablename__ = "lecturer_course_assignment"
    __table_args__ = (
        UniqueConstraint(
            "lecturer_id", "course_id", "assignment_role", name="uq_lecturer_course_role"
        ),
        composite_index("lecturer_course_assignment", "lecturer_id", "is_active"),
        composite_index("lecturer_course_assignment", "course_id", "is_active"),
    )

    lecturer_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    course_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    assignment_role: LecturerAssignmentRole = Field(nullable=False)
    assigned_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_type=DateTime(timezone=True),
    )
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    course: Optional["Course"] = Relationship(back_populates="lecturer_assignments")


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT ENROLLMENT
# ─────────────────────────────────────────────────────────────────────────────


class StudentEnrollment(AuditedBaseModel, table=True):
    """Junction table: Student ↔ ClassSection."""

    __tablename__ = "student_enrollment"
    __table_args__ = (
        UniqueConstraint(
            "student_id", "class_section_id", name="uq_student_enrollment_student_section"
        ),
        composite_index("student_enrollment", "student_id", "enrollment_status"),
        composite_index("student_enrollment", "class_section_id", "enrollment_status"),
    )

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    class_section_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("class_section.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    enrollment_status: EnrollmentStatus = Field(
        default=EnrollmentStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    enrolled_at: datetime = Field(
        default_factory=utcnow,
        nullable=False,
        sa_type=DateTime(timezone=True),
    )
    withdrawn_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    withdrawal_reason: Optional[str] = Field(default=None, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    class_section: Optional["ClassSection"] = Relationship(back_populates="enrollments")
