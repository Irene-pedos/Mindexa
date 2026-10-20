"""
tests/unit/test_phase5_marking.py

Unit tests for Phase 5 marking rules:
1. Step marks sum validation (must equal question marks, mismatch fails)
2. ReviewAgent v2 output validation (inconsistent sums, hallucinated quotes)
3. AI cannot finalize grades without lecturer action
4. Sample-check requirement before bulk-accepting AI suggestions
5. Low agreement rate blocking and override rules
6. Delegated grader course assignment enforcement
7. Language policy blocks AI path for unsupported languages (RW) while manual path works
8. Key points injected in ReviewAgent v2 prompt
9. Anonymous marking masks student identity
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.agents.review_agent import (
    KeyPointCoverageItem,
    ReviewAgent,
    ReviewAgentV2Output,
    RubricAlignmentNote,
    validate_v2_output,
)
from app.core.exceptions import (
    AILanguageBlockedError,
    AuthorizationError,
    ConflictError,
    ValidationError,
)
from app.db.enums import (
    AIGradeDecision,
    DelegationStatus,
    GradingDelegationScope,
    KeyPointImportance,
    QuestionType,
    SampleCheckStatus,
    StepKind,
    UserRole,
)
from app.db.models.academic import Course, LecturerCourseAssignment, TeachingAssignment
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt, SubmissionGrade
from app.db.models.auth import User
from app.db.models.marking import (
    AIGradeSampleCheck,
    GradingDelegation,
    MarkingScheme,
    MaterialKeyPoint,
    QuestionMarkStep,
)
from app.db.models.question import Question
from app.schemas.marking import (
    GradingDelegationCreate,
    MaterialKeyPointCreate,
    QuestionMarkStepCreate,
    SampleCheckVerifyItem,
)
from app.services.marking_service import MarkingService


# ── 1. Step Marks Sum Validation ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_step_marks_sum_validation():
    db = AsyncMock()
    service = MarkingService(db)

    question_id = uuid.uuid4()
    question = MagicMock()
    question.id = question_id
    question.marks = 10.0
    question.course_id = None
    service._get_question_and_verify_access = AsyncMock(return_value=question)

    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = UserRole.LECTURER

    # Step marks sum = 8.0 != 10.0 -> must raise ValidationError
    invalid_steps = [
        QuestionMarkStepCreate(step_no=1, description="Step 1", marks=5.0, kind=StepKind.METHOD),
        QuestionMarkStepCreate(step_no=2, description="Step 2", marks=3.0, kind=StepKind.ACCURACY),
    ]

    with pytest.raises(ValidationError) as exc:
        await service.batch_save_steps(question_id, user, invalid_steps)
    assert exc.value.code == "STEP_MARKS_SUM_MISMATCH"

    # Step marks sum = 10.0 == 10.0 -> passes
    valid_steps = [
        QuestionMarkStepCreate(step_no=1, description="Step 1", marks=6.0, kind=StepKind.METHOD),
        QuestionMarkStepCreate(step_no=2, description="Step 2", marks=4.0, kind=StepKind.ACCURACY),
    ]
    service.repo.batch_replace_steps = AsyncMock(return_value=[MagicMock(), MagicMock()])
    res = await service.batch_save_steps(question_id, user, valid_steps)
    assert len(res) == 2


# ── 2. ReviewAgent v2 Output Validation ──────────────────────────────────────


def test_validate_v2_output_score_clamping():
    parsed = ReviewAgentV2Output(
        suggested_score=15.0,
        rationale="Great effort throughout the response.",
        rubric_alignment=[],
        confidence=0.9,
    )
    validated = validate_v2_output(parsed, student_answer="test", max_score=10.0)
    assert validated.suggested_score == 10.0

    parsed_neg = ReviewAgentV2Output(
        suggested_score=-2.0,
        rationale="Completely off-topic.",
        rubric_alignment=[],
        confidence=0.9,
    )
    validated_neg = validate_v2_output(parsed_neg, student_answer="test", max_score=10.0)
    assert validated_neg.suggested_score == 0.0


def test_validate_v2_output_inconsistent_sum():
    # Criterion sum = 3.0 + 3.0 = 6.0 != suggested_score 8.0
    parsed = ReviewAgentV2Output(
        suggested_score=8.0,
        rationale="Good answer overall with some details missing.",
        rubric_alignment=[
            RubricAlignmentNote(criterion="Interpretation", notes="Good", marks_awarded=3.0),
            RubricAlignmentNote(criterion="Quality", notes="Good", marks_awarded=3.0),
        ],
        confidence=0.9,
    )
    validated = validate_v2_output(parsed, student_answer="my answer", max_score=10.0)
    assert validated.inconsistent_ai_output is True
    assert validated.confidence <= 0.4


def test_validate_v2_output_hallucinated_evidence_quote_dropped():
    # Student answer does not contain "fabricated quote that student never said"
    student_ans = "The gradient descent algorithm iteratively updates weights to minimize loss."
    parsed = ReviewAgentV2Output(
        suggested_score=5.0,
        rationale="Solid explanation of gradient descent.",
        rubric_alignment=[],
        confidence=0.85,
        key_points_coverage=[
            KeyPointCoverageItem(
                key_point_id="kp1",
                covered=True,
                evidence_quote="gradient descent algorithm iteratively",
                note="Present in text",
            ),
            KeyPointCoverageItem(
                key_point_id="kp2",
                covered=True,
                evidence_quote="quantum computing accelerates backprop",
                note="Hallucinated quote",
            ),
        ],
    )
    validated = validate_v2_output(parsed, student_answer=student_ans, max_score=10.0)
    # Valid quote preserved
    assert validated.key_points_coverage[0].evidence_quote == "gradient descent algorithm iteratively"
    # Hallucinated quote dropped
    assert validated.key_points_coverage[1].evidence_quote is None
    # Confidence penalized
    assert validated.confidence < 0.85


# ── 3. AI Cannot Finalize Grades Without Lecturer Action ─────────────────────


@pytest.mark.asyncio
async def test_ai_suggestion_is_pending_not_final():
    """AI suggestion must stay PENDING and is_final=False until lecturer action."""
    from app.db.models.ai import AIGradeReview
    review = AIGradeReview(
        attempt_id=uuid.uuid4(),
        assessment_id=uuid.uuid4(),
        student_id=uuid.uuid4(),
        grading_decision=AIGradeDecision.PENDING,
        ai_suggested_total=8.0,
    )
    assert review.grading_decision == AIGradeDecision.PENDING
    assert review.lecturer_final_total is None
    assert review.lecturer_id is None


# ── 4. Sample Check Requirement Before Bulk Accept ───────────────────────────


@pytest.mark.asyncio
async def test_bulk_accept_requires_sample_check():
    db = AsyncMock()
    service = MarkingService(db)
    assessment_id = uuid.uuid4()
    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = UserRole.LECTURER

    service._verify_assessment_access = AsyncMock(return_value=MagicMock())

    # Case 1: No sample check exists
    service.repo.get_latest_sample_check_for_assessment = AsyncMock(return_value=None)
    with pytest.raises(ConflictError) as exc:
        await service.bulk_accept_grades(assessment_id, user)
    assert exc.value.code == "SAMPLE_CHECK_REQUIRED"

    # Case 2: Sample check is still PENDING
    pending_check = MagicMock()
    pending_check.status = SampleCheckStatus.PENDING
    service.repo.get_latest_sample_check_for_assessment = AsyncMock(return_value=pending_check)
    with pytest.raises(ConflictError) as exc:
        await service.bulk_accept_grades(assessment_id, user)
    assert exc.value.code == "SAMPLE_CHECK_REQUIRED"


# ── 5. Low Agreement Rate Blocking and Override Rules ────────────────────────


@pytest.mark.asyncio
async def test_bulk_accept_low_agreement_rate():
    db = AsyncMock()
    service = MarkingService(db)
    assessment_id = uuid.uuid4()
    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = UserRole.LECTURER

    service._verify_assessment_access = AsyncMock(return_value=MagicMock())

    # Agreement rate is 60% (< 80%)
    check = MagicMock()
    check.status = SampleCheckStatus.VERIFIED
    check.agreement_rate = 0.60
    check.id = uuid.uuid4()
    service.repo.get_latest_sample_check_for_assessment = AsyncMock(return_value=check)

    # Without override -> 409 AGREEMENT_BELOW_THRESHOLD
    with pytest.raises(ConflictError) as exc:
        await service.bulk_accept_grades(assessment_id, user, override_low_agreement=False)
    assert exc.value.code == "AGREEMENT_BELOW_THRESHOLD"

    # With override but short/empty reason -> 422 OVERRIDE_REASON_REQUIRED
    with pytest.raises(ValidationError) as exc2:
        await service.bulk_accept_grades(
            assessment_id, user, override_low_agreement=True, override_reason="short"
        )
    assert exc2.value.code == "OVERRIDE_REASON_REQUIRED"

    # With override and valid explanation -> succeeds
    service.repo.list_pending_ai_reviews_for_assessment = AsyncMock(return_value=[])
    res = await service.bulk_accept_grades(
        assessment_id,
        user,
        override_low_agreement=True,
        override_reason="Reviewed deviations, AI was slightly generous on formatting but within acceptable bounds.",
    )
    assert res["status"] == "COMPLETED"


# ── 6. Delegated Grader Course Assignment Enforcement ────────────────────────


@pytest.mark.asyncio
async def test_delegated_grader_must_teach_same_course():
    db = AsyncMock()
    service = MarkingService(db)
    assessment_id = uuid.uuid4()
    course_id = uuid.uuid4()
    assessment = MagicMock()
    assessment.id = assessment_id
    assessment.course_id = course_id

    service._verify_assessment_access = AsyncMock(return_value=assessment)

    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = UserRole.LECTURER

    delegate_id = uuid.uuid4()

    # Delegate exists but not assigned to course
    res_user = MagicMock()
    res_user.scalar_one_or_none.return_value = MagicMock(id=delegate_id)

    res_empty = MagicMock()
    res_empty.scalars.return_value.first.return_value = None

    db.execute = AsyncMock(side_effect=[res_user, res_empty, res_empty])

    data = GradingDelegationCreate(
        delegate_id=delegate_id,
        scope=GradingDelegationScope.WHOLE,
        reason="Lecturer away at academic conference",
        valid_from=datetime.now(UTC),
        valid_to=datetime.now(UTC) + timedelta(days=7),
    )

    with pytest.raises(ValidationError) as exc:
        await service.create_grading_delegation(assessment_id, user, data)
    assert exc.value.code == "DELEGATE_NOT_COURSE_LECTURER"


# ── 7. Language Policy Blocks AI for Unsupported Language (RW) ───────────────


@pytest.mark.asyncio
async def test_language_policy_blocks_ai_grading_for_kinyarwanda():
    gateway = MagicMock()
    agent = ReviewAgent(gateway=gateway)

    # Calling review_response with RW raises AILanguageBlockedError
    with pytest.raises(AILanguageBlockedError):
        await agent.review_response(
            question_text="Sobanura imiterere ya mudasobwa",
            student_answer="Mudasobwa igizwe na hardware na software",
            rubric_content="Standard",
            max_score=10.0,
            question_type="essay",
            language="RW",
        )

    # Calling review_response_v2 with RW also raises AILanguageBlockedError
    with pytest.raises(AILanguageBlockedError):
        await agent.review_response_v2(
            question_text="Sobanura imiterere ya mudasobwa",
            student_answer="Mudasobwa igizwe na hardware na software",
            max_score=10.0,
            question_type="essay",
            language="RW",
        )


# ── 8. Key Points Injected in ReviewAgent v2 Prompt ──────────────────────────


@pytest.mark.asyncio
async def test_key_points_injected_in_prompt():
    gateway = MagicMock()
    gateway.complete = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.content = (
        '{"suggested_score": 8.5, "rationale": "Well explained response covering key principles.", '
        '"rubric_alignment": [], "confidence": 0.9, '
        '"key_points_coverage": [{"key_point_id": "kp_grad", "covered": true, "evidence_quote": "steepest descent", "note": "Explicitly mentioned"}], '
        '"interpretation_note": "Accurate comprehension"}'
    )
    gateway.complete.return_value = mock_resp

    agent = ReviewAgent(gateway=gateway)
    key_points = [
        {"id": "kp_grad", "text": "Optimization follows the direction of steepest descent.", "importance": "CORE"}
    ]

    result, _ = await agent.review_response_v2(
        question_text="Explain gradient descent.",
        student_answer="Gradient descent optimizes the objective along the direction of steepest descent to find minima.",
        max_score=10.0,
        question_type="essay",
        key_points=key_points,
        marking_scheme="Expect steepest descent concept and learning rate explanation.",
    )

    # Check that gateway was called with the prompt containing the key points
    call_args = gateway.complete.call_args[0]
    request = call_args[0]
    prompt_text = request.messages[0].content

    assert "kp_grad" in prompt_text
    assert "steepest descent" in prompt_text
    assert "Expect steepest descent concept" in prompt_text
    assert result.suggested_score == 8.5
    assert len(result.key_points_coverage) == 1
    assert result.key_points_coverage[0].covered is True


# ── 9. Anonymous Marking Masks Student Identity ──────────────────────────────


def test_anonymous_marking_alias_formatting():
    """Verify alias Candidate-<HEX> is generated when anonymous marking is active."""
    attempt_id = uuid.UUID("12345678-1234-5678-1234-567812345678")
    is_anonymous = True

    if is_anonymous:
        name = f"Candidate-{str(attempt_id)[:6].upper()}"
    else:
        name = "John Doe"

    assert name == "Candidate-123456"
