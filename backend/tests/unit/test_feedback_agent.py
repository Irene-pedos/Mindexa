import pytest
import uuid
import json
from unittest.mock import AsyncMock, MagicMock, patch
from app.agents.feedback_agent import FeedbackAgent, FeedbackAgentOutput
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AICompletionResponse
from app.core.exceptions import ValidationError
from app.services.grading_service import GradingService

@pytest.mark.asyncio
async def test_feedback_agent_returns_validated_output():
    # Mock Gateway
    gateway = AsyncMock(spec=AIGateway)
    
    # Mock successful response
    mock_feedback = {
        "draft_feedback": "Excellent work on your assessment. You demonstrated a clear understanding...",
        "strengths": ["Clear explanation", "Good structure"],
        "areas_for_improvement": ["Needs more examples"],
        "suggestions": ["Include 2-3 case studies in your next response."]
    }
    
    gateway.complete.return_value = AICompletionResponse(
        content=json.dumps(mock_feedback),
        provider="groq",
        model="llama3-8b",
    )
    
    agent = FeedbackAgent(gateway)
    output = await agent.draft_feedback(
        assessment_title="Computer Science 101",
        score=15.0,
        max_score=20.0,
        rubric_content="Standard Rubric"
    )
    
    assert isinstance(output, FeedbackAgentOutput)
    assert output.draft_feedback.startswith("Excellent work")
    assert len(output.strengths) == 2
    assert "examples" in output.areas_for_improvement[0]

@pytest.mark.asyncio
async def test_feedback_agent_rejects_malformed_json():
    gateway = AsyncMock(spec=AIGateway)
    gateway.complete.return_value = AICompletionResponse(
        content="Invalid JSON",
        provider="groq",
        model="llama3-8b",
    )
    
    agent = FeedbackAgent(gateway)
    with pytest.raises(ValidationError) as exc_info:
        await agent.draft_feedback(
            assessment_title="Title",
            score=10.0,
            max_score=10.0,
            rubric_content="Rubric"
        )
    
    assert exc_info.value.code == "AI_OUTPUT_VALIDATION_FAILED"

@pytest.mark.asyncio
async def test_grading_service_stores_feedback_separately():
    # This test verifies that the GradingService stores AI feedback in
    # ai_feedback_draft and does NOT overwrite the finalized feedback field.
    
    db = AsyncMock()
    service = GradingService(db)
    service.grading_repo = AsyncMock()
    service.assessment_repo = AsyncMock()
    service.submission_repo = AsyncMock()
    
    # Mock grade row
    mock_grade = MagicMock()
    mock_grade.id = uuid.uuid4()
    mock_grade.assessment_id = uuid.uuid4()
    mock_grade.feedback = "Existing manual feedback"
    mock_grade.rubric_scores = [{"criterion": "Accuracy", "score": 5}]
    mock_grade.response_id = None
    mock_grade.score = 15.0
    mock_grade.max_score = 20.0
    mock_grade.internal_notes = "Great job"
    service.grading_repo.get_grade_by_id.return_value = mock_grade
    
    # Mock assessment
    mock_assessment = MagicMock()
    mock_assessment.title = "CS101"
    service.assessment_repo.get_by_id.return_value = mock_assessment
    
    # Mock FeedbackAgent.draft_feedback directly to avoid gateway complexities in this unit test
    mock_output = FeedbackAgentOutput(
        draft_feedback="AI drafted feedback for the student based on their assessment performance.",
        strengths=["Logic"],
        areas_for_improvement=["Speed"],
        suggestions=["Practice"]
    )
    
    with patch("app.agents.feedback_agent.FeedbackAgent.draft_feedback", new_callable=AsyncMock) as mock_draft:
        mock_analyze = mock_draft
        mock_analyze.return_value = mock_output
        
        await service.generate_feedback_draft(
            grade_id=mock_grade.id,
            lecturer_id=uuid.uuid4()
        )
        
        # Verify update_grade was called with ai_feedback_draft but NOT feedback
        args, kwargs = service.grading_repo.update_grade.call_args
        assert "ai_feedback_draft" in kwargs
        assert "feedback" not in kwargs
        assert mock_grade.feedback == "Existing manual feedback" # Should remain untouched
