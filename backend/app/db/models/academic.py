"""
app/db/models/academic.py

Academic structure models for Mindexa.

Tables defined here:
    institution              — Top-level organisational unit
    department               — Subdivision within an institution
    academic_period          — Semester / trimester / year scope
    subject                  — First-class academic discipline (not free-text)
    course                   — A subject offering within a period
    course_subject           — Junction: course ↔ subject (many-to-many)
    class_section            — A group of students within a course
    lecturer_course_assignment — Junction: lecturer ↔ course with role
    student_enrollment       — Junction: student ↔ class_section

Import order safety:
    This file imports from:
        app.db.base    → BaseModel, AuditedBaseModel, utcnow
        app.db.enums   → AcademicPeriodType, EnrollmentStatus, LecturerAssignmentRole
        app.db.mixins  → fk_uuid, optional_fk_uuid, composite_index,
                         unique_composite_index, short_text, long_text,
                         bool_field, positive_int

    This file does NOT import from:
        app.db.models.auth        → User referenced via TYPE_CHECKING only
        app.db.models.assessment  → Not needed here; assessment imports academic

Cascade rules:
    ondelete="RESTRICT" is the default on all FKs (via fk_uuid).
    CASCADE is only applied where child records have zero independent meaning:
        - department rows are meaningless without their institution
        - course rows are meaningless without their period and department
    Student and lecturer records (user rows) are NEVER cascade-deleted from
    junction tables — academic records must survive user soft-deletion.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

from app.db.base import AuditedBaseModel, BaseModel, utcnow
from app.db.enums import (AcademicPeriodType, EnrollmentStatus,
                          LecturerAssignmentRole)
from app.db.mixins import (bool_field, composite_index, fk_uuid, long_text,
                           optional_fk_uuid, positive_int, short_text,
                           unique_composite_index)
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship

if TYPE_CHECKING:
    from app.db.models.assessment import Assessment
    from app.db.models.auth import User


# ─────────────────────────────────────────────────────────────────────────────
# INSTITUTION
# ─────────────────────────────────────────────────────────────────────────────

class Institution(BaseModel, table=True):
    """
    Top-level organisational unit.

    All academic entities (departments, courses, subjects, periods) are
    scoped to an institution. Supports future multi-tenant deployments
    without schema changes.

    is_active:
        Inactive institutions are hidden from all UI. Their data is preserved.
    """

    __tablename__ = "institution"

    __table_args__ = (
        UniqueConstraint("code", name="uq_institution_code"),
        composite_index("institution", "is_active"),
    )

    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20, index=True)
    logo_url: Optional[str] = Field(default=None, nullable=True, max_length=500)
    timezone: str = Field(default="UTC", nullable=False, max_length=64)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    departments: List["Department"] = Relationship(back_populates="institution")
    academic_periods: List["AcademicPeriod"] = Relationship(back_populates="institution")
    subjects: List["Subject"] = Relationship(back_populates="institution")
    courses: List["Course"] = Relationship(back_populates="institution")


# ─────────────────────────────────────────────────────────────────────────────
# DEPARTMENT
# ─────────────────────────────────────────────────────────────────────────────

class Department(BaseModel, table=True):
    """
    Organisational subdivision within an institution.

    head_lecturer_id:
        Optional UUID reference to a User with role=lecturer.
        Stored as a plain UUID (not a declared FK) to avoid a circular
        dependency between this file and auth.py at the SQLAlchemy level.
        The service layer validates that this UUID belongs to a real lecturer.
    """

    __tablename__ = "department"

    __table_args__ = (
        UniqueConstraint(
            "institution_id", "code",
            name="uq_department_institution_code",
        ),
        composite_index("department", "institution_id", "is_active"),
    )

    institution_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="institution.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)

    # Plain UUID — not a declared FK; validated at service layer
    head_lecturer_id: Optional[uuid.UUID] = Field(default=None, nullable=True)

    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="departments")
    courses: List["Course"] = Relationship(back_populates="department")
    subjects: List["Subject"] = Relationship(back_populates="department")


# ─────────────────────────────────────────────────────────────────────────────
# ACADEMIC PERIOD
# ─────────────────────────────────────────────────────────────────────────────

class AcademicPeriod(BaseModel, table=True):
    """
    A time-bounded academic period (semester, trimester, quarter, year).

    All courses and assessments are implicitly scoped to a period through
    their course FK.

    is_active:
        Only one period should be active per institution at a time.
        This is enforced at the service layer, not by a DB unique constraint,
        because the transition between periods requires both to briefly coexist.

    start_date / end_date:
        Used by the scheduler to auto-close assessments whose windows
        exceed the period's end date.
    """

    __tablename__ = "academic_period"

    __table_args__ = (
        composite_index("academic_period", "institution_id", "is_active"),
        composite_index("academic_period", "institution_id", "period_type"),
    )

    institution_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="institution.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    name: str = Field(nullable=False, max_length=255)
    period_type: AcademicPeriodType = Field(nullable=False)
    start_date: date = Field(nullable=False)
    end_date: date = Field(nullable=False)
    is_active: bool = Field(default=False, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(
        back_populates="academic_periods"
    )
    courses: List["Course"] = Relationship(back_populates="academic_period")


# ─────────────────────────────────────────────────────────────────────────────
# SUBJECT
# ─────────────────────────────────────────────────────────────────────────────

class Subject(BaseModel, table=True):
    """
    A named academic discipline — first-class relational entity.

    Subjects are NOT free text. The lecturer selects a subject from
    a dropdown in the assessment builder. That dropdown is populated
    by querying subjects linked to the lecturer's assigned courses
    via course_subject.

    Scope: per institution. A subject named "Database Systems" at
    Institution A is a different row from one at Institution B.

    department_id is nullable — some subjects span departments or are
    administered centrally at the institution level.
    """

    __tablename__ = "subject"

    __table_args__ = (
        UniqueConstraint(
            "institution_id", "code",
            name="uq_subject_institution_code",
        ),
        composite_index("subject", "institution_id", "is_active"),
        composite_index("subject", "institution_id", "department_id"),
    )

    institution_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="institution.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    department_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        foreign_key="department.id",
        index=True,
        sa_column_kwargs={"ondelete": "SET NULL"},
    )
    code: str = Field(nullable=False, max_length=20)
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
    """
    An academic course offering within a specific period.

    A course is the container for:
        - class sections (groups of students)
        - lecturer assignments
        - assessments
        - subject associations

    The same physical course (e.g. "CS301 Database Systems") recurs each
    semester as a new row — linked to a new academic_period_id. Historical
    course data is preserved for academic record integrity.

    code uniqueness is scoped to (institution_id, academic_period_id) —
    the same course code can exist across different periods.
    """

    __tablename__ = "course"

    __table_args__ = (
        UniqueConstraint(
            "institution_id", "code", "academic_period_id",
            name="uq_course_institution_code_period",
        ),
        composite_index("course", "department_id", "is_active"),
        composite_index("course", "academic_period_id", "is_active"),
        composite_index("course", "institution_id", "is_active"),
    )

    institution_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="institution.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    department_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        foreign_key="department.id",
        index=True,
        sa_column_kwargs={"ondelete": "SET NULL"},
    )
    academic_period_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="academic_period.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    code: str = Field(nullable=False, max_length=20)
    title: str = Field(nullable=False, max_length=255)
    description: Optional[str] = Field(default=None, nullable=True)
    credit_hours: Optional[int] = Field(default=None, nullable=True)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="courses")
    department: Optional["Department"] = Relationship(back_populates="courses")
    academic_period: Optional["AcademicPeriod"] = Relationship(
        back_populates="courses"
    )
    class_sections: List["ClassSection"] = Relationship(back_populates="course")
    course_subjects: List["CourseSubject"] = Relationship(back_populates="course")
    lecturer_assignments: List["LecturerCourseAssignment"] = Relationship(
        back_populates="course"
    )
    assessments: List["Assessment"] = Relationship(back_populates="course")


# ─────────────────────────────────────────────────────────────────────────────
# COURSE SUBJECT (junction)
# ─────────────────────────────────────────────────────────────────────────────

class CourseSubject(BaseModel, table=True):
    """
    Junction table: Course ↔ Subject (many-to-many).

    A course can cover multiple subjects. A subject can appear in
    multiple courses across different periods.

    is_primary:
        Exactly one subject per course should be flagged as primary.
        The assessment builder uses the primary subject as the default
        subject selection when a lecturer starts a new assessment.
        Enforced as a service-layer rule (not a partial unique constraint)
        to keep the migration simple.
    """

    __tablename__ = "course_subject"

    __table_args__ = (
        UniqueConstraint(
            "course_id", "subject_id",
            name="uq_course_subject_course_subject",
        ),
        composite_index("course_subject", "course_id"),
        composite_index("course_subject", "subject_id"),
    )

    course_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="course.id",
        index=True,
        sa_column_kwargs={"ondelete": "CASCADE"},
    )
    subject_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="subject.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    is_primary: bool = Field(default=False, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    course: Optional["Course"] = Relationship(back_populates="course_subjects")
    subject: Optional["Subject"] = Relationship(back_populates="course_subjects")


# ─────────────────────────────────────────────────────────────────────────────
# CLASS SECTION
# ─────────────────────────────────────────────────────────────────────────────

class ClassSection(BaseModel, table=True):
    """
    A specific group of students within a course offering.

    Examples: "Section A", "Group 1", "Morning Cohort".

    A lecturer's assessment target dropdown is populated by querying
    class_sections linked to the lecturer's assigned courses.

    capacity:
        Maximum number of students for this section. Enrollment is
        blocked at the service layer when capacity is reached.
        NULL means unlimited.

    room / schedule_notes:
        Informational only — not used for any business logic.
    """

    __tablename__ = "class_section"

    __table_args__ = (
        UniqueConstraint(
            "course_id", "name",
            name="uq_class_section_course_name",
        ),
        composite_index("class_section", "course_id", "is_active"),
    )

    course_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="course.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    name: str = Field(nullable=False, max_length=100)
    capacity: Optional[int] = Field(default=None, nullable=True)
    room: Optional[str] = Field(default=None, nullable=True, max_length=100)
    schedule_notes: Optional[str] = Field(default=None, nullable=True)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    course: Optional["Course"] = Relationship(back_populates="class_sections")
    enrollments: List["StudentEnrollment"] = Relationship(
        back_populates="class_section"
    )
    assessment_targets: List["AssessmentTargetSection"] = Relationship(
        back_populates="class_section"
    )


# ─────────────────────────────────────────────────────────────────────────────
# LECTURER COURSE ASSIGNMENT
# ─────────────────────────────────────────────────────────────────────────────

class LecturerCourseAssignment(AuditedBaseModel, table=True):
    """
    Junction table: Lecturer ↔ Course with a defined role.

    Inherits AuditedBaseModel because:
        - Knowing who assigned a lecturer to a course is a compliance requirement.
        - An admin assigns lecturers; created_by_id records which admin did it.

    assignment_role:
        PRIMARY   — The course owner. There should be exactly one per course,
                    enforced at the service layer.
        ASSISTANT — Teaching assistant; can supervise assessments but not
                    publish them.
        SUPERVISOR — Can only supervise active assessment sessions.

    Unique constraint: a lecturer cannot be assigned the same role twice
    on the same course. They CAN hold multiple roles (e.g. PRIMARY on
    CS301 and ASSISTANT on CS201).

    is_active:
        Inactive assignments are hidden from all workflow queries.
        The lecturer can no longer create or supervise assessments for
        this course once their assignment is deactivated.
    """

    __tablename__ = "lecturer_course_assignment"

    __table_args__ = (
        UniqueConstraint(
            "lecturer_id", "course_id", "assignment_role",
            name="uq_lecturer_course_assignment_lecturer_course_role",
        ),
        composite_index("lecturer_course_assignment", "lecturer_id", "is_active"),
        composite_index("lecturer_course_assignment", "course_id", "is_active"),
        composite_index(
            "lecturer_course_assignment", "lecturer_id", "course_id"
        ),
    )

    lecturer_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    course_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="course.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    assignment_role: LecturerAssignmentRole = Field(nullable=False)
    assigned_at: datetime = Field(default_factory=utcnow, nullable=False)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    course: Optional["Course"] = Relationship(back_populates="lecturer_assignments")

    # Lecturer user accessed via plain UUID (lecturer_id) to avoid circular
    # import with auth.py. Resolved at the service layer when needed.


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT ENROLLMENT
# ─────────────────────────────────────────────────────────────────────────────

class StudentEnrollment(AuditedBaseModel, table=True):
    """
    Junction table: Student ↔ ClassSection.

    Inherits AuditedBaseModel because:
        - An admin or lecturer enrolls a student; created_by_id records who.
        - Changes to enrollment status (withdrawal, deferral) must be traceable.

    enrollment_status:
        ACTIVE      — Student is currently enrolled and can take assessments.
        WITHDRAWN   — Student withdrew; they can no longer take new assessments
                      but their existing grades are preserved.
        COMPLETED   — Student completed the course.
        DEFERRED    — Student has deferred; treated like withdrawn for assessment
                      access but flagged differently in academic reports.

    Unique constraint: a student cannot be enrolled twice in the same section.
    They CAN be enrolled in multiple sections of different courses simultaneously.

    withdrawn_at / withdrawal_reason:
        Only populated when status transitions to WITHDRAWN or DEFERRED.
    """

    __tablename__ = "student_enrollment"

    __table_args__ = (
        UniqueConstraint(
            "student_id", "class_section_id",
            name="uq_student_enrollment_student_section",
        ),
        composite_index("student_enrollment", "student_id", "enrollment_status"),
        composite_index("student_enrollment", "class_section_id", "enrollment_status"),
    )

    student_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    class_section_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="class_section.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )
    enrollment_status: EnrollmentStatus = Field(
        default=EnrollmentStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    enrolled_at: datetime = Field(default_factory=utcnow, nullable=False)
    withdrawn_at: Optional[datetime] = Field(default=None, nullable=True)
    withdrawal_reason: Optional[str] = Field(default=None, nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    class_section: Optional["ClassSection"] = Relationship(
        back_populates="enrollments"
    )
