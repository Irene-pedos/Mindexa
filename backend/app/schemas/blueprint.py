"""
app/schemas/blueprint.py

Pydantic schemas for the Blueprint Rule Engine.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.db.models.assessment import BlueprintRuleType
from pydantic import BaseModel, Field, field_validator

# ─── Blueprint Rule Schemas ───────────────────────────────────────────────────


class BlueprintRuleCreate(BaseModel):
    rule_type: str = Field(...)
    value_json: Dict[str, Any] = Field(
        ...,
        description="Rule configuration. Schema depends on rule_type."
    )
    priority: int = Field(default=100, ge=1, le=1000)
    is_blocking: bool = True
    description: Optional[str] = Field(default=None, max_length=500)

    @field_validator("rule_type")
    @classmethod
    def validate_rule_type(cls, v: str) -> str:
        if v not in BlueprintRuleType.ALL_TYPES:
            raise ValueError(
                f"rule_type must be one of: {', '.join(sorted(BlueprintRuleType.ALL_TYPES))}"
            )
        return v


class BlueprintRuleUpdate(BaseModel):
    value_json: Optional[Dict[str, Any]] = None
    priority: Optional[int] = Field(default=None, ge=1, le=1000)
    is_blocking: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=500)


class BlueprintRuleResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    rule_type: str
    value_json: str  # Raw JSON string from DB
    priority: int
    is_blocking: bool
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class SetBlueprintRequest(BaseModel):
    """
    Set all blueprint rules for an assessment (replaces existing rules).
    Used when the lecturer completes Step 3 of the wizard.
    """

    rules: List[BlueprintRuleCreate] = Field(
        ..., min_length=1,
        description="Complete set of rules. Existing rules will be replaced."
    )


# ─── Validation Results ───────────────────────────────────────────────────────


class BlueprintViolation(BaseModel):
    rule_type: str
    rule_id: Optional[uuid.UUID]
    is_blocking: bool
    message: str
    expected: Optional[Any] = None
    actual: Optional[Any] = None


class BlueprintValidationResult(BaseModel):
    assessment_id: uuid.UUID
    is_valid: bool
    can_finalize: bool
    violations: List[BlueprintViolation] = []
    warnings: List[BlueprintViolation] = []
    total_marks_assigned: int
    total_questions: int
    difficulty_distribution: Dict[str, int]
    type_distribution: Dict[str, int]


class BlueprintSummaryResponse(BaseModel):
    assessment_id: uuid.UUID
    rules: List[BlueprintRuleResponse]
    last_validation: Optional[BlueprintValidationResult] = None
