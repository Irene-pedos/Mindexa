"""
tests/unit/test_group_submission_rules.py

Unit tests for group submission rules (participation and approval).
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
    GroupActivityType
)
from app.db.models.assessment import Assessment
from app.db.models.auth import User
from app.db.models.attempt import GroupSubmission, StudentGroup, StudentGroupMember, GroupSubmissionApproval
from app.core.exceptions import ValidationError, ConflictError

@pytest.mark.asyncio
class TestGroupSubmissionRules:

    async def _setup_context(self, db):
        lecturer = User(email=f"lec_{uuid.uuid4().hex[:6]}@test.ac", hashed_password="...", role=UserRole.LECTURER)
        db.add(lecturer)
        await db.flush()
        
        assessment = Assessment(
            title="Test Rules",
            assessment_type=AssessmentType.SUMMATIVE,
            status=AssessmentStatus.PUBLISHED,
            created_by_id=lecturer.id,
            is_group_assessment=True,
            require_all_member_participation=True,
            require_all_member_approval=True
        )
        db.add(assessment)
        await db.flush()
        
        group = StudentGroup(assessment_id=assessment.id, name="Team A", is_locked=True)
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
        
        submission = GroupSubmission(assessment_id=assessment.id, group_id=group.id, status=GroupSubmissionStatus.DRAFT)
        db.add(submission)
        await db.commit()
        
        return assessment, group, submission, s1, s2

    async def test_cannot_request_approval_without_participation(self, db):
        """Verify that a member cannot request approval if not all members participated."""
        assessment, group, submission, s1, s2 = await self._setup_context(db)
        svc = GroupWorkService(db)
        
        # No activity log yet -> Should fail
        with pytest.raises(ValidationError) as exc:
            await svc.request_submission_approval(
                assessment_id=assessment.id,
                submission_id=submission.id,
                student_id=s1.id
            )
        assert exc.value.code == "PARTICIPATION_REQUIRED"

    async def test_finalize_fails_without_all_approvals(self, db):
        """Verify that a leader cannot finalize if not everyone approved."""
        assessment, group, submission, s1, s2 = await self._setup_context(db)
        svc = GroupWorkService(db)
        
        # Mock all participated
        await svc.submission_repo.add_activity_log(submission_id=submission.id, student_id=s1.id, activity_type=GroupActivityType.ANSWER_EDITED)
        await svc.submission_repo.add_activity_log(submission_id=submission.id, student_id=s2.id, activity_type=GroupActivityType.ANSWER_EDITED)
        
        # Transition to READY_FOR_APPROVAL
        await svc.request_submission_approval(assessment_id=assessment.id, submission_id=submission.id, student_id=s1.id)
        
        # S1 approves, S2 is still PENDING
        from app.schemas.group_work import ApproveGroupSubmissionRequest, FinalizeGroupSubmissionRequest
        await svc.approve_submission(assessment_id=assessment.id, submission_id=submission.id, student_id=s1.id, data=ApproveGroupSubmissionRequest(status="APPROVED"))
        
        # Leader (S1) tries to finalize
        with pytest.raises(ConflictError) as exc:
            await svc.finalize_submission(
                assessment_id=assessment.id,
                submission_id=submission.id,
                student_id=s1.id,
                data=FinalizeGroupSubmissionRequest(confirm=True)
            )
        assert exc.value.code == "GROUP_SUBMISSION_NOT_READY"

    async def test_finalize_success_all_satisfied(self, db):
        """Verify successful finalization when all rules are met."""
        assessment, group, submission, s1, s2 = await self._setup_context(db)
        svc = GroupWorkService(db)
        
        # Mock all participated
        await svc.submission_repo.add_activity_log(submission_id=submission.id, student_id=s1.id, activity_type=GroupActivityType.ANSWER_EDITED)
        await svc.submission_repo.add_activity_log(submission_id=submission.id, student_id=s2.id, activity_type=GroupActivityType.ANSWER_EDITED)
        
        # Transition to READY_FOR_APPROVAL
        await svc.request_submission_approval(assessment_id=assessment.id, submission_id=submission.id, student_id=s1.id)
        
        # Both approve
        from app.schemas.group_work import ApproveGroupSubmissionRequest, FinalizeGroupSubmissionRequest
        await svc.approve_submission(assessment_id=assessment.id, submission_id=submission.id, student_id=s1.id, data=ApproveGroupSubmissionRequest(status="APPROVED"))
        await svc.approve_submission(assessment_id=assessment.id, submission_id=submission.id, student_id=s2.id, data=ApproveGroupSubmissionRequest(status="APPROVED"))
        
        # Leader (S1) finalizes
        await svc.finalize_submission(
            assessment_id=assessment.id,
            submission_id=submission.id,
            student_id=s1.id,
            data=FinalizeGroupSubmissionRequest(confirm=True)
        )
        
        # Check status
        await db.refresh(submission)
        assert submission.status == GroupSubmissionStatus.SUBMITTED
