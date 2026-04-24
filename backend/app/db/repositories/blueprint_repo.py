"""
app/db/repositories/blueprint_repo.py

Repository for Blueprint Rule data access.
"""

from __future__ import annotations

import uuid

from app.db.enums import BlueprintRuleType
from app.db.models.assessment import AssessmentBlueprintRule
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col


class BlueprintRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_rule(
        self,
        assessment_id: uuid.UUID,
        rule_type: str,
        value_json: str,
        priority: int = 100,
        is_blocking: bool = True,
        description: str | None = None,
    ) -> AssessmentBlueprintRule:
        rule = AssessmentBlueprintRule(
            assessment_id=assessment_id,
            rule_type=BlueprintRuleType(rule_type),
            value_json=value_json,
            priority=priority,
            is_blocking=is_blocking,
            description=description,
        )
        self.db.add(rule)
        await self.db.flush()
        return rule

    async def get_by_id(self, rule_id: uuid.UUID) -> AssessmentBlueprintRule | None:
        result = await self.db.execute(
            select(AssessmentBlueprintRule).where(
                col(AssessmentBlueprintRule.id) == rule_id
            )
        )
        return result.scalar_one_or_none()

    async def list_by_assessment(
        self, assessment_id: uuid.UUID
    ) -> list[AssessmentBlueprintRule]:
        result = await self.db.execute(
            select(AssessmentBlueprintRule)
            .where(col(AssessmentBlueprintRule.assessment_id) == assessment_id)
            .order_by(
                col(AssessmentBlueprintRule.priority).asc(),
                col(AssessmentBlueprintRule.created_at).asc(),
            )
        )
        return list(result.scalars().all())

    async def delete_all_for_assessment(self, assessment_id: uuid.UUID) -> int:
        count_result = await self.db.execute(
            select(func.count(col(AssessmentBlueprintRule.id))).where(
                col(AssessmentBlueprintRule.assessment_id) == assessment_id
            )
        )
        total = int(count_result.scalar_one() or 0)

        result = await self.db.execute(
            delete(AssessmentBlueprintRule).where(
                col(AssessmentBlueprintRule.assessment_id) == assessment_id
            )
        )
        _ = result  # keep execute side effect explicit
        return total

    async def delete_rule(self, rule_id: uuid.UUID) -> None:
        await self.db.execute(
            delete(AssessmentBlueprintRule).where(
                col(AssessmentBlueprintRule.id) == rule_id
            )
        )
