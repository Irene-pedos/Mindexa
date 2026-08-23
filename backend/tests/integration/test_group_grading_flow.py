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

        student = User(
            email=f"student_gw_{uuid.uuid4().hex[:6]}@test.ac", 
            hashed_password="...", 
            role=UserRole.STUDENT,
            email_verified=True,
        )
        db.add(student); await db.flush()

        gm = StudentGroupMember(
            group_id=group.id,
            student_id=student.id,
            is_leader=True,
        )
        db.add(gm); await db.flush()

        from app.db.models.academic import StudentEnrollment
        from app.db.enums import EnrollmentStatus
        enr = StudentEnrollment(
            student_id=student.id,
            course_id=course.id,
            class_section_id=cs.id,
            enrollment_status=EnrollmentStatus.ACTIVE,
        )
        db.add(enr); await db.flush()

        submission = GroupSubmission(
            assessment_id=assessment.id, 
            group_id=group.id, 
            status=GroupSubmissionStatus.SUBMITTED
        )
        db.add(submission); await db.commit()

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

        # Verify derived AssessmentResult row was created for the group member
        from app.db.repositories.result_repo import ResultRepository
        result_repo = ResultRepository(db)
        derived_results = await result_repo.list_by_group_submission(submission.id)
        assert len(derived_results) >= 1
        res = derived_results[0]
        assert res.total_score == 18.5
        assert res.max_score == 100.0 or res.max_score == 20.0
        assert res.letter_grade is not None

        # Release the result
        rel_resp = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/release-result?assessment_id={assessment.id}",
            headers=headers,
        )
        assert rel_resp.status_code == 204

        # Student fetches the released result
        student_headers = make_auth_headers(user_id=str(res.student_id), role=UserRole.STUDENT)
        student_res = await client.get(
            f"/api/v1/results/attempt/{res.id}",
            headers=student_headers,
        )
        assert student_res.status_code == 200
        student_data = student_res.json()
        assert len(student_data["breakdowns"]) >= 1
        bd = student_data["breakdowns"][0]
        assert bd["score"] == 18.5
        assert bd["feedback"] == "Great explanation of Isolation and Durability."
        assert bd["question_text"] == "Discuss the role of ACID properties."

    async def test_lecturer_grades_group_question_score_out_of_range_rejected(self, client: AsyncClient, db, make_auth_headers):
        """Verify that scoring a group question with a score exceeding max marks or negative is rejected."""
        from app.db.models.question import Question, AssessmentQuestion
        from app.db.enums import QuestionType

        assessment, group, submission, lecturer = await self._setup_data(db)

        # Create a question with 10 marks linked to assessment
        q = Question(
            content="Explain CAP theorem.",
            question_type=QuestionType.ESSAY,
            marks=10,
            created_by_id=lecturer.id,
        )
        db.add(q); await db.flush()
        aq = AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, order_index=0)
        db.add(aq); await db.commit()

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        # 1. Score exceeding question marks (50 > 10)
        res_high = await client.put(
            f"/api/v1/group-work/submissions/{submission.id}/questions/{q.id}/grade",
            json={"score": 50.0, "feedback": "Too high", "is_final": True},
            headers=headers,
        )
        assert res_high.status_code in (400, 422)

        # 2. Negative score
        res_neg = await client.put(
            f"/api/v1/group-work/submissions/{submission.id}/questions/{q.id}/grade",
            json={"score": -5.0, "feedback": "Negative", "is_final": True},
            headers=headers,
        )
        assert res_neg.status_code in (400, 422)

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
        assert data["ai_grade_decision"] in ("PROCESSING", "SUGGESTED")

        # Execute background AI evaluation job
        from app.services.group_work_service import GroupWorkService
        from app.services.grading_service import GradingService
        await GroupWorkService(db).process_ai_grading_for_single_question(
            submission_id=submission.id,
            question_id=q.id,
            grading_service=GradingService(db),
        )
        await db.commit()

        ws_res = await client.get(
            f"/api/v1/grading/group-submission/{submission.id}",
            headers=headers,
        )
        assert ws_res.status_code == 200
        ws_data = ws_res.json()
        eval_ans = next(a for a in ws_data["answers"] if a["question_id"] == str(q.id))
        assert eval_ans["ai_grade_score"] == 9.0
        assert eval_ans["ai_grade_confidence"] == 0.92
        assert eval_ans["ai_feedback_draft"] == "Excellent explanation of database transaction principles."

    async def test_rubric_context_and_serialization_with_attached_rubric(self, client: AsyncClient, db, make_auth_headers, monkeypatch):
        """Verify that attached rubrics build AI context without attribute errors and serialize cleanly."""
        from unittest.mock import AsyncMock
        from app.db.models.assessment import Rubric, RubricCriterion, RubricCriterionLevel
        from app.db.models.question import Question, AssessmentQuestion
        from app.db.enums import QuestionType
        from app.db.models.attempt import GroupSubmissionAnswer
        from app.agents.review_agent import ReviewAgentOutput
        from app.agents.feedback_agent import FeedbackAgentOutput

        assessment, group, submission, lecturer = await self._setup_data(db)

        # 1. Create a Rubric with Criteria and Levels
        rubric = Rubric(
            title="Database Analysis Rubric",
            description="Grading rubric for database architecture essays.",
            created_by_id=lecturer.id,
        )
        db.add(rubric); await db.flush()

        criterion = RubricCriterion(
            rubric_id=rubric.id,
            title="Architectural Depth",
            description="Depth of database system analysis",
            max_marks=15,
            order_index=0,
        )
        db.add(criterion); await db.flush()

        level = RubricCriterionLevel(
            criterion_id=criterion.id,
            label="Exemplary",
            description="Exceptional depth and mastery of database internals",
            marks=15,
            order_index=0,
        )
        db.add(level); await db.flush()

        # 2. Create question linked to rubric
        q = Question(
            content="Evaluate relational vs distributed storage engines.",
            question_type=QuestionType.ESSAY,
            marks=15,
            rubric_id=rubric.id,
            created_by_id=lecturer.id,
        )
        db.add(q); await db.flush()
        aq = AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, order_index=0)
        db.add(aq)
        g_ans = GroupSubmissionAnswer(
            submission_id=submission.id,
            question_id=q.id,
            answer_content={"text": "Distributed storage achieves scalability via partitioning."},
        )
        db.add(g_ans)
        await db.commit()

        # 3. Test workspace question serialization
        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)
        ws_res = await client.get(
            f"/api/v1/grading/group-submission/{submission.id}",
            headers=headers,
        )
        assert ws_res.status_code == 200
        ws_data = ws_res.json()
        matched_q = next((item for item in ws_data["questions"] if item["id"] == str(q.id)), None)
        assert matched_q is not None
        assert matched_q["rubric"] is not None
        assert matched_q["rubric"]["title"] == "Database Analysis Rubric"
        assert len(matched_q["rubric"]["criteria"]) == 1
        crit_data = matched_q["rubric"]["criteria"][0]
        assert crit_data["title"] == "Architectural Depth"
        assert crit_data["max_marks"] == 15
        assert len(crit_data["levels"]) == 1
        lvl_data = crit_data["levels"][0]
        assert lvl_data["label"] == "Exemplary"
        assert lvl_data["marks"] == 15

        # 4. Test AI review invocation builds rubric context without crash
        captured_rubric_content = []
        captured_kwargs = []

        async def fake_review(self, *args, **kwargs):
            captured_rubric_content.append(kwargs.get("rubric_content"))
            captured_kwargs.append(kwargs)
            return (
                ReviewAgentOutput(
                    suggested_score=14.0,
                    confidence=0.95,
                    rationale="Thorough comparative evaluation.",
                    is_correct=True,
                    criteria_scores=[],
                ),
                "raw completion text",
            )

        mock_feedback = AsyncMock(return_value=FeedbackAgentOutput(
            draft_feedback="Exceptional understanding of distributed architectures.",
            strengths=["Comprehensive architectural depth"],
            areas_for_improvement=[],
            suggestions=[],
        ))

        monkeypatch.setattr("app.agents.review_agent.ReviewAgent.review_response", fake_review)
        monkeypatch.setattr("app.agents.feedback_agent.FeedbackAgent.draft_feedback", mock_feedback)

        ai_res = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/questions/{q.id}/ai-review",
            headers=headers,
        )

        assert ai_res.status_code == 200

        # Run background evaluation
        from app.services.group_work_service import GroupWorkService
        from app.services.grading_service import GradingService
        await GroupWorkService(db).process_ai_grading_for_single_question(
            submission_id=submission.id,
            question_id=q.id,
            grading_service=GradingService(db),
        )
        await db.commit()

        assert len(captured_rubric_content) == 1
        assert "Architectural Depth: Depth of database system analysis (15 marks)" in captured_rubric_content[0]
        assert captured_kwargs[0]["basis_used"] == "RUBRIC"

    async def test_ai_group_grading_skipped_short_circuit(self, client: AsyncClient, db, make_auth_headers, monkeypatch):
        """Verify that skipped/empty group question answers short-circuit without calling AI agents."""
        from unittest.mock import AsyncMock
        from app.db.models.question import Question, AssessmentQuestion
        from app.db.enums import QuestionType
        from app.db.models.attempt import GroupSubmissionAnswer

        assessment, group, submission, lecturer = await self._setup_data(db)

        q = Question(
            content="Explain CAP theorem tradeoffs.",
            question_type=QuestionType.ESSAY,
            marks=10,
            created_by_id=lecturer.id,
        )
        db.add(q); await db.flush()
        aq = AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, order_index=0)
        db.add(aq)

        ans = GroupSubmissionAnswer(
            submission_id=submission.id,
            question_id=q.id,
            answer_content={"is_skipped": True, "text": ""},
        )
        db.add(ans); await db.commit()

        # Mock review agent to fail if called
        review_mock = AsyncMock(side_effect=AssertionError("ReviewAgent should not be called for skipped questions"))
        monkeypatch.setattr("app.agents.review_agent.ReviewAgent.review_response", review_mock)

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)
        ai_res = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/questions/{q.id}/ai-review",
            headers=headers,
        )

        assert ai_res.status_code == 200

        # Run background evaluation
        from app.services.group_work_service import GroupWorkService
        from app.services.grading_service import GradingService
        await GroupWorkService(db).process_ai_grading_for_single_question(
            submission_id=submission.id,
            question_id=q.id,
            grading_service=GradingService(db),
        )
        await db.commit()

        ws_res = await client.get(
            f"/api/v1/grading/group-submission/{submission.id}",
            headers=headers,
        )
        assert ws_res.status_code == 200
        ws_data = ws_res.json()
        eval_ans = next(a for a in ws_data["answers"] if a["question_id"] == str(q.id))
        assert eval_ans["ai_grade_score"] == 0.0
        assert eval_ans["ai_grade_confidence"] == 1.0
        assert eval_ans["ai_grading_basis"] == "GENERAL_KNOWLEDGE"
        assert eval_ans["rag_used"] is False
        assert "No response provided" in eval_ans["ai_grade_rationale"]
        assert not review_mock.called

    async def test_lecturer_suggests_changes_for_group_question(self, client: AsyncClient, db, make_auth_headers, monkeypatch):
        """Verify that lecturer can submit guidance to re-evaluate a group question AI grade."""
        from unittest.mock import AsyncMock
        from app.db.models.question import Question, AssessmentQuestion
        from app.db.enums import QuestionType
        from app.db.models.attempt import GroupSubmissionAnswer
        from app.agents.review_agent import ReviewAgentOutput
        from app.agents.feedback_agent import FeedbackAgentOutput

        assessment, group, submission, lecturer = await self._setup_data(db)

        q = Question(
            content="Discuss ACID transaction properties in distributed databases.",
            question_type=QuestionType.ESSAY,
            marks=10,
            created_by_id=lecturer.id,
        )
        db.add(q); await db.flush()
        aq = AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, order_index=0)
        db.add(aq)

        ans = GroupSubmissionAnswer(
            submission_id=submission.id,
            question_id=q.id,
            answer_content={"text": "Atomicity ensures all-or-nothing completion."},
        )
        db.add(ans); await db.commit()

        captured_guidance = []

        async def fake_review(self, *args, **kwargs):
            captured_guidance.append(kwargs.get("lecturer_feedback"))
            return (
                ReviewAgentOutput(
                    suggested_score=8.5,
                    confidence=0.91,
                    rationale="Updated score taking lecturer partial credit guidance into account.",
                    is_correct=True,
                    criteria_scores=[],
                ),
                "raw completion text",
            )

        mock_feedback = AsyncMock(return_value=FeedbackAgentOutput(
            draft_feedback="Good explanation with partial credit applied.",
            strengths=["Clear atomicity explanation"],
            areas_for_improvement=[],
            suggestions=[],
        ))

        monkeypatch.setattr("app.agents.review_agent.ReviewAgent.review_response", fake_review)
        monkeypatch.setattr("app.agents.feedback_agent.FeedbackAgent.draft_feedback", mock_feedback)

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)
        res = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/questions/{q.id}/suggest-changes",
            headers=headers,
            json={"feedback": "Award partial credit for atomicity definition."},
        )

        assert res.status_code == 200
        data = res.json()
        assert data["ai_grade_score"] == 8.5
        assert len(captured_guidance) == 1
        assert "Award partial credit for atomicity definition." in captured_guidance[0]

    async def test_student_assessment_list_shows_group_work_status_correctly(self, client: AsyncClient, db, make_auth_headers):
        """Verify that GET /assessments for a student correctly resolves group work lifecycle status."""
        from sqlalchemy import select
        assessment, group, submission, lecturer = await self._setup_data(db)

        # Get group member (student)
        stmt = select(StudentGroupMember).where(StudentGroupMember.group_id == group.id)
        member = (await db.execute(stmt)).scalars().first()
        assert member is not None
        student_headers = make_auth_headers(user_id=str(member.student_id), role=UserRole.STUDENT)

        # 1. Initially submission is DRAFT -> maps to IN_PROGRESS student status
        submission.status = GroupSubmissionStatus.DRAFT
        await db.commit()

        res1 = await client.get("/api/v1/assessments", headers=student_headers)
        assert res1.status_code == 200
        items1 = res1.json()["items"]
        item1 = next((a for a in items1 if a["id"] == str(assessment.id)), None)
        assert item1 is not None
        assert item1["student_status"] == "IN_PROGRESS"

        # 2. Submission is SUBMITTED
        submission.status = GroupSubmissionStatus.SUBMITTED
        await db.commit()

        res2 = await client.get("/api/v1/assessments", headers=student_headers)
        assert res2.status_code == 200
        items2 = res2.json()["items"]
        item2 = next((a for a in items2 if a["id"] == str(assessment.id)), None)
        assert item2 is not None
        assert item2["student_status"] == "SUBMITTED"

        # 3. Submission is GRADED
        submission.status = GroupSubmissionStatus.GRADED
        await db.commit()

        # Create derived result for the member
        from app.db.repositories.result_repo import ResultRepository
        result_repo = ResultRepository(db)
        derived_res, _ = await result_repo.create_or_update_derived_group_result(
            assessment_id=assessment.id,
            student_id=member.student_id,
            group_submission_id=submission.id,
            total_score=88.0,
            max_score=100.0,
            percentage=88.0,
            letter_grade="A",
            is_passing=True,
            is_released=True,
        )
        await db.commit()

        res3 = await client.get("/api/v1/assessments", headers=student_headers)
        assert res3.status_code == 200
        items3 = res3.json()["items"]
        item3 = next((a for a in items3 if a["id"] == str(assessment.id)), None)
        assert item3 is not None
        assert item3["student_status"] == "GRADED"
        assert item3["student_attempt_id"] == str(derived_res.id)



