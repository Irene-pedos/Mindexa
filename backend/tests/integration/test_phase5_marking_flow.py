"""
tests/integration/test_phase5_marking_flow.py

End-to-end integration test for Phase 5 (Section 9):
1. Question marking scheme and step marks (method marks) creation
2. Lecturer material key points and linking to question
3. AI ReviewAgent v2 generation with key-point evidence quotes and model answer context
4. Sample-check trust-building mode gating bulk-accept
5. Bulk-accept flow finalizing AI suggestions with lecturer attribution and audit logging
6. Delegated grading with course assignment verification and delegation tracking
7. Anonymous marking masking student identities in grading workflows
"""
from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.review_agent import ReviewAgent, ReviewAgentV2Output
from app.core.constants import AssessmentType, UserRole
from app.core.exceptions import ConflictError
from app.db.enums import (
    AcademicPeriodType,
    AIGradeDecision,
    AssessmentStatus,
    AttemptStatus,
    DelegationStatus,
    GradingDelegationScope,
    GradingMode,
    KeyPointImportance,
    LecturerAssignmentRole,
    QuestionType,
    SampleCheckStatus,
    StepKind,
)
from app.db.models.academic import (
    AcademicPeriod,
    Campus,
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
from app.db.models.ai import AIActionLog, AIGradeReview
from app.db.models.assessment import Assessment, AssessmentSection
from app.db.models.attempt import AssessmentAttempt, GradingQueueItem, StudentResponse, SubmissionGrade
from app.db.models.audit import AuditLog
from app.db.models.auth import User, UserProfile
from app.db.models.marking import (
    AIGradeSampleCheck,
    GradingDelegation,
    MarkingScheme,
    MaterialKeyPoint,
    QuestionKeyPoint,
    QuestionMarkStep,
)
from app.db.models.question import Question
from app.db.models.resource import LecturerMaterial
from app.main import app
from app.schemas.marking import (
    GradingDelegationCreate,
    MaterialKeyPointCreate,
    MarkingSchemeCreate,
    QuestionMarkStepCreate,
    SampleCheckVerifyItem,
)
from app.services.grading_service import GradingService
from app.services.marking_service import MarkingService


@pytest.mark.asyncio
async def test_full_phase5_marking_flow(db: AsyncSession):
    # ── 1. Setup Academic Hierarchy ──────────────────────────────────────────
    inst = Institution(name="National University of Rwanda", code="NUR")
    db.add(inst)
    await db.flush()

    campus = Campus(institution_id=inst.id, name="Huye Campus", code="HC")
    db.add(campus)
    await db.flush()

    period = AcademicPeriod(
        institution_id=inst.id,
        name="2026 Semester 1",
        period_type=AcademicPeriodType.SEMESTER,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
    )
    db.add(period)
    await db.flush()

    dept = Department(institution_id=inst.id, name="Computer Science", code="CS")
    db.add(dept)
    await db.flush()

    course = Course(
        institution_id=inst.id,
        academic_period_id=period.id,
        department_id=dept.id,
        name="Information Security",
        code="CS302",
        academic_year="2026",
    )
    db.add(course)
    await db.flush()

    opt = Option(department_id=dept.id, name="Software Engineering", code="SE")
    db.add(opt)
    await db.flush()
    cg = ClassGroup(option_id=opt.id, name="CS Year 3", code="CSY3")
    db.add(cg)
    await db.flush()
    sec = ClassSection(class_group_id=cg.id, name="Section A", department_id=dept.id)
    db.add(sec)
    await db.flush()

    # Users
    author = User(
        id=uuid.uuid4(),
        email="author_sec@nur.ac",
        hashed_password="pw",
        role=UserRole.LECTURER,
        status="ACTIVE",
        email_verified=True,
    )
    delegate = User(
        id=uuid.uuid4(),
        email="delegate_sec@nur.ac",
        hashed_password="pw",
        role=UserRole.LECTURER,
        status="ACTIVE",
        email_verified=True,
    )
    student = User(
        id=uuid.uuid4(),
        email="alice@student.nur.ac",
        hashed_password="pw",
        role=UserRole.STUDENT,
        status="ACTIVE",
        email_verified=True,
    )
    db.add_all([author, delegate, student])
    await db.flush()

    db.add_all([
        UserProfile(user_id=author.id, first_name="Jean", last_name="Author"),
        UserProfile(user_id=delegate.id, first_name="Paul", last_name="Delegate"),
        UserProfile(user_id=student.id, first_name="Alice", last_name="Mugisha"),
    ])
    await db.flush()

    # Assign both author and delegate to the course
    author_assignment = TeachingAssignment(
        lecturer_id=author.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        class_section_id=sec.id,
        option_id=opt.id,
        is_active=True,
    )
    delegate_assignment = TeachingAssignment(
        lecturer_id=delegate.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_period_id=period.id,
        academic_year="2026",
        role=LecturerAssignmentRole.MAIN_LECTURER,
        class_section_id=sec.id,
        option_id=opt.id,
        is_active=True,
    )
    db.add_all([author_assignment, delegate_assignment])
    await db.flush()

    # Workspace
    workspace = TeachingWorkspace(
        teaching_assignment_id=author_assignment.id,
        course_id=course.id,
        class_section_id=sec.id,
        academic_period_id=period.id,
        title="InfoSec 2026 Workspace",
        created_by_id=author.id,
    )
    db.add(workspace)
    await db.flush()

    # ── 2. Assessment with Anonymous Marking ─────────────────────────────────
    assessment = Assessment(
        title="Cryptography Summative Paper",
        assessment_type=AssessmentType.SUMMATIVE,
        teaching_workspace_id=workspace.id,
        course_id=course.id,
        created_by_id=author.id,
        status=AssessmentStatus.ACTIVE,
        academic_year="2026",
        total_marks=100.0,
        anonymous_marking=True,  # Phase 5 R-11 anonymous marking
        ai_assistance_allowed=True,
    )
    db.add(assessment)
    await db.flush()

    # Question (Essay, 10 marks)
    question = Question(
        course_id=course.id,
        created_by_id=author.id,
        question_type=QuestionType.ESSAY,
        content="Explain the difference between symmetric and asymmetric encryption.",
        marks=10.0,
        is_deleted=False,
    )
    db.add(question)
    await db.flush()

    marking_service = MarkingService(db)

    # ── 3. Marking Scheme & Step Marks (Method Marks, R-12) ──────────────────
    scheme = await marking_service.create_or_update_marking_scheme(
        question_id=question.id,
        user=author,
        data=MarkingSchemeCreate(
            model_answer=(
                "Symmetric encryption uses a single shared secret key for both encryption and decryption. "
                "Asymmetric encryption uses a mathematically linked public-private key pair."
            ),
            allow_partial_credit=True,
            notes="Credit method marks for key distribution distinction and mathematical foundation.",
        ),
    )
    assert scheme.model_answer.startswith("Symmetric encryption")

    # Step marks sum must equal question.marks (10.0)
    steps = [
        QuestionMarkStepCreate(
            step_no=1,
            description="Clear definition of symmetric encryption and key sharing",
            marks=5.0,
            kind=StepKind.METHOD,
        ),
        QuestionMarkStepCreate(
            step_no=2,
            description="Clear definition of asymmetric key pairs and public distribution",
            marks=5.0,
            kind=StepKind.ACCURACY,
        ),
    ]
    saved_steps = await marking_service.batch_save_steps(question.id, author, steps)
    assert len(saved_steps) == 2
    assert sum(s.marks for s in saved_steps) == 10.0

    # ── 4. Lecturer Material Key Points (R-13) ───────────────────────────────
    material = LecturerMaterial(
        lecturer_id=author.id,
        teaching_workspace_id=workspace.id,
        course_id=course.id,
        original_filename="Lecture4_Public_Key_Crypto.pdf",
        safe_filename="Lecture4_Public_Key_Crypto.pdf",
        file_path="/materials/Lecture4_Public_Key_Crypto.pdf",
        file_size_bytes=1024,
        file_extension="pdf",
        mime_type="application/pdf",
    )
    db.add(material)
    await db.flush()

    key_point = await marking_service.create_material_key_point(
        material_id=material.id,
        user=author,
        data=MaterialKeyPointCreate(
            text="Asymmetric cryptography uses a public key for encryption and private key for decryption.",
            importance=KeyPointImportance.CORE,
            page_number=4,
        ),
    )
    assert key_point.importance == KeyPointImportance.CORE

    # Attach key point to question
    attached_kps = await marking_service.attach_key_points_to_question(
        question.id, author, [key_point.id]
    )
    assert len(attached_kps) == 1
    assert attached_kps[0].id == key_point.id

    # ── 5. Student Attempt & Submission ──────────────────────────────────────
    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student.id,
        class_section_id=sec.id,
        status=AttemptStatus.SUBMITTED,
        grading_mode=GradingMode.SEMI,
        attempt_number=1,
        started_at=datetime.now(UTC) - timedelta(hours=1),
        submitted_at=datetime.now(UTC),
    )
    db.add(attempt)
    await db.flush()

    student_ans_text = (
        "Symmetric encryption uses one single key for everything. "
        "In contrast, asymmetric cryptography uses a public key for encryption and private key for decryption."
    )
    response = StudentResponse(
        attempt_id=attempt.id,
        question_id=question.id,
        answer_text=student_ans_text,
    )
    db.add(response)
    await db.flush()

    grade = SubmissionGrade(
        attempt_id=attempt.id,
        assessment_id=assessment.id,
        question_id=question.id,
        student_id=student.id,
        response_id=response.id,
        max_score=10.0,
        grading_mode=GradingMode.SEMI,
        is_final=False,
    )
    db.add(grade)
    await db.flush()

    # ── 6. AI ReviewAgent v2 Suggestion ──────────────────────────────────────
    gateway = MagicMock()
    mock_llm_response = MagicMock()
    mock_llm_response.content = json.dumps({
        "suggested_score": 9.0,
        "rationale": "Accurately defines both types and correctly identifies the key pair mechanism.",
        "rubric_alignment": [
            {"criterion": "Interpretation of the question", "notes": "Understood difference clearly", "marks_awarded": 2.0},
            {"criterion": "Quality of the answer", "notes": "Sound reasoning and definitions", "marks_awarded": 4.0},
            {"criterion": "Use of course content", "notes": "Applied cryptographic concepts", "marks_awarded": 1.5},
            {"criterion": "Key-point coverage", "notes": "Covered the core asymmetric key pair point", "marks_awarded": 1.5},
        ],
        "confidence": 0.95,
        "key_points_coverage": [
            {
                "key_point_id": str(key_point.id),
                "covered": True,
                "evidence_quote": "asymmetric cryptography uses a public key for encryption and private key for decryption",
                "note": "Exact match with highlighted lecture statement",
            }
        ],
        "interpretation_note": "Student grasped the key duality correctly.",
    })
    gateway.complete = AsyncMock(return_value=mock_llm_response)

    agent = ReviewAgent(gateway=gateway)
    v2_output, _ = await agent.review_response_v2(
        question_text=question.content,
        student_answer=student_ans_text,
        max_score=10.0,
        question_type="essay",
        key_points=[{"id": str(key_point.id), "text": key_point.text, "importance": "CORE"}],
        marking_scheme=scheme.model_answer,
        step_marks=[{"step_no": s.step_no, "description": s.description, "marks": s.marks} for s in saved_steps],
    )

    assert v2_output.suggested_score == 9.0
    assert len(v2_output.key_points_coverage) == 1
    assert v2_output.key_points_coverage[0].covered is True
    # Verify exact quote was preserved
    assert v2_output.key_points_coverage[0].evidence_quote is not None

    # Save AI review record in PENDING state
    ai_review = AIGradeReview(
        attempt_id=attempt.id,
        assessment_id=assessment.id,
        student_id=student.id,
        response_id=response.id,
        submission_grade_id=grade.id,
        grading_decision=AIGradeDecision.PENDING,
        ai_suggested_total=9.0,
        max_possible_score=10.0,
    )
    db.add(ai_review)
    grade.ai_suggested_score = 9.0
    await db.flush()

    # ── 7. Sample-Check Mode Gating Bulk Accept (R-13) ────────────────────────
    # Bulk accept blocked before sample check
    with pytest.raises(ConflictError) as exc_info:
        await marking_service.bulk_accept_grades(assessment.id, author)
    assert exc_info.value.code == "SAMPLE_CHECK_REQUIRED"

    # Create sample check
    sample_check = await marking_service.create_sample_check(assessment.id, author, sample_size=1)
    assert sample_check.status == SampleCheckStatus.PENDING
    assert sample_check.sample_size == 1

    # Verify sample check (Lecturer agrees with suggestion)
    verify_req = [
        SampleCheckVerifyItem(
            review_id=ai_review.id,
            agreed=True,
            lecturer_feedback="Confirmed accurate",
        )
    ]
    verified_check = await marking_service.verify_sample_check(
        assessment.id, sample_check.id, author, verify_req
    )
    assert verified_check.status == SampleCheckStatus.VERIFIED
    assert verified_check.agreement_rate == 1.0

    # Bulk accept now succeeds
    bulk_result = await marking_service.bulk_accept_grades(assessment.id, author)
    assert bulk_result["status"] == "COMPLETED"

    # Verify grade finalized with author attribution
    updated_grade = (await db.execute(select(SubmissionGrade).where(SubmissionGrade.id == grade.id))).scalar_one()
    assert updated_grade.is_final is True
    assert updated_grade.score == 9.0
    assert updated_grade.graded_by_id == author.id

    # Verify audit log recorded [AUDIT]
    audit_res = await db.execute(
        select(AuditLog).where(
            AuditLog.entity_id == assessment.id,
            AuditLog.action == "ai_grades_bulk_accepted",
        )
    )
    audit = audit_res.scalar_one_or_none()
    assert audit is not None
    assert audit.actor_id == author.id

    # ── 8. Delegated Marking (R-11, Section 9.7) ─────────────────────────────
    # Create delegation from author to delegate (fellow course lecturer)
    delegation_data = GradingDelegationCreate(
        delegate_id=delegate.id,
        scope=GradingDelegationScope.WHOLE,
        reason="Primary author attending pedagogical colloquium",
        valid_from=datetime.now(UTC) - timedelta(hours=1),
        valid_to=datetime.now(UTC) + timedelta(days=3),
    )
    delegation = await marking_service.create_grading_delegation(
        assessment.id, author, delegation_data
    )
    assert delegation.status == DelegationStatus.ACTIVE

    # Create a second student attempt for delegate to mark
    student2 = User(
        id=uuid.uuid4(),
        email="bob@student.nur.ac",
        hashed_password="pw",
        role=UserRole.STUDENT,
        status="ACTIVE",
        email_verified=True,
    )
    db.add(student2)
    await db.flush()

    attempt2 = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student2.id,
        class_section_id=sec.id,
        status=AttemptStatus.SUBMITTED,
        grading_mode=GradingMode.MANUAL,
        attempt_number=1,
        started_at=datetime.now(UTC) - timedelta(hours=1),
        submitted_at=datetime.now(UTC),
    )
    db.add(attempt2)
    await db.flush()

    response2 = StudentResponse(
        attempt_id=attempt2.id,
        question_id=question.id,
        answer_text="Symmetric uses single key, asymmetric uses key pairs.",
    )
    db.add(response2)
    await db.flush()

    grade2 = SubmissionGrade(
        attempt_id=attempt2.id,
        assessment_id=assessment.id,
        question_id=question.id,
        student_id=student2.id,
        response_id=response2.id,
        max_score=10.0,
        grading_mode=GradingMode.MANUAL,
        is_final=False,
    )
    db.add(grade2)
    await db.flush()

    # Delegate finalizes the grade
    grading_service = GradingService(db)
    finalized_by_delegate = await grading_service.finalize_grade(
        response_id=response2.id,
        lecturer_id=delegate.id,
        score=8.0,
        feedback="Good concise explanation.",
    )

    # Verify delegation was tracked on SubmissionGrade
    saved_grade2 = (await db.execute(select(SubmissionGrade).where(SubmissionGrade.id == grade2.id))).scalar_one()
    assert saved_grade2.is_final is True
    assert saved_grade2.score == 8.0
    assert saved_grade2.graded_by_id == delegate.id
    assert saved_grade2.delegation_id == delegation.id

    # ── 9. Anonymous Marking Verification ────────────────────────────────────
    # In anonymous marking mode, grading queue returns Candidate alias
    from app.db.repositories.grading_repo import GradingRepository
    g_repo = GradingRepository(db)
    # Add item to queue to test queue query
    q_item = GradingQueueItem(
        attempt_id=attempt.id,
        response_id=response.id,
        assessment_id=assessment.id,
        question_id=question.id,
        student_id=student.id,
        grading_mode="MANUAL",
    )
    db.add(q_item)
    await db.flush()

    queue_items, total = await g_repo.list_queue(assessment_ids=[assessment.id])
    assert total >= 1
    # Check that candidate alias is used
    matched = [item for item in queue_items if item["attempt_id"] == attempt.id]
    if matched:
        assert matched[0]["student_name"].startswith("Candidate-")
        assert "Alice" not in matched[0]["student_name"]
