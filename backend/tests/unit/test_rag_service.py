import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock
from app.services.rag_service import RAGService
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AIEmbeddingResponse

@pytest.mark.asyncio
async def test_rag_service_blocks_retrieval_during_active_assessment():
    # Mock DB and Gateway
    db = AsyncMock()
    gateway = AsyncMock(spec=AIGateway)
    
    # Mock _has_active_assessment to return True
    service = RAGService(db, gateway)
    service._has_active_assessment = AsyncMock(return_value=True)
    
    student_id = uuid.uuid4()
    institution_id = uuid.uuid4()
    
    chunks = await service.retrieve_context_for_student(student_id, institution_id, "What is SQL?")
    
    assert chunks == []
    service._has_active_assessment.assert_called_once_with(student_id)

@pytest.mark.asyncio
async def test_rag_service_retrieves_chunks_when_no_active_assessment():
    # Mock DB and Gateway
    db = AsyncMock()
    gateway = AsyncMock(spec=AIGateway)
    
    # Mock gateway.embed to return a dummy embedding
    gateway.embed.return_value = AIEmbeddingResponse(
        embeddings=[[0.1] * 1536],
        provider="openai",
        model="text-embedding-3-small",
        total_tokens=10
    )
    
    # Mock DB execution for similarity search
    # We need to mock the result of session.execute(stmt)
    mock_result_student = MagicMock()
    mock_result_student.fetchall.return_value = [
        ("SQL content", 1, "notes.pdf", 0.9)
    ]
    
    mock_result_lecturer = MagicMock()
    mock_result_lecturer.fetchall.return_value = [
        ("Lecturer SQL content", 2, "slides.pdf", "Lecture Slides", 0.95)
    ]
    
    db.execute.side_effect = [mock_result_student, mock_result_lecturer]
    
    service = RAGService(db, gateway)
    service._has_active_assessment = AsyncMock(return_value=False)
    
    student_id = uuid.uuid4()
    institution_id = uuid.uuid4()
    
    chunks = await service.retrieve_context_for_student(student_id, institution_id, "What is SQL?")
    
    assert len(chunks) == 2
    assert chunks[0]["score"] == 0.95  # Highest score first
    assert chunks[0]["type"] == "lecturer_material"
    assert chunks[1]["score"] == 0.9
    assert chunks[1]["type"] == "student_resource"
