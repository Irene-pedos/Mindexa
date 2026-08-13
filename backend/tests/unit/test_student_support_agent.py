from __future__ import annotations

import uuid
import pytest

from app.agents.student_support_agent import StudySupportAgent
from app.core.ai.providers import AICompletionResponse
from app.core.ai.gateway import AIGateway


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


def test_study_support_agent_build_system_prompt() -> None:
    agent = StudySupportAgent(FakeGateway("Hello"))
    
    prompt_with_context = agent._build_system_prompt(has_context=True)
    assert "Mindexa's AI Study Tutor" in prompt_with_context
    assert "DIRECT ANSWER FIRST" in prompt_with_context

    prompt_without_context = agent._build_system_prompt(has_context=False)
    assert "Mindexa's AI Study Tutor" in prompt_without_context
    assert "MANDATORY GENERAL KNOWLEDGE DISCLAIMER" in prompt_without_context


def test_study_support_agent_build_user_prompt() -> None:
    agent = StudySupportAgent(FakeGateway("Hello"))
    
    prompt_with_context = agent._build_user_prompt(
        question="What is an index?",
        context="Indexes are fast",
        fallback=False
    )
    assert "Student Question:\nWhat is an index?" in prompt_with_context
    assert "Retrieved Course Material Context:\nIndexes are fast" in prompt_with_context

    prompt_without_context = agent._build_user_prompt(
        question="What is an index?",
        context="",
        fallback=True
    )
    assert "Student Question:\nWhat is an index?" in prompt_without_context
    assert "No course materials were found." in prompt_without_context


def test_study_support_agent_call_llm() -> None:
    import anyio
    gateway = FakeGateway("Sample Answer")
    agent = StudySupportAgent(gateway)
    student_id = uuid.uuid4()
    
    async def run():
        return await agent._call_llm(
            system_prompt="System instructions",
            user_prompt="User question context",
            history=[
                {"role": "user", "content": "hi"},
                {"role": "assistant", "content": "hello"}
            ],
            student_id=student_id
        )
    
    response = anyio.run(run)
    
    assert response == "Sample Answer"
    assert gateway.last_request is not None
    messages = gateway.last_request.messages
    assert len(messages) == 4
    assert messages[0].role == "system"
    assert messages[0].content == "System instructions"
    assert messages[1].role == "user"
    assert messages[1].content == "hi"
    assert messages[2].role == "assistant"
    assert messages[2].content == "hello"
    assert messages[3].role == "user"
    assert messages[3].content == "User question context"
