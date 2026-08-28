import json
import uuid
import pytest
from unittest.mock import AsyncMock

from app.agents.rubric_agent import RubricAgent, RubricDraftOutput
from app.core.ai.gateway import AIGateway
from app.core.ai.language_policy import assert_ai_allowed
from app.core.ai.providers import AICompletionResponse
from app.core.exceptions import AILanguageBlockedError, ValidationError


@pytest.mark.asyncio
async def test_rubric_agent_returns_validated_output():
    gateway = AsyncMock(spec=AIGateway)

    mock_rubric = {
        "title": "SQL Query Optimization Rubric",
        "description": "Marking scheme for essay question on query execution plans.",
        "criteria": [
            {
                "title": "Execution Plan Interpretation",
                "description": "Correct identification of table scans and index lookups.",
                "max_marks": 5,
                "order_index": 1,
                "levels": [
                    {"label": "Excellent", "description": "Completely explains cost estimation.", "marks": 5},
                    {"label": "Proficient", "description": "Explains major cost drivers.", "marks": 3},
                    {"label": "Inadequate", "description": "Misinterprets execution plan.", "marks": 0}
                ]
            },
            {
                "title": "Index Design Recommendation",
                "description": "Appropriate composite and covering index design.",
                "max_marks": 5,
                "order_index": 2,
                "levels": [
                    {"label": "Excellent", "description": "Designs optimal composite index.", "marks": 5},
                    {"label": "Proficient", "description": "Designs basic single-column index.", "marks": 3},
                    {"label": "Inadequate", "description": "Recommends ineffective index.", "marks": 0}
                ]
            }
        ]
    }

    gateway.complete.return_value = AICompletionResponse(
        content=json.dumps(mock_rubric),
        provider="groq",
        model="llama3-70b",
    )

    agent = RubricAgent(gateway)
    output = await agent.draft_or_improve(
        lecturer_id=uuid.uuid4(),
        question_id=uuid.uuid4(),
        question_content="Analyze the provided EXPLAIN query plan...",
        question_type="ESSAY",
        max_marks=10,
    )

    assert isinstance(output, RubricDraftOutput)
    assert output.title == "SQL Query Optimization Rubric"
    assert len(output.criteria) == 2
    assert output.criteria[0].max_marks == 5
    assert len(output.criteria[0].levels) == 3


@pytest.mark.asyncio
async def test_rubric_language_policy_blocks_kinyarwanda():
    with pytest.raises(AILanguageBlockedError):
        assert_ai_allowed("RW", action="draft_rubric")


@pytest.mark.asyncio
async def test_rubric_agent_rejects_malformed_json():
    gateway = AsyncMock(spec=AIGateway)
    gateway.complete.return_value = AICompletionResponse(
        content="Invalid non-json output",
        provider="groq",
        model="llama3-70b",
    )

    agent = RubricAgent(gateway)
    with pytest.raises(ValidationError) as exc_info:
        await agent.draft_or_improve(
            lecturer_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            question_content="Some question",
            question_type="ESSAY",
            max_marks=10,
        )

    assert exc_info.value.code == "AI_OUTPUT_VALIDATION_FAILED"
