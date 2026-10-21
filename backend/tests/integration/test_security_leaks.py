"""
tests/integration/test_security_leaks.py

Regression tests for the Phase 1 security fixes of the journey audit:
- /admin/academic/* requires an authenticated admin
- students never receive answer keys (assessment detail, question bank, attempt payload)
- redaction does not modify the stored answer key
- students cannot open assessments that are not published / not targeted to them
- grading & attempt endpoints are scoped to the assessment's course team
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import (
    AcademicPeriodType,
    AssessmentStatus,
    AssessmentType,
    EnrollmentStatus,
    LecturerAssignmentRole,
    QuestionType,
    UserRole,
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
from app.db.models.auth import User, UserProfile
from app.db.models.question import AssessmentQuestion, Question, QuestionOption


async def _user(db: AsyncSession, email: str, role: UserRole) -> User:
    user = User(
        id=uuid.uuid4(), email=email, hashed_password="pw", role=role,
        status="ACTIVE", email_verified=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserProfile(user_id=user.id, first_name=email.split("@")[0], last_name="T"))
    await db.flush()
    return user


async def _env(db: AsyncSession) -> dict:
    """Published assessment (MCQ + MATCHING) visible to an enrolled student."""
    inst = Institution(name="Leak Test Inst", code=f"LTI{uuid.uuid4().hex[:5]}")
    db.add(inst)
    await db.flush()
    period = AcademicPeriod(
        institution_id=inst.id, name="Sem 1", period_type=AcademicPeriodType.SEMESTER,
        start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
    )
    dept = Department(institution_id=inst.id, name="CS", code="CS")
    db.add_all([period, dept])
    await db.flush()
    opt = Option(department_id=dept.id, name="SE", code="SE")
    db.add(opt)
    await db.flush()
    course = Course(
        institution_id=inst.id, academic_period_id=period.id, department_id=dept.id,
        name="Algorithms", code="CS101", academic_year="2026",
    )
    db.add(course)
    await db.flush()
    group = ClassGroup(course_id=course.id, option_id=opt.id, name="Y1", code="Y1")
    db.add(group)
    await db.flush()
    section = ClassSection(class_group_id=group.id, name="A", department_id=dept.id)
    db.add(section)
    await db.flush()

    lecturer = await _user(db, "owner_lect@leak.ac", UserRole.LECTURER)
    outsider = await _user(db, "outsider_lect@leak.ac", UserRole.LECTURER)
    student = await _user(db, "student@leak.ac", UserRole.STUDENT)
    stranger = await _user(db, "stranger_student@leak.ac", UserRole.STUDENT)

    assignment = TeachingAssignment(
        lecturer_id=lecturer.id, institution_id=inst.id, department_id=dept.id,
        option_id=opt.id, course_id=course.id, academic_period_id=period.id,
        academic_year="2026", role=LecturerAssignmentRole.MAIN_LECTURER,
    )
    db.add(assignment)
    await db.flush()
    workspace = TeachingWorkspace(
        teaching_assignment_id=assignment.id, course_id=course.id,
        academic_period_id=period.id, title="WS", created_by_id=lecturer.id,
    )
    db.add(workspace)
    await db.flush()
    db.add(StudentEnrollment(
        student_id=student.id, class_section_id=section.id,
        enrollment_status=EnrollmentStatus.ACTIVE,
    ))

    def _assessment(status: AssessmentStatus, title: str) -> Assessment:
        return Assessment(
            title=title, assessment_type=AssessmentType.CAT, status=status,
            created_by_id=lecturer.id, teaching_workspace_id=workspace.id,
            course_id=course.id, academic_year="2026", audience_type="all",
            draft_is_complete=True,
        )

    published = _assessment(AssessmentStatus.PUBLISHED, "Published CAT")
    pending = _assessment(AssessmentStatus.PENDING_MODERATION, "Under moderation")
    db.add_all([published, pending])
    await db.flush()

    mcq = Question(content="2+2?", question_type=QuestionType.MCQ, created_by_id=lecturer.id,
                   explanation="Because arithmetic.")
    matching = Question(content="Match capitals", question_type=QuestionType.MATCHING,
                        created_by_id=lecturer.id)
    db.add_all([mcq, matching])
    await db.flush()
    correct = QuestionOption(question_id=mcq.id, content="4", is_correct=True, order_index=0)
    db.add_all([
        correct,
        QuestionOption(question_id=mcq.id, content="5", is_correct=False, order_index=1),
        QuestionOption(question_id=matching.id, content="Rwanda", match_value="Kigali", order_index=0),
        QuestionOption(question_id=matching.id, content="Kenya", match_value="Nairobi", order_index=1),
    ])
    for i, q in enumerate([mcq, matching]):
        for a in (published, pending):
            db.add(AssessmentQuestion(assessment_id=a.id, question_id=q.id, order_index=i, marks_override=5))
    await db.commit()

    return {
        "lecturer": lecturer, "outsider": outsider, "student": student, "stranger": stranger,
        "published": published, "pending": pending, "mcq": mcq, "correct_option": correct,
    }


def _h(make_auth_headers, user: User) -> dict[str, str]:
    return make_auth_headers(user_id=str(user.id), role=user.role, email=user.email)


@pytest.mark.asyncio
async def test_admin_academic_requires_admin(client: AsyncClient, db: AsyncSession, make_auth_headers):
    lecturer = await _user(db, "lect_academic@leak.ac", UserRole.LECTURER)

    resp = await client.get("/api/v1/admin/academic/assignments")
    assert resp.status_code == 401, resp.text

    resp = await client.get("/api/v1/admin/academic/assignments", headers=_h(make_auth_headers, lecturer))
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_student_assessment_detail_has_no_answer_key_and_db_is_untouched(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    env = await _env(db)
    hdrs = _h(make_auth_headers, env["student"])

    resp = await client.get(f"/api/v1/assessments/{env['published'].id}", headers=hdrs)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    for aq in body["assessment_questions"]:
        q = aq["question"]
        assert q["explanation"] is None
        assert q["correct_order_json"] is None
        for opt in q["options"]:
            assert opt["is_correct"] is None
            assert opt["option_text_right"] is None
    assert body["target_student_ids"] is None

    resp = await client.get(f"/api/v1/assessments/{env['published'].id}/questions", headers=hdrs)
    assert resp.status_code == 200, resp.text
    assert all(
        o["is_correct"] is None for aq in resp.json() for o in aq["question"]["options"]
    )

    # The stored answer key must survive the request (get_db commits on success).
    await db.refresh(env["correct_option"])
    assert env["correct_option"].is_correct is True


@pytest.mark.asyncio
async def test_student_cannot_open_unpublished_or_untargeted_assessment(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    env = await _env(db)

    resp = await client.get(
        f"/api/v1/assessments/{env['pending'].id}", headers=_h(make_auth_headers, env["student"])
    )
    assert resp.status_code == 404, resp.text

    resp = await client.get(
        f"/api/v1/assessments/{env['published'].id}", headers=_h(make_auth_headers, env["stranger"])
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_student_cannot_read_question_bank(client: AsyncClient, db: AsyncSession, make_auth_headers):
    env = await _env(db)
    resp = await client.get(
        f"/api/v1/questions/{env['mcq'].id}", headers=_h(make_auth_headers, env["student"])
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_attempt_payload_hides_matching_pairs_and_unreleased_score(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    from app.services.attempt_service import AttemptService

    env = await _env(db)
    attempt = await AttemptService(db).start_attempt(
        student_id=env["student"].id, assessment_id=env["published"].id
    )
    attempt_id = getattr(attempt, "id", None) or attempt["attempt_id"]
    await db.commit()

    resp = await client.get(f"/api/v1/attempts/{attempt_id}", headers=_h(make_auth_headers, env["student"]))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    matching = next(q for q in body["questions"] if q["type"] == "MATCHING")
    assert all(o["option_text_right"] is None for o in matching["options"])
    assert sorted(matching["match_choices"]) == ["Kigali", "Nairobi"]
    assert body["total_score"] is None


@pytest.mark.asyncio
async def test_grading_and_attempt_endpoints_are_scoped_to_course_team(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    from app.services.attempt_service import AttemptService

    env = await _env(db)
    attempt = await AttemptService(db).start_attempt(
        student_id=env["student"].id, assessment_id=env["published"].id
    )
    attempt_id = getattr(attempt, "id", None) or attempt["attempt_id"]
    await db.commit()

    outsider = _h(make_auth_headers, env["outsider"])
    for url in (
        f"/api/v1/grading/attempt/{attempt_id}",
        f"/api/v1/grading/attempt/{attempt_id}/verify",
        f"/api/v1/attempts/{attempt_id}",
        f"/api/v1/submissions/attempt/{attempt_id}",
    ):
        resp = await client.get(url, headers=outsider)
        assert resp.status_code == 403, f"{url}: {resp.status_code} {resp.text}"

    owner = _h(make_auth_headers, env["lecturer"])
    resp = await client.get(f"/api/v1/grading/attempt/{attempt_id}", headers=owner)
    assert resp.status_code == 200, resp.text
