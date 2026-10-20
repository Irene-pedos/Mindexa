"""
tests/unit/test_phase2_choice_sections.py

Comprehensive tests for MINDEXA Phase 2:
- Central pure marks calculation (required_marks, max_possible_score, validate_choice_pools)
- Summative structure rules and default RP Summative 3-Section template rules
- Over-answer policy resolution (FIRST_N vs BEST_N)
- Student question selection/deselection service methods (N limit, IDOR, re-indexing)
- Assessment marks summary endpoint and section PATCH endpoint
- Student selection and deselection API endpoints
- Publish validation integration for choice pools and summative structure
"""
# ruff: noqa: ANN001, ANN201, ANN202, E501, S106
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    AssessmentStatus,
    AssessmentType,
    GradingMode,
    OverAnswerPolicy,
    QuestionType,
    SectionKind,
    UserRole,
    UserStatus,
)
from app.core.exceptions import (
    AuthorizationError,
    BadRequestError,
    ValidationError,
)
from app.db.enums import AttemptStatus
from app.db.models.academic import Campus, Course, Department, Institution, TeachingAssignment, TeachingWorkspace
from app.db.models.assessment import Assessment, AssessmentSection
from app.db.models.attempt import AssessmentAttempt, AttemptSectionSelection, StudentResponse, SubmissionGrade
from app.db.models.auth import User
from app.db.models.question import AssessmentQuestion, Question
from app.schemas.assessment import AssessmentSectionUpdate
from app.services.assessment_marks import (
    ChoicePoolIssue,
    ResponseCountDecision,
    StructureViolation,
    max_possible_score,
    required_marks,
    resolve_choice_section_responses,
    validate_choice_pools,
    validate_summative_structure,
)
from app.services.assessment_service import AssessmentService
from app.services.attempt_service import AttemptService


# ─────────────────────────────────────────────────────────────────────────────
# 1. PURE CALCULATION TESTS (services/assessment_marks.py)
# ─────────────────────────────────────────────────────────────────────────────

def _make_mock_question(marks: int, q_id: uuid.UUID | None = None) -> Question:
    q = Question(
        id=q_id or uuid.uuid4(),
        created_by_id=uuid.uuid4(),
        question_type=QuestionType.MCQ,
        content=f"Question content {marks} marks",
        marks=marks,
    )
    return q


def _make_mock_aq(
    marks: int,
    section_id: uuid.UUID | None = None,
    marks_override: int | None = None,
    is_deleted: bool = False,
) -> AssessmentQuestion:
    q = _make_mock_question(marks)
    aq = AssessmentQuestion(
        id=uuid.uuid4(),
        assessment_id=uuid.uuid4(),
        question_id=q.id,
        assessment_section_id=section_id,
        order_index=1,
        marks_override=marks_override,
        is_deleted=is_deleted,
    )
    aq.question = q
    return aq


def _make_mock_section(
    section_id: uuid.UUID | None = None,
    title: str = "Section",
    order_index: int = 1,
    section_kind: SectionKind = SectionKind.MIXED,
    questions_to_answer: int | None = None,
    is_deleted: bool = False,
) -> AssessmentSection:
    sec = AssessmentSection(
        id=section_id or uuid.uuid4(),
        assessment_id=uuid.uuid4(),
        title=title,
        order_index=order_index,
        section_kind=section_kind,
        questions_to_answer=questions_to_answer,
        is_deleted=is_deleted,
    )
    return sec


def test_required_marks_all_compulsory():
    sec1 = _make_mock_section(title="Sec 1", questions_to_answer=None)
    aq1 = _make_mock_aq(marks=10, section_id=sec1.id)
    aq2 = _make_mock_aq(marks=15, section_id=sec1.id)

    mock_assessment = MagicMock()
    mock_assessment.sections = [sec1]
    mock_assessment.assessment_questions = [aq1, aq2]

    # Both compulsory -> 10 + 15 = 25
    assert required_marks(mock_assessment) == 25
    assert max_possible_score(mock_assessment) == 25


def test_required_marks_choice_pools():
    # Choice section: 4 questions of 10 marks each, answer 2 (N=2)
    sec1 = _make_mock_section(title="Section B", questions_to_answer=2)
    aqs = [_make_mock_aq(marks=10, section_id=sec1.id) for _ in range(4)]

    mock_assessment = MagicMock()
    mock_assessment.sections = [sec1]
    mock_assessment.assessment_questions = aqs

    # N * marks_per_question = 2 * 10 = 20
    assert required_marks(mock_assessment) == 20


def test_required_marks_mixed_sections_and_unsectioned():
    sec_a = _make_mock_section(title="Sec A (Compulsory)", order_index=1, questions_to_answer=None)
    sec_b = _make_mock_section(title="Sec B (Choice)", order_index=2, questions_to_answer=2)

    # Sec A has 2 questions of 10 marks = 20
    aqs_a = [_make_mock_aq(marks=10, section_id=sec_a.id) for _ in range(2)]
    # Sec B has 4 questions of 15 marks, answer 2 = 30
    aqs_b = [_make_mock_aq(marks=15, section_id=sec_b.id) for _ in range(4)]
    # Unsectioned question of 5 marks = 5
    aq_unsectioned = _make_mock_aq(marks=5, section_id=None)

    mock_assessment = MagicMock()
    mock_assessment.sections = [sec_a, sec_b]
    mock_assessment.assessment_questions = aqs_a + aqs_b + [aq_unsectioned]

    # Total = 20 + 30 + 5 = 55
    assert required_marks(mock_assessment) == 55


