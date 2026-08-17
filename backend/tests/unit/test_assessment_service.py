from unittest.mock import AsyncMock, MagicMock
import pytest
import uuid
from app.services.assessment_service import AssessmentService
from app.db.models.auth import User
from app.db.models.assessment import Assessment

@pytest.mark.asyncio
async def test_bulk_save_draft_assessment_no_missing_greenlet():
    # Arrange
    db_mock = MagicMock()
    db_mock.flush = AsyncMock()
    db_mock.expire = MagicMock()
    
    # AssessmentService expects db to be passed
    service = AssessmentService(db=db_mock)
    
    # Mock the internal repository
    service._repo = AsyncMock()
    
    # Mock _build_bulk_assessment
    mock_assessment = MagicMock(spec=Assessment)
    mock_assessment.id = uuid.uuid4()
    service._build_bulk_assessment = AsyncMock(return_value=mock_assessment)
    
    # Mock repo.get_by_id
    expected_assessment = MagicMock(spec=Assessment)
    service._repo.get_by_id = AsyncMock(return_value=expected_assessment)
    
    # Act
    data_mock = MagicMock()
    user_mock = MagicMock(spec=User)
    
    result = await service.bulk_save_draft_assessment(data_mock, user_mock)
    
    # Assert
    assert result == expected_assessment
    service._build_bulk_assessment.assert_called_once_with(data_mock, user_mock)
    db_mock.flush.assert_called_once()
    db_mock.expire.assert_called_once_with(mock_assessment)
    service._repo.get_by_id.assert_called_once_with(mock_assessment.id)


def test_bulk_assessment_metadata_peer_evaluation_validation():
    from app.schemas.assessment import BulkAssessmentMetadata
    from datetime import datetime, timedelta

    # 1. peerEvaluationEnabled is True, but peerEvaluationDeadline is missing -> should raise ValueError
    with pytest.raises(ValueError, match="peerEvaluationDeadline is required"):
        BulkAssessmentMetadata(
            title="Group Project",
            peerEvaluationEnabled=True,
            peerEvaluationDeadline=None,
            peerEvaluationWeightPercent=20,
        )

    # 2. peerEvaluationDeadline <= windowEnd -> should raise ValueError
    now = datetime.now()
    with pytest.raises(ValueError, match="peerEvaluationDeadline must be after"):
        BulkAssessmentMetadata(
            title="Group Project",
            windowEnd=now + timedelta(days=2),
            peerEvaluationEnabled=True,
            peerEvaluationDeadline=now + timedelta(days=1),
            peerEvaluationWeightPercent=20,
        )

    # 3. peerEvaluationWeightPercent out of bounds -> should raise ValueError
    with pytest.raises(ValueError, match="peerEvaluationWeightPercent must be between"):
        BulkAssessmentMetadata(
            title="Group Project",
            windowEnd=now + timedelta(days=2),
            peerEvaluationEnabled=True,
            peerEvaluationDeadline=now + timedelta(days=3),
            peerEvaluationWeightPercent=150,
        )

    # 4. Valid peer evaluation -> should succeed
    meta = BulkAssessmentMetadata(
        title="Group Project",
        windowEnd=now + timedelta(days=2),
        peerEvaluationEnabled=True,
        peerEvaluationDeadline=now + timedelta(days=3),
        peerEvaluationWeightPercent=20,
    )
    assert meta.peerEvaluationEnabled is True
    assert meta.peerEvaluationWeightPercent == 20


@pytest.mark.asyncio
async def test_build_bulk_assessment_handles_duplicate_questions_gracefully():
    """Verify that multiple questions with the same ID or bank ID in the payload receive unique Question instances."""
    from app.schemas.assessment import (
        BulkAssessmentPublishRequest,
        BulkAssessmentMetadata,
        BulkAssessmentRules,
        BulkAssessmentSection,
        BulkAssessmentQuestion,
    )
    from app.db.models.academic import TeachingWorkspace, Course
    from app.db.models.question import Question as QuestionModel

    db_mock = AsyncMock()
    service = AssessmentService(db=db_mock)
    service._repo = AsyncMock()

    course_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    assessment_id = uuid.uuid4()
    q_shared_id = uuid.uuid4()

    # Mock assessment create
    mock_asmt = MagicMock(spec=Assessment)
    mock_asmt.id = assessment_id
    service._repo.create.return_value = mock_asmt
    service._repo.update_fields.return_value = None

    # Mock section create
    mock_section = MagicMock()
    mock_section.id = uuid.uuid4()
    service._repo.create_section.return_value = mock_section

    # Mock execute returns for workspace / course lookups
    mock_ws = MagicMock(spec=TeachingWorkspace)
    mock_ws.id = ws_id
    mock_ws.course_id = course_id

    mock_res_ws = MagicMock()
    mock_res_ws.scalars.return_value.first.return_value = mock_ws
    mock_res_ws.scalar_one_or_none.return_value = None
    mock_res_ws.scalars.return_value.all.return_value = []

    # When db.get is called for the duplicate question:
    # First call returns the question owned by the assessment,
    # Second call returns the question, but used_question_ids will force creation of a new instance
    existing_question = MagicMock(spec=QuestionModel)
    existing_question.id = q_shared_id
    existing_question.source_assessment_id = assessment_id
    existing_question.is_in_question_bank = False
    existing_question.marks = 5

    db_mock.execute.return_value = mock_res_ws
    db_mock.get.return_value = existing_question
    db_mock.flush = AsyncMock()

    service._question_repo = AsyncMock()

    data = BulkAssessmentPublishRequest(
        metadata=BulkAssessmentMetadata(
            title="Duplicate Test Assessment",
            course_id=course_id,
            teaching_workspace_id=ws_id,
            mode="Formative",
        ),
        rules=BulkAssessmentRules(),
        blueprint=[
            BulkAssessmentSection(id="sec-1", section="Section 1", questions=2, marks=10)
        ],
        questions=[
            BulkAssessmentQuestion(id=str(q_shared_id), type="mcq", text="Q1 content", marks=5, sectionId="sec-1"),
            BulkAssessmentQuestion(id=str(q_shared_id), type="mcq", text="Q2 content duplicate", marks=5, sectionId="sec-1"),
        ]
    )

    current_user = MagicMock(spec=User)
    current_user.id = uuid.uuid4()

    # Act
    built_asmt = await service._build_bulk_assessment(data, current_user)

    # Assert
    assert built_asmt.id == assessment_id
    # Ensure add_question was called twice, but with two different question IDs
    assert service._repo.add_question.call_count == 2
    call1_args = service._repo.add_question.call_args_list[0].kwargs
    call2_args = service._repo.add_question.call_args_list[1].kwargs

    assert call1_args["question_id"] == q_shared_id
    # Second question MUST have received a new distinct Question ID to prevent unique constraint conflict
    assert call2_args["question_id"] != q_shared_id
