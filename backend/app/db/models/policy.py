"""
app/db/models/policy.py

Institutional policy models.
Strictly SQLModel-based ORM pattern.
"""
import uuid
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Column, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, Relationship

from app.core.constants import (
    AssessmentType,
    PostApprovalEditMode,
    PostStartEditMode,
)
from app.db.base import BaseModel

if TYPE_CHECKING:
    from app.db.models.academic import Institution


class ApprovalPolicy(BaseModel, table=True):
    """
    Institutional approval policies configured per assessment type.
    Unique per institution and assessment type.
    """

    __tablename__ = "approval_policy"
    __table_args__ = (
        UniqueConstraint(
            "institution_id",
            "assessment_type",
            name="uq_approval_policy_inst_type",
        ),
    )

    institution_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("institution.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    assessment_type: AssessmentType = Field(
        sa_column=Column(
            sa.Enum(AssessmentType, name="assessmenttype", create_type=False),
            nullable=False,
            index=True,
        )
    )
    requires_moderation: bool = Field(
        default=False,
        nullable=False,
        sa_column_kwargs={"server_default": sa.text("false")},
    )
    enforce_structure_template: bool = Field(
        default=False,
        nullable=False,
        sa_column_kwargs={"server_default": sa.text("false")},
    )
    summative_total_marks: int | None = Field(
        default=None,
        nullable=True,
    )
    post_approval_edit_mode: PostApprovalEditMode = Field(
        default=PostApprovalEditMode.NOTIFY,
        sa_column=Column(
            sa.Enum(PostApprovalEditMode, name="post_approval_edit_mode", create_type=False),
            nullable=False,
            server_default=sa.text("'NOTIFY'"),
        ),
    )
    post_start_edit_mode: PostStartEditMode = Field(
        default=PostStartEditMode.BLOCK,
        sa_column=Column(
            sa.Enum(PostStartEditMode, name="post_start_edit_mode", create_type=False),
            nullable=False,
            server_default=sa.text("'BLOCK'"),
        ),
    )
    sealing_warning_days: int | None = Field(
        default=None,
        nullable=True,
    )
    # How strictly each automatic pre-moderation check applies at this institution:
    # {"MARKS_TOTAL": {"mode": "BLOCKING|WARNING|OFF"}, "STRUCTURE": {..., "expected_sections": 3}, ...}
    # Empty/NULL = platform defaults (see app/services/compliance_rules.py).
    compliance_rules: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
    )
    is_active: bool = Field(
        default=True,
        nullable=False,
        sa_column_kwargs={"server_default": sa.text("true")},
    )

    institution: Optional["Institution"] = Relationship(
        sa_relationship_kwargs={"lazy": "selectin"}
    )
