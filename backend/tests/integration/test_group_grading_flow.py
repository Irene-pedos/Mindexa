"""
tests/integration/test_group_grading_flow.py

Integration tests for the lecturer grading flow of group assessments.
"""

from __future__ import annotations

import uuid
import pytest
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
class TestGroupGradingFlow:

    async def _setup_data(self, db):
        from app.db.models.academic import (
            Institution, AcademicPeriod, Department, Option, Course, 
            ClassGroup, ClassSection, TeachingAssignment, TeachingWorkspace
        )
        from app.db.enums import AcademicPeriodType, LecturerAssignmentRole
        from datetime import date

        inst = Institution(name="Grading Inst", code="GINST")
        db.add(inst); await db.flush()

        period = AcademicPeriod(
            institution_id=inst.id, name="G Period", 
            period_type=AcademicPeriodType.SEMESTER, 
            start_date=date(2026,1,1), end_date=date(2026,12,31)
        )
        db.add(period); await db.flush()

        dept = Department(institution_id=inst.id, name="G Dept", code="GDEPT")
        db.add(dept); await db.flush()

        opt = Option(department_id=dept.id, name="G Option", code="GOPT")
        db.add(opt); await db.flush()

        course = Course(
            institution_id=inst.id, academic_period_id=period.id, 
            name="G Course", code="GCODE", academic_year="2026"
        )
        db.add(course); await db.flush()

        cg = ClassGroup(course_id=course.id, name="G Group", code="GG", option_id=opt.id)
        db.add(cg); await db.flush()

        cs = ClassSection(course_id=course.id, class_group_id=cg.id, name="G Section")
        db.add(cs); await db.flush()

        lecturer = User(
            email=f"lec_grading_{uuid.uuid4().hex[:6]}@test.ac", 
            hashed_password="...", 
            role=UserRole.LECTURER,
            email_verified=True
        )
        db.add(lecturer); await db.flush()

        assignment = TeachingAssignment(
            lecturer_id=lecturer.id, institution_id=inst.id, department_id=dept.id,
            course_id=course.id, academic_period_id=period.id, academic_year="2026",
            role=LecturerAssignmentRole.MAIN_LECTURER, class_section_id=cs.id, option_id=opt.id
        )
        db.add(assignment); await db.flush()

        workspace = TeachingWorkspace(
            teaching_assignment_id=assignment.id, course_id=course.id,
            class_section_id=cs.id, academic_period_id=period.id,
            title="G Workspace", created_by_id=lecturer.id
        )
        db.add(workspace); await db.flush()

        assessment = Assessment(
            title="Grading Test",
            assessment_type=AssessmentType.SUMMATIVE,
            status=AssessmentStatus.PUBLISHED,
            created_by_id=lecturer.id,
            teaching_workspace_id=workspace.id,
            course_id=course.id,
            academic_year="2026",
            is_group_assessment=True,
            total_marks=100
        )
        db.add(assessment); await db.flush()

        group = StudentGroup(assessment_id=assessment.id, name="Grading Team", is_locked=True)
        db.add(group); await db.flush()

        submission = GroupSubmission(
            assessment_id=assessment.id, 
            group_id=group.id, 
            status=GroupSubmissionStatus.SUBMITTED
        )
        db.add(submission); await db.commit()

        return assessment, group, submission, lecturer

        db.add(submission)
        await db.commit()
        
        return assessment, group, submission, lecturer

    async def test_lecturer_grades_group_submission(self, client: AsyncClient, db, make_auth_headers):
        """Verify that a lecturer can grade a submitted group work."""
        assessment, group, submission, lecturer = await self._setup_data(db)
        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)
        
        payload = {
            "total_score": 85.5,
            "max_score": 100,
            "feedback": "Excellent teamwork and clear analysis."
        }
        
        response = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/grade?assessment_id={assessment.id}",
            json=payload,
            headers=headers
        )
        
        assert response.status_code == 204
        
        # Check database
        await db.refresh(submission)
        assert submission.status == GroupSubmissionStatus.GRADED
        assert submission.total_score == 85.5
        assert submission.feedback == "Excellent teamwork and clear analysis."

    async def test_lecturer_releases_results(self, client: AsyncClient, db, make_auth_headers):
        """Verify that results can be released after grading."""
        assessment, group, submission, lecturer = await self._setup_data(db)
        
        # Setup as graded
        submission.status = GroupSubmissionStatus.GRADED
        submission.total_score = 85.5
        await db.commit()
        
        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)
        
        response = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/release-result?assessment_id={assessment.id}",
            headers=headers
        )
        
        assert response.status_code == 204
        
        # Check database
        await db.refresh(submission)
        assert submission.result_released_at is not None
