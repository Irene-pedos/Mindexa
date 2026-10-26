"""The reader must use the chunks the RAG pipeline really writes and never invent content."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agents.study_reader_agent import StudyReaderAgent
from app.core.exceptions import ValidationError
from app.db.models.resource_chunk import ResourceChunk
from app.services.study_reader_service import StudyReaderService


def _service(chunks, academic_resource_id="present"):
    service = StudyReaderService(AsyncMock())
    service.assert_access = AsyncMock(return_value=("Databases", {}))
    service._assert_language_allowed_for_source = AsyncMock()
    service.resource_repo = MagicMock()
    service.resource_repo.get_academic_resource_id = AsyncMock(
        return_value=uuid.uuid4() if academic_resource_id else None
    )
    service.resource_repo.list_source_chunks = AsyncMock(return_value=chunks)
    return service


@pytest.mark.asyncio
@pytest.mark.parametrize("indexed", [True, False])
async def test_skim_refuses_a_document_with_no_indexed_chunks(indexed):
    service = _service([], academic_resource_id="present" if indexed else None)

    with pytest.raises(ValidationError) as exc_info:
        await service.skim_document(uuid.uuid4(), "lecturer_material", uuid.uuid4())

    assert exc_info.value.code == "DOCUMENT_NOT_READY"


@pytest.mark.asyncio
async def test_skim_passes_indexed_chunks_with_page_markers_to_the_agent(monkeypatch):
    chunk = ResourceChunk(
        resource_id=uuid.uuid4(), chunk_index=0, content="B-trees keep data sorted.", metadata_json={"page": 7}
    )
    service = _service([chunk])
    agent = MagicMock()
    agent.skim = AsyncMock(return_value="skim-result")
    monkeypatch.setattr("app.services.study_reader_service.StudyReaderAgent", lambda _gw: agent)
    monkeypatch.setattr("app.services.study_reader_service.get_ai_provider", MagicMock())
    monkeypatch.setattr("app.services.study_reader_service.get_embedding_provider", MagicMock())
    monkeypatch.setattr("app.services.study_reader_service.AIGateway", MagicMock())

    result = await service.skim_document(uuid.uuid4(), "lecturer_material", uuid.uuid4())

    assert result == "skim-result"
    assert agent.skim.call_args.kwargs["chunks_text"] == ["B-trees keep data sorted. [Page 7]"]


def _agent_replying(content):
    gateway = MagicMock()
    gateway.complete = AsyncMock(return_value=SimpleNamespace(content=content))
    return StudyReaderAgent(gateway)


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", ["not json at all", '{"summary": "x", "bullets": []}'])
async def test_unusable_skim_output_is_an_error_not_invented_bullets(reply):
    agent = _agent_replying(reply)

    with pytest.raises(ValidationError):
        await agent.skim(
            title="Databases",
            chunks_text=["text"],
            student_id=uuid.uuid4(),
            source_id=uuid.uuid4(),
            source_kind="lecturer_material",
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", ["garbage", '{"questions": []}'])
async def test_unusable_page_check_output_is_an_error_not_a_canned_quiz(reply):
    agent = _agent_replying(reply)

    with pytest.raises(ValidationError):
        await agent.generate_page_check(
            title="Databases",
            page_number=3,
            page_context="text",
            student_id=uuid.uuid4(),
            source_id=uuid.uuid4(),
            source_kind="lecturer_material",
        )
