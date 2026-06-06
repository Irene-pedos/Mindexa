"""
tests/unit/test_group_appeals.py

Unit tests for group appeal consensus logic.
"""

from __future__ import annotations

import uuid
import pytest
from app.services.group_work_service import GroupWorkService
from app.db.enums import (
    AssessmentStatus, 
    AssessmentType, 
    UserRole, 
    GroupSubmissionStatus,
    GroupApprovalStatus,
    GroupActivityType,
    GroupAppealStatus
)
from app.db.models.assessment import Assessment
from app.db.models.auth import User
from app.db.models.attempt import GroupSubmission, StudentGroup, StudentGroupMember, GroupAppeal
from app.core.exceptions import ValidationError, AuthorizationError

@pytest.mark.asyncio
class TestGroupAppeals:

    async def _setup_context(self, db):
        lecturer = User(email=f"lec_{uuid.uuid4().hex[:6]}@test.ac", hashed_password="...", role=UserRole.LECTURER)
        db.add(lecturer)
        await db.flush()
        
        from app.db.models.academic import TeachingWorkspace
        workspace = TeachingWorkspace(
            lecturer_id=lecturer.id,
            class_section_id=uuid.uuid4(),
            academic_period_id=uuid.uuid4(),
            course_id=uuid.uuid4(),
            title="Test Appeals Workspace"
        )
        db.add(workspace)
        await db.flush()

        assessment = Assessment(
            title="Test Appeals",
            assessment_type=AssessmentType.SUMMATIVE,
            status=AssessmentStatus.PUBLISHED,
            created_by_id=lecturer.id,
            teaching_workspace_id=workspace.id,
            is_group_assessment=True,
            passing_marks=50
        )
        db.add(assessment)
        await db.flush()
        
        group = StudentGroup(assessment_id=assessment.id, name="Team B", is_locked=True)
        db.add(group)
        await db.flush()
        
        s1 = User(email=f"s1_{uuid.uuid4().hex[:6]}@test.ac", hashed_password="...", role=UserRole.STUDENT)
        s2 = User(email=f"s2_{uuid.uuid4().hex[:6]}@test.ac", hashed_password="...", role=UserRole.STUDENT)
        db.add(s1); db.add(s2)
        await db.flush()
        
        m1 = StudentGroupMember(group_id=group.id, student_id=s1.id, is_leader=True)
        m2 = StudentGroupMember(group_id=group.id, student_id=s2.id, is_leader=False)
        db.add(m1); db.add(m2)
        await db.flush()
        
        submission = GroupSubmission(assessment_id=assessment.id, group_id=group.id, status=GroupSubmissionStatus.GRADED, score=40)
        db.add(submission)
        await db.commit()
        
        return assessment, group, submission, s1, s2, lecturer

    async def test_appeal_initiation_awaits_consensus(self, db):
        """Verify that an appeal is NOT submitted to lecturer until all members approve."""
        assessment, group, submission, s1, s2, lecturer = await self._setup_context(db)
        svc = GroupWorkService(db)
        
        from app.schemas.group_work import CreateGroupAppealRequest, ApproveGroupAppealRequest
        
        # S1 initiates appeal
        appeal_resp = await svc.create_group_appeal(
            assessment_id=assessment.id,
            submission_id=submission.id,
            student_id=s1.id,
            data=CreateGroupAppealRequest(statement="We deserve more marks.")
        )
        
        assert appeal_resp.status == GroupAppealStatus.PENDING_MEMBER_APPROVAL
        
        # S1 approves their own appeal automatically (handled in service or manually)
        await svc.approve_group_appeal(
            assessment_id=assessment.id,
            appeal_id=appeal_resp.id,
            student_id=s1.id,
            data=ApproveGroupAppealRequest(approve=True)
        )
        
        # Reload appeal
        appeal_db = await svc.appeal_repo.get_by_id(appeal_resp.id)
        assert appeal_db.status == GroupAppealStatus.PENDING_MEMBER_APPROVAL # Still pending because S2 hasn't approved
        
        # S2 approves
        await svc.approve_group_appeal(
            assessment_id=assessment.id,
            appeal_id=appeal_resp.id,
            student_id=s2.id,
            data=ApproveGroupAppealRequest(approve=True)
        )
        
        # Now it should be submitted
        appeal_db = await svc.appeal_repo.get_by_id(appeal_resp.id)
        assert appeal_db.status == GroupAppealStatus.SUBMITTED_TO_LECTURER

    async def test_reassessment_only_for_failing_groups(self, db):
        """Verify that reassessment cannot be assigned to a passing group."""
        assessment, group, submission, s1, s2, lecturer = await self._setup_context(db)
        svc = GroupWorkService(db)
        
        # Change submission to passing
        submission.total_score = 80
        await db.commit()
        
        from app.core.exceptions import ConflictError
        with pytest.raises(ConflictError) as exc:
            await svc.assign_group_reassessment(
                assessment_id=assessment.id,
                submission_id=submission.id,
                current_user=lecturer
            )
        assert exc.value.code == "GROUP_NOT_ELIGIBLE_FOR_REASSESSMENT"
