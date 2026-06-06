"""
tests/unit/test_group_generation.py

Unit tests for automatic group generation logic.
"""

from __future__ import annotations

import uuid
import pytest
from app.services.group_work_service import GroupWorkService
from app.db.enums import GroupAssignmentMode, AssessmentStatus, AssessmentType, UserRole, StudentGroupStatus
from app.db.models.assessment import Assessment
from app.db.models.auth import User, UserProfile
from app.db.models.academic import ClassGroup
from app.schemas.group_work import AutoGenerateGroupsRequest
from app.core.exceptions import ValidationError

@pytest.mark.asyncio
class TestGroupGeneration:

    async def _setup_assessment(self, db, lecturer):
        from app.db.models.academic import TeachingWorkspace
        workspace = TeachingWorkspace(
            lecturer_id=lecturer.id,
            class_section_id=uuid.uuid4(),
            academic_period_id=uuid.uuid4(),
            course_id=uuid.uuid4(),
            title="Generation Test Workspace"
        )
        db.add(workspace)
        await db.flush()

        assessment = Assessment(
            title="Test Group Assessment",
            assessment_type=AssessmentType.SUMMATIVE,
            status=AssessmentStatus.DRAFT,
            created_by_id=lecturer.id,
            teaching_workspace_id=workspace.id,
            is_group_assessment=True,
            max_group_size=4,
        )
        db.add(assessment)
        await db.commit()
        await db.refresh(assessment)
        return assessment

    async def _setup_students(self, db, count: int):
        students = []
        for i in range(count):
            user = User(
                email=f"student{i}_{uuid.uuid4().hex[:6]}@test.ac",
                hashed_password="...",
                role=UserRole.STUDENT,
            )
            db.add(user)
            await db.flush()
            students.append(user)
        await db.commit()
        return students

    async def _setup_lecturer(self, db):
        user = User(
            email=f"lecturer_{uuid.uuid4().hex[:6]}@test.ac",
            hashed_password="...",
            role=UserRole.LECTURER,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    async def test_auto_generate_exact_division(self, db):
        """Test generating groups when students divide evenly."""
        lecturer = await self._setup_lecturer(db)
        assessment = await self._setup_assessment(db, lecturer)
        students = await self._setup_students(db, 12)
        
        # We need to mock target student IDs because the repo fetches them from ClassSection links
        # For unit test, we can mock the repo method.
        svc = GroupWorkService(db)
        
        from unittest.mock import AsyncMock
        svc.group_repo.list_target_student_ids = AsyncMock(return_value=[s.id for s in students])
        
        data = AutoGenerateGroupsRequest(
            max_group_size=4,
            allow_smaller_final_group=True,
            naming_pattern="Group {index}"
        )
        
        groups = await svc.auto_generate_groups(
            assessment_id=assessment.id,
            current_user=lecturer,
            data=data
        )
        
        assert len(groups) == 3
        # In our implementation offset 0 is leader
        assert all(len(g.members) == 4 for g in groups)
        assert groups[0].name == "Group 1"
        assert groups[2].name == "Group 3"

    async def test_auto_generate_with_leftover(self, db):
        """Test generating groups when there's a remainder student."""
        lecturer = await self._setup_lecturer(db)
        assessment = await self._setup_assessment(db, lecturer)
        students = await self._setup_students(db, 13)
        
        svc = GroupWorkService(db)
        from unittest.mock import AsyncMock
        svc.group_repo.list_target_student_ids = AsyncMock(return_value=[s.id for s in students])
        
        data = AutoGenerateGroupsRequest(
            max_group_size=4,
            allow_smaller_final_group=True,
            naming_pattern="Group {index}"
        )
        
        groups = await svc.auto_generate_groups(
            assessment_id=assessment.id,
            current_user=lecturer,
            data=data
        )
        
        assert len(groups) == 4
        assert len(groups[3].members) == 1
        assert groups[3].name == "Group 4"

    async def test_auto_generate_fails_without_leftover_allowed(self, db):
        """Test that validation fails if uneven size is not allowed."""
        lecturer = await self._setup_lecturer(db)
        assessment = await self._setup_assessment(db, lecturer)
        students = await self._setup_students(db, 13)
        
        svc = GroupWorkService(db)
        from unittest.mock import AsyncMock
        svc.group_repo.list_target_student_ids = AsyncMock(return_value=[s.id for s in students])
        
        data = AutoGenerateGroupsRequest(
            max_group_size=4,
            allow_smaller_final_group=False,
            naming_pattern="Group {index}"
        )
        
        with pytest.raises(ValidationError) as exc:
            await svc.auto_generate_groups(
                assessment_id=assessment.id,
                current_user=lecturer,
                data=data
            )
        assert exc.value.code == "UNEVEN_GROUP_SIZE"
