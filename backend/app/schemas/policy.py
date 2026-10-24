"""
app/schemas/policy.py

Pydantic schemas for Institutional ApprovalPolicy workflows (Phase 1).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.constants import (
    AssessmentType,
    PostApprovalEditMode,
    PostStartEditMode,
)


class ApprovalPolicyUpdate(BaseModel):
    """Payload for updating an institutional approval policy."""

    requires_moderation: bool | None = Field(
        None, description="Whether moderation is required before publish"
    )
    enforce_structure_template: bool | None = Field(
        None, description="Whether structure template rules are enforced"
    )
    summative_total_marks: int | None = Field(
        None, description="Fixed total marks requirement (e.g. 100 for SUMMATIVE)"
    )
    post_approval_edit_mode: PostApprovalEditMode | None = Field(
        None, description="NOTIFY | REQUIRE_REAPPROVAL"
    )
    post_start_edit_mode: PostStartEditMode | None = Field(
        None, description="BLOCK | ALLOW_WITH_NOTICE"
    )
    sealing_warning_days: int | None = Field(
        None, description="Days before window start to alert if not sealed"
    )
    compliance_rules: dict[str, Any] | None = Field(
        None,
        description=(
            "How strictly each automatic pre-moderation check applies. "
            "Keys: MARKS_TOTAL, MARKS_DISTRIBUTION, STRUCTURE, QUESTIONS_COMPLETE; "
            "each has a mode of BLOCKING, WARNING or OFF."
        ),
    )

    model_config = ConfigDict(from_attributes=True)


class ApprovalPolicyResponse(BaseModel):
    """Response representation of an approval policy."""

    id: uuid.UUID
    institution_id: uuid.UUID
    assessment_type: AssessmentType
    requires_moderation: bool
    enforce_structure_template: bool
    summative_total_marks: int | None = None
    post_approval_edit_mode: PostApprovalEditMode
    post_start_edit_mode: PostStartEditMode
    sealing_warning_days: int | None = None
    # Always the full effective rules (institution settings laid over the platform defaults).
    compliance_rules: dict[str, Any] = Field(default_factory=dict)
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None

    institution_name: str | None = None

    model_config = ConfigDict(from_attributes=True)
