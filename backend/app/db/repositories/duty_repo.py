"""
app/db/repositories/duty_repo.py

Data access repository for UserDutyAssignment.
Repositories do not commit; the service layer manages transactions.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.constants import Duty
from app.db.base import utcnow
from app.db.models.auth import User
from app.db.models.duty import UserDutyAssignment


class DutyRepository:
    """Repository for querying and persisting user duty assignments."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, assignment: UserDutyAssignment) -> UserDutyAssignment:
        """Add new duty assignment without committing."""
        self.db.add(assignment)
        await self.db.flush()
        return assignment

    async def get_by_id(self, duty_id: uuid.UUID) -> UserDutyAssignment | None:
        """Fetch duty assignment by ID with relationships preloaded."""
        stmt = (
            select(UserDutyAssignment)
            .where(
                UserDutyAssignment.id == duty_id,
                UserDutyAssignment.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(UserDutyAssignment.user).selectinload(User.profile),
                selectinload(UserDutyAssignment.assigned_by),
                selectinload(UserDutyAssignment.institution),
                selectinload(UserDutyAssignment.campus),
                selectinload(UserDutyAssignment.department),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active_assignment(
        self,
        *,
        user_id: uuid.UUID,
        duty: Duty,
        institution_id: uuid.UUID,
        campus_id: uuid.UUID | None = None,
        department_id: uuid.UUID | None = None,
    ) -> UserDutyAssignment | None:
        """
        Find an existing active duty assignment for the exact scope.
        Used to prevent duplicate active assignments.
        """
        conditions = [
            UserDutyAssignment.user_id == user_id,
            UserDutyAssignment.duty == duty,
            UserDutyAssignment.institution_id == institution_id,
            UserDutyAssignment.is_active == True,  # noqa: E712
            UserDutyAssignment.is_deleted == False,  # noqa: E712
        ]

        if department_id is not None:
            conditions.append(UserDutyAssignment.department_id == department_id)
        else:
            conditions.append(UserDutyAssignment.department_id.is_(None))

        if campus_id is not None:
            conditions.append(UserDutyAssignment.campus_id == campus_id)
        else:
            conditions.append(UserDutyAssignment.campus_id.is_(None))

        stmt = select(UserDutyAssignment).where(and_(*conditions))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_assignments(
        self,
        *,
        user_id: uuid.UUID | None = None,
        duty: Duty | None = None,
        institution_id: uuid.UUID | None = None,
        campus_id: uuid.UUID | None = None,
        department_id: uuid.UUID | None = None,
        is_active: bool | None = None,
    ) -> list[UserDutyAssignment]:
        """List duty assignments with optional filters."""
        stmt = (
            select(UserDutyAssignment)
            .where(UserDutyAssignment.is_deleted == False)  # noqa: E712
            .options(
                selectinload(UserDutyAssignment.user).selectinload(User.profile),
                selectinload(UserDutyAssignment.assigned_by),
                selectinload(UserDutyAssignment.institution),
                selectinload(UserDutyAssignment.campus),
                selectinload(UserDutyAssignment.department),
            )
            .order_by(UserDutyAssignment.created_at.desc())
        )

        if user_id is not None:
            stmt = stmt.where(UserDutyAssignment.user_id == user_id)
        if duty is not None:
            stmt = stmt.where(UserDutyAssignment.duty == duty)
        if institution_id is not None:
            stmt = stmt.where(UserDutyAssignment.institution_id == institution_id)
        if campus_id is not None:
            stmt = stmt.where(UserDutyAssignment.campus_id == campus_id)
        if department_id is not None:
            stmt = stmt.where(UserDutyAssignment.department_id == department_id)
        if is_active is not None:
            stmt = stmt.where(UserDutyAssignment.is_active == is_active)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_valid_active_duties(
        self,
        *,
        user_id: uuid.UUID,
        duty: Duty | None = None,
        as_of: datetime | None = None,
    ) -> list[UserDutyAssignment]:
        """
        Query currently effective active duty assignments for a user.
        Evaluates validity window using timezone-aware comparison.
        """
        check_time = as_of or utcnow()
        conditions = [
            UserDutyAssignment.user_id == user_id,
            UserDutyAssignment.is_active == True,  # noqa: E712
            UserDutyAssignment.is_deleted == False,  # noqa: E712
            UserDutyAssignment.valid_from <= check_time,
            or_(
                UserDutyAssignment.valid_to.is_(None),
                UserDutyAssignment.valid_to >= check_time,
            ),
        ]

        if duty is not None:
            conditions.append(UserDutyAssignment.duty == duty)

        stmt = (
            select(UserDutyAssignment)
            .where(and_(*conditions))
            .options(
                selectinload(UserDutyAssignment.user).selectinload(User.profile),
                selectinload(UserDutyAssignment.institution),
                selectinload(UserDutyAssignment.campus),
                selectinload(UserDutyAssignment.department),
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
