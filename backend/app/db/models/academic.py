"""
app/db/models/academic.py

Academic structure models for Mindexa.
Strictly SQLModel-based ORM pattern.
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlmodel import Field, Relationship

from app.db.base import AuditedBaseModel, BaseModel, utcnow
from app.db.enums import AcademicPeriodType, EnrollmentStatus, LecturerAssignmentRole
from app.db.mixins import composite_index

if TYPE_CHECKING:
    from app.db.models.assessment import Assessment, AssessmentTargetSection
    from app.db.models.auth import User


# ─────────────────────────────────────────────────────────────────────────────
# TEACHING ASSIGNMENT
# ─────────────────────────────────────────────────────────────────────────────


class TeachingAssignment(BaseModel, table=True):
    """Official teaching assignment linking a lecturer to academic context."""

    __tablename__ = "teaching_assignment"

    lecturer_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    campus_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("campus.id", ondelete="SET NULL"),
            nullable=True,
        )
    )
    college_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("college.id", ondelete="SET NULL"),
            nullable=True,
        )
    )
    department_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("department.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    option_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("option.id", ondelete="SET NULL"),
            nullable=True,
        )
    )
    course_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="CASCADE"),
            nullable=True,
        )
    )
    class_section_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("class_section.id", ondelete="SET NULL"),
            nullable=True,
        )
    )

    academic_period_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_period.id", ondelete="CASCADE"),
            nullable=True,
        )
    )
    academic_year: str = Field(nullable=False, max_length=20)

    role: LecturerAssignmentRole = Field(
        default=LecturerAssignmentRole.MAIN_LECTURER,
        sa_column=Column(String, nullable=False)
    )
    is_active: bool = Field(default=True, nullable=False)

    # ── External Integration ──────────────────────────────────────────────────
    external_id: Optional[str] = Field(default=None, max_length=100, index=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    lecturer: Optional["User"] = Relationship()
    institution: Optional["Institution"] = Relationship()
    campus: Optional["Campus"] = Relationship()
    college: Optional["College"] = Relationship()
    department: Optional["Department"] = Relationship()
    option: Optional["Option"] = Relationship()
    course: Optional["Course"] = Relationship()
    class_section: Optional["ClassSection"] = Relationship()
    academic_period: Optional["AcademicPeriod"] = Relationship()

    workspaces: List["TeachingWorkspace"] = Relationship(back_populates="teaching_assignment")


# ─────────────────────────────────────────────────────────────────────────────
# TEACHING WORKSPACE
# ─────────────────────────────────────────────────────────────────────────────


class TeachingWorkspace(AuditedBaseModel, table=True):
    """
    The operational teaching environment.
    Isolated container where actual teaching happens (materials, assessments).
    Generated automatically or manually based on an official TeachingAssignment.
    """

    __tablename__ = "teaching_workspace"

    # -- Links to Official Structure --
    teaching_assignment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("teaching_assignment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    course_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    class_section_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("class_section.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    academic_period_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_period.id", ondelete="CASCADE"),
            nullable=False,
        )
    )

    # -- Customisation --
    title: str = Field(nullable=False, max_length=255)
    description: Optional[str] = Field(default=None)
    
    # Allows a lecturer to hide/archive a specific section workspace
    status: str = Field(default="ACTIVE", max_length=20) 

    # -- Relationships --
    teaching_assignment: "TeachingAssignment" = Relationship(back_populates="workspaces")
    course: "Course" = Relationship(back_populates="workspaces")
    class_section: "ClassSection" = Relationship(back_populates="workspaces")
    academic_period: "AcademicPeriod" = Relationship()

    # Link operational content
    assessments: List["Assessment"] = Relationship(back_populates="workspace")
    materials: List["LecturerMaterial"] = Relationship(back_populates="workspace")


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
    logo_url: Optional[str] = Field(default=None, nullable=True)
    timezone: str = Field(default="UTC", nullable=False, max_length=64)
    is_active: bool = Field(default=True, nullable=False)

    # ── Branding & Configuration ──────────────────────────────────────────────
    settings: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=True))
    integrations: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=True))

    # ── External Integration ──────────────────────────────────────────────────
    external_id: Optional[str] = Field(default=None, max_length=100, index=True)
    source_system: Optional[str] = Field(default=None, max_length=50)

    # ── Relationships ─────────────────────────────────────────────────────────
    campuses: List["Campus"] = Relationship(back_populates="institution")
    departments: List["Department"] = Relationship(back_populates="institution")
    academic_periods: List["AcademicPeriod"] = Relationship(back_populates="institution")
    subjects: List["Subject"] = Relationship(
        back_populates="institution",
        sa_relationship_kwargs={"primaryjoin": "Institution.id == Subject.institution_id"}
    )
    courses: List["Course"] = Relationship(
        back_populates="institution",
        sa_relationship_kwargs={"primaryjoin": "Institution.id == Course.institution_id"}
    )


# ─────────────────────────────────────────────────────────────────────────────
# CAMPUS
# ─────────────────────────────────────────────────────────────────────────────


class Campus(BaseModel, table=True):
    """Geographic or organisational campus within an institution."""

    __tablename__ = "campus"
    __table_args__ = (
        UniqueConstraint("institution_id", "code", name="uq_campus_inst_code"),
        composite_index("campus", "institution_id"),
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
    is_active: bool = Field(default=True, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="campuses")
    colleges: List["College"] = Relationship(back_populates="campus")
    departments: List["Department"] = Relationship(back_populates="campus")


# ─────────────────────────────────────────────────────────────────────────────
# COLLEGE
# ─────────────────────────────────────────────────────────────────────────────


class College(BaseModel, table=True):
    """A college or faculty within a campus or institution."""

    __tablename__ = "college"
    __table_args__ = (
        UniqueConstraint("campus_id", "code", name="uq_college_campus_code"),
        composite_index("college", "campus_id"),
    )

    campus_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("campus.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)
    is_active: bool = Field(default=True, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    campus: Optional["Campus"] = Relationship(back_populates="colleges")
    departments: List["Department"] = Relationship(back_populates="college")


# ─────────────────────────────────────────────────────────────────────────────
# DEPARTMENT
# ─────────────────────────────────────────────────────────────────────────────


class Department(BaseModel, table=True):
    """Organisational subdivision within a college, campus, or institution."""

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
    campus_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("campus.id", ondelete="SET NULL"),
            nullable=True,
        )
    )
    college_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("college.id", ondelete="SET NULL"),
            nullable=True,
        )
    )
    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)
    head_lecturer_id: Optional[uuid.UUID] = Field(default=None, nullable=True)
    is_active: bool = Field(default=True, nullable=False)

    # ── External Integration ──────────────────────────────────────────────────
    external_id: Optional[str] = Field(default=None, max_length=100, index=True)
    source_system: Optional[str] = Field(default=None, max_length=50)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="departments")
    campus: Optional["Campus"] = Relationship(back_populates="departments")
    college: Optional["College"] = Relationship(back_populates="departments")
    courses: List["Course"] = Relationship(back_populates="department")
    subjects: List["Subject"] = Relationship(back_populates="department")
    options: List["Option"] = Relationship(back_populates="department")


# ─────────────────────────────────────────────────────────────────────────────
# OPTION (Specialization)
# ─────────────────────────────────────────────────────────────────────────────


class Option(BaseModel, table=True):
    """Academic specialization within a department (e.g. Networking)."""

    __tablename__ = "option"
    __table_args__ = (
        UniqueConstraint("department_id", "code", name="uq_option_dept_code"),
        composite_index("option", "department_id"),
    )

    department_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("department.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── External Integration ──────────────────────────────────────────────────
    external_id: Optional[str] = Field(default=None, max_length=100, index=True)
    source_system: Optional[str] = Field(default=None, max_length=50)

    # ── Relationships ─────────────────────────────────────────────────────────
    department: Optional["Department"] = Relationship(back_populates="options")
    class_groups: List["ClassGroup"] = Relationship(back_populates="option")


# ─────────────────────────────────────────────────────────────────────────────
# CLASS GROUP (Cohort / Level)
# ─────────────────────────────────────────────────────────────────────────────


class ClassGroup(BaseModel, table=True):
    """A cohort of students (e.g. Year 1 A) within an option."""

    __tablename__ = "class_group"
    __table_args__ = (
        UniqueConstraint("option_id", "code", name="uq_class_group_option_code"),
        composite_index("class_group", "option_id"),
    )

    option_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("option.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)
    level: Optional[int] = Field(default=None, nullable=True) # e.g. Year 1, 2...
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── External Integration ──────────────────────────────────────────────────
    external_id: Optional[str] = Field(default=None, max_length=100, index=True)
    source_system: Optional[str] = Field(default=None, max_length=50)

    # ── Relationships ─────────────────────────────────────────────────────────
    option: Optional["Option"] = Relationship(back_populates="class_groups")
    class_sections: List["ClassSection"] = Relationship(back_populates="class_group")


# ─────────────────────────────────────────────────────────────────────────────
# LECTURER ASSOCIATIONS (Multi-association)
# ─────────────────────────────────────────────────────────────────────────────


class LecturerInstitution(BaseModel, table=True):
    """Junction table: Lecturer ↔ Institution."""

    __tablename__ = "lecturer_institution"
    lecturer_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )


class LecturerDepartment(BaseModel, table=True):
    """Junction table: Lecturer ↔ Department."""

    __tablename__ = "lecturer_department"
    lecturer_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    department_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("department.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )


class LecturerOption(BaseModel, table=True):
    """Junction table: Lecturer ↔ Option."""

    __tablename__ = "lecturer_option"
    lecturer_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    option_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("option.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )


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
    """Specific subject area within a department."""

    __tablename__ = "subject"
    __table_args__ = (
        UniqueConstraint("institution_id", "code", name="uq_subject_inst_code"),
        composite_index("subject", "institution_id"),
        composite_index("subject", "is_active"),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    department_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("department.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)
    is_active: bool = Field(default=True, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="subjects")
    department: Optional["Department"] = Relationship(back_populates="subjects")
    course_subjects: List["CourseSubject"] = Relationship(back_populates="subject")
    
    assessments: List["Assessment"] = Relationship(back_populates="subject")


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
    academic_period_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_period.id", ondelete="RESTRICT"),
            nullable=True,
        )
    )
    academic_year: str = Field(nullable=False, max_length=20)
    name: str = Field(nullable=False, max_length=255)
    code: str = Field(nullable=False, max_length=20)
    description: Optional[str] = Field(default=None, nullable=True)
    department_name: Optional[str] = Field(default=None, max_length=150)
    option_name: Optional[str] = Field(default=None, max_length=150)
    credit_hours: Optional[int] = Field(default=None, nullable=True)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── External Integration ──────────────────────────────────────────────────
    external_id: Optional[str] = Field(default=None, max_length=100, index=True)
    source_system: Optional[str] = Field(default=None, max_length=50)

    # ── Relationships ─────────────────────────────────────────────────────────
    institution: Optional["Institution"] = Relationship(back_populates="courses")
    department: Optional["Department"] = Relationship(back_populates="courses")
    academic_period: Optional["AcademicPeriod"] = Relationship(back_populates="courses")
    class_sections: List["ClassSection"] = Relationship(back_populates="course")
    course_subjects: List["CourseSubject"] = Relationship(back_populates="course")
    lecturer_assignments: List["LecturerCourseAssignment"] = Relationship(back_populates="course")
    
    workspaces: List["TeachingWorkspace"] = Relationship(back_populates="course")
    assessments: List["Assessment"] = Relationship(back_populates="course")


class CourseDepartment(BaseModel, table=True):
    """Junction table: Course ↔ Department."""
    __tablename__ = "course_department"
    course_id: uuid.UUID = Field(sa_column=Column(UUID(as_uuid=True), ForeignKey("course.id", ondelete="CASCADE"), primary_key=True))
    department_id: uuid.UUID = Field(sa_column=Column(UUID(as_uuid=True), ForeignKey("department.id", ondelete="CASCADE"), primary_key=True))


class CourseOption(BaseModel, table=True):
    """Junction table: Course ↔ Option."""
    __tablename__ = "course_option"
    course_id: uuid.UUID = Field(sa_column=Column(UUID(as_uuid=True), ForeignKey("course.id", ondelete="CASCADE"), primary_key=True))
    option_id: uuid.UUID = Field(sa_column=Column(UUID(as_uuid=True), ForeignKey("option.id", ondelete="CASCADE"), primary_key=True))


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
    class_group_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("class_group.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        )
    )
    name: str = Field(nullable=False, max_length=100)
    capacity: Optional[int] = Field(default=None, nullable=True)
    room: Optional[str] = Field(default=None, nullable=True, max_length=100)
    schedule_notes: Optional[str] = Field(default=None, nullable=True)
    is_active: bool = Field(default=True, nullable=False, index=True)

    # ── External Integration ──────────────────────────────────────────────────
    external_id: Optional[str] = Field(default=None, max_length=100, index=True)
    source_system: Optional[str] = Field(default=None, max_length=50)

    # ── Relationships ─────────────────────────────────────────────────────────
    course: Optional["Course"] = Relationship(back_populates="class_sections")
    class_group: Optional["ClassGroup"] = Relationship(back_populates="class_sections")
    enrollments: List["StudentEnrollment"] = Relationship(back_populates="class_section")
    assessment_targets: List["AssessmentTargetSection"] = Relationship(back_populates="class_section")
    
    workspaces: List["TeachingWorkspace"] = Relationship(back_populates="class_section")


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