def test_required_marks_marks_override_takes_precedence():
    sec = _make_mock_section(title="Sec", questions_to_answer=None)
    aq = _make_mock_aq(marks=10, section_id=sec.id, marks_override=25)

    mock_assessment = MagicMock()
    mock_assessment.sections = [sec]
    mock_assessment.assessment_questions = [aq]

    assert required_marks(mock_assessment) == 25


def test_required_marks_ignores_soft_deleted():
    sec1 = _make_mock_section(title="Active Sec", questions_to_answer=None)
    sec2_del = _make_mock_section(title="Deleted Sec", questions_to_answer=None, is_deleted=True)

    aq1 = _make_mock_aq(marks=10, section_id=sec1.id)
    aq2_del = _make_mock_aq(marks=10, section_id=sec1.id, is_deleted=True)
    aq3_in_del_sec = _make_mock_aq(marks=20, section_id=sec2_del.id)

    mock_assessment = MagicMock()
    mock_assessment.sections = [sec1, sec2_del]
    mock_assessment.assessment_questions = [aq1, aq2_del, aq3_in_del_sec]

    assert required_marks(mock_assessment) == 10


def test_validate_choice_pools_valid():
    sec = _make_mock_section(title="Valid Pool", questions_to_answer=2)
    aqs = [_make_mock_aq(marks=10, section_id=sec.id) for _ in range(4)]

    mock_assessment = MagicMock()
    mock_assessment.sections = [sec]
    mock_assessment.assessment_questions = aqs

    issues = validate_choice_pools(mock_assessment)
    assert issues == []


def test_validate_choice_pools_invalid_n():
    sec = _make_mock_section(title="Zero N Pool", questions_to_answer=0)
    aqs = [_make_mock_aq(marks=10, section_id=sec.id) for _ in range(4)]

    mock_assessment = MagicMock()
    mock_assessment.sections = [sec]
    mock_assessment.assessment_questions = aqs

    issues = validate_choice_pools(mock_assessment)
    assert len(issues) == 1
    assert issues[0].code == "INVALID_N"


def test_validate_choice_pools_n_exceeds_pool():
    sec = _make_mock_section(title="Exceeded Pool", questions_to_answer=5)
    aqs = [_make_mock_aq(marks=10, section_id=sec.id) for _ in range(3)]

    mock_assessment = MagicMock()
    mock_assessment.sections = [sec]
    mock_assessment.assessment_questions = aqs

    issues = validate_choice_pools(mock_assessment)
    assert len(issues) == 1
    assert issues[0].code == "N_EXCEEDS_POOL"


def test_validate_choice_pools_unequal_marks():
    sec = _make_mock_section(title="Unequal Pool", questions_to_answer=2)
    aq1 = _make_mock_aq(marks=10, section_id=sec.id)
    aq2 = _make_mock_aq(marks=15, section_id=sec.id)

    mock_assessment = MagicMock()
    mock_assessment.sections = [sec]
    mock_assessment.assessment_questions = [aq1, aq2]

    issues = validate_choice_pools(mock_assessment)
    assert len(issues) == 1
    assert issues[0].code == "UNEQUAL_MARKS"


def test_validate_summative_structure_compliant_exam():
    # 3 sections: A (CLOSED, 20 marks), B (MIXED, answer 2 of 3 of 20 = 40), C (OPEN, answer 2 of 3 of 20 = 40) -> Total = 100
    sec_a = _make_mock_section(title="Section A", order_index=1, section_kind=SectionKind.CLOSED, questions_to_answer=None)
    aqs_a = [_make_mock_aq(marks=20, section_id=sec_a.id)]
    sec_a.assessment_questions = aqs_a

    sec_b = _make_mock_section(title="Section B", order_index=2, section_kind=SectionKind.MIXED, questions_to_answer=2)
    aqs_b = [_make_mock_aq(marks=20, section_id=sec_b.id) for _ in range(3)]
    sec_b.assessment_questions = aqs_b

    sec_c = _make_mock_section(title="Section C", order_index=3, section_kind=SectionKind.OPEN, questions_to_answer=2)
    aqs_c = [_make_mock_aq(marks=20, section_id=sec_c.id) for _ in range(3)]
    sec_c.assessment_questions = aqs_c

    mock_assessment = MagicMock()
    mock_assessment.assessment_type = AssessmentType.SUMMATIVE
    mock_assessment.sections = [sec_a, sec_b, sec_c]
    mock_assessment.assessment_questions = aqs_a + aqs_b + aqs_c

    res = validate_summative_structure(mock_assessment, policy_total=100)
    assert res.is_valid is True
    assert len(res.hard_violations) == 0
    assert len(res.soft_warnings) == 0


