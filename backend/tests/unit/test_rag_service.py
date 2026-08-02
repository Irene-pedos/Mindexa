import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.config import settings
from app.db.schemas.rag import RAGRetrievalResult
from app.services.rag_service import RAGService


@pytest.mark.asyncio
async def test_rag_service_retrieve_context_for_lecturer_success():
    # Mock DB
    db = AsyncMock()

    # Mock search results from session.execute (8 fields: chunk_id, content, chunk_index, metadata_json, mat_id, display_name, original_filename, similarity)
    mock_result = MagicMock()
    mock_result.fetchall.return_value = [
        (uuid.uuid4(), "SQL indexes are data structures.", 1, 5, uuid.uuid4(), "Database Lecture 3", "lecture_3.pdf", 0.95),
        (uuid.uuid4(), "B-Trees are self-balancing.", 2, 6, uuid.uuid4(), "Database Lecture 3", "lecture_3.pdf", 0.90)
    ]
    db.execute.return_value = mock_result

    service = RAGService(db)

    # Mock _embed_question to prevent real Jina HTTP calls
    service._embed_question = AsyncMock(return_value=[0.1] * 1536)

    workspace_id = uuid.uuid4()
    res = await service.retrieve_context_for_lecturer("What is a database index?", workspace_id)

    assert isinstance(res, RAGRetrievalResult)
    assert "[Source: Database Lecture 3, Page 5]" in res.context_string
    assert "SQL indexes are data structures." in res.context_string
    assert "[Source: Database Lecture 3, Page 6]" in res.context_string
    assert "B-Trees are self-balancing." in res.context_string
    assert not res.fallback_used
    assert len(res.citations) == 2
    assert res.citations[0].resource_name == "Database Lecture 3"

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
    res = await service.retrieve_context_for_lecturer("Unknown Topic", workspace_id)

    assert isinstance(res, RAGRetrievalResult)
    assert res.context_string == ""
    assert res.fallback_used
    assert len(res.citations) == 0
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


@pytest.mark.asyncio
async def test_rag_service_retrieve_context_for_lecturer_filtered_by_material_ids():
    # Mock DB
    db = AsyncMock()

    # Mock search results
    mock_result = MagicMock()
    mock_result.fetchall.return_value = [
        (uuid.uuid4(), "Specific material chunk.", 1, 3, uuid.uuid4(), "Specific Doc", "doc.pdf", 0.98)
    ]
    db.execute.return_value = mock_result

    service = RAGService(db)
    service._embed_question = AsyncMock(return_value=[0.1] * 1536)

    workspace_id = uuid.uuid4()
    material_ids = [uuid.uuid4()]
    res = await service.retrieve_context_for_lecturer("Question", workspace_id, material_ids=material_ids)

    assert isinstance(res, RAGRetrievalResult)
    assert "Specific material chunk." in res.context_string
    db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_embed_question_fits_pgvector_dimension():
    from unittest.mock import patch
    db = AsyncMock()
    service = RAGService(db)

    mock_gateway_res = MagicMock()
    mock_gateway_res.embeddings = [[0.5] * settings.PGVECTOR_DIMENSION]

    with patch("app.core.ai.gateway.AIGateway.embed", new_callable=AsyncMock) as mock_embed:
        mock_embed.return_value = mock_gateway_res
        vec = await service._embed_question("Sample query string")
        assert len(vec) == settings.PGVECTOR_DIMENSION
        mock_embed.assert_awaited_once()
        called_args, called_kwargs = mock_embed.call_args
        assert called_args and called_args[0].input == "Sample query string"
