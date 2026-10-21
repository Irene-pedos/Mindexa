"""
app/db/models/eligibility.py

Phase 6A: Eligibility, Reassessment, and Retake Engine data models.
Strictly SQLModel-based ORM pattern.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

from app.db.base import BaseModel, utcnow
from app.db.enums import (
    EligibilityDecisionType,
    EligibilityResult,
    FormativeScope,
    NoCourseworkBehavior,
    OverrideSource,
    PaymentPurpose,
    PaymentStatus,
    PendingMarksBehavior,
    ReassessmentBlockScope,
    ReassessmentRequirementStatus,
    RetakeStatus,
    RetakeTrigger,
)

if TYPE_CHECKING:
    from app.db.models.academic import AcademicPeriod, Course, Department, Institution
    from app.db.models.assessment import Assessment
    from app.db.models.attempt import AssessmentAttempt
    from app.db.models.auth import User


class EligibilityPolicy(BaseModel, table=True):
    """
    Institutional policy for eligibility thresholds and behaviors.
    Per-institution with optional per-department override.
    """

    __tablename__ = "eligibility_policy"
    __table_args__ = (
        UniqueConstraint(
            "institution_id",
            "department_id",
            name="uq_eligibility_policy_inst_dept",
        ),
        Index("ix_eligibility_policy_institution_id", "institution_id"),
        Index("ix_eligibility_policy_department_id", "department_id"),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    department_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("department.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    formative_exempt_pct: float = Field(
        default=70.0,
        nullable=False,
        description="Threshold percentage below which formative requires reassessment",
    )
    summative_entry_pct: float = Field(
        default=50.0,
        nullable=False,
        description="Coursework average threshold required for summative entry",
    )
    summative_pass_pct: float = Field(
        default=50.0,
        nullable=False,
        description="Summative pass mark threshold",
    )
    formative_scope: FormativeScope = Field(
        default=FormativeScope.PER_FORMATIVE,
        sa_column=Column(
            sa.Enum(FormativeScope, name="formativescope", create_type=False),
            nullable=False,
            server_default=FormativeScope.PER_FORMATIVE.value,
        ),
    )
    reassessment_block_scope: ReassessmentBlockScope = Field(
        default=ReassessmentBlockScope.COURSE,
        sa_column=Column(
            sa.Enum(ReassessmentBlockScope, name="reassessmentblockscope", create_type=False),
            nullable=False,
            server_default=ReassessmentBlockScope.COURSE.value,
        ),
    )
    pending_marks_behavior: PendingMarksBehavior = Field(
        default=PendingMarksBehavior.BLOCK,
        sa_column=Column(
            sa.Enum(PendingMarksBehavior, name="pendingmarksbehavior", create_type=False),
            nullable=False,
            server_default=PendingMarksBehavior.BLOCK.value,
        ),
    )
    no_coursework_behavior: NoCourseworkBehavior = Field(
        default=NoCourseworkBehavior.MANUAL_REVIEW,
        sa_column=Column(
            sa.Enum(NoCourseworkBehavior, name="nocourseworkbehavior", create_type=False),
            nullable=False,
            server_default=NoCourseworkBehavior.MANUAL_REVIEW.value,
        ),
    )
    allow_hod_override: bool = Field(
        default=True,
        nullable=False,
        sa_column_kwargs={"server_default": sa.text("true")},
    )

    institution: Optional["Institution"] = Relationship()
    department: Optional["Department"] = Relationship()


class ReassessmentRequirement(BaseModel, table=True):
    """
    Tracks a student's requirement to complete a reassessment for a formative paper.
    The original formative score is never modified (R-18).
    """

    __tablename__ = "reassessment_requirement"
    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "source_assessment_id",
            name="uq_reassessment_requirement_student_source",
        ),
        Index("ix_reassessment_req_student_course", "student_id", "course_id"),
        Index("ix_reassessment_req_status", "status"),
    )

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
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
    academic_period_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_period.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    source_assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    original_percentage: float = Field(nullable=False)
    status: ReassessmentRequirementStatus = Field(
        default=ReassessmentRequirementStatus.REQUIRED,
        sa_column=Column(
            sa.Enum(ReassessmentRequirementStatus, name="reassessmentrequirementstatus", create_type=False),
            nullable=False,
            server_default=ReassessmentRequirementStatus.REQUIRED.value,
        ),
    )
    reassessment_assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    reassessment_attempt_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_attempt.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    closed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    student: Optional["User"] = Relationship()
    course: Optional["Course"] = Relationship()
    academic_period: Optional["AcademicPeriod"] = Relationship()
    source_assessment: Optional["Assessment"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ReassessmentRequirement.source_assessment_id]"}
    )
    reassessment_assessment: Optional["Assessment"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ReassessmentRequirement.reassessment_assessment_id]"}
    )
    reassessment_attempt: Optional["AssessmentAttempt"] = Relationship()

    @property
    def source_assessment_title(self) -> Optional[str]:
        return self.source_assessment.title if self.source_assessment else None

    @property
    def course_code(self) -> Optional[str]:
        return self.course.code if self.course else None


class EligibilityDecision(BaseModel, table=True):
    """
    Append-only audit of every computed eligibility decision (appeal-proof).
    """

    __tablename__ = "eligibility_decision"
    __table_args__ = (
        Index("ix_eligibility_decision_student_course", "student_id", "course_id"),
        Index("ix_eligibility_decision_assessment_id", "assessment_id"),
        Index("ix_eligibility_decision_decision_type", "decision_type"),
    )

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
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
    assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    decision_type: EligibilityDecisionType = Field(
        sa_column=Column(
            sa.Enum(EligibilityDecisionType, name="eligibilitydecisiontype", create_type=False),
            nullable=False,
        )
    )
    result: EligibilityResult = Field(
        sa_column=Column(
            sa.Enum(EligibilityResult, name="eligibilityresult", create_type=False),
            nullable=False,
        )
    )
    reason_code: str = Field(nullable=False)
    inputs_json: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    policy_snapshot_json: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    computed_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    computed_by: str = Field(default="system", nullable=False)

    student: Optional["User"] = Relationship()
    course: Optional["Course"] = Relationship()
    assessment: Optional["Assessment"] = Relationship()


class AttemptEligibilityOverride(BaseModel, table=True):
    """
    Audit record for HOD or excuse-based override allowing an attempt despite normal block.
    """

    __tablename__ = "attempt_eligibility_override"
    __table_args__ = (
        Index("ix_eligibility_override_student_assessment", "student_id", "assessment_id"),
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
    source: OverrideSource = Field(
        sa_column=Column(
            sa.Enum(OverrideSource, name="overridesource", create_type=False),
            nullable=False,
        )
    )
    allowed_window_start: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    allowed_window_end: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    reason: str = Field(sa_column=Column(Text, nullable=False))
    granted_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    excuse_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(UUID(as_uuid=True), nullable=True),
    )
    revoked_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    student: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[AttemptEligibilityOverride.student_id]"}
    )
    assessment: Optional["Assessment"] = Relationship()
    granted_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[AttemptEligibilityOverride.granted_by_id]"}
    )


class PaymentReference(BaseModel, table=True):
    """
    Payment record confirmed by finance/admin user.
    Mindexa never processes payments directly.
    """

    __tablename__ = "payment_reference"
    __table_args__ = (
        Index("ix_payment_reference_student", "student_id"),
        Index("ix_payment_reference_status", "status"),
    )

    purpose: PaymentPurpose = Field(
        sa_column=Column(
            sa.Enum(PaymentPurpose, name="paymentpurpose", create_type=False),
            nullable=False,
        )
    )
    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    external_reference: Optional[str] = Field(default=None, nullable=True)
    amount_text: Optional[str] = Field(default=None, nullable=True)
    status: PaymentStatus = Field(
        default=PaymentStatus.PENDING,
        sa_column=Column(
            sa.Enum(PaymentStatus, name="paymentstatus", create_type=False),
            nullable=False,
            server_default=PaymentStatus.PENDING.value,
        ),
    )
    confirmed_by_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    confirmed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))

    student: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[PaymentReference.student_id]"}
    )
    confirmed_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[PaymentReference.confirmed_by_id]"}
    )


class RetakeRecord(BaseModel, table=True):
    """
    Tracks a student's retake obligation from entry threshold failure or summative failure.
    Requires manual payment confirmation and administrative enrolment.
    """

    __tablename__ = "retake_record"
    __table_args__ = (
        Index("ix_retake_record_student_course", "student_id", "course_id"),
        Index("ix_retake_record_status", "status"),
    )

    student_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="CASCADE"),
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
    from_period_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_period.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    target_period_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("academic_period.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    target_course_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("course.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    trigger: RetakeTrigger = Field(
        sa_column=Column(
            sa.Enum(RetakeTrigger, name="retaketrigger", create_type=False),
            nullable=False,
        )
    )
    status: RetakeStatus = Field(
        default=RetakeStatus.FLAGGED,
        sa_column=Column(
            sa.Enum(RetakeStatus, name="retakestatus", create_type=False),
            nullable=False,
            server_default=RetakeStatus.FLAGGED.value,
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
    decided_decision_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("eligibility_decision.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    enrolled_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    student: Optional["User"] = Relationship()
    course: Optional["Course"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[RetakeRecord.course_id]"}
    )
    from_period: Optional["AcademicPeriod"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[RetakeRecord.from_period_id]"}
    )
    target_period: Optional["AcademicPeriod"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[RetakeRecord.target_period_id]"}
    )
    payment_reference: Optional["PaymentReference"] = Relationship()
    decided_decision: Optional["EligibilityDecision"] = Relationship()

    @property
    def course_code(self) -> Optional[str]:
        return self.course.code if self.course else None

    @property
    def course_title(self) -> Optional[str]:
        if not self.course:
            return None
        return getattr(self.course, "title", None) or getattr(self.course, "name", None)

    @property
    def from_period_name(self) -> Optional[str]:
        return self.from_period.name if self.from_period else None

    @property
    def target_period_name(self) -> Optional[str]:
        return self.target_period.name if self.target_period else None
