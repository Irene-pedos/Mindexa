"""
app/db/models/marking.py

Phase 5: Marking schemes, method marks, material key points,
AI grade sample checks, and grading delegations.
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

import sqlalchemy as sa
from sqlalchemy import Column, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

from app.db.base import BaseModel
from app.db.enums import (
    DelegationStatus,
    GradingDelegationScope,
    KeyPointImportance,
    SampleCheckStatus,
    StepKind,
)
from app.db.mixins import composite_index

if TYPE_CHECKING:
    from app.db.models.assessment import Assessment, AssessmentSection, Rubric
    from app.db.models.auth import User
    from app.db.models.question import Question
    from app.db.models.resource import LecturerMaterial, LecturerMaterialChunk


class MarkingScheme(BaseModel, table=True):
    """
    Marking scheme and model answer for a question.
    Can optionally reference a Rubric for multi-criteria assessment.
    """

    __tablename__ = "marking_scheme"

    __table_args__ = (
        UniqueConstraint("question_id", name="uq_marking_scheme_question"),
    )

    question_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        )
    )
    model_answer: str = Field(sa_column=Column(sa.Text, nullable=False))
    allow_partial_credit: bool = Field(default=True, nullable=False)
    notes: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))
    rubric_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("rubric.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    created_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    is_deleted: bool = Field(default=False, nullable=False, index=True)

    # Relationships
    question: Optional["Question"] = Relationship()
    rubric: Optional["Rubric"] = Relationship()
    created_by: Optional["User"] = Relationship()


class QuestionMarkStep(BaseModel, table=True):
    """
    Step mark / method mark for a question (R-12).
    Sum of step marks must equal the question's marks.
    """

    __tablename__ = "question_mark_step"

    __table_args__ = (
        UniqueConstraint("question_id", "step_no", name="uq_question_mark_step_question_step_no"),
        composite_index("question_mark_step", "question_id", "step_no"),
    )

    question_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    step_no: int = Field(nullable=False)
    description: str = Field(sa_column=Column(sa.Text, nullable=False))
    marks: float = Field(nullable=False)
    kind: StepKind = Field(
        sa_column=Column(
            sa.Enum(StepKind, name="stepkind", native_enum=True),
            nullable=False,
            default=StepKind.METHOD,
        )
    )
    is_deleted: bool = Field(default=False, nullable=False, index=True)

    # Relationships
    question: Optional["Question"] = Relationship()


class MaterialKeyPoint(BaseModel, table=True):
    """
    Lecturer-highlighted key statement on course learning materials (R-13c, R-13d).
    """

    __tablename__ = "material_key_point"

    lecturer_material_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("lecturer_material.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    chunk_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("lecturer_material_chunk.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    page_number: Optional[int] = Field(default=None, nullable=True)
    text: str = Field(sa_column=Column(sa.Text, nullable=False))
    importance: KeyPointImportance = Field(
        sa_column=Column(
            sa.Enum(KeyPointImportance, name="keypointimportance", native_enum=True),
            nullable=False,
            default=KeyPointImportance.CORE,
        )
    )
    created_by_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    is_deleted: bool = Field(default=False, nullable=False, index=True)

    # Relationships
    material: Optional["LecturerMaterial"] = Relationship()
    chunk: Optional["LecturerMaterialChunk"] = Relationship()
    created_by: Optional["User"] = Relationship()


class QuestionKeyPoint(BaseModel, table=True):
    """
    Links a MaterialKeyPoint to a Question for explicit key-point checking.
    """

    __tablename__ = "question_key_point"

    __table_args__ = (
        UniqueConstraint("question_id", "key_point_id", name="uq_question_key_point_question_key_point"),
    )

    question_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("question.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    key_point_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("material_key_point.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )

    # Relationships
    question: Optional["Question"] = Relationship()
    key_point: Optional["MaterialKeyPoint"] = Relationship()


class AIGradeSampleCheck(BaseModel, table=True):
    """
    Trust-building sample check before bulk-accepting AI grade reviews (R-13).
    """

    __tablename__ = "ai_grade_sample_check"

    __table_args__ = (
        composite_index("ai_grade_sample_check", "assessment_id", "status"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    lecturer_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    sample_size: int = Field(nullable=False)
    sampled_review_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    checked_count: int = Field(default=0, nullable=False)
    agreement_rate: float = Field(default=0.0, nullable=False)
    status: SampleCheckStatus = Field(
        sa_column=Column(
            sa.Enum(SampleCheckStatus, name="samplecheckstatus", native_enum=True),
            nullable=False,
            default=SampleCheckStatus.PENDING,
            index=True,
        )
    )

    # Relationships
    assessment: Optional["Assessment"] = Relationship()
    lecturer: Optional["User"] = Relationship()


class GradingDelegation(BaseModel, table=True):
    """
    Delegated grading record allowing a fellow course lecturer to mark (R-11).
    """

    __tablename__ = "grading_delegation"

    __table_args__ = (
        composite_index("grading_delegation", "assessment_id", "status"),
        composite_index("grading_delegation", "delegate_id", "status"),
    )

    assessment_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    delegator_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    delegate_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("user.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    scope: GradingDelegationScope = Field(
        sa_column=Column(
            sa.Enum(GradingDelegationScope, name="gradingdelegationscope", native_enum=True),
            nullable=False,
            default=GradingDelegationScope.WHOLE,
        )
    )
    target_section_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("assessment_section.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    target_student_ids: Optional[list[str]] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    reason: str = Field(sa_column=Column(sa.Text, nullable=False))
    valid_from: datetime = Field(
        sa_column=Column(sa.DateTime(timezone=True), nullable=False)
    )
    valid_to: datetime = Field(
        sa_column=Column(sa.DateTime(timezone=True), nullable=False)
    )
    status: DelegationStatus = Field(
        sa_column=Column(
            sa.Enum(DelegationStatus, name="delegationstatus", native_enum=True),
            nullable=False,
            default=DelegationStatus.ACTIVE,
            index=True,
        )
    )

    # Relationships
    assessment: Optional["Assessment"] = Relationship()
    delegator: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[GradingDelegation.delegator_id]"}
    )
    delegate: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[GradingDelegation.delegate_id]"}
    )
    target_section: Optional["AssessmentSection"] = Relationship()
