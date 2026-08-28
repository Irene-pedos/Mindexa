import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.agents.slide_deck_agent import SlideDeckAgent, SlideDeckOutput, SlideItem
from app.core.ai.gateway import AIGateway
from app.core.ai.language_policy import assert_ai_allowed
from app.core.ai.providers import AICompletionResponse
from app.core.exceptions import AILanguageBlockedError, ValidationError
from app.services.lecturer_ai_service import LecturerAIService


@pytest.mark.asyncio
async def test_slide_deck_agent_returns_validated_output():
    gateway = AsyncMock(spec=AIGateway)

    mock_deck = {
        "title": "Relational Normalization & 3NF",
        "target_audience": "Undergraduate Computer Science",
        "estimated_minutes": 45,
        "slides": [
            {
                "title": "Introduction to Normalization",
                "bullet_points": ["Eliminating data redundancy", "Ensuring data integrity", "Lossless join decomposition"],
                "visual_idea": "Diagram of an unnormalized table",
                "speaker_notes": "Welcome class. Today we discuss relational decomposition and normalization."
            },
            {
                "title": "First Normal Form (1NF)",
                "bullet_points": ["Atomic attributes", "Unique row identification", "No repeating groups"],
                "visual_idea": "Before and after 1NF grid",
                "speaker_notes": "1NF requires each attribute to contain atomic values."
            },
            {
                "title": "Second Normal Form (2NF)",
                "bullet_points": ["Must be in 1NF", "No partial functional dependencies", "Applies to composite keys"],
                "visual_idea": "Functional dependency diagram",
                "speaker_notes": "2NF eliminates partial dependencies."
            },
            {
                "title": "Third Normal Form (3NF)",
                "bullet_points": ["Must be in 2NF", "No transitive dependencies", "X -> A requires X superkey or A prime"],
                "visual_idea": "Transitive dependency arrow chart",
                "speaker_notes": "3NF ensures non-key attributes depend only on candidate keys."
            },
            {
                "title": "Summary & Practical Examples",
                "bullet_points": ["Recap 1NF, 2NF, 3NF", "Trade-offs of denormalization", "Next lecture: BCNF"],
                "visual_idea": "Summary table",
                "speaker_notes": "In conclusion, normalization balances integrity and performance."
            }
        ]
    }

    gateway.complete.return_value = AICompletionResponse(
        content=json.dumps(mock_deck),
        provider="groq",
        model="llama3-70b",
    )

    agent = SlideDeckAgent(gateway)
    output = await agent.generate(
        lecturer_id=uuid.uuid4(),
        learning_unit_id=uuid.uuid4(),
        unit_title="Relational Normalization",
        chunk_content="Normalization reduces data redundancy...",
        estimated_minutes=45,
    )

    assert isinstance(output, SlideDeckOutput)
    assert output.title == "Relational Normalization & 3NF"
    assert len(output.slides) == 5
    assert output.slides[0].title == "Introduction to Normalization"
    assert len(output.slides[0].bullet_points) == 3


@pytest.mark.asyncio
async def test_slide_deck_language_policy_blocks_kinyarwanda():
    # Verify that Kinyarwanda language content is blocked by language policy
    with pytest.raises(AILanguageBlockedError):
        assert_ai_allowed("RW", action="generate_slide_deck")

    with pytest.raises(AILanguageBlockedError):
        assert_ai_allowed("KINYARWANDA", action="generate_slide_deck")


@pytest.mark.asyncio
async def test_slide_deck_agent_rejects_malformed_json():
    gateway = AsyncMock(spec=AIGateway)
    gateway.complete.return_value = AICompletionResponse(
        content="Here are the slides: 1. intro 2. concept",
        provider="groq",
        model="llama3-70b",
    )

    agent = SlideDeckAgent(gateway)
    with pytest.raises(ValidationError) as exc_info:
        await agent.generate(
            lecturer_id=uuid.uuid4(),
            learning_unit_id=uuid.uuid4(),
            unit_title="Test Unit",
            chunk_content="Some content",
        )

    assert exc_info.value.code == "AI_OUTPUT_VALIDATION_FAILED"
