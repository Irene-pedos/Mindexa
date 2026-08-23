"""
tests/integration/test_group_results_pipeline.py

Integration tests for the Unified Group-Work Results Pipeline:
- Atomic derivation of AssessmentResult for all active group members
- Per-member grading overrides
- Per-student integrity hold isolation
- Release lifecycle and student endpoints (/results/me, /results/attempt/{id})
- Release readiness queue reporting
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
    GroupSubmissionStatus,
    LecturerAssignmentRole,
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
from app.db.models.attempt import (
    AssessmentAttempt,
    GroupSubmission,
    StudentGroup,
    StudentGroupMember,
)
from app.db.models.auth import User, UserProfile
from app.db.models.result import AssessmentResult


@pytest.mark.asyncio
class TestGroupResultsPipeline:

    async def _setup_data(self, db):
        inst = Institution(name="Pipeline Inst", code=f"PI_{uuid.uuid4().hex[:4]}")
        db.add(inst)
        await db.flush()

        period = AcademicPeriod(
            institution_id=inst.id,
            name="Pipeline Period",
            period_type=AcademicPeriodType.SEMESTER,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
        )
        db.add(period)
        await db.flush()

        dept = Department(institution_id=inst.id, name="Pipeline Dept", code=f"PD_{uuid.uuid4().hex[:4]}")
        db.add(dept)
        await db.flush()

        opt = Option(department_id=dept.id, name="Pipeline Option", code=f"PO_{uuid.uuid4().hex[:4]}")
        db.add(opt)
        await db.flush()

        course = Course(
            institution_id=inst.id,
            academic_period_id=period.id,
            name="Pipeline Course",
            code=f"PC_{uuid.uuid4().hex[:4]}",
            academic_year="2026",
        )
        db.add(course)
        await db.flush()

        cg = ClassGroup(course_id=course.id, name="Pipeline CG", code=f"PCG_{uuid.uuid4().hex[:4]}", option_id=opt.id)
        db.add(cg)
        await db.flush()

        cs = ClassSection(class_group_id=cg.id, name="Pipeline CS")
        db.add(cs)
        await db.flush()

        lecturer = User(
            email=f"lec_pipe_{uuid.uuid4().hex[:6]}@test.ac",
            hashed_password="...",
            role=UserRole.LECTURER,
            email_verified=True,
        )
        db.add(lecturer)
        await db.flush()

        student_1 = User(
            email=f"s1_pipe_{uuid.uuid4().hex[:6]}@test.ac",
            hashed_password="...",
            role=UserRole.STUDENT,
            email_verified=True,
        )
        db.add(student_1)
        student_2 = User(
            email=f"s2_pipe_{uuid.uuid4().hex[:6]}@test.ac",
            hashed_password="...",
            role=UserRole.STUDENT,
            email_verified=True,
        )
        db.add(student_2)
        await db.flush()

        p1 = UserProfile(user_id=student_1.id, first_name="Alice", last_name="Alpha")
        p2 = UserProfile(user_id=student_2.id, first_name="Bob", last_name="Beta")
        db.add(p1)
        db.add(p2)

        enr1 = StudentEnrollment(student_id=student_1.id, class_section_id=cs.id)
        enr2 = StudentEnrollment(student_id=student_2.id, class_section_id=cs.id)
        db.add(enr1)
        db.add(enr2)
        await db.flush()

        assignment = TeachingAssignment(
            lecturer_id=lecturer.id,
            institution_id=inst.id,
            department_id=dept.id,
            course_id=course.id,
            academic_period_id=period.id,
            academic_year="2026",
            role=LecturerAssignmentRole.MAIN_LECTURER,
            class_section_id=cs.id,
            option_id=opt.id,
        )
        db.add(assignment)
        await db.flush()

        workspace = TeachingWorkspace(
            teaching_assignment_id=assignment.id,
            course_id=course.id,
            class_section_id=cs.id,
            academic_period_id=period.id,
            title="Pipeline Workspace",
            created_by_id=lecturer.id,
        )
        db.add(workspace)
        await db.flush()

        assessment = Assessment(
            title="Group Work Pipeline Assessment",
            assessment_type=AssessmentType.SUMMATIVE,
            status=AssessmentStatus.PUBLISHED,
            created_by_id=lecturer.id,
            teaching_workspace_id=workspace.id,
            course_id=course.id,
            academic_year="2026",
            is_group_assessment=True,
            total_marks=100.0,
            passing_marks=50.0,
        )
        db.add(assessment)
        await db.flush()

        from app.db.enums import QuestionType
        from app.db.models.question import Question, AssessmentQuestion

        q = Question(
            created_by_id=lecturer.id,
            question_type=QuestionType.ESSAY,
            content="Provide a collaborative system architecture report.",
            marks=100.0,
        )
        db.add(q)
        await db.flush()

        aq = AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, order_index=0)
        db.add(aq)
        await db.flush()

        group = StudentGroup(assessment_id=assessment.id, name="Team Alpha", is_locked=True)
        db.add(group)
        await db.flush()

        m1 = StudentGroupMember(group_id=group.id, student_id=student_1.id)
        m2 = StudentGroupMember(group_id=group.id, student_id=student_2.id)
        db.add(m1)
        db.add(m2)
        await db.flush()

        submission = GroupSubmission(
            assessment_id=assessment.id,
            group_id=group.id,
            status=GroupSubmissionStatus.SUBMITTED,
            submitted_at=datetime.now(UTC),
        )
        db.add(submission)
        await db.commit()

        return {
            "institution": inst,
            "course": course,
            "section": cs,
            "lecturer": lecturer,
            "student_1": student_1,
            "student_2": student_2,
            "assessment": assessment,
            "group": group,
            "submission": submission,
        }

    async def test_group_grading_derives_assessment_results(self, client: AsyncClient, db, make_auth_headers):
        """Verify that grading a group submission generates AssessmentResult rows for each member."""
        data = await self._setup_data(db)
        lecturer = data["lecturer"]
        assessment = data["assessment"]
        submission = data["submission"]
        s1 = data["student_1"]
        s2 = data["student_2"]

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        payload = {
            "total_score": 88.0,
            "max_score": 100.0,
            "feedback": "Outstanding collaborative work!",
            "is_final": True,
        }

        res = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/grade?assessment_id={assessment.id}",
            json=payload,
            headers=headers,
        )
        assert res.status_code == 204

        # Check database for derived AssessmentResults
        stmt = select(AssessmentResult).where(
            AssessmentResult.group_submission_id == submission.id,
            AssessmentResult.is_deleted == False,
        )
        results = (await db.execute(stmt)).scalars().all()
        assert len(results) == 2

        res_map = {r.student_id: r for r in results}
        assert s1.id in res_map
        assert s2.id in res_map

        r1 = res_map[s1.id]
        assert r1.total_score == 88.0
        assert r1.max_score == 100.0
        assert r1.percentage == 88.0
        assert r1.is_passing is True
        assert r1.is_group_result is True
        assert r1.is_released is False
        assert r1.integrity_hold is False

    async def test_group_grading_with_member_overrides_and_integrity_hold(
        self, client: AsyncClient, db, make_auth_headers
    ):
        """Verify member score overrides and per-student integrity hold isolation."""
        data = await self._setup_data(db)
        lecturer = data["lecturer"]
        assessment = data["assessment"]
        submission = data["submission"]
        s1 = data["student_1"]
        s2 = data["student_2"]

        # Simulate student 2 having a high integrity risk / flag on their attempt
        attempt_s2 = AssessmentAttempt(
            assessment_id=assessment.id,
            student_id=s2.id,
            group_id=data["group"].id,
            status=AttemptStatus.SUBMITTED,
            grading_mode=GradingMode.AUTO,
            is_flagged=True,
            integrity_risk_score=85.0,
            submitted_at=datetime.now(UTC),
        )
        db.add(attempt_s2)
        await db.commit()

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        payload = {
            "total_score": 80.0,
            "max_score": 100.0,
            "feedback": "Team performed well, student 2 had custom contributions.",
            "member_overrides": {
                str(s2.id): 95.0,
            },
            "is_final": True,
        }

        res = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/grade?assessment_id={assessment.id}",
            json=payload,
            headers=headers,
        )
        assert res.status_code == 204

        # Verify results
        stmt = select(AssessmentResult).where(
            AssessmentResult.group_submission_id == submission.id,
            AssessmentResult.is_deleted == False,
        )
        results = (await db.execute(stmt)).scalars().all()
        res_map = {r.student_id: r for r in results}

        r1 = res_map[s1.id]
        r2 = res_map[s2.id]

        # S1 has default team score and no hold
        assert r1.total_score == 80.0
        assert r1.integrity_hold is False
        assert r1.is_released is False

        # S2 has overridden score and integrity hold isolated to them
        assert r2.total_score == 95.0
        assert r2.integrity_hold is True
        assert r2.attempt_id == attempt_s2.id

        # Now lecturer releases group results
        rel_res = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/release-result?assessment_id={assessment.id}",
            headers=headers,
        )
        assert rel_res.status_code == 204

        await db.refresh(r1)
        await db.refresh(r2)

        # S1 result is now released!
        assert r1.is_released is True
        assert r1.released_at is not None

        # S2 result remains held!
        assert r2.is_released is False
        assert r2.integrity_hold is True

        # S1 views their released result via /results/attempt/{id}
        s1_headers = make_auth_headers(user_id=str(s1.id), role=UserRole.STUDENT)
        res_view = await client.get(f"/api/v1/results/attempt/{r1.id}", headers=s1_headers)
        assert res_view.status_code == 200
        view_data = res_view.json()
        assert view_data["is_group_result"] is True
        assert view_data["group_name"] == "Team Alpha"
        assert view_data["group_feedback"] == "Team performed well, student 2 had custom contributions."
        assert len(view_data["breakdowns"]) == 1
        assert view_data["total_score"] == 80.0

        # S1 views their transcript /results/me
        me_res = await client.get("/api/v1/results/me", headers=s1_headers)
        assert me_res.status_code == 200
        items = me_res.json()["items"]
        assert len(items) >= 1
        assert any(it["assessment_id"] == str(assessment.id) and it["is_group_result"] is True for it in items)

    async def test_class_level_release_endpoint_supports_group_assessments(
        self, client: AsyncClient, db, make_auth_headers
    ):
        """Verify that lecturer can release group assessment results via the unified class-level POST /results/release endpoint."""
        data = await self._setup_data(db)
        lecturer = data["lecturer"]
        assessment = data["assessment"]
        submission = data["submission"]
        section = data["section"]
        s1 = data["student_1"]
        s2 = data["student_2"]

        headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER)

        # 1. Grade the group submission
        grade_payload = {
            "total_score": 92.0,
            "max_score": 100.0,
            "feedback": "Great project!",
            "is_final": True,
        }
        g_res = await client.post(
            f"/api/v1/group-work/submissions/{submission.id}/grade?assessment_id={assessment.id}",
            json=grade_payload,
            headers=headers,
        )
        assert g_res.status_code == 204

        # 2. Check release queue endpoint before release
        queue_res = await client.get(
            f"/api/v1/results/assessment/{assessment.id}/release-queue?class_section_id={section.id}",
            headers=headers,
        )
        assert queue_res.status_code == 200
        q_data = queue_res.json()
        assert q_data["class_fully_graded"] is True
        assert len(q_data["items"]) == 2
        for item in q_data["items"]:
            assert item["status"] == "PENDING_RELEASE"
            assert item["can_release"] is True

        # 3. Trigger class-level release via POST /results/release
        rel_payload = {
            "assessment_id": str(assessment.id),
            "class_section_id": str(section.id),
        }
        rel_res = await client.post(
            "/api/v1/results/release",
            json=rel_payload,
            headers=headers,
        )
        assert rel_res.status_code == 200
        rel_data = rel_res.json()
        assert rel_data["released_count"] == 2

        # 4. Verify results are marked released in database and GroupSubmission has result_released_at
        stmt = select(AssessmentResult).where(
            AssessmentResult.group_submission_id == submission.id,
            AssessmentResult.is_deleted == False,
        )
        results = (await db.execute(stmt)).scalars().all()
        assert len(results) == 2
        for r in results:
            assert r.is_released is True
            assert r.released_at is not None

        await db.refresh(submission)
        assert submission.result_released_at is not None
