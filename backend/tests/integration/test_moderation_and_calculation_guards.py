"""Integration tests for:
- Completeness guards on POST /results/calculate/{attempt_id}
- Post-release moderation tracking (is_post_release_corrected) on AssessmentResult
- Conditional student notification on draft vs released moderation
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, date

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.constants import UserRole
from app.db.enums import (
    AcademicPeriodType,
    AssessmentStatus,
    AssessmentType,
    AttemptStatus,
    GradingMode,
    LecturerAssignmentRole,
    QuestionType,
    ResultReleaseMode,
)
from app.db.models.academic import (
    AcademicPeriod,
    ClassGroup,
    ClassSection,
    Course,
    Department,
    Institution,
    Option,
    StudentEnrollment,
    TeachingAssignment,
    TeachingWorkspace,
)
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt, StudentResponse, SubmissionGrade
from app.db.models.auth import User, UserProfile
from app.db.models.question import Question, AssessmentQuestion
from app.db.models.result import AssessmentResult


@pytest.mark.asyncio
class TestModerationAndCalculationGuards:
    async def _setup_data(self, db):
        # 1. Institution & Hierarchy
        inst = Institution(name="University of Science", code=f"USC_{uuid.uuid4().hex[:6]}")
        db.add(inst)
        await db.flush()

        period = AcademicPeriod(
            institution_id=inst.id,
            name="2026-2027",
            period_type=AcademicPeriodType.SEMESTER,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
        )
        db.add(period)
        await db.flush()

        dept = Department(institution_id=inst.id, name="Computer Science", code=f"CS_{uuid.uuid4().hex[:4]}")
        db.add(dept)
        await db.flush()

        opt = Option(department_id=dept.id, name="Software Eng", code=f"SE_{uuid.uuid4().hex[:4]}")
        db.add(opt)
        await db.flush()

        course = Course(
            institution_id=inst.id,
            academic_period_id=period.id,
            name="Advanced Algorithms",
            code=f"CS_{uuid.uuid4().hex[:4].upper()}",
            academic_year="2026",
        )
        db.add(course)
        await db.flush()

        cg = ClassGroup(course_id=course.id, name="CG A", code=f"CGA_{uuid.uuid4().hex[:4]}", option_id=opt.id)
        db.add(cg)
        await db.flush()

        section = ClassSection(class_group_id=cg.id, name="Section A")
        db.add(section)
        await db.flush()

        # 2. Users
        lecturer = User(
            email=f"lecturer_{uuid.uuid4().hex[:6]}@example.com",
            role=UserRole.LECTURER,
            hashed_password="hash",
            institution_id=inst.id,
            is_active=True,
            email_verified=True,
        )
        db.add(lecturer)

        student = User(
            email=f"student_{uuid.uuid4().hex[:6]}@example.com",
            role=UserRole.STUDENT,
            hashed_password="hash",
            institution_id=inst.id,
            is_active=True,
            email_verified=True,
        )
        db.add(student)
        await db.flush()

        p_lec = UserProfile(user_id=lecturer.id, first_name="Dr.", last_name="Turing")
        p_stu = UserProfile(user_id=student.id, first_name="Ada", last_name="Lovelace")
        db.add_all([p_lec, p_stu])

        enr = StudentEnrollment(
            student_id=student.id,
            class_section_id=section.id,
            is_active=True,
        )
        db.add(enr)
        await db.flush()

        assignment = TeachingAssignment(
            lecturer_id=lecturer.id,
            institution_id=inst.id,
            department_id=dept.id,
            course_id=course.id,
            academic_period_id=period.id,
            academic_year="2026",
            role=LecturerAssignmentRole.MAIN_LECTURER,
            class_section_id=section.id,
            option_id=opt.id,
        )
        db.add(assignment)
        await db.flush()

        workspace = TeachingWorkspace(
            teaching_assignment_id=assignment.id,
            course_id=course.id,
            class_section_id=section.id,
            academic_period_id=period.id,
            title="Quiz Workspace",
            created_by_id=lecturer.id,
        )
        db.add(workspace)
        await db.flush()

        # 3. Assessment with 2 questions (10 marks each -> total 20 marks)
        assessment = Assessment(
            title="Algorithm Analysis Quiz",
            institution_id=inst.id,
            created_by_id=lecturer.id,
            teaching_workspace_id=workspace.id,
            course_id=course.id,
            academic_year="2026",
            assessment_type=AssessmentType.SUMMATIVE,
            status=AssessmentStatus.PUBLISHED,
            result_release_mode=ResultReleaseMode.MANUAL,
            total_marks=20.0,
            passing_marks=10.0,
        )
        db.add(assessment)
        await db.flush()

        q1 = Question(
            created_by_id=lecturer.id,
            course_id=course.id,
            question_type=QuestionType.SHORT_ANSWER,
            content="Explain Dijkstra algorithm time complexity.",
            marks=10.0,
        )
        q2 = Question(
            created_by_id=lecturer.id,
            course_id=course.id,
            question_type=QuestionType.SHORT_ANSWER,
            content="Explain Bellman-Ford negative cycle detection.",
            marks=10.0,
        )
        db.add_all([q1, q2])
        await db.flush()

        aq1 = AssessmentQuestion(
            assessment_id=assessment.id,
            question_id=q1.id,
            order_index=1,
            score=10.0,
        )
        aq2 = AssessmentQuestion(
            assessment_id=assessment.id,
            question_id=q2.id,
            order_index=2,
            score=10.0,
        )
        db.add_all([aq1, aq2])
        await db.flush()

        # 4. Attempt & Responses
        attempt = AssessmentAttempt(
            assessment_id=assessment.id,
            student_id=student.id,
            status=AttemptStatus.SUBMITTED,
            grading_mode=GradingMode.MANUAL,
            submitted_at=datetime.now(UTC),
        )
        db.add(attempt)
        await db.flush()

        r1 = StudentResponse(
            attempt_id=attempt.id,
            question_id=q1.id,
            student_id=student.id,
            answer_text="O((V + E) log V) with min-heap.",
            submitted_at=datetime.now(UTC),
        )
        r2 = StudentResponse(
            attempt_id=attempt.id,
            question_id=q2.id,
            student_id=student.id,
            answer_text="Runs V-1 relaxations, 1 extra check detects cycle.",
            submitted_at=datetime.now(UTC),
        )
        db.add_all([r1, r2])
        await db.flush()

        return {
            "lecturer": lecturer,
            "student": student,
            "assessment": assessment,
            "q1": q1,
            "q2": q2,
            "attempt": attempt,
            "r1": r1,
            "r2": r2,
            "section": section,
        }

    async def test_calculate_result_completeness_guard_and_accurate_denominator(
        self, client: AsyncClient, db, make_auth_headers
    ):
        """Verify POST /results/calculate guards against partially graded attempts and calculates against assessment total."""
        data = await self._setup_data(db)
        lecturer = data["lecturer"]
        assessment = data["assessment"]
        attempt = data["attempt"]
        q1 = data["q1"]
        q2 = data["q2"]
        r1 = data["r1"]
        r2 = data["r2"]

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        # 1. Finalize grade for question 1 only (9 / 10 marks)
        g1 = SubmissionGrade(
            attempt_id=attempt.id,
            response_id=r1.id,
            question_id=q1.id,
            student_id=data["student"].id,
            assessment_id=assessment.id,
            score=9.0,
            max_score=10.0,
            grading_mode=GradingMode.MANUAL,
            is_final=True,
            created_by_id=lecturer.id,
            is_current=True,
        )
        db.add(g1)
        await db.flush()

        # 2. Trigger calculate without allow_partial -> MUST fail with 409 Conflict
        res_fail = await client.post(
            f"/api/v1/results/calculate/{attempt.id}",
            headers=headers,
        )
        assert res_fail.status_code == 409
        err = res_fail.json()
        assert "partially graded" in err.get("detail", "").lower() or "attempt_partially_graded" in str(err).lower()

        # 3. Trigger calculate with allow_partial=true -> MUST succeed with accurate total denominator (9 / 20 = 45%)
        res_partial = await client.post(
            f"/api/v1/results/calculate/{attempt.id}?allow_partial=true",
            headers=headers,
        )
        assert res_partial.status_code == 200
        part_data = res_partial.json()
        assert part_data["total_score"] == 9.0
        assert part_data["max_score"] == 20.0
        assert part_data["percentage"] == 45.0
        assert part_data["is_released"] is False

        # 4. Finalize grade for question 2 (8 / 10 marks)
        g2 = SubmissionGrade(
            attempt_id=attempt.id,
            response_id=r2.id,
            question_id=q2.id,
            student_id=data["student"].id,
            assessment_id=assessment.id,
            score=8.0,
            max_score=10.0,
            grading_mode=GradingMode.MANUAL,
            is_final=True,
            created_by_id=lecturer.id,
            is_current=True,
        )
        db.add(g2)
        await db.flush()

        # 5. Trigger calculate now -> succeeds without allow_partial (17 / 20 = 85%)
        res_full = await client.post(
            f"/api/v1/results/calculate/{attempt.id}",
            headers=headers,
        )
        assert res_full.status_code == 200
        full_data = res_full.json()
        assert full_data["total_score"] == 17.0
        assert full_data["max_score"] == 20.0
        assert full_data["percentage"] == 85.0

    async def test_post_release_moderation_audit_marker(
        self, client: AsyncClient, db, make_auth_headers
    ):
        """Verify that moderating a grade after release sets is_post_release_corrected and maintains released state."""
        data = await self._setup_data(db)
        lecturer = data["lecturer"]
        assessment = data["assessment"]
        attempt = data["attempt"]
        q1 = data["q1"]
        q2 = data["q2"]
        r1 = data["r1"]
        r2 = data["r2"]
        student = data["student"]

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        # 1. Finalize all grades
        g1 = SubmissionGrade(
            attempt_id=attempt.id,
            response_id=r1.id,
            question_id=q1.id,
            student_id=student.id,
            assessment_id=assessment.id,
            score=8.0,
            max_score=10.0,
            grading_mode=GradingMode.MANUAL,
            is_final=True,
            created_by_id=lecturer.id,
            is_current=True,
        )
        g2 = SubmissionGrade(
            attempt_id=attempt.id,
            response_id=r2.id,
            question_id=q2.id,
            student_id=student.id,
            assessment_id=assessment.id,
            score=8.0,
            max_score=10.0,
            grading_mode=GradingMode.MANUAL,
            is_final=True,
            created_by_id=lecturer.id,
            is_current=True,
        )
        db.add_all([g1, g2])
        await db.flush()

        # Calculate result (16 / 20 = 80%)
        calc_res = await client.post(f"/api/v1/results/calculate/{attempt.id}", headers=headers)
        assert calc_res.status_code == 200

        # 2. Moderate while still unreleased (draft moderation)
        mod_draft = {
            "response_id": str(r1.id),
            "new_score": 9.0,
            "revision_reason": "Adjusted rubric step for time complexity explanation",
        }
        res_mod1 = await client.post("/api/v1/grading/moderate", json=mod_draft, headers=headers)
        assert res_mod1.status_code == 200

        # Result is recalculated to 17/20, but was not released so is_post_release_corrected remains False
        stmt = select(AssessmentResult).where(AssessmentResult.attempt_id == attempt.id)
        res_row = (await db.execute(stmt)).scalar_one()
        assert res_row.total_score == 17.0
        assert res_row.is_released is False
        assert res_row.is_post_release_corrected is False

        # 3. Release result
        rel_payload = {
            "assessment_id": str(assessment.id),
            "class_section_id": str(data["section"].id),
        }
        res_rel = await client.post("/api/v1/results/release", json=rel_payload, headers=headers)
        assert res_rel.status_code == 200

        await db.refresh(res_row)
        assert res_row.is_released is True

        # 4. Moderate AFTER release (post-release correction)
        mod_post = {
            "response_id": str(r2.id),
            "new_score": 10.0,
            "revision_reason": "Post-release remark approved by academic coordinator",
        }
        res_mod2 = await client.post("/api/v1/grading/moderate", json=mod_post, headers=headers)
        assert res_mod2.status_code == 200

        # Verify result row has post-release correction flag, maintains is_released=True, and updated total score (19/20 = 95%)
        await db.refresh(res_row)
        assert res_row.total_score == 19.0
        assert res_row.percentage == 95.0
        assert res_row.is_released is True
        assert res_row.is_post_release_corrected is True
        assert res_row.post_release_corrected_at is not None

        # 5. Student views the updated result via /results/attempt/{id}
        stu_headers = make_auth_headers(user_id=str(student.id), role=UserRole.STUDENT)
        view_res = await client.get(f"/api/v1/results/attempt/{attempt.id}", headers=stu_headers)
        assert view_res.status_code == 200
        view_data = view_res.json()
        assert view_data["total_score"] == 19.0
        assert view_data["is_post_release_corrected"] is True

    async def test_moderate_grade_score_out_of_range_rejected(self, db, client: AsyncClient, make_auth_headers):
        data = await self._setup_data(db)
        lecturer = data["lecturer"]
        student = data["student"]
        assessment = data["assessment"]
        attempt = data["attempt"]
        q1 = data["q1"]
        r1 = data["r1"]

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        g1 = SubmissionGrade(
            attempt_id=attempt.id,
            response_id=r1.id,
            question_id=q1.id,
            student_id=student.id,
            assessment_id=assessment.id,
            score=8.0,
            max_score=10.0,
            grading_mode=GradingMode.MANUAL,
            is_final=True,
            created_by_id=lecturer.id,
            is_current=True,
        )
        db.add(g1)
        await db.flush()

        # Moderate with score > max_score (50 > 10)
        res_high = await client.post("/api/v1/grading/moderate", json={
            "response_id": str(r1.id),
            "new_score": 50.0,
            "revision_reason": "Testing score exceeding question max marks",
        }, headers=headers)
        assert res_high.status_code in (400, 422)

        # Moderate with negative score
        res_neg = await client.post("/api/v1/grading/moderate", json={
            "response_id": str(r1.id),
            "new_score": -5.0,
            "revision_reason": "Testing negative score rejection",
        }, headers=headers)
        assert res_neg.status_code in (400, 422)

    async def test_closed_only_assessment_auto_releases_even_in_manual_mode(self, db, client: AsyncClient, make_auth_headers):
        """Verify that an assessment with only closed questions auto-releases upon calculation even in MANUAL release mode."""
        data = await self._setup_data(db)
        lecturer = data["lecturer"]
        student = data["student"]
        workspace = (await db.execute(select(TeachingWorkspace))).scalars().first()

        # 1. Create a closed-only assessment in MANUAL release mode
        closed_assessment = Assessment(
            title="Closed Only MCQ Quiz",
            created_by_id=lecturer.id,
            teaching_workspace_id=workspace.id,
            course_id=workspace.course_id,
            academic_year="2026",
            assessment_type=AssessmentType.FORMATIVE,
            status=AssessmentStatus.PUBLISHED,
            result_release_mode=ResultReleaseMode.MANUAL,
            total_marks=20.0,
            passing_marks=10.0,
        )
        db.add(closed_assessment)
        await db.flush()

        # Add 2 MCQ questions
        q1 = Question(
            created_by_id=lecturer.id,
            course_id=workspace.course_id,
            question_type=QuestionType.MCQ,
            content="What is 2+2?",
            marks=10.0,
        )
        q2 = Question(
            created_by_id=lecturer.id,
            course_id=workspace.course_id,
            question_type=QuestionType.TRUE_FALSE,
            content="Python is dynamically typed.",
            marks=10.0,
        )
        db.add_all([q1, q2])
        await db.flush()

        aq1 = AssessmentQuestion(assessment_id=closed_assessment.id, question_id=q1.id, order_index=1, score=10.0)
        aq2 = AssessmentQuestion(assessment_id=closed_assessment.id, question_id=q2.id, order_index=2, score=10.0)
        db.add_all([aq1, aq2])
        await db.flush()

        # Student attempt
        attempt = AssessmentAttempt(
            assessment_id=closed_assessment.id,
            student_id=student.id,
            class_section_id=data["section"].id,
            attempt_number=1,
            status=AttemptStatus.SUBMITTED,
            grading_mode=GradingMode.AUTO,
            submitted_at=datetime.now(UTC),
        )
        db.add(attempt)
        await db.flush()

        r1 = StudentResponse(attempt_id=attempt.id, question_id=q1.id, student_id=student.id, answer_text="4", submitted_at=datetime.now(UTC))
        r2 = StudentResponse(attempt_id=attempt.id, question_id=q2.id, student_id=student.id, answer_text="True", submitted_at=datetime.now(UTC))
        db.add_all([r1, r2])
        await db.flush()

        g1 = SubmissionGrade(
            attempt_id=attempt.id, response_id=r1.id, question_id=q1.id, student_id=student.id,
            assessment_id=closed_assessment.id, score=10.0, max_score=10.0, grading_mode=GradingMode.AUTO,
            is_final=True, created_by_id=lecturer.id, is_current=True,
        )
        g2 = SubmissionGrade(
            attempt_id=attempt.id, response_id=r2.id, question_id=q2.id, student_id=student.id,
            assessment_id=closed_assessment.id, score=10.0, max_score=10.0, grading_mode=GradingMode.AUTO,
            is_final=True, created_by_id=lecturer.id, is_current=True,
        )
        db.add_all([g1, g2])
        await db.commit()

        # Calculate result via API
        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)
        calc_res = await client.post(f"/api/v1/results/calculate/{attempt.id}", headers=headers)
        assert calc_res.status_code == 200

        # Verify that AssessmentResult is automatically released!
        stmt = select(AssessmentResult).where(AssessmentResult.attempt_id == attempt.id)
        res_row = (await db.execute(stmt)).scalar_one()
        assert res_row.total_score == 20.0
        assert res_row.is_released is True
