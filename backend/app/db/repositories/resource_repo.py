"""
app/db/repositories/resource_repo.py

Repository for student resources and lecturer materials.
"""

import uuid
from typing import List, Optional

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.resource import LecturerMaterial, StudentResource
from app.db.models.resource_chunk import ResourceChunk
from app.db.repositories.base import BaseRepository


class ResourceRepository(BaseRepository[LecturerMaterial]):
    def __init__(self, db: AsyncSession) -> None:
        super().__init__(LecturerMaterial, db)

    # ── Indexed chunks (what the RAG pipeline actually writes) ──────────────

    async def get_academic_resource_id(
        self, kind: str, source_id: uuid.UUID
    ) -> Optional[uuid.UUID]:
        """AcademicResource backing a lecturer material / student resource, if it was indexed."""
        model = LecturerMaterial if kind == "lecturer_material" else StudentResource
        stmt = select(model.academic_resource_id).where(
            and_(model.id == source_id, model.is_deleted == False)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def soft_delete_chunks(self, academic_resource_id: uuid.UUID) -> int:
        """Soft-delete every live chunk of a document; returns how many were retired.

        Used when a document is re-processed (so chunks are not duplicated) and when its
        owner deletes it (so the deleted text can no longer be retrieved).
        """
        from sqlalchemy import update

        stmt = (
            update(ResourceChunk)
            .where(
                ResourceChunk.resource_id == academic_resource_id,
                ResourceChunk.is_deleted == False,
            )
            .values(is_deleted=True, deleted_at=func.now())
        )
        return (await self.db.execute(stmt)).rowcount or 0

    async def list_source_chunks(
        self,
        academic_resource_id: uuid.UUID,
        *,
        page: Optional[int] = None,
        limit: int = 25,
    ) -> List[ResourceChunk]:
        """Live chunks of an indexed document in reading order, optionally for one page only."""
        stmt = select(ResourceChunk).where(
            and_(
                ResourceChunk.resource_id == academic_resource_id,
                ResourceChunk.is_deleted == False,
            )
        )
        if page is not None:
            stmt = stmt.where(ResourceChunk.metadata_json["page"].astext == str(page))
        stmt = stmt.order_by(ResourceChunk.chunk_index.asc()).limit(limit)
        return list((await self.db.execute(stmt)).scalars().all())

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

    async def student_resource_usage(self, student_id: uuid.UUID) -> tuple[int, int]:
        """(file count, total bytes) of the student's live uploads, for quota enforcement."""
        from sqlalchemy import func

        stmt = select(
            func.count(StudentResource.id),
            func.coalesce(func.sum(StudentResource.file_size_bytes), 0),
        ).where(
            and_(
                StudentResource.student_id == student_id,
                StudentResource.is_deleted == False,
            )
        )
        count, total = (await self.db.execute(stmt)).one()
        return int(count), int(total)

    async def delete_student_resource(self, resource_id: uuid.UUID) -> bool:
        from sqlalchemy import update
        stmt = (
            update(StudentResource)
            .where(StudentResource.id == resource_id)
            .values(is_deleted=True, deleted_at=func.now())
        )
        result = await self.db.execute(stmt)
        return result.rowcount > 0

