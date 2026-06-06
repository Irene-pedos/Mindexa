import pytest
import uuid
from datetime import datetime, UTC
from unittest.mock import AsyncMock, MagicMock
from app.services.ai_generation_service import AIGenerationService
from app.db.enums import AIQuestionDecision
from app.db.models.auth import User
from app.core.exceptions import ConflictError

@pytest.mark.asyncio
async def test_ai_generation_service_requires_review_before_promotion():
    # Mock repositories
    db = AsyncMock()
    service = AIGenerationService(db)
    service._repo = AsyncMock()
    service._question_repo = AsyncMock()
    
    # Mock User
    current_user = MagicMock(spec=User)
    current_user.id = uuid.uuid4()
    current_user.role = "lecturer"
    
    # Mock AI generated question in pending state
    ai_question_id = uuid.uuid4()
    mock_ai_question = MagicMock()
    mock_ai_question.id = ai_question_id
    mock_ai_question.review_status = AIQuestionDecision.PENDING
    mock_ai_question.parsed_successfully = True
    mock_ai_question.parsed_question_text = "What is 2+2?"
    mock_ai_question.parsed_options_json = "[]"
    mock_ai_question.parsed_explanation = "4"
    mock_ai_question.question_type = "short_answer"
    mock_ai_question.difficulty = "easy"
    
    service._repo.get_generated_question.return_value = mock_ai_question
    
    # Mock successful review creation
    mock_review = MagicMock()
    mock_review.id = uuid.uuid4()
    mock_review.ai_question_id = ai_question_id
    mock_review.reviewer_id = current_user.id
    mock_review.decision = AIQuestionDecision.APPROVED
    mock_review.reviewed_at = datetime.now(UTC)
    mock_review.modified_question_text = None
    mock_review.modified_options_json = None
    mock_review.modified_explanation = None
    mock_review.reviewer_notes = None
    
    service._repo.create_review.return_value = mock_review
    
    # Mock promotion
    service._promote_to_question_bank = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))
    
    # Review data
    from app.schemas.ai_generation import ReviewAIQuestionRequest
    review_data = ReviewAIQuestionRequest(
        decision=AIQuestionDecision.APPROVED,
        add_to_assessment_id=None
    )
    
    # Perform review
    review_resp, promoted = await service.review_ai_question(
        ai_question_id=ai_question_id,
        data=review_data,
        current_user=current_user
    )
    
    # Verify promotion happened
    assert promoted is not None
    service._repo.update_generated_question.assert_called_once()
    
    # Now try to review again - should fail
    mock_ai_question.review_status = AIQuestionDecision.APPROVED
    with pytest.raises(ConflictError):
        await service.review_ai_question(
            ai_question_id=ai_question_id,
            data=review_data,
            current_user=current_user
        )
