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
    service._assessment_repo = AsyncMock()
    
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
    service._question_repo.add_to_bank.assert_not_called()
    service._question_repo.create_bank_entry.assert_not_called()


@pytest.mark.asyncio
async def test_ai_generation_service_saves_to_bank_only_when_requested():
    db = AsyncMock()
    service = AIGenerationService(db)
    service._repo = AsyncMock()
    service._question_repo = AsyncMock()
    service._assessment_repo = AsyncMock()

    current_user = MagicMock(spec=User)
    current_user.id = uuid.uuid4()
    current_user.role = "lecturer"

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
    mock_ai_question.batch_id = None
    service._repo.get_generated_question.return_value = mock_ai_question

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

    service._promote_to_question_bank = AsyncMock(
        return_value=MagicMock(id=uuid.uuid4(), difficulty="easy")
    )

    from app.schemas.ai_generation import ReviewAIQuestionRequest
    review_data = ReviewAIQuestionRequest(
        decision=AIQuestionDecision.APPROVED,
        save_to_bank=True,
    )

    await service.review_ai_question(
        ai_question_id=ai_question_id,
        data=review_data,
        current_user=current_user,
    )

    service._question_repo.add_to_bank.assert_called_once()
    service._question_repo.create_bank_entry.assert_called_once()
    
    # Now try to review again with the same decision - should be idempotent
    mock_ai_question.review_status = AIQuestionDecision.APPROVED
    promoted = {"id": str(service._promote_to_question_bank.return_value.id)}
    mock_ai_question.promoted_question_id = promoted["id"]
    
    # We mock getting the promoted question
    service._question_repo.get_by_id = AsyncMock(return_value=MagicMock(
        id=promoted["id"],
        content="What is 2+2?",
        question_type="short_answer"
    ))
    
    review_resp2, promoted2 = await service.review_ai_question(
        ai_question_id=ai_question_id,
        data=review_data,
        current_user=current_user
    )
    assert promoted2 is not None
    assert promoted2["id"] == promoted["id"]

    # Try to review again with a conflicting decision (e.g. REJECTED) - should fail
    review_data_rejected = ReviewAIQuestionRequest(
        decision=AIQuestionDecision.REJECTED,
        add_to_assessment_id=None
    )
    with pytest.raises(ConflictError):
        await service.review_ai_question(
            ai_question_id=ai_question_id,
            data=review_data_rejected,
            current_user=current_user
        )


@pytest.mark.asyncio
async def test_ai_generation_service_with_section_id():
    db = AsyncMock()
    service = AIGenerationService(db)
    service._repo = AsyncMock()
    service._question_repo = AsyncMock()
    service._assessment_repo = AsyncMock()
    
    current_user = MagicMock(spec=User)
    current_user.id = uuid.uuid4()
    current_user.role = "lecturer"
    
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
    mock_ai_question.target_section_id = uuid.uuid4()
    
    service._repo.get_generated_question.return_value = mock_ai_question
    
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
    
    promoted_q = MagicMock(id=uuid.uuid4())
    service._promote_to_question_bank = AsyncMock(return_value=promoted_q)
    
    # Mock assessment repository calls
    mock_assessment = MagicMock()
    mock_assessment.draft_is_complete = False
    service._assessment_repo.get_by_id_simple = AsyncMock(return_value=mock_assessment)
    service._assessment_repo.get_next_order_index = AsyncMock(return_value=5)
    
    from app.schemas.ai_generation import ReviewAIQuestionRequest
    assessment_id = uuid.uuid4()
    section_id = uuid.uuid4()
    
    review_data = ReviewAIQuestionRequest(
        decision=AIQuestionDecision.APPROVED,
        add_to_assessment_id=assessment_id,
        add_to_section_id=section_id
    )
    
    # Perform review
    await service.review_ai_question(
        ai_question_id=ai_question_id,
        data=review_data,
        current_user=current_user
    )
    
    # Verify add_question was called with the specific section_id
    service._assessment_repo.add_question.assert_called_once_with(
        assessment_id=assessment_id,
        question_id=promoted_q.id,
        marks_override=1,
        order_index=5,
        added_via="AI_GENERATED_ACCEPTED",
        assessment_section_id=section_id,
        ai_review_id=mock_review.id
    )
