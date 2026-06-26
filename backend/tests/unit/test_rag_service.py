import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock
from app.services.rag_service import RAGService
from app.db.schemas.rag import RAGRetrievalResult

@pytest.mark.asyncio
async def test_rag_service_retrieve_context_for_lecturer_success():
    # Mock DB
    db = AsyncMock()
    
    # Mock search results from session.execute
    mock_result = MagicMock()
    mock_result.fetchall.return_value = [
        ("SQL indexes are data structures.", 1, 5, "Database Lecture 3", "lecture_3.pdf", 0.95),
        ("B-Trees are self-balancing.", 2, 6, "Database Lecture 3", "lecture_3.pdf", 0.90)
    ]
    db.execute.return_value = mock_result
    
    service = RAGService(db)
    
    # Mock _embed_question to prevent real Jina HTTP calls
    service._embed_question = AsyncMock(return_value=[0.1] * 1536)
    
    workspace_id = uuid.uuid4()
    context = await service.retrieve_context_for_lecturer("What is a database index?", workspace_id)
    
    assert "[Source: Database Lecture 3, Page 5]" in context
    assert "SQL indexes are data structures." in context
    assert "[Source: Database Lecture 3, Page 6]" in context
    assert "B-Trees are self-balancing." in context
    
    service._embed_question.assert_called_once_with("What is a database index?")
    db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_rag_service_retrieve_context_for_lecturer_fallback():
    # Mock DB
    db = AsyncMock()
    
    # Mock search results returning empty
    mock_result = MagicMock()
    mock_result.fetchall.return_value = []
    db.execute.return_value = mock_result
    
    service = RAGService(db)
    service._embed_question = AsyncMock(return_value=[0.1] * 1536)
    
    workspace_id = uuid.uuid4()
    context = await service.retrieve_context_for_lecturer("Unknown Topic", workspace_id)
    
    assert context == ""
    service._embed_question.assert_called_once()
    db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_rag_service_retrieve_context_for_student_success():
    # Mock DB
    db = AsyncMock()
    
    # Mock student allowed resource IDs and similarity search rows
    service = RAGService(db)
    service._embed_question = AsyncMock(return_value=[0.1] * 1536)
    service._get_allowed_resource_ids = AsyncMock(return_value=[uuid.uuid4()])
    
    mock_result = MagicMock()
    mock_result.fetchall.return_value = [
        (uuid.uuid4(), "Normalised form reduces redundancy.", 1, {"page": 2}, uuid.uuid4(), "Normalisation Guide", 0.96)
    ]
    db.execute.return_value = mock_result
    
    student_id = uuid.uuid4()
    res = await service.retrieve_context("What is normalisation?", student_id)
    
    assert isinstance(res, RAGRetrievalResult)
    assert "Normalised form reduces redundancy." in res.context_string
    assert not res.fallback_used
    assert len(res.citations) == 1
    assert res.citations[0].resource_name == "Normalisation Guide"
