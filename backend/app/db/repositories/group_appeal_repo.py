"""Data access for group appeals and their member approvals."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.db.enums import GroupAppealStatus, GroupApprovalStatus
from app.db.models.attempt import GroupAppeal, GroupAppealApproval


def _utcnow() -> datetime:
    return datetime.now(UTC)


class GroupAppealRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_appeal(
        self,
        *,
        submission_id: uuid.UUID,
        initiated_by_id: uuid.UUID,
        statement: str,
        status: GroupAppealStatus = GroupAppealStatus.DRAFT,
    ) -> GroupAppeal:
        appeal = GroupAppeal(
            submission_id=submission_id,
            initiated_by_id=initiated_by_id,
            statement=statement,
            status=status,
        )
        self.db.add(appeal)
        await self.db.flush()
        return appeal

    async def get_by_id(
        self,
        appeal_id: uuid.UUID,
        *,
        include_approvals: bool = False,
    ) -> GroupAppeal | None:
        stmt = select(GroupAppeal).where(
            GroupAppeal.id == appeal_id,
            GroupAppeal.is_deleted.is_(False),
        )
        if include_approvals:
            stmt = stmt.options(selectinload(GroupAppeal.approvals))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active_by_submission(
        self,
        submission_id: uuid.UUID,
    ) -> GroupAppeal | None:
        result = await self.db.execute(
            select(GroupAppeal)
            .options(selectinload(GroupAppeal.approvals))
            .where(
                GroupAppeal.submission_id == submission_id,
                GroupAppeal.is_deleted.is_(False),
                GroupAppeal.status.in_(
                    [
                        GroupAppealStatus.DRAFT,
                        GroupAppealStatus.PENDING_MEMBER_APPROVAL,
                        GroupAppealStatus.SUBMITTED_TO_LECTURER,
                        GroupAppealStatus.UNDER_REVIEW,
                    ]
                ),
            )
            .order_by(GroupAppeal.created_at.desc())
        )
        return result.scalars().first()

    async def seed_appeal_approvals(
        self,
        *,
        appeal_id: uuid.UUID,
        student_ids: list[uuid.UUID],
        initiated_by_id: uuid.UUID,
    ) -> None:
        for student_id in student_ids:
            result = await self.db.execute(
                select(GroupAppealApproval.id).where(
                    GroupAppealApproval.appeal_id == appeal_id,
                    GroupAppealApproval.student_id == student_id,
                    GroupAppealApproval.is_deleted.is_(False),
                )
            )
            if result.scalar_one_or_none() is None:
                self.db.add(
                    GroupAppealApproval(
                        appeal_id=appeal_id,
                        student_id=student_id,
                        status=(
                            GroupApprovalStatus.APPROVED
                            if student_id == initiated_by_id
                            else GroupApprovalStatus.PENDING
                        ),
                        responded_at=_utcnow() if student_id == initiated_by_id else None,
                    )
                )
        await self.db.flush()

    async def upsert_appeal_approval(
        self,
        *,
        appeal_id: uuid.UUID,
        student_id: uuid.UUID,
        status: GroupApprovalStatus,
        note: str | None = None,
    ) -> tuple[GroupAppealApproval, bool]:
        result = await self.db.execute(
            select(GroupAppealApproval).where(
                GroupAppealApproval.appeal_id == appeal_id,
                GroupAppealApproval.student_id == student_id,
                GroupAppealApproval.is_deleted.is_(False),
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.status = status
            existing.note = note
            existing.responded_at = _utcnow()
            await self.db.flush()
            return existing, False

        approval = GroupAppealApproval(
            appeal_id=appeal_id,
            student_id=student_id,
            status=status,
            note=note,
            responded_at=_utcnow(),
        )
        self.db.add(approval)
        await self.db.flush()
        return approval, True

    async def list_appeal_approvals(
        self,
        appeal_id: uuid.UUID,
    ) -> list[GroupAppealApproval]:
        result = await self.db.execute(
            select(GroupAppealApproval)
            .where(
                GroupAppealApproval.appeal_id == appeal_id,
                GroupAppealApproval.is_deleted.is_(False),
            )
            .order_by(GroupAppealApproval.created_at.asc())
        )
        return list(result.scalars().all())

    async def set_status(
        self,
        *,
        appeal_id: uuid.UUID,
        status: GroupAppealStatus,
        lecturer_decision: str | None = None,
    ) -> None:
        values: dict[str, object] = {"status": status}
        now = _utcnow()
        if status == GroupAppealStatus.SUBMITTED_TO_LECTURER:
            values["submitted_to_lecturer_at"] = now
        if status in {
            GroupAppealStatus.APPROVED,
            GroupAppealStatus.REJECTED,
            GroupAppealStatus.RESOLVED,
            GroupAppealStatus.CANCELLED,
        }:
            values["resolved_at"] = now
        if lecturer_decision is not None:
            values["lecturer_decision"] = lecturer_decision
        await self.db.execute(
            update(GroupAppeal)
            .where(GroupAppeal.id == appeal_id)
            .values(**values)
        )
