import pytest
import uuid
import json
from unittest.mock import AsyncMock, MagicMock
from app.agents.review_agent import ReviewAgent, ReviewAgentOutput
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AICompletionResponse
from app.core.exceptions import ValidationError
from app.services.grading_service import GradingService

@pytest.mark.asyncio
async def test_review_agent_returns_validated_output():
    # Mock Gateway
    gateway = AsyncMock(spec=AIGateway)
    
    # Mock successful response
    mock_review = {
        "suggested_score": 8.5,
        "rationale": "The student explained the core concepts well, though some details were missing.",
        "rubric_alignment": [
            {"criterion": "Accuracy", "notes": "Mostly accurate.", "marks_awarded": 5.0},
            {"criterion": "Depth", "notes": "Lacked specific examples.", "marks_awarded": 3.5}
        ],
        "confidence": 0.9
    }
    
    gateway.complete.return_value = AICompletionResponse(
        content=json.dumps(mock_review),
        provider="groq",
        model="llama3-8b",
    )
    
    agent = ReviewAgent(gateway)
    output = await agent.review_response(
        question_text="Explain SQL normalization.",
        student_answer="SQL normalization is about reducing redundancy...",
        rubric_content="Accuracy: 5 marks, Depth: 5 marks",
        max_score=10.0,
        question_type="essay"
    )
    
    assert isinstance(output, ReviewAgentOutput)
    assert output.suggested_score == 8.5
    assert output.confidence == 0.9
    assert len(output.rubric_alignment) == 2

@pytest.mark.asyncio
async def test_review_agent_rejects_malformed_json():
    gateway = AsyncMock(spec=AIGateway)
    gateway.complete.return_value = AICompletionResponse(
        content="Invalid JSON",
        provider="groq",
        model="llama3-8b",
    )
    
    agent = ReviewAgent(gateway)
    with pytest.raises(ValidationError) as exc_info:
        await agent.review_response(
            question_text="Text",
            student_answer="Answer",
            rubric_content="Rubric",
            max_score=10.0,
            question_type="essay"
        )
    
    assert exc_info.value.code == "AI_OUTPUT_VALIDATION_FAILED"

@pytest.mark.asyncio
async def test_grading_service_prevents_ai_finalization():
    # This test verifies that the GradingService.apply_ai_grading method
    # never sets is_final=True, maintaining the human-in-the-loop requirement.
    
    db = AsyncMock()
    service = GradingService(db)
    service.grading_repo = AsyncMock()
    service.grading_repo.get_grade_by_response = AsyncMock()
    service.grading_repo.get_active_queue_item_for_response = AsyncMock()
    
    # Mock existing grade row
    mock_grade = MagicMock()
    mock_grade.id = uuid.uuid4()
    mock_grade.is_final = False
    service.grading_repo.get_grade_by_response.return_value = mock_grade
    
    response_id = uuid.uuid4()
    
    await service.apply_ai_grading(
        response_id=response_id,
        ai_suggested_score=7.0,
        ai_rationale="Good answer.",
        ai_confidence=0.8,
        max_score=10.0
    )
    
    # Verify update_grade was called with is_final=False
    args, kwargs = service.grading_repo.update_grade.call_args
    assert kwargs["is_final"] is False
    assert kwargs["score"] is None # Score remains NULL until confirmed
