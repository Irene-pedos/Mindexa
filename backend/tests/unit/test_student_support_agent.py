from __future__ import annotations

import uuid

import pytest

from app.agents.student_support_agent import StudentSupportAgent, StudentSupportContext
from app.core.ai.providers import AICompletionResponse
from app.core.exceptions import ValidationError


class FakeGateway:
    def __init__(self, content: str) -> None:
        self.content = content
        self.last_request = None
        self.last_kwargs = None

    async def complete(self, request, **kwargs):
        self.last_request = request
        self.last_kwargs = kwargs
        return AICompletionResponse(
            content=self.content,
            provider="groq",
            model="llama-3.1-8b-instant",
            raw={"content": self.content},
        )


@pytest.mark.asyncio
async def test_student_support_agent_returns_validated_output() -> None:
    gateway = FakeGateway(
        """
        {
          "explanation": "A database index helps the database find rows faster.",
          "revision_plan": ["Review primary keys", "Practice EXPLAIN plans"],
          "follow_up_questions": ["Do you want an example query?"],
          "safety_notice": "This is study guidance, not exam content."
        }
        """
    )
    agent = StudentSupportAgent(gateway)

    result = await agent.answer(
        student_id=uuid.uuid4(),
        actor_role="STUDENT",
        question="What is an index?",
        contexts=[
            StudentSupportContext(
                title="Database notes",
                content="Indexes are data structures that speed up lookup operations.",
            )
        ],
    )

    assert result.explanation.startswith("A database index")
    assert result.revision_plan == ["Review primary keys", "Practice EXPLAIN plans"]
    assert gateway.last_kwargs["action_type"].value == "STUDY_SUPPORT"
    assert "hidden records" in gateway.last_request.messages[0].content


@pytest.mark.asyncio
async def test_student_support_agent_rejects_invalid_provider_output() -> None:
    gateway = FakeGateway("This is not JSON")
    agent = StudentSupportAgent(gateway)

    with pytest.raises(ValidationError) as exc_info:
        await agent.answer(
            student_id=uuid.uuid4(),
            actor_role="STUDENT",
            question="Explain normalization",
            contexts=[],
        )

    assert exc_info.value.code == "AI_OUTPUT_VALIDATION_FAILED"
