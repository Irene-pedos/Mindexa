"""Data access for StudentGroup and StudentGroupMember."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.db.enums import EnrollmentStatus, StudentGroupStatus
from app.db.models.academic import StudentEnrollment
from app.db.models.assessment import AssessmentTargetSection
from app.db.models.attempt import StudentGroup, StudentGroupMember


def _utcnow() -> datetime:
    return datetime.now(UTC)


class GroupRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_group(
        self,
        *,
        assessment_id: uuid.UUID,
        name: str,
        max_members: int | None,
        status: StudentGroupStatus = StudentGroupStatus.DRAFT,
    ) -> StudentGroup:
        group = StudentGroup(
            assessment_id=assessment_id,
            name=name,
            max_members=max_members,
            status=status,
            is_locked=False,
        )
        self.db.add(group)
        await self.db.flush()
        return group

    async def add_member(
        self,
        *,
        group_id: uuid.UUID,
        student_id: uuid.UUID,
        group_role: str | None = None,
        is_leader: bool = False,
    ) -> StudentGroupMember:
        member = StudentGroupMember(
            group_id=group_id,
            student_id=student_id,
            group_role=group_role,
            is_leader=is_leader,
        )
        self.db.add(member)
        await self.db.flush()
        return member

    async def list_groups_by_assessment(
        self,
        assessment_id: uuid.UUID,
        *,
        include_members: bool = False,
    ) -> list[StudentGroup]:
        stmt = select(StudentGroup).where(
            StudentGroup.assessment_id == assessment_id,
            StudentGroup.is_deleted.is_(False),
        )
        if include_members:
            stmt = stmt.options(selectinload(StudentGroup.members))
        stmt = stmt.order_by(StudentGroup.name.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_group_by_id(
        self,
        group_id: uuid.UUID,
        *,
        include_members: bool = False,
    ) -> StudentGroup | None:
        stmt = select(StudentGroup).where(
            StudentGroup.id == group_id,
            StudentGroup.is_deleted.is_(False),
        )
        if include_members:
            stmt = stmt.options(selectinload(StudentGroup.members))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_student_group_for_assessment(
        self,
        *,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        include_members: bool = False,
    ) -> StudentGroup | None:
        stmt = (
            select(StudentGroup)
            .join(StudentGroupMember, StudentGroupMember.group_id == StudentGroup.id)
            .where(
                StudentGroup.assessment_id == assessment_id,
                StudentGroupMember.student_id == student_id,
                StudentGroup.is_deleted.is_(False),
                StudentGroupMember.is_deleted.is_(False),
            )
        )
        if include_members:
            stmt = stmt.options(selectinload(StudentGroup.members))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_member_record(
        self,
        *,
        group_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> StudentGroupMember | None:
        result = await self.db.execute(
            select(StudentGroupMember).where(
                StudentGroupMember.group_id == group_id,
                StudentGroupMember.student_id == student_id,
                StudentGroupMember.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def list_members(self, group_id: uuid.UUID) -> list[StudentGroupMember]:
        result = await self.db.execute(
            select(StudentGroupMember)
            .where(
                StudentGroupMember.group_id == group_id,
                StudentGroupMember.is_deleted.is_(False),
            )
            .order_by(StudentGroupMember.created_at.asc())
        )
        return list(result.scalars().all())

    async def remove_groups_for_assessment(self, assessment_id: uuid.UUID) -> None:
        # Hard-delete draft groups so the assessment-level unique constraint on
        # (assessment_id, name) does not block legitimate regeneration/rebuilds.
        await self.db.execute(
            delete(StudentGroup).where(StudentGroup.assessment_id == assessment_id)
        )

    async def hard_delete_group_members(self, group_id: uuid.UUID) -> None:
        await self.db.execute(
            delete(StudentGroupMember).where(StudentGroupMember.group_id == group_id)
        )

    async def set_group_status(
        self,
        *,
        group_id: uuid.UUID,
        status: StudentGroupStatus,
        is_locked: bool | None = None,
    ) -> None:
        values: dict[str, object] = {"status": status}
        if is_locked is not None:
            values["is_locked"] = is_locked
            values["locked_at"] = _utcnow() if is_locked else None
        if status == StudentGroupStatus.INVALIDATED:
            values["invalidated_at"] = _utcnow()
            values["is_locked"] = False
            values["locked_at"] = None
        await self.db.execute(
            update(StudentGroup)
            .where(StudentGroup.id == group_id)
            .values(**values)
        )

    async def invalidate_groups_for_assessment(self, assessment_id: uuid.UUID) -> int:
        result = await self.db.execute(
            update(StudentGroup)
            .where(
                StudentGroup.assessment_id == assessment_id,
                StudentGroup.is_deleted.is_(False),
            )
            .values(
                status=StudentGroupStatus.INVALIDATED,
                invalidated_at=_utcnow(),
                is_locked=False,
                locked_at=None,
            )
        )
        return result.rowcount

    async def lock_groups_for_assessment(self, assessment_id: uuid.UUID) -> int:
        result = await self.db.execute(
            update(StudentGroup)
            .where(
                StudentGroup.assessment_id == assessment_id,
                StudentGroup.is_deleted.is_(False),
            )
            .values(
                status=StudentGroupStatus.LOCKED,
                is_locked=True,
                locked_at=_utcnow(),
            )
        )
        return result.rowcount

    async def count_members(self, group_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(StudentGroupMember.id)).where(
                StudentGroupMember.group_id == group_id,
                StudentGroupMember.is_deleted.is_(False),
            )
        )
        return result.scalar_one()

    async def list_target_student_ids(self, assessment_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.db.execute(
            select(StudentEnrollment.student_id)
            .join(
                AssessmentTargetSection,
                AssessmentTargetSection.class_section_id == StudentEnrollment.class_section_id,
            )
            .where(
                AssessmentTargetSection.assessment_id == assessment_id,
                AssessmentTargetSection.is_deleted.is_(False),
                StudentEnrollment.enrollment_status == EnrollmentStatus.ACTIVE,
                StudentEnrollment.is_deleted.is_(False),
            )
            .distinct()
        )
        return list(result.scalars().all())

    async def student_belongs_to_any_group(
        self,
        *,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> bool:
        result = await self.db.execute(
            select(StudentGroupMember.id)
            .join(StudentGroup, StudentGroup.id == StudentGroupMember.group_id)
            .where(
                StudentGroup.assessment_id == assessment_id,
                StudentGroupMember.student_id == student_id,
                StudentGroup.is_deleted.is_(False),
                StudentGroupMember.is_deleted.is_(False),
            )
            .limit(1)
        )
        return result.scalar_one_or_none() is not None
