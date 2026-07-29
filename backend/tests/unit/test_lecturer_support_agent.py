from __future__ import annotations

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.agents.lecturer_support_agent import LecturerSupportAgent
from app.core.ai.providers import AICompletionResponse
from app.db.schemas.rag import RAGRetrievalResult, SourceCitation

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
            provider="gemini",
            model="gemini-2.5-pro",
            raw={"content": self.content},
        )

def test_lecturer_support_agent_build_system_prompt() -> None:
    agent = LecturerSupportAgent(FakeGateway("Hello"))
    
    prompt_with_context = agent._build_system_prompt(has_context=True)
    assert "Mindexa Lecturer AI Assistant" in prompt_with_context
    assert "Use the retrieved course material context as your primary source of truth" in prompt_with_context
    assert "Never claim to have read or accessed a course file" in prompt_with_context

    prompt_without_context = agent._build_system_prompt(has_context=False)
    assert "Mindexa Lecturer AI Assistant" in prompt_without_context
    assert "No relevant course materials were found" in prompt_without_context
    assert "Answer the lecturer's query using general academic knowledge only" in prompt_without_context

def test_lecturer_support_agent_build_user_prompt() -> None:
    agent = LecturerSupportAgent(FakeGateway("Hello"))
    
    prompt_with_context = agent._build_user_prompt(
        question="Design a rubric.",
        context="Sample Syllabus Info",
        fallback=False
    )
    assert "Lecturer Request:\nDesign a rubric." in prompt_with_context
    assert "Retrieved Course Material Context:\nSample Syllabus Info" in prompt_with_context

    prompt_without_context = agent._build_user_prompt(
        question="Design a rubric.",
        context="",
        fallback=True
    )
    assert "Lecturer Request:\nDesign a rubric." in prompt_without_context
    assert "No matching course material context was found." in prompt_without_context

@pytest.mark.asyncio
async def test_lecturer_support_agent_answer() -> None:
    gateway = FakeGateway("Suggested Rubric Details")
    agent = LecturerSupportAgent(gateway)
    
    db = AsyncMock()
    mock_rag_result = RAGRetrievalResult(
        context_string="Rubric context details",
        citations=[SourceCitation(resource_name="Syllabus", resource_id=uuid.uuid4(), excerpt="...", chunk_index=0)],
        chunk_ids_used=[uuid.uuid4()],
        retrieval_score=0.9,
        fallback_used=False
    )
    
    # Safely patch RAGService locally
    with patch("app.agents.lecturer_support_agent.RAGService") as MockRAGService:
        mock_instance = MockRAGService.return_value
        mock_instance.retrieve_context_for_lecturer = AsyncMock(return_value=mock_rag_result)
        
        response = await agent.answer(
            question="Create rubric.",
            workspace_id=uuid.uuid4(),
            mode="content",
            selected_material_ids=None,
            conversation_history=[
                {"role": "user", "content": "hi"},
                {"role": "model", "content": "hello"}
            ],
            db=db
        )
        
        assert response.answer == "Suggested Rubric Details"
        assert not response.fallback_used
        assert len(response.citations) == 1
        assert response.citations[0].resource_name == "Syllabus"
        
        # Verify messages
        assert gateway.last_request is not None
        messages = gateway.last_request.messages
        assert len(messages) == 4 # system + 2 history + user
        assert messages[0].role == "system"
        assert "Mindexa Lecturer AI Assistant" in messages[0].content
        assert messages[1].role == "user"
        assert messages[1].content == "hi"
        assert messages[2].role == "assistant"
        assert messages[2].content == "hello"
        assert messages[3].role == "user"
        assert "Lecturer Request:\nCreate rubric." in messages[3].content
