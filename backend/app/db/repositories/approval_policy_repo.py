"""
app/db/repositories/approval_policy_repo.py

Data access repository for ApprovalPolicy.
Repositories do not commit; the service layer manages transactions.
"""
from __future__ import annotations

import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.constants import AssessmentType
from app.db.models.policy import ApprovalPolicy


class ApprovalPolicyRepository:
    """Repository for querying and persisting institutional approval policies."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, policy: ApprovalPolicy) -> ApprovalPolicy:
        """Add new policy without committing."""
        self.db.add(policy)
        await self.db.flush()
        return policy

    async def get_by_id(self, policy_id: uuid.UUID) -> ApprovalPolicy | None:
        """Fetch policy by ID with institution loaded."""
        stmt = (
            select(ApprovalPolicy)
            .where(
                ApprovalPolicy.id == policy_id,
                ApprovalPolicy.is_deleted == False,  # noqa: E712
            )
            .options(selectinload(ApprovalPolicy.institution))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_institution_and_type(
        self,
        institution_id: uuid.UUID,
        assessment_type: AssessmentType,
    ) -> ApprovalPolicy | None:
        """Fetch approval policy for a specific institution and assessment type."""
        stmt = (
            select(ApprovalPolicy)
            .where(
                and_(
                    ApprovalPolicy.institution_id == institution_id,
                    ApprovalPolicy.assessment_type == assessment_type,
                    ApprovalPolicy.is_deleted == False,  # noqa: E712
                )
            )
            .options(selectinload(ApprovalPolicy.institution))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_institution(self, institution_id: uuid.UUID) -> list[ApprovalPolicy]:
        """List all approval policies for an institution."""
        stmt = (
            select(ApprovalPolicy)
            .where(
                and_(
                    ApprovalPolicy.institution_id == institution_id,
                    ApprovalPolicy.is_deleted == False,  # noqa: E712
                )
            )
            .options(selectinload(ApprovalPolicy.institution))
            .order_by(ApprovalPolicy.assessment_type)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_all(
        self,
        *,
        institution_id: uuid.UUID | None = None,
        assessment_type: AssessmentType | None = None,
    ) -> list[ApprovalPolicy]:
        """List policies with optional filters."""
        stmt = (
            select(ApprovalPolicy)
            .where(ApprovalPolicy.is_deleted == False)  # noqa: E712
            .options(selectinload(ApprovalPolicy.institution))
            .order_by(ApprovalPolicy.institution_id, ApprovalPolicy.assessment_type)
        )
        if institution_id is not None:
            stmt = stmt.where(ApprovalPolicy.institution_id == institution_id)
        if assessment_type is not None:
            stmt = stmt.where(ApprovalPolicy.assessment_type == assessment_type)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())