def test_validate_summative_structure_total_mismatch_blocks():
    # Total marks = 90 instead of 100
    sec_a = _make_mock_section(title="Section A", order_index=1, section_kind=SectionKind.CLOSED, questions_to_answer=None)
    aqs_a = [_make_mock_aq(marks=90, section_id=sec_a.id)]
    sec_a.assessment_questions = aqs_a

    mock_assessment = MagicMock()
    mock_assessment.assessment_type = AssessmentType.SUMMATIVE
    mock_assessment.sections = [sec_a]
    mock_assessment.assessment_questions = aqs_a

    res = validate_summative_structure(mock_assessment, policy_total=100)
    assert res.is_valid is False
    assert len(res.hard_violations) == 1
    assert res.hard_violations[0].code == "SUMMATIVE_MARKS_TOTAL"
    assert res.hard_violations[0].is_blocking is True


def test_validate_summative_structure_soft_warnings():
    # Total is 100, but only 2 sections, and Section A is not CLOSED
    sec_a = _make_mock_section(title="Section A", order_index=1, section_kind=SectionKind.MIXED, questions_to_answer=None)
    sec_b = _make_mock_section(title="Section B", order_index=2, section_kind=SectionKind.MIXED, questions_to_answer=2)
    aqs_a = [_make_mock_aq(marks=60, section_id=sec_a.id)]
    aqs_b = [_make_mock_aq(marks=20, section_id=sec_b.id) for _ in range(2)]  # pool_size == questions_to_answer !
    sec_a.assessment_questions = aqs_a
    sec_b.assessment_questions = aqs_b

    mock_assessment = MagicMock()
    mock_assessment.assessment_type = AssessmentType.SUMMATIVE
    mock_assessment.sections = [sec_a, sec_b]
    mock_assessment.assessment_questions = aqs_a + aqs_b

    res = validate_summative_structure(mock_assessment, policy_total=100)
    assert res.is_valid is True  # No hard violations, total is 100!
    assert len(res.hard_violations) == 0
    # Soft warnings expected:
    # 1. SUMMATIVE_SECTION_COUNT (found 2)
    # 2. SECTION_A_KIND (found MIXED)
    # 3. SECTION_B_CHOICE_POOL (pool_size <= questions_to_answer)
    warning_codes = [w.code for w in res.soft_warnings]
    assert "SUMMATIVE_SECTION_COUNT" in warning_codes
    assert "SECTION_A_KIND" in warning_codes
    assert any("CHOICE_POOL" in c for c in warning_codes)


def test_validate_summative_structure_non_summative_allowed_any_marks():
    # Non-summative CAT with 37 marks passes cleanly
    sec = _make_mock_section(title="CAT Sec", questions_to_answer=None)
    aqs = [_make_mock_aq(marks=37, section_id=sec.id)]

    mock_assessment = MagicMock()
    mock_assessment.assessment_type = AssessmentType.CAT
    mock_assessment.sections = [sec]
    mock_assessment.assessment_questions = aqs

    res = validate_summative_structure(mock_assessment, policy_total=100)
    assert res.is_valid is True
    assert len(res.hard_violations) == 0
    assert len(res.soft_warnings) == 0


# ─────────────────────────────────────────────────────────────────────────────
# 2. OVER-ANSWER RESOLUTION TESTS (FIRST_N vs BEST_N)
# ─────────────────────────────────────────────────────────────────────────────

def test_resolve_choice_responses_first_n_by_selection_order():
    sec_id = uuid.uuid4()
    q1_id, q2_id, q3_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

    r1 = MagicMock(id=uuid.uuid4(), question_id=q1_id, auto_grade_score=5.0)
    r2 = MagicMock(id=uuid.uuid4(), question_id=q2_id, auto_grade_score=10.0)
    r3 = MagicMock(id=uuid.uuid4(), question_id=q3_id, auto_grade_score=15.0)

    # Student selected q2 first, then q1, then q3
    s2 = MagicMock(assessment_section_id=sec_id, question_id=q2_id, selected_order=1)
    s1 = MagicMock(assessment_section_id=sec_id, question_id=q1_id, selected_order=2)
    s3 = MagicMock(assessment_section_id=sec_id, question_id=q3_id, selected_order=3)

    decisions = resolve_choice_section_responses(
        section_id=sec_id,
        questions_to_answer=2,
        over_answer_policy=OverAnswerPolicy.FIRST_N,
        responses=[r1, r2, r3],
        selections=[s1, s2, s3],
    )

    dec_by_q = {d.question_id: d for d in decisions}
    # q2 (order 1) -> counted, score 10.0
    assert dec_by_q[q2_id].is_counted is True
    assert dec_by_q[q2_id].score == 10.0
    # q1 (order 2) -> counted, score 5.0
    assert dec_by_q[q1_id].is_counted is True
    assert dec_by_q[q1_id].score == 5.0
    # q3 (order 3) -> excluded, score 0.0
    assert dec_by_q[q3_id].is_counted is False
    assert dec_by_q[q3_id].score == 0.0


