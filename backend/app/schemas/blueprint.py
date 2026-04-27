"""
app/schemas/blueprint.py

Pydantic schemas for the Blueprint Rule Engine.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.db.models.assessment import BlueprintRuleType

# ─── Blueprint Rule Schemas ───────────────────────────────────────────────────


class BlueprintRuleCreate(BaseModel):
    rule_type: str = Field(...)
    value_json: dict[str, Any] = Field(
        ...,
        description="Rule configuration. Schema depends on rule_type."
    )
    priority: int = Field(default=100, ge=1, le=1000)
    is_blocking: bool = True
    description: str | None = Field(default=None, max_length=500)

    @field_validator("rule_type")
    @classmethod
    def validate_rule_type(cls, v: str) -> str:
        if v not in BlueprintRuleType.all_types():
            raise ValueError(
                f"rule_type must be one of: {', '.join(sorted(BlueprintRuleType.all_types()))}"
            )
        return v


class BlueprintRuleUpdate(BaseModel):
    value_json: dict[str, Any] | None = None
    priority: int | None = Field(default=None, ge=1, le=1000)
    is_blocking: bool | None = None
    description: str | None = Field(default=None, max_length=500)


class BlueprintRuleResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    rule_type: str
    value_json: Any  # Can be dict (parsed) or string (raw)
    priority: int
    is_blocking: bool
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("value_json", mode="before")
    @classmethod
    def parse_value_json(cls, v: Any) -> Any:
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return v
        return v


class SetBlueprintRequest(BaseModel):
    """
    Set all blueprint rules for an assessment (replaces existing rules).
    Used when the lecturer completes Step 3 of the wizard.
    """

    rules: list[BlueprintRuleCreate] = Field(
        ..., min_length=1,
        description="Complete set of rules. Existing rules will be replaced."
    )


# ─── Validation Results ───────────────────────────────────────────────────────


class BlueprintViolation(BaseModel):
    rule_type: str
    rule_id: uuid.UUID | None
    is_blocking: bool
    message: str
    expected: Any | None = None
    actual: Any | None = None


class BlueprintValidationResult(BaseModel):
    assessment_id: uuid.UUID
    is_valid: bool
    can_finalize: bool
    violations: list[BlueprintViolation] = []
    warnings: list[BlueprintViolation] = []
    total_marks_assigned: int
    total_questions: int
    difficulty_distribution: dict[str, int]
    type_distribution: dict[str, int]


class BlueprintSummaryResponse(BaseModel):
    assessment_id: uuid.UUID
    rules: list[BlueprintRuleResponse]
    last_validation: BlueprintValidationResult | None = None
