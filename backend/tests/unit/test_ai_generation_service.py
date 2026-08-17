import pytest
import uuid
from datetime import datetime, UTC
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.ai_generation_service import AIGenerationService
from app.db.enums import AIQuestionDecision
from app.db.models.auth import User
from app.core.exceptions import ConflictError
from app.schemas.ai_generation import ReviewAIQuestionRequest, GenerateQuestionsRequest


@pytest.mark.asyncio
async def test_ai_generation_service_requires_review_before_promotion():
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
    service._promote_to_question_bank = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))
    
    review_data = ReviewAIQuestionRequest(
        decision=AIQuestionDecision.APPROVED,
        add_to_assessment_id=None
    )
    
    review_resp, promoted = await service.review_ai_question(
        ai_question_id=ai_question_id,
        data=review_data,
        current_user=current_user
    )
    
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
    
    mock_ai_question.review_status = AIQuestionDecision.APPROVED
    promoted = {"id": str(service._promote_to_question_bank.return_value.id)}
    mock_ai_question.promoted_question_id = promoted["id"]
    
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
    
    mock_assessment = MagicMock()
    mock_assessment.draft_is_complete = False
    service._assessment_repo.get_by_id_simple = AsyncMock(return_value=mock_assessment)
    service._assessment_repo.get_next_order_index = AsyncMock(return_value=5)
    
    assessment_id = uuid.uuid4()
    section_id = uuid.uuid4()
    
    review_data = ReviewAIQuestionRequest(
        decision=AIQuestionDecision.APPROVED,
        add_to_assessment_id=assessment_id,
        add_to_section_id=section_id
    )
    
    await service.review_ai_question(
        ai_question_id=ai_question_id,
        data=review_data,
        current_user=current_user
    )
    
    service._assessment_repo.add_question.assert_called_once_with(
        assessment_id=assessment_id,
        question_id=promoted_q.id,
        marks_override=1,
        order_index=5,
        added_via="AI_GENERATED_ACCEPTED",
        assessment_section_id=section_id,
        ai_review_id=mock_review.id
    )


@pytest.mark.asyncio
async def test_generate_questions_batch_with_aliases_and_no_workspace():
    db = AsyncMock()
    service = AIGenerationService(db)
    service._repo = AsyncMock()
    service._assessment_repo = AsyncMock()

    current_user = MagicMock(spec=User)
    current_user.id = uuid.uuid4()
    current_user.role = "lecturer"

    mock_batch = MagicMock()
    mock_batch.id = uuid.uuid4()
    mock_batch.created_by_id = current_user.id
    mock_batch.assessment_id = None
    mock_batch.teaching_workspace_id = None
    mock_batch.target_section_id = None
    mock_batch.sections_json = None
    mock_batch.question_type = "mcq"
    mock_batch.difficulty = "medium"
    mock_batch.total_requested = 5
    mock_batch.subject = "Math"
    mock_batch.topic = "Algebra"
    mock_batch.bloom_level = "apply"
    mock_batch.additional_context = None
    mock_batch.status = "pending"
    mock_batch.created_at = datetime.now(UTC)
    mock_batch.updated_at = datetime.now(UTC)
    mock_batch.completed_at = None
    mock_batch.error_message = None
    mock_batch.blueprint_constraints = None
    mock_batch.learning_outcomes = None
    mock_batch.marks_per_question = None
    mock_batch.ai_model_used = "gpt-4o"
    mock_batch.ai_provider = "openai"
    mock_batch.generated_questions = []

    service._repo.create_batch.return_value = mock_batch
    service._repo.get_batch_by_id.return_value = mock_batch

    # 1. Ad-hoc request with no assessment or workspace
    req = GenerateQuestionsRequest(
        subject="Math",
        topic="Algebra",
        question_type="mcq",
        difficulty="medium",
        count=5
    )

    with patch("app.workers.tasks.process_ai_generation_batch.delay") as mock_delay:
        res = await service.generate_questions_batch(req, current_user)
        assert res is not None
        assert res.id == mock_batch.id
        mock_delay.assert_called_once_with(batch_id=str(mock_batch.id))

    # 2. Request using workspace_id alias and target_assessment_id alias
    assessment_id = uuid.uuid4()
    ws_id = uuid.uuid4()
    req_with_aliases = GenerateQuestionsRequest(
        subject="Math",
        topic="Algebra",
        question_type="mcq",
        difficulty="medium",
        count=3,
        workspace_id=ws_id,
        target_assessment_id=assessment_id
    )

    mock_assessment = MagicMock()
    mock_assessment.draft_is_complete = False
    mock_assessment.language = "EN"
    mock_assessment.teaching_workspace_id = ws_id
    service._assessment_repo.get_by_id_simple.return_value = mock_assessment

    with patch("app.workers.tasks.process_ai_generation_batch.delay") as mock_delay:
        res2 = await service.generate_questions_batch(req_with_aliases, current_user)
        assert res2 is not None
        service._repo.create_batch.assert_called()
