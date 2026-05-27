"""
tests/integration/test_group_reassessment_flow.py

Integration tests for the reassessment assignment flow for failing groups.
"""

from __future__ import annotations

import uuid
import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from app.db.enums import (
    AssessmentStatus, 
    AssessmentType, 
    GroupSubmissionStatus
)
from app.db.models.assessment import Assessment
from app.db.models.auth import User
from app.db.models.attempt import GroupSubmission, StudentGroup, StudentGroupMember
from app.core.constants import UserRole

@pytest.mark.asyncio
class TestGroupReassessmentFlow:

    async def _setup_data(self, db):
        lecturer = User(
            email=f"lec_re_{uuid.uuid4().hex[:6]}@test.ac", 
            hashed_password="...", 
            role=UserRole.LECTURER,
            email_verified=True
        )
        db.add(lecturer)
        await db.flush()
        
        assessment = Assessment(
            title="Original Assessment",
            assessment_type=AssessmentType.SUMMATIVE,
            status=AssessmentStatus.PUBLISHED,
            created_by_id=lecturer.id,
            is_group_assessment=True,
            total_marks=100,
            passing_marks=50
        )
        db.add(assessment)
        await db.flush()
        
        group = StudentGroup(assessment_id=assessment.id, name="Failing Team", is_locked=True)
        db.add(group)
        await db.flush()
        
        submission = GroupSubmission(
            assessment_id=assessment.id, 
            group_id=group.id, 
            status=GroupSubmissionStatus.GRADED,
            total_score=30 # Failing
        )
        db.add(submission)
        await db.commit()
        
        return assessment, group, submission, lecturer

    async def test_assign_reassessment_flow(self, client: AsyncClient, db, make_auth_headers):
        """Verify that a lecturer can assign a reassessment to a failing group."""
        assessment, group, submission, lecturer = await self._setup_data(db)
        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)
        
        response = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/assign-reassessment?assessment_id={assessment.id}",
            headers=headers
        )
        
        assert response.status_code == 200
        new_assessment_id = response.json()
        assert isinstance(new_assessment_id, str)
        
        # Check original submission status
        await db.refresh(submission)
        assert submission.status == GroupSubmissionStatus.REASSESSMENT_ASSIGNED
        
        # Check new assessment creation
        res = await db.execute(
            sa.text(f"SELECT title, assessment_type, reassessment_of_id FROM assessment WHERE id = '{new_assessment_id}'")
        )
        new_assessment = res.first()
        assert "Reassessment" in new_assessment[0]
        assert new_assessment[1] == "REASSESSMENT"
        assert str(new_assessment[2]) == str(assessment.id)
