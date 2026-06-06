"""
tests/unit/test_group_work_service.py

Unit tests for GroupWorkService complex scenarios.
"""

from __future__ import annotations

import uuid
import pytest
from unittest.mock import AsyncMock
from app.services.group_work_service import GroupWorkService
from app.db.enums import (
    AssessmentStatus, 
    AssessmentType, 
    UserRole, 
    QuestionDistributionMode
)
from app.db.models.assessment import Assessment
from app.db.models.auth import User
from app.db.models.attempt import StudentGroup, StudentGroupMember
from app.schemas.group_work import SaveGroupAnswerRequest
from app.core.exceptions import ValidationError, AuthorizationError

@pytest.mark.asyncio
class TestGroupWorkServiceExtended:

    async def _setup_context(self, db):
        lecturer = User(email=f"lec_{uuid.uuid4().hex[:6]}@test.ac", hashed_password="...", role=UserRole.LECTURER)
        db.add(lecturer)
        await db.flush()
        
        from app.db.models.academic import TeachingWorkspace
        workspace = TeachingWorkspace(
            lecturer_id=lecturer.id,
            class_section_id=uuid.uuid4(), # Dummy
            academic_period_id=uuid.uuid4(), # Dummy
            course_id=uuid.uuid4(), # Dummy
            title="Test Workspace"
        )
        db.add(workspace)
        await db.flush()

        assessment = Assessment(
            title="Per Group Test",
            assessment_type=AssessmentType.SUMMATIVE,
            status=AssessmentStatus.PUBLISHED,
            created_by_id=lecturer.id,
            teaching_workspace_id=workspace.id,
            is_group_assessment=True,
            question_distribution_mode=QuestionDistributionMode.PER_GROUP
        )
        db.add(assessment)
        await db.flush()
        
        group = StudentGroup(assessment_id=assessment.id, name="Team C", is_locked=True)
        db.add(group)
        await db.flush()
        
        s1 = User(email=f"s1_{uuid.uuid4().hex[:6]}@test.ac", hashed_password="...", role=UserRole.STUDENT)
        db.add(s1)
        await db.flush()
        
        m1 = StudentGroupMember(group_id=group.id, student_id=s1.id, is_leader=True)
        db.add(m1)
        await db.flush()
        
        await db.commit()
        return assessment, group, s1, lecturer

    async def test_per_group_question_validation(self, db):
        """Verify that a group cannot answer a question not assigned to them in PER_GROUP mode."""
        assessment, group, s1, lecturer = await self._setup_context(db)
        svc = GroupWorkService(db)
        
        # Setup another group
        group2 = StudentGroup(assessment_id=assessment.id, name="Team D", is_locked=True)
        db.add(group2)
        await db.flush()
        
        # Create a question for group 2
        from app.db.models.question import Question, AssessmentQuestion
        from app.db.enums import QuestionType as DbQuestionType, QuestionAddedVia
        q = Question(
            content="Q for Group 2", 
            question_type=DbQuestionType.SHORT_ANSWER, 
            marks=10,
            created_by_id=lecturer.id
        )
        db.add(q)
        await db.flush()
        
        aq = AssessmentQuestion(
            assessment_id=assessment.id, 
            question_id=q.id, 
            order_index=0, 
            added_via=QuestionAddedVia.MANUAL_WRITE,
            group_id=group2.id # Assigned to group 2
        )
        db.add(aq)
        await db.commit()
        
        # S1 (Group 1) tries to answer question assigned to Group 2
        submission, _ = await svc.submission_repo.get_or_create_submission(
            assessment_id=assessment.id, 
            group_id=group.id
        )
        
        with pytest.raises(ValidationError) as exc:
            await svc.save_group_answer(
                assessment_id=assessment.id,
                submission_id=submission.id,
                question_id=q.id,
                student_id=s1.id,
                data=SaveGroupAnswerRequest(answer_content={"text": "Hello"}, change_source="manual_edit")
            )
        assert exc.value.code == "QUESTION_NOT_FOR_GROUP"
