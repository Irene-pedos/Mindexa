import json
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agents.assessment_generator_agent import (AssessmentGeneratorAgent,
                                                   GeneratedQuestion)
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
async def test_assessment_generator_agent_normalizes_common_payload_variants():
    gateway = AsyncMock(spec=AIGateway)
    gateway.complete.return_value = AICompletionResponse(
        content=json.dumps({
            "questions": [{
                "stem": "What is 2 + 2?",
                "choices": [
                    {"option_text": "4", "is_correct": True, "explanation": "Correct"},
                    {"option_text": "5", "is_correct": False, "explanation": "Incorrect"},
                ],
                "explanation": "4 is the correct sum.",
                "difficulty": "easy",
                "bloom_level": "remember",
            }]
        }),
        provider="groq",
        model="llama3-8b",
    )

    agent = AssessmentGeneratorAgent(gateway)
    questions, prompt = await agent.generate(
        lecturer_id=uuid.uuid4(),
        question_type="mcq",
        difficulty="easy",
        count=1,
        topic="Mathematics",
    )

    assert len(questions) == 1
    assert questions[0].question == "What is 2 + 2?"
    assert len(questions[0].options) == 2
    assert questions[0].options[0].text == "4"
    assert "Mathematics" in prompt

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


@pytest.mark.asyncio
async def test_assessment_generator_agent_parses_case_study_with_embedded_code_blocks():
    """Verify that case study questions with embedded markdown code blocks in question stem are parsed correctly."""
    raw_case_study_json = """```json
[
    {
        "question": "A junior front-end developer is creating a web page:\\n\\n```html\\n<script>\\nconst cars = [\\"Saab\\", \\\"Volvo\\\", \\\"BMW\\"];\\n</script>\\n```\\n\\nAnswer the questions below.",
        "options": [
            {
                "text": "Which line displays the second brand?",
                "is_correct": true,
                "explanation": "Use cars[1] because array indexes start at 0."
            }
        ],
        "explanation": "",
        "difficulty": "medium",
        "bloom_level": "understand",
        "source_reference": "Page 462, Chapter 4"
    }
]
```"""
    gateway = AsyncMock(spec=AIGateway)
    gateway.complete.return_value = AICompletionResponse(
        content=raw_case_study_json,
        provider="groq",
        model="llama3-8b",
    )

    agent = AssessmentGeneratorAgent(gateway)
    questions, _ = await agent.generate(
        lecturer_id=uuid.uuid4(),
        question_type="case_study",
        difficulty="medium",
        count=1,
        topic="JavaScript Arrays"
    )

    assert len(questions) == 1
    assert "const cars" in questions[0].question
    assert len(questions[0].options) == 1
    assert questions[0].options[0].text == "Which line displays the second brand?"
    assert questions[0].options[0].is_correct is True
