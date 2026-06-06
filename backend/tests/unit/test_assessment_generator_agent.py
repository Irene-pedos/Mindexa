import pytest
import uuid
import json
from unittest.mock import AsyncMock, MagicMock
from app.agents.assessment_generator_agent import AssessmentGeneratorAgent, GeneratedQuestion
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AICompletionResponse
from app.core.exceptions import ValidationError

@pytest.mark.asyncio
async def test_assessment_generator_agent_returns_validated_output():
    # Mock Gateway
    gateway = AsyncMock(spec=AIGateway)
    
    # Mock successful response
    mock_questions = [
        {
            "question": "What is the capital of France?",
            "options": [
                {"text": "Paris", "is_correct": True, "explanation": "Correct"},
                {"text": "London", "is_correct": False, "explanation": "Incorrect"}
            ],
            "explanation": "Paris is the capital.",
            "difficulty": "easy",
            "bloom_level": "remember"
        }
    ]
    
    gateway.complete.return_value = AICompletionResponse(
        content=json.dumps(mock_questions),
        provider="groq",
        model="llama3-8b",
    )
    
    agent = AssessmentGeneratorAgent(gateway)
    questions, prompt = await agent.generate(
        lecturer_id=uuid.uuid4(),
        question_type="mcq",
        difficulty="easy",
        count=1,
        topic="Geography"
    )
    
    assert len(questions) == 1
    assert isinstance(questions[0], GeneratedQuestion)
    assert questions[0].question == "What is the capital of France?"
    assert len(questions[0].options) == 2
    assert questions[0].options[0].text == "Paris"
    assert questions[0].options[0].is_correct is True
    assert "Geography" in prompt

@pytest.mark.asyncio
async def test_assessment_generator_agent_rejects_malformed_json():
    gateway = AsyncMock(spec=AIGateway)
    gateway.complete.return_value = AICompletionResponse(
        content="Invalid JSON block",
        provider="groq",
        model="llama3-8b",
    )
    
    agent = AssessmentGeneratorAgent(gateway)
    with pytest.raises(ValidationError) as exc_info:
        await agent.generate(
            lecturer_id=uuid.uuid4(),
            question_type="mcq",
            difficulty="easy",
            count=1
        )
    
    assert exc_info.value.code == "AI_OUTPUT_VALIDATION_FAILED"

@pytest.mark.asyncio
async def test_assessment_generator_agent_rejects_missing_fields():
    gateway = AsyncMock(spec=AIGateway)
    # Missing 'question' field
    mock_questions = [
        {
            "options": [],
            "explanation": "Missing question stem."
        }
    ]
    gateway.complete.return_value = AICompletionResponse(
        content=json.dumps(mock_questions),
        provider="groq",
        model="llama3-8b",
    )
    
    agent = AssessmentGeneratorAgent(gateway)
    with pytest.raises(ValidationError) as exc_info:
        await agent.generate(
            lecturer_id=uuid.uuid4(),
            question_type="mcq",
            difficulty="easy",
            count=1
        )
    
    assert exc_info.value.code == "AI_OUTPUT_VALIDATION_FAILED"
