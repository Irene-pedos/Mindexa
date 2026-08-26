from __future__ import annotations

import json
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


@pytest.mark.asyncio
async def test_study_support_agent_skips_rag_when_no_scope_provided() -> None:
    from unittest.mock import AsyncMock, patch

    gateway = FakeGateway("General Knowledge: Normalization is...")
    agent = StudySupportAgent(gateway)
    student_id = uuid.uuid4()
    mock_db = AsyncMock()

    with patch("app.agents.student_support_agent.RAGService.retrieve_context", new_callable=AsyncMock) as mock_retrieve:
        agent._log_session = AsyncMock()
        resp = await agent.answer(
            question="What is 1NF?",
            student_id=student_id,
            conversation_history=[],
            db=mock_db,
            selected_resource_id=None,
            selected_resource_ids=None,
            teaching_workspace_id=None,
        )

        assert resp.answer == "General Knowledge: Normalization is..."
        assert resp.fallback_used is True
        assert resp.citations == []
        mock_retrieve.assert_not_called()


@pytest.mark.asyncio
async def test_study_support_agent_generate_revision_guide() -> None:
    from unittest.mock import AsyncMock, patch
    from app.db.schemas.rag import RAGRetrievalResult

    mock_llm_json = json.dumps({
        "title": "Database Normalization & BCNF",
        "summary": "Database normalization minimizes data redundancy and prevents anomalies.",
        "checklist": ["Identify functional dependencies", "Decompose into 3NF relations"],
        "readings": ["Database Systems Concepts (Chapter 7)"]
    })

    gateway = FakeGateway(mock_llm_json)
    agent = StudySupportAgent(gateway)
    student_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    mock_db = AsyncMock()

    mock_rag_result = RAGRetrievalResult(
        context_string="Retrieved text on normalization and BCNF.",
        citations=[],
        chunk_ids_used=[],
        retrieval_score=0.92,
        fallback_used=False,
    )

    with patch("app.agents.student_support_agent.RAGService.retrieve_context", new_callable=AsyncMock) as mock_retrieve:
        mock_retrieve.return_value = mock_rag_result

        res = await agent.generate_revision_guide(
            topic="Database Normalization & BCNF",
            student_id=student_id,
            teaching_workspace_id=workspace_id,
            db=mock_db,
        )

        assert res.title == "Database Normalization & BCNF"
        assert "Database normalization minimizes data redundancy" in res.summary
        assert len(res.checklist) == 2
        assert len(res.readings) == 1
        assert res.markdown is not None
        assert "# Revision Sheet: Database Normalization & BCNF" in res.markdown
        assert "## 📌 Core Concept Summary" in res.markdown
        assert "## ✅ Learning Outcomes & Recall Checklist" in res.markdown
        assert "- [ ] Identify functional dependencies" in res.markdown


@pytest.mark.asyncio
async def test_study_support_agent_greeting_and_courtesy() -> None:
    from unittest.mock import AsyncMock, patch
    from app.agents.student_support_agent import (
        STUDENT_GREETING_RESPONSE,
        STUDENT_COURTESY_RESPONSE,
    )

    gateway = FakeGateway("unused")
    agent = StudySupportAgent(gateway)
    student_id = uuid.uuid4()
    mock_db = AsyncMock()

    with patch("app.agents.student_support_agent.RAGService.retrieve_context", new_callable=AsyncMock) as mock_retrieve:
        agent._log_session = AsyncMock()

        # 1. Test greeting "Hello"
        resp_greeting = await agent.answer(
            question="Hello! 👋",
            student_id=student_id,
            conversation_history=[],
            db=mock_db,
        )
        assert resp_greeting.answer == STUDENT_GREETING_RESPONSE
        assert resp_greeting.fallback_used is False
        assert resp_greeting.citations == []
        mock_retrieve.assert_not_called()

        # 2. Test courtesy "thank you so much"
        resp_courtesy = await agent.answer(
            question="Thank you so much!",
            student_id=student_id,
            conversation_history=[],
            db=mock_db,
        )
        assert resp_courtesy.answer == STUDENT_COURTESY_RESPONSE
        assert resp_courtesy.fallback_used is False
        assert resp_courtesy.citations == []
        mock_retrieve.assert_not_called()