def test_resolve_choice_responses_best_n():
    sec_id = uuid.uuid4()
    q1_id, q2_id, q3_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

    r1 = MagicMock(id=uuid.uuid4(), question_id=q1_id, auto_grade_score=2.0)
    r2 = MagicMock(id=uuid.uuid4(), question_id=q2_id, auto_grade_score=10.0)
    r3 = MagicMock(id=uuid.uuid4(), question_id=q3_id, auto_grade_score=7.0)

    # In BEST_N, scores 10.0 and 7.0 should be counted, 2.0 excluded
    decisions = resolve_choice_section_responses(
        section_id=sec_id,
        questions_to_answer=2,
        over_answer_policy=OverAnswerPolicy.BEST_N,
        responses=[r1, r2, r3],
    )

    dec_by_q = {d.question_id: d for d in decisions}
    assert dec_by_q[q2_id].is_counted is True
    assert dec_by_q[q2_id].score == 10.0
    assert dec_by_q[q3_id].is_counted is True
    assert dec_by_q[q3_id].score == 7.0
    assert dec_by_q[q1_id].is_counted is False
    assert dec_by_q[q1_id].score == 0.0


def test_resolve_choice_responses_fewer_than_n():
    sec_id = uuid.uuid4()
    q1_id = uuid.uuid4()
    r1 = MagicMock(id=uuid.uuid4(), question_id=q1_id, auto_grade_score=8.0)

    decisions = resolve_choice_section_responses(
        section_id=sec_id,
        questions_to_answer=2,
        over_answer_policy=OverAnswerPolicy.FIRST_N,
        responses=[r1],
    )

    assert len(decisions) == 1
    assert decisions[0].is_counted is True
    assert decisions[0].score == 8.0


# ─────────────────────────────────────────────────────────────────────────────
# 3. DATABASE SETUP FIXTURE FOR INTEGRATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

