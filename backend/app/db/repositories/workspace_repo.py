from __future__ import annotations

import uuid
from typing import List, Tuple
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.academic import TeachingWorkspace, ClassSection, StudentEnrollment, TeachingAssignment, Course

class WorkspaceRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_by_lecturer(
        self, lecturer_id: uuid.UUID
    ) -> List[TeachingWorkspace]:
        """List all operational workspaces for a lecturer."""
        stmt = (
            select(TeachingWorkspace)
            .join(TeachingAssignment, TeachingAssignment.id == TeachingWorkspace.teaching_assignment_id)
            .where(
                TeachingAssignment.lecturer_id == lecturer_id,
                TeachingWorkspace.is_deleted == False
            )
            .options(
                selectinload(TeachingWorkspace.course).selectinload(Course.institution),
                selectinload(TeachingWorkspace.class_section),
                selectinload(TeachingWorkspace.academic_period),
                selectinload(TeachingWorkspace.teaching_assignment).selectinload(TeachingAssignment.lecturer)
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_by_student(
        self, student_id: uuid.UUID
    ) -> List[TeachingWorkspace]:
        """List all workspaces a student is enrolled in."""
        stmt = (
            select(TeachingWorkspace)
            .join(ClassSection, ClassSection.id == TeachingWorkspace.class_section_id)
            .join(StudentEnrollment, StudentEnrollment.class_section_id == ClassSection.id)
            .where(
                StudentEnrollment.student_id == student_id,
                StudentEnrollment.is_deleted == False,
                TeachingWorkspace.is_deleted == False
            )
            .options(
                selectinload(TeachingWorkspace.course).selectinload(Course.institution),
                selectinload(TeachingWorkspace.class_section),
                selectinload(TeachingWorkspace.academic_period),
                selectinload(TeachingWorkspace.teaching_assignment).selectinload(TeachingAssignment.lecturer)
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, workspace_id: uuid.UUID) -> TeachingWorkspace | None:
        stmt = (
            select(TeachingWorkspace)
            .where(TeachingWorkspace.id == workspace_id, TeachingWorkspace.is_deleted == False)
            .options(
                selectinload(TeachingWorkspace.course).selectinload(Course.institution),
                selectinload(TeachingWorkspace.class_section),
                selectinload(TeachingWorkspace.academic_period),
                selectinload(TeachingWorkspace.teaching_assignment).selectinload(TeachingAssignment.lecturer)
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, workspace: TeachingWorkspace) -> TeachingWorkspace:
        self.db.add(workspace)
        await self.db.flush()
        return workspace

    async def get_student_count(self, workspace_id: uuid.UUID) -> int:
        """Count students enrolled in the specific section of this workspace."""
        result = await self.db.execute(
            select(func.count(StudentEnrollment.id))
            .join(ClassSection, ClassSection.id == StudentEnrollment.class_section_id)
            .join(TeachingWorkspace, TeachingWorkspace.class_section_id == ClassSection.id)
            .where(
                TeachingWorkspace.id == workspace_id,
                StudentEnrollment.is_deleted == False
            )
        )
        return result.scalar_one()
