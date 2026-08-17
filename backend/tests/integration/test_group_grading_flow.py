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

        cs = ClassSection(class_group_id=cg.id, name="G Section")
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

    async def test_lecturer_fetches_group_submission_workspace(self, client: AsyncClient, db, make_auth_headers):
        """Verify that a lecturer can fetch a group submission workspace for grading."""
        assessment, group, submission, lecturer = await self._setup_data(db)
        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        response = await client.get(
            f"/api/v1/grading/group-submission/{submission.id}",
            headers=headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["submission_id"] == str(submission.id)
        assert data["group_name"] == "Grading Team"
        assert "questions" in data
        assert "answers" in data

    async def test_lecturer_grades_single_question_in_group_work(self, client: AsyncClient, db, make_auth_headers):
        """Verify that a lecturer can score a single question in group SpeedGrader."""
        from app.db.models.question import Question, AssessmentQuestion
        from app.db.enums import QuestionType

        assessment, group, submission, lecturer = await self._setup_data(db)

        # Create a question and link to assessment
        q = Question(
            content="Discuss the role of ACID properties.",
            question_type=QuestionType.ESSAY,
            marks=20,
            created_by_id=lecturer.id,
        )
        db.add(q); await db.flush()
        aq = AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, order_index=0)
        db.add(aq); await db.commit()

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        payload = {
            "score": 18.5,
            "feedback": "Great explanation of Isolation and Durability.",
            "is_final": True,
        }

        response = await client.put(
            f"/api/v1/group-work/submissions/{submission.id}/questions/{q.id}/grade",
            json=payload,
            headers=headers,
        )

        assert response.status_code == 200
        ans_data = response.json()
        assert ans_data["score"] == 18.5
        assert ans_data["feedback"] == "Great explanation of Isolation and Durability."
        assert ans_data["is_final"] is True

    async def test_lecturer_triggers_ai_review_for_group_question(self, client: AsyncClient, db, make_auth_headers, monkeypatch):
        """Verify that a lecturer can trigger AI review on an open-ended group question."""
        from unittest.mock import AsyncMock, MagicMock
        from app.db.models.question import Question, AssessmentQuestion
        from app.db.enums import QuestionType
        from app.db.models.attempt import GroupSubmissionAnswer
        from app.agents.review_agent import ReviewAgentOutput
        from app.agents.feedback_agent import FeedbackAgentOutput

        assessment, group, submission, lecturer = await self._setup_data(db)

        # Create a question and existing group answer
        q = Question(
            content="Discuss ACID properties.",
            question_type=QuestionType.ESSAY,
            marks=10,
            created_by_id=lecturer.id,
        )
        db.add(q); await db.flush()
        aq = AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, order_index=0)
        db.add(aq)
        g_ans = GroupSubmissionAnswer(
            submission_id=submission.id,
            question_id=q.id,
            answer_content={"text": "Atomicity ensures all or nothing."},
        )
        db.add(g_ans)
        await db.commit()

        # Mock AI ReviewAgent and FeedbackAgent
        mock_review = AsyncMock(return_value=(
            ReviewAgentOutput(
                suggested_score=9.0,
                confidence=0.92,
                rationale="Comprehensive and accurate explanation.",
                is_correct=True,
                criteria_scores=[],
            ),
            "raw completion text",
        ))
        mock_feedback = AsyncMock(return_value=FeedbackAgentOutput(
            draft_feedback="Excellent explanation of database transaction principles.",
            strengths=["Clear concise definition"],
            areas_for_improvement=[],
            suggestions=[],
        ))

        monkeypatch.setattr("app.agents.review_agent.ReviewAgent.review_response", mock_review)
        monkeypatch.setattr("app.agents.feedback_agent.FeedbackAgent.draft_feedback", mock_feedback)

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        response = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/questions/{q.id}/ai-review",
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ai_grade_score"] == 9.0
        assert data["ai_grade_confidence"] == 0.92
        assert data["ai_feedback_draft"] == "Excellent explanation of database transaction principles."

