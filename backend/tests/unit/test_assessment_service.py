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