async def _setup_assessment_environment(db: AsyncSession):
    """Create institution, department, lecturer, student, course, workspace, and assessment."""
    inst = Institution(
        id=uuid.uuid4(),
        name="Institute of Tech",
        code=f"IT_{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db.add(inst)

    campus = Campus(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="Main Campus",
        code=f"MC_{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    db.add(campus)

    dept = Department(
        id=uuid.uuid4(),
        institution_id=inst.id,
        campus_id=campus.id,
        name="Computer Science",
        code=f"CS_{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    db.add(dept)

    course = Course(
        id=uuid.uuid4(),
        institution_id=inst.id,
        department_id=dept.id,
        name="Data Structures",
        code=f"CS_{uuid.uuid4().hex[:4]}",
        academic_year="2025/2026",
        is_active=True,
    )
    db.add(course)

    lecturer = User(
        id=uuid.uuid4(),
        email=f"lecturer_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    student = User(
        id=uuid.uuid4(),
        email=f"student_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.STUDENT.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    student2 = User(
        id=uuid.uuid4(),
        email=f"student2_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.STUDENT.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    db.add_all([lecturer, student, student2])
    await db.flush()

    teaching_assignment = TeachingAssignment(
        id=uuid.uuid4(),
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_year="2025/2026",
        is_active=True,
    )
    db.add(teaching_assignment)
    await db.flush()

    workspace = TeachingWorkspace(
        id=uuid.uuid4(),
        teaching_assignment_id=teaching_assignment.id,
        course_id=course.id,
        title="CS101 Workspace",
        status="ACTIVE",
    )
    db.add(workspace)
    await db.flush()

    now = datetime.now(UTC)
    assessment = Assessment(
        id=uuid.uuid4(),
        teaching_workspace_id=workspace.id,
        course_id=course.id,
        academic_year="2025/2026",
        created_by_id=lecturer.id,
        title="Midterm Assessment",
        assessment_type=AssessmentType.CAT.value,
        status=AssessmentStatus.DRAFT.value,
        window_start=now - timedelta(hours=1),
        window_end=now + timedelta(hours=4),
        duration_minutes=60,
        over_answer_policy=OverAnswerPolicy.FIRST_N,
    )
    db.add(assessment)
    await db.flush()

    # Create 2 sections: Sec 1 (Compulsory), Sec 2 (Choice 1 of 2)
    sec1 = AssessmentSection(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        title="Section A (Compulsory)",
        order_index=1,
        section_kind=SectionKind.CLOSED,
        questions_to_answer=None,
    )
    sec2 = AssessmentSection(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        title="Section B (Choice)",
        order_index=2,
        section_kind=SectionKind.OPEN,
        questions_to_answer=1,
    )
    db.add_all([sec1, sec2])
    await db.flush()

    # Create questions
    q1 = Question(
        id=uuid.uuid4(),
        created_by_id=lecturer.id,
        course_id=course.id,
        question_type=QuestionType.MCQ,
        content="Q1 in Sec A",
        marks=10,
    )
    q2 = Question(
        id=uuid.uuid4(),
        created_by_id=lecturer.id,
        course_id=course.id,
        question_type=QuestionType.SHORT_ANSWER,
        content="Q2 in Sec B option 1",
        marks=20,
    )
    q3 = Question(
        id=uuid.uuid4(),
        created_by_id=lecturer.id,
        course_id=course.id,
        question_type=QuestionType.SHORT_ANSWER,
        content="Q3 in Sec B option 2",
        marks=20,
    )
    db.add_all([q1, q2, q3])
    await db.flush()

    aq1 = AssessmentQuestion(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        question_id=q1.id,
        assessment_section_id=sec1.id,
        order_index=1,
    )
    aq2 = AssessmentQuestion(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        question_id=q2.id,
        assessment_section_id=sec2.id,
        order_index=2,
    )
    aq3 = AssessmentQuestion(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        question_id=q3.id,
        assessment_section_id=sec2.id,
        order_index=3,
    )
    db.add_all([aq1, aq2, aq3])
    await db.flush()

    # Create student attempt
    attempt = AssessmentAttempt(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        student_id=student.id,
        attempt_number=1,
        status=AttemptStatus.IN_PROGRESS,
        grading_mode=GradingMode.AUTO,
        started_at=now,
        expires_at=now + timedelta(hours=1),
        access_token=uuid.uuid4(),
    )
    db.add(attempt)
    await db.flush()

    return {
        "institution": inst,
        "inst": inst,
        "department": dept,
        "dept": dept,
        "course": course,
        "lecturer": lecturer,
        "student": student,
        "student2": student2,
        "assessment": assessment,
        "sec1": sec1,
        "sec2": sec2,
        "q1": q1,
        "q2": q2,
        "q3": q3,
        "aq1": aq1,
        "aq2": aq2,
        "aq3": aq3,
        "attempt": attempt,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. ATTEMPT SERVICE SELECTION / DESELECTION TESTS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_attempt_service_select_question_success(db: AsyncSession):
    env = await _setup_assessment_environment(db)
    service = AttemptService(db)

    # Student selects q2 in Sec B (Choice 1 of 2)
    selection = await service.select_question(
        attempt_id=env["attempt"].id,
        section_id=env["sec2"].id,
        question_id=env["q2"].id,
        current_user=env["student"],
    )

    assert selection is not None
    assert selection.attempt_id == env["attempt"].id
    assert selection.assessment_section_id == env["sec2"].id
    assert selection.question_id == env["q2"].id
    assert selection.selected_order == 1


@pytest.mark.asyncio
async def test_attempt_service_select_question_limit_exceeded(db: AsyncSession):
    env = await _setup_assessment_environment(db)
    service = AttemptService(db)

    # Sec B questions_to_answer = 1.
    # First selection succeeds
    await service.select_question(
        attempt_id=env["attempt"].id,
        section_id=env["sec2"].id,
        question_id=env["q2"].id,
        current_user=env["student"],
    )

    # Second selection exceeds N=1 -> must raise BadRequestError with CHOICE_LIMIT_EXCEEDED
    with pytest.raises(BadRequestError) as exc_info:
        await service.select_question(
            attempt_id=env["attempt"].id,
            section_id=env["sec2"].id,
            question_id=env["q3"].id,
            current_user=env["student"],
        )
    assert exc_info.value.code == "CHOICE_LIMIT_EXCEEDED"


@pytest.mark.asyncio
async def test_attempt_service_select_question_idor_rejected(db: AsyncSession):
    env = await _setup_assessment_environment(db)
    service = AttemptService(db)

    # Student 2 tries to select question on Student 1's attempt
    with pytest.raises(AuthorizationError) as exc_info:
        await service.select_question(
            attempt_id=env["attempt"].id,
            section_id=env["sec2"].id,
            question_id=env["q2"].id,
            current_user=env["student2"],
        )
    assert exc_info.value.code == "FORBIDDEN"


@pytest.mark.asyncio
async def test_attempt_service_select_question_after_submission_rejected(db: AsyncSession):
    env = await _setup_assessment_environment(db)
    service = AttemptService(db)

    # Set attempt to SUBMITTED
    env["attempt"].status = AttemptStatus.SUBMITTED
    db.add(env["attempt"])
    await db.flush()

    with pytest.raises(ValidationError) as exc_info:
        await service.select_question(
            attempt_id=env["attempt"].id,
            section_id=env["sec2"].id,
            question_id=env["q2"].id,
            current_user=env["student"],
        )
    assert exc_info.value.code == "ATTEMPT_NOT_ACTIVE"


@pytest.mark.asyncio
async def test_attempt_service_deselect_question_and_reindex(db: AsyncSession):
    env = await _setup_assessment_environment(db)
    service = AttemptService(db)

    # Change sec2 questions_to_answer to 3 so we can select multiple
    env["sec2"].questions_to_answer = 3
    db.add(env["sec2"])
    await db.flush()

    # Add a 4th question to sec2
    q4 = Question(
        id=uuid.uuid4(),
        created_by_id=env["lecturer"].id,
        course_id=env["course"].id,
        question_type=QuestionType.SHORT_ANSWER,
        content="Q4 in Sec B",
        marks=20,
    )
    db.add(q4)
    await db.flush()
    aq4 = AssessmentQuestion(
        id=uuid.uuid4(),
        assessment_id=env["assessment"].id,
        question_id=q4.id,
        assessment_section_id=env["sec2"].id,
        order_index=4,
    )
    db.add(aq4)
    await db.flush()

    # Select q2 (order 1), q3 (order 2), q4 (order 3)
    s1 = await service.select_question(
        attempt_id=env["attempt"].id,
        section_id=env["sec2"].id,
        question_id=env["q2"].id,
        current_user=env["student"],
    )
    s2 = await service.select_question(
        attempt_id=env["attempt"].id,
        section_id=env["sec2"].id,
        question_id=env["q3"].id,
        current_user=env["student"],
    )
    s3 = await service.select_question(
        attempt_id=env["attempt"].id,
        section_id=env["sec2"].id,
        question_id=q4.id,
        current_user=env["student"],
    )
    assert s1.selected_order == 1
    assert s2.selected_order == 2
    assert s3.selected_order == 3

    # Now deselect q2 (order 1)
    await service.deselect_question(
        attempt_id=env["attempt"].id,
        question_id=env["q2"].id,
        current_user=env["student"],
    )

    # Remaining selections should be re-indexed: q3 -> 1, q4 -> 2
    from app.db.repositories.attempt_repo import AttemptRepository
    repo = AttemptRepository(db)
    remaining = await repo.list_selections_for_attempt(env["attempt"].id, env["sec2"].id)
    assert len(remaining) == 2
    order_by_q = {r.question_id: r.selected_order for r in remaining}
    assert order_by_q[env["q3"].id] == 1
    assert order_by_q[q4.id] == 2


# ─────────────────────────────────────────────────────────────────────────────
# 5. API ENDPOINT INTEGRATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_patch_assessment_section_endpoint(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    env = await _setup_assessment_environment(db)
    lecturer_hdr = make_auth_headers(
        user_id=str(env["lecturer"].id),
        role=UserRole.LECTURER,
        email=env["lecturer"].email,
    )

    # Patch Section A
    res = await client.patch(
        f"/api/v1/assessments/{env['assessment'].id}/sections/{env['sec1'].id}",
        headers=lecturer_hdr,
        json={
            "section_kind": SectionKind.CLOSED.value,
            "questions_to_answer": 1,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["section_kind"] == SectionKind.CLOSED.value
    assert data["questions_to_answer"] == 1


@pytest.mark.asyncio
async def test_get_marks_summary_endpoint(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    env = await _setup_assessment_environment(db)
    lecturer_hdr = make_auth_headers(
        user_id=str(env["lecturer"].id),
        role=UserRole.LECTURER,
        email=env["lecturer"].email,
    )

    # Call marks summary endpoint
    res = await client.get(
        f"/api/v1/assessments/{env['assessment'].id}/marks-summary",
        headers=lecturer_hdr,
    )
    assert res.status_code == 200
    data = res.json()
    assert "required_marks" in data
    assert "max_possible_score" in data
    assert "choice_pool_issues" in data
    assert "structure_violations" in data

    # Also check the /lecturer/assessments/{id}/marks-summary route
    res_alt = await client.get(
        f"/lecturer/assessments/{env['assessment'].id}/marks-summary",
        headers=lecturer_hdr,
    )
    assert res_alt.status_code == 200
    assert res_alt.json()["required_marks"] == data["required_marks"]


@pytest.mark.asyncio
async def test_student_select_and_deselect_endpoints(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    env = await _setup_assessment_environment(db)
    student_hdr = make_auth_headers(
        user_id=str(env["student"].id),
        role=UserRole.STUDENT,
        email=env["student"].email,
    )
    other_student_hdr = make_auth_headers(
        user_id=str(env["student2"].id),
        role=UserRole.STUDENT,
        email=env["student2"].email,
    )

    # 1. IDOR prevention: other student cannot select
    res_idor = await client.post(
        f"/student/attempts/{env['attempt'].id}/sections/{env['sec2'].id}/select",
        headers=other_student_hdr,
        json={"question_id": str(env["q2"].id)},
    )
    assert res_idor.status_code == 403

    # 2. Legitimate student selects question
    res_select = await client.post(
        f"/student/attempts/{env['attempt'].id}/sections/{env['sec2'].id}/select",
        headers=student_hdr,
        json={"question_id": str(env["q2"].id)},
    )
    assert res_select.status_code == 201
    sel_data = res_select.json()
    assert sel_data["question_id"] == str(env["q2"].id)
    assert sel_data["selected_order"] == 1

    # 3. Limit exceeded: trying to select second question when N=1
    res_overflow = await client.post(
        f"/student/attempts/{env['attempt'].id}/sections/{env['sec2'].id}/select",
        headers=student_hdr,
        json={"question_id": str(env["q3"].id)},
    )
    assert res_overflow.status_code == 400
    err_json = res_overflow.json()
    assert (
        err_json.get("error", {}).get("code") == "CHOICE_LIMIT_EXCEEDED"
        or "CHOICE_LIMIT_EXCEEDED" in str(err_json)
    )

    # 4. Deselect question
    res_del = await client.delete(
        f"/student/attempts/{env['attempt'].id}/questions/{env['q2'].id}/select",
        headers=student_hdr,
    )
    assert res_del.status_code == 204

    # 5. Now can select q3
    res_select2 = await client.post(
        f"/student/attempts/{env['attempt'].id}/sections/{env['sec2'].id}/select",
        headers=student_hdr,
        json={"question_id": str(env["q3"].id)},
    )
    assert res_select2.status_code == 201
    assert res_select2.json()["question_id"] == str(env["q3"].id)


# ─────────────────────────────────────────────────────────────────────────────
# 6. INTEGRATION: FINALIZE ASSESSMENT & RESULT CALCULATION
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_finalize_assessment_blocks_on_choice_pool_issue(db: AsyncSession):
    env = await _setup_assessment_environment(db)
    service = AssessmentService(db)

    # Set sec2 questions_to_answer = 5 when section only has 2 questions
    env["sec2"].questions_to_answer = 5
    db.add(env["sec2"])
    await db.flush()

    res = await service.finalize_assessment(
        assessment_id=env["assessment"].id,
        current_user=env["lecturer"],
    )
    assert res.validation_passed is False
    assert any("Choice pool:" in e for e in res.errors)


@pytest.mark.asyncio
async def test_finalize_assessment_blocks_on_summative_structure_total(db: AsyncSession):
    env = await _setup_assessment_environment(db)
    service = AssessmentService(db)

    # Change assessment to SUMMATIVE with total_marks=30 (requires 100)
    env["assessment"].assessment_type = AssessmentType.SUMMATIVE.value
    env["assessment"].total_marks = 30
    db.add(env["assessment"])
    await db.flush()

    res = await service.finalize_assessment(
        assessment_id=env["assessment"].id,
        current_user=env["lecturer"],
    )
    assert res.validation_passed is False
    assert any("Structure:" in e for e in res.errors)


@pytest.mark.asyncio
async def test_result_calculation_uses_required_marks_for_percentage(db: AsyncSession):
    from app.db.models.attempt import StudentResponse, SubmissionGrade
    from app.services.result_service import ResultService

    env = await _setup_assessment_environment(db)

    # Set attempt to SUBMITTED
    env["attempt"].status = AttemptStatus.SUBMITTED
    db.add(env["attempt"])
    await db.flush()

    # Section A has q1 (10 marks)
    # Section B has q2 (20 marks) and q3 (20 marks), questions_to_answer=1
    # Total required marks = 10 + (1 * 20) = 30 marks

    # Student selected q2 (order 1)
    sel = AttemptSectionSelection(
        id=uuid.uuid4(),
        attempt_id=env["attempt"].id,
        assessment_section_id=env["sec2"].id,
        question_id=env["q2"].id,
        selected_order=1,
    )
    db.add(sel)

    # Response for q1 in Section A (scored 10.0 / 10)
    r1 = StudentResponse(
        id=uuid.uuid4(),
        attempt_id=env["attempt"].id,
        question_id=env["q1"].id,
        content="Answer 1",
        is_counted=True,
    )
    db.add(r1)
    await db.flush()

    g1 = SubmissionGrade(
        id=uuid.uuid4(),
        assessment_id=env["assessment"].id,
        attempt_id=env["attempt"].id,
        student_id=env["student"].id,
        question_id=env["q1"].id,
        response_id=r1.id,
        grading_mode="MANUAL",
        score=10.0,
        max_score=10.0,
        is_final=True,
        is_counted=True,
    )
    db.add(g1)

    # Response for q2 in Section B (scored 5.0 / 20)
    r2 = StudentResponse(
        id=uuid.uuid4(),
        attempt_id=env["attempt"].id,
        question_id=env["q2"].id,
        content="Answer 2",
        is_counted=True,
    )
    db.add(r2)
    await db.flush()

    g2 = SubmissionGrade(
        id=uuid.uuid4(),
        assessment_id=env["assessment"].id,
        attempt_id=env["attempt"].id,
        student_id=env["student"].id,
        question_id=env["q2"].id,
        response_id=r2.id,
        grading_mode="MANUAL",
        score=5.0,
        max_score=20.0,
        is_final=True,
        is_counted=True,
    )
    db.add(g2)
    await db.flush()

    result_svc = ResultService(db)
    result, created = await result_svc.calculate_result(
        attempt_id=env["attempt"].id,
        allow_partial=True,
    )

    # Total score = 10 + 5 = 15
    # Max possible score = required_marks = 30
    # Percentage = (15 / 30) * 100 = 50.0%
    assert result.total_score == 15.0
    assert result.max_score == 30.0
    assert result.percentage == 50.0


# ─────────────────────────────────────────────────────────────────────────────
# 7. REGRESSION TESTS FOR MARKS SUMMARY AUTH, POLICY TOTAL & BLUEPRINT CHOICE
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_marks_summary_authorization_moderator_and_unrelated_lecturer(db: AsyncSession):
    """
    Test marks summary authorization:
    - Authorized moderator for course's department: allowed.
    - Moderator for a different department: rejected (AuthorizationError).
    - Unrelated lecturer (neither creator, co-author, nor moderator): rejected (AuthorizationError).
    """
    from app.core.constants import Duty
    from app.db.models.duty import UserDutyAssignment

    env = await _setup_assessment_environment(db)
    service = AssessmentService(db)

    # Create another department
    other_dept = Department(
        id=uuid.uuid4(),
        institution_id=env["inst"].id,
        name="Other Department",
        code=f"OD_{uuid.uuid4().hex[:6]}",
    )
    db.add(other_dept)

    # 1. Authorized moderator for env["dept"]
    auth_mod = User(
        id=uuid.uuid4(),
        email=f"auth_mod_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    db.add(auth_mod)
    await db.flush()

    duty_auth = UserDutyAssignment(
        id=uuid.uuid4(),
        user_id=auth_mod.id,
        duty=Duty.MODERATOR,
        institution_id=env["inst"].id,
        department_id=env["dept"].id,
        is_active=True,
        valid_from=datetime.now(UTC) - timedelta(days=1),
        assigned_by_id=env["lecturer"].id,
    )
    db.add(duty_auth)

    # 2. Moderator for other_dept
    other_mod = User(
        id=uuid.uuid4(),
        email=f"other_mod_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    db.add(other_mod)
    await db.flush()

    duty_other = UserDutyAssignment(
        id=uuid.uuid4(),
        user_id=other_mod.id,
        duty=Duty.MODERATOR,
        institution_id=env["inst"].id,
        department_id=other_dept.id,
        is_active=True,
        valid_from=datetime.now(UTC) - timedelta(days=1),
        assigned_by_id=env["lecturer"].id,
    )
    db.add(duty_other)

    # 3. Unrelated lecturer
    unrelated_lec = User(
        id=uuid.uuid4(),
        email=f"unrelated_lec_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    db.add(unrelated_lec)
    await db.flush()

    # Authorized moderator should succeed
    summary = await service.get_marks_summary(
        assessment_id=env["assessment"].id,
        current_user=auth_mod,
    )
    assert summary is not None
    assert summary["assessment_id"] == env["assessment"].id

    # Moderator from another department should be denied
    with pytest.raises(AuthorizationError):
        await service.get_marks_summary(
            assessment_id=env["assessment"].id,
            current_user=other_mod,
        )

    # Unrelated lecturer should be denied
    with pytest.raises(AuthorizationError):
        await service.get_marks_summary(
            assessment_id=env["assessment"].id,
            current_user=unrelated_lec,
        )


@pytest.mark.asyncio
async def test_configured_summative_total_from_approval_policy(db: AsyncSession):
    """
    Test that finalize_assessment and get_marks_summary respect
    ApprovalPolicy.summative_total_marks when configured (e.g. 80 marks).
    """
    from app.db.models.policy import ApprovalPolicy
    from app.db.repositories.approval_policy_repo import ApprovalPolicyRepository

    env = await _setup_assessment_environment(db)
    service = AssessmentService(db)

    # Configure ApprovalPolicy for the institution: summative_total_marks = 80
    policy_repo = ApprovalPolicyRepository(db)
    policy = ApprovalPolicy(
        id=uuid.uuid4(),
        institution_id=env["inst"].id,
        assessment_type=AssessmentType.SUMMATIVE,
        requires_moderation=True,
        enforce_structure_template=True,
        summative_total_marks=80,
    )
    await policy_repo.create(policy)

    # Setup assessment as SUMMATIVE with total_marks=80
    ass = env["assessment"]
    ass.assessment_type = AssessmentType.SUMMATIVE.value
    ass.total_marks = 80
    db.add(ass)

    # Section A (compulsory): 40 marks
    env["q1"].marks = 40
    db.add(env["q1"])

    # Section B (choice 1 of 2): 40 marks each (effective required marks = 1 * 40 = 40)
    # Total required marks = 40 + 40 = 80
    env["q2"].marks = 40
    env["q3"].marks = 40
    db.add_all([env["q2"], env["q3"]])
    await db.flush()

    # Finalize assessment: required marks (80) matches policy (80) -> passes hard structure check!
    res = await service.finalize_assessment(
        assessment_id=ass.id,
        current_user=env["lecturer"],
    )
    assert not any("Summative assessment total required marks must be exactly" in e for e in res.errors), res.errors

    # Marks summary should reflect configured_policy_total_marks = 80
    summary = await service.get_marks_summary(
        assessment_id=ass.id,
        current_user=env["lecturer"],
    )
    assert summary["configured_policy_total_marks"] == 80
    assert summary["required_marks"] == 80

    # If assessment required marks is 100 when policy specifies 80 -> must block!
    ass.total_marks = 100
    ass.draft_is_complete = False
    ass.status = AssessmentStatus.DRAFT.value
    env["q1"].marks = 60
    db.add_all([ass, env["q1"]])
    await db.flush()

    res_fail = await service.finalize_assessment(
        assessment_id=ass.id,
        current_user=env["lecturer"],
    )
    assert res_fail.validation_passed is False
    assert any("must be exactly 80" in e for e in res_fail.errors)


@pytest.mark.asyncio
async def test_blueprint_service_choice_section_allocated_marks_validation(db: AsyncSession):
    """
    Test that BlueprintService validates section marks against the choice pool's
    required contribution (N * marks_per_question) rather than summing all questions.
    """
    from app.services.blueprint_service import BlueprintService

    env = await _setup_assessment_environment(db)
    bp_service = BlueprintService(db)

    # Section B has 2 questions of 20 marks each, questions_to_answer=1.
    # Required contribution = 1 * 20 = 20 marks.
    # If allocated_marks is 20, it should match!
    env["sec2"].allocated_marks = 20
    db.add(env["sec2"])
    await db.flush()

    res = await bp_service.validate_blueprint(env["assessment"].id)
    sec_marks_violations = [v for v in res.violations if v.rule_type == "section_marks" and "Section B" in v.message]
    assert len(sec_marks_violations) == 0

    # If allocated_marks is 40 (raw sum of all questions), it should report violation!
    env["sec2"].allocated_marks = 40
    db.add(env["sec2"])
    await db.flush()

    res2 = await bp_service.validate_blueprint(env["assessment"].id)
    sec_marks_violations2 = [v for v in res2.violations if v.rule_type == "section_marks" and "Section B" in v.message]
    assert len(sec_marks_violations2) == 1
    assert sec_marks_violations2[0].actual == 20
    assert sec_marks_violations2[0].expected == 40

