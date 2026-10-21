"""
app/db/models/appeals.py

Phase 6B: Appeals and Absence Excuses data models.
Spec: MINDEXA_INSTITUTIONAL_WORKFLOWS_SPEC.md Sections 11.1 and 11.2
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

from app.db.base import BaseModel, utcnow
from app.db.enums import (
    AbsenceExcuseStatus,
    AppealOutcome,
    IndividualAppealStatus,
)

if TYPE_CHECKING:
    from app.db.models.academic import Course, Institution
    from app.db.models.assessment import Assessment
    from app.db.models.attempt import AssessmentAttempt
    from app.db.models.auth import User
    from app.db.models.eligibility import PaymentReference


class AppealPolicy(BaseModel, table=True):
    """
    Institutional policy for individual grade appeals.
    Per-institution; created by Admin.
    """

    __tablename__ = "appeal_policy"
    __table_args__ = (
        UniqueConstraint("institution_id", name="uq_appeal_policy_institution"),
        Index("ix_appeal_policy_institution_id", "institution_id"),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    # R-17 / A-07: appeal window in days after result release
    window_days: int = Field(
        default=7,
        nullable=False,
        description="Days after result release during which a student may submit an appeal",
    )
    # A-08: decrease policy
    allow_mark_decrease: bool = Field(
        default=False,
        nullable=False,
        sa_column_kwargs={"server_default": sa.text("false")},
        description="If False, final_total = max(original, reviewer_total)",
    )
    require_payment: bool = Field(
        default=True,
        nullable=False,
        sa_column_kwargs={"server_default": sa.text("true")},
        description="Require confirmed payment before assignment/review",
    )
    anonymize_for_reviewer: bool = Field(
        default=False,
        nullable=False,
        sa_column_kwargs={"server_default": sa.text("false")},
        description="Hide student identity from appeal reviewer",
    )

    institution: Optional["Institution"] = Relationship()


class Appeal(BaseModel, table=True):
    """
    Individual student grade appeal.
    Full status machine: SUBMITTED → PAYMENT_PENDING → PAID → ASSIGNED →
    UNDER_REVIEW → DECIDED → CLOSED (+ REJECTED_INVALID, WITHDRAWN).
    Original grades remain immutable; a new revision row is created on decision.
    """

    __tablename__ = "appeal"
    __table_args__ = (
        Index("ix_appeal_student_id", "student_id"),
        Index("ix_appeal_assessment_id", "assessment_id"),
        Index("ix_appeal_status", "status"),
        Index("ix_appeal_reviewer_id", "reviewer_id"),
    )

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    attempt_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
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
    # Student's grounds for appeal (min 20 chars enforced at service level)
    reason: str = Field(sa_column=Column(Text, nullable=False))
    # Optional list of disputed question IDs + notes
    items: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    status: IndividualAppealStatus = Field(
        default=IndividualAppealStatus.SUBMITTED,
        sa_column=Column(
            sa.Enum(IndividualAppealStatus, name="individualappealstatus", create_type=False),
            nullable=False,
            server_default=IndividualAppealStatus.SUBMITTED.value,
        ),
    )
    payment_reference_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("payment_reference.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    original_total: float = Field(nullable=False, description="Mark at time of appeal submission")
    reviewer_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    assigned_by_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    # Required when no eligible reviewer found in the normal pool (A-09)
    assignment_justification: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    reviewer_total: Optional[float] = Field(default=None, nullable=True)
    final_total: Optional[float] = Field(default=None, nullable=True)
    outcome: Optional[AppealOutcome] = Field(
        default=None,
        sa_column=Column(
            sa.Enum(AppealOutcome, name="appealoutcome", create_type=False),
            nullable=True,
        ),
    )
    decision_note: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    submitted_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    assigned_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    decided_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    closed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    student: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Appeal.student_id]"}
    )
    attempt: Optional["AssessmentAttempt"] = Relationship()
    assessment: Optional["Assessment"] = Relationship()
    course: Optional["Course"] = Relationship()
    reviewer: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Appeal.reviewer_id]"}
    )
    assigned_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Appeal.assigned_by_id]"}
    )
    payment_reference: Optional["PaymentReference"] = Relationship()


class AbsenceExcusePolicy(BaseModel, table=True):
    """
    Institutional policy for absence excuse submissions.
    Per-institution; Admin manages.
    """

    __tablename__ = "absence_excuse_policy"
    __table_args__ = (
        UniqueConstraint("institution_id", name="uq_absence_excuse_policy_institution"),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    # A-assumption: default 7 days after assessment window closes
    submit_days_after: int = Field(
        default=7,
        nullable=False,
        description="Days after assessment window close within which excuse must be submitted",
    )

    institution: Optional["Institution"] = Relationship()


class AbsenceExcuseRequest(BaseModel, table=True):
    """
    Student request to have an assessment absence excused.
    Approved by course lecturer OR HOD (R-23).
    APPROVED → creates AttemptEligibilityOverride; REJECTED → absence stays 0%.
    """

    __tablename__ = "absence_excuse_request"
    __table_args__ = (
        Index("ix_absence_excuse_student_id", "student_id"),
        Index("ix_absence_excuse_assessment_id", "assessment_id"),
        Index("ix_absence_excuse_status", "status"),
    )

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
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
    reason: str = Field(sa_column=Column(Text, nullable=False))
    # List of secure file IDs uploaded as supporting evidence (R-23)
    evidence_file_ids: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    status: AbsenceExcuseStatus = Field(
        default=AbsenceExcuseStatus.SUBMITTED,
        sa_column=Column(
            sa.Enum(AbsenceExcuseStatus, name="absenceexcusestatus", create_type=False),
            nullable=False,
            server_default=AbsenceExcuseStatus.SUBMITTED.value,
        ),
    )
    decided_by_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    decided_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    decision_note: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    # Populated by service when APPROVED — the window in which the student may sit the assessment
    granted_window_start: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    granted_window_end: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    student: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[AbsenceExcuseRequest.student_id]"}
    )
    assessment: Optional["Assessment"] = Relationship()
    course: Optional["Course"] = Relationship()
    decided_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[AbsenceExcuseRequest.decided_by_id]"}
    )
