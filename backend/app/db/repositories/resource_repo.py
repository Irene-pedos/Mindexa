"""
app/db/repositories/resource_repo.py

Repository for student resources and lecturer materials.
"""

import uuid
from typing import List, Optional

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.resource import LecturerMaterial, StudentResource
from app.db.repositories.base import BaseRepository


class ResourceRepository(BaseRepository[LecturerMaterial]):
    def __init__(self, db: AsyncSession) -> None:
        super().__init__(LecturerMaterial, db)

    # ── Lecturer Materials ──────────────────────────────────────────────────

    async def list_materials_by_workspace(
        self, workspace_id: uuid.UUID, is_current: bool = True
    ) -> List[LecturerMaterial]:
        """List all current materials for a workspace."""
        stmt = select(LecturerMaterial).where(
            and_(
                LecturerMaterial.teaching_workspace_id == workspace_id,
                LecturerMaterial.is_current == is_current,
                LecturerMaterial.is_deleted == False,
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_materials_by_course(
        self, course_id: uuid.UUID, is_current: bool = True
    ) -> List[LecturerMaterial]:
        """List all current materials for a course (Admin view)."""
        stmt = select(LecturerMaterial).where(
            and_(
                LecturerMaterial.course_id == course_id,
                LecturerMaterial.is_current == is_current,
                LecturerMaterial.is_deleted == False,
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_materials_by_assessment(
        self, assessment_id: uuid.UUID, is_current: bool = True
    ) -> List[LecturerMaterial]:
        """List all materials specifically linked to an assessment."""
        stmt = select(LecturerMaterial).where(
            and_(
                LecturerMaterial.assessment_id == assessment_id,
                LecturerMaterial.is_current == is_current,
                LecturerMaterial.is_deleted == False,
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_material_by_id(self, material_id: uuid.UUID) -> Optional[LecturerMaterial]:
        """Fetch a single material by ID."""
        return await self.get_by_id(material_id)

    async def get_latest_material_by_filename(
        self, workspace_id: uuid.UUID, original_filename: str
    ) -> Optional[LecturerMaterial]:
        """Fetch the most recent material matching a filename in a workspace."""
        stmt = (
            select(LecturerMaterial)
            .where(
                and_(
                    LecturerMaterial.teaching_workspace_id == workspace_id,
                    LecturerMaterial.original_filename == original_filename,
                    LecturerMaterial.is_deleted == False,
                )
            )
            .order_by(LecturerMaterial.version.desc(), LecturerMaterial.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_superseded_material_ids(
        self, workspace_id: uuid.UUID, original_filename: str
    ) -> List[uuid.UUID]:
        """Get IDs of all existing versions of a file in a workspace."""
        stmt = select(LecturerMaterial.id).where(
            and_(
                LecturerMaterial.teaching_workspace_id == workspace_id,
                LecturerMaterial.original_filename == original_filename,
                LecturerMaterial.is_deleted == False,
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def mark_superseded(
        self, workspace_id: uuid.UUID, original_filename: str
    ) -> List[uuid.UUID]:
        """Mark old versions of a file as not current within a workspace and return their IDs."""
        from sqlalchemy import update

        stmt_select = select(LecturerMaterial.id).where(
            and_(
                LecturerMaterial.teaching_workspace_id == workspace_id,
                LecturerMaterial.original_filename == original_filename,
                LecturerMaterial.is_current == True,
            )
        )
        res = await self.db.execute(stmt_select)
        superseded_ids = list(res.scalars().all())

        if superseded_ids:
            stmt = (
                update(LecturerMaterial)
                .where(LecturerMaterial.id.in_(superseded_ids))
                .values(is_current=False)
            )
            await self.db.execute(stmt)

        return superseded_ids

    # ── Student Resources ────────────────────────────────────────────────────

    async def create_student_resource(self, resource: StudentResource) -> StudentResource:
        self.db.add(resource)
        await self.db.flush()
        return resource

    async def get_student_resource(self, resource_id: uuid.UUID) -> Optional[StudentResource]:
        stmt = select(StudentResource).where(
            and_(
                StudentResource.id == resource_id,
                StudentResource.is_deleted == False,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_student_resources(self, student_id: uuid.UUID) -> List[StudentResource]:
        stmt = select(StudentResource).where(
            and_(
                StudentResource.student_id == student_id,
                StudentResource.is_deleted == False,
            )
        ).order_by(StudentResource.created_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_student_resource(self, resource_id: uuid.UUID) -> bool:
        from sqlalchemy import update
        stmt = (
            update(StudentResource)
            .where(StudentResource.id == resource_id)
            .values(is_deleted=True, deleted_at=func.now())
        )
        result = await self.db.execute(stmt)
        return result.rowcount > 0

