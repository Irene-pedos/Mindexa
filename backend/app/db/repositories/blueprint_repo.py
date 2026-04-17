"""
app/db/repositories/blueprint_repo.py

Repository for Blueprint Rule data access.
"""

import uuid
from typing import List, Optional

from app.db.models.assessment import AssessmentBlueprintRule
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession


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
        description: Optional[str] = None,
    ) -> AssessmentBlueprintRule:
        rule = AssessmentBlueprintRule(
            assessment_id=assessment_id,
            rule_type=rule_type,
            value_json=value_json,
            priority=priority,
            is_blocking=is_blocking,
            description=description,
        )
        self.db.add(rule)
        await self.db.flush()
        return rule

    async def get_by_id(self, rule_id: uuid.UUID) -> Optional[AssessmentBlueprintRule]:
        result = await self.db.execute(
            select(AssessmentBlueprintRule).where(
                AssessmentBlueprintRule.id == rule_id
            )
        )
        return result.scalar_one_or_none()

    async def list_by_assessment(
        self, assessment_id: uuid.UUID
    ) -> List[AssessmentBlueprintRule]:
        result = await self.db.execute(
            select(AssessmentBlueprintRule)
            .where(AssessmentBlueprintRule.assessment_id == assessment_id)
            .order_by(
                AssessmentBlueprintRule.priority,
                AssessmentBlueprintRule.created_at,
            )
        )
        return list(result.scalars().all())

    async def delete_all_for_assessment(self, assessment_id: uuid.UUID) -> int:
        result = await self.db.execute(
            delete(AssessmentBlueprintRule).where(
                AssessmentBlueprintRule.assessment_id == assessment_id
            )
        )
        return result.rowcount

    async def delete_rule(self, rule_id: uuid.UUID) -> None:
        await self.db.execute(
            delete(AssessmentBlueprintRule).where(
                AssessmentBlueprintRule.id == rule_id
            )
        )
