from __future__ import annotations

import uuid
from typing import List, Tuple
from sqlalchemy import func, select, or_, and_, exists, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.academic import TeachingWorkspace, ClassSection, StudentEnrollment, TeachingAssignment, Course, ClassGroup
from app.db.models.auth import User
from app.db.enums import EnrollmentStatus

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
                selectinload(TeachingWorkspace.teaching_assignment)
                .selectinload(TeachingAssignment.lecturer)
                .selectinload(User.profile)
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_by_student(
        self, student_id: uuid.UUID
    ) -> List[TeachingWorkspace]:
        """List all workspaces a student is enrolled in (section-specific or global)."""
        # A student sees workspaces that:
        # 1) Direct: Workspace has class_section_id and student is active in that section
        # 2) Global: Workspace has class_section_id is Null, student is active in a section
        #    that belongs to the workspace's assignment department (and option if option_id is set).
        stmt = (
            select(TeachingWorkspace)
            .join(TeachingAssignment, TeachingAssignment.id == TeachingWorkspace.teaching_assignment_id)
            .where(
                TeachingWorkspace.is_deleted == False,
                or_(
                    # Direct link
                    exists().where(
                        and_(
                            StudentEnrollment.student_id == student_id,
                            StudentEnrollment.class_section_id == TeachingWorkspace.class_section_id,
                            StudentEnrollment.enrollment_status == EnrollmentStatus.ACTIVE.value,
                            StudentEnrollment.is_deleted == False
                        )
                    ),
                    # Global/course-wide link
                    and_(
                        TeachingWorkspace.class_section_id == None,
                        exists().where(
                            and_(
                                StudentEnrollment.student_id == student_id,
                                StudentEnrollment.enrollment_status == EnrollmentStatus.ACTIVE.value,
                                StudentEnrollment.is_deleted == False,
                                exists().where(
                                    and_(
                                        ClassSection.id == StudentEnrollment.class_section_id,
                                        ClassSection.department_id == TeachingAssignment.department_id,
                                        ClassSection.is_active == True,
                                        or_(
                                            TeachingAssignment.option_id == None,
                                            exists().where(
                                                and_(
                                                    ClassGroup.id == ClassSection.class_group_id,
                                                    ClassGroup.option_id == TeachingAssignment.option_id
                                                )
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            )
            .options(
                selectinload(TeachingWorkspace.course).selectinload(Course.institution),
                selectinload(TeachingWorkspace.class_section),
                selectinload(TeachingWorkspace.academic_period),
                selectinload(TeachingWorkspace.teaching_assignment)
                .selectinload(TeachingAssignment.lecturer)
                .selectinload(User.profile)
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
                selectinload(TeachingWorkspace.class_section).selectinload(ClassSection.department),
                selectinload(TeachingWorkspace.class_section).selectinload(ClassSection.class_group).selectinload(ClassGroup.option),
                selectinload(TeachingWorkspace.academic_period),
                selectinload(TeachingWorkspace.teaching_assignment)
                .selectinload(TeachingAssignment.lecturer)
                .selectinload(User.profile)
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, workspace: TeachingWorkspace) -> TeachingWorkspace:
        self.db.add(workspace)
        await self.db.flush()
        return workspace

    async def resolve_workspace_sections(self, workspace_id: uuid.UUID) -> List[ClassSection]:
        """Resolve all active class sections linked to this workspace."""
        ws = await self.get_by_id(workspace_id)
        if not ws:
            return []
            
        if ws.class_section_id:
            stmt = (
                select(ClassSection)
                .where(ClassSection.id == ws.class_section_id, ClassSection.is_active == True)
                .options(
                    selectinload(ClassSection.department),
                    selectinload(ClassSection.class_group).selectinload(ClassGroup.option)
                )
            )
            result = await self.db.execute(stmt)
            return list(result.scalars().all())
        else:
            ta = ws.teaching_assignment
            stmt = (
                select(ClassSection)
                .where(
                    ClassSection.department_id == ta.department_id,
                    ClassSection.is_active == True
                )
            )
            if ta.option_id:
                stmt = (
                    stmt.join(ClassGroup, ClassGroup.id == ClassSection.class_group_id)
                    .where(ClassGroup.option_id == ta.option_id)
                )
            stmt = stmt.options(
                selectinload(ClassSection.department),
                selectinload(ClassSection.class_group).selectinload(ClassGroup.option)
            )
            result = await self.db.execute(stmt)
            return list(result.scalars().all())

    async def get_student_count(self, workspace_id: uuid.UUID) -> int:
        """Count students enrolled in this workspace (section-specific or global)."""
        sections = await self.resolve_workspace_sections(workspace_id)
        if not sections:
            return 0
        section_ids = [s.id for s in sections]
        result = await self.db.execute(
            select(func.count(StudentEnrollment.id))
            .where(
                StudentEnrollment.class_section_id.in_(section_ids),
                StudentEnrollment.enrollment_status == EnrollmentStatus.ACTIVE.value,
                StudentEnrollment.is_deleted == False
            )
        )
        return result.scalar_one()

