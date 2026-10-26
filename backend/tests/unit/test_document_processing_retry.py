import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.db.enums import ResourceProcessingStatus
from app.services import document_processing_service as dps
from app.services.document_processing_service import (
    DocumentProcessingService,
    EmbeddingGenerationError,
)


def _service(monkeypatch, *, embed_error=None):
    monkeypatch.setattr(dps.tiktoken, "get_encoding", MagicMock(side_effect=RuntimeError("offline")))
    monkeypatch.setattr(dps.os.path, "exists", lambda _p: True)
    service = DocumentProcessingService()
    service._extract_text_pdf = MagicMock(return_value=[{"page": 1, "text": "x" * 400}])
    service._generate_embeddings = AsyncMock(
        side_effect=embed_error, return_value=[[0.1] * 4]
    )
    service._store_chunks = AsyncMock()
    service._sync_parent_resource_status = AsyncMock()
    service._auto_segment_learning_units = AsyncMock()
    return service


def _db():
    resource = SimpleNamespace(
        id=uuid.uuid4(),
        file_name="notes.pdf",
        file_path="students/x/notes.pdf",
        processing_status=ResourceProcessingStatus.PENDING,
        processing_error=None,
    )
    db = AsyncMock()
    db.get.return_value = resource
    return db, resource


@pytest.mark.asyncio
async def test_transient_failure_before_the_last_attempt_is_raised_for_celery_to_retry(monkeypatch):
    service = _service(monkeypatch, embed_error=EmbeddingGenerationError("provider down"))
    db, resource = _db()

    with pytest.raises(EmbeddingGenerationError):
        await service.process_resource(resource.id, db, final_attempt=False)

    assert resource.processing_status == ResourceProcessingStatus.PENDING
    service._sync_parent_resource_status.assert_not_called()


@pytest.mark.asyncio
async def test_transient_failure_on_the_final_attempt_marks_failed_with_a_safe_message(monkeypatch):
    service = _service(monkeypatch, embed_error=EmbeddingGenerationError("Jina API failed: sk-secret"))
    db, resource = _db()

    await service.process_resource(resource.id, db, final_attempt=True)

    assert resource.processing_status == ResourceProcessingStatus.FAILED
    assert "sk-secret" not in resource.processing_error


@pytest.mark.asyncio
async def test_permanent_failure_is_not_retried(monkeypatch):
    service = _service(monkeypatch)
    service._extract_text_pdf = MagicMock(side_effect=dps.DocumentExtractionError("corrupt"))
    db, resource = _db()

    await service.process_resource(resource.id, db, final_attempt=False)

    assert resource.processing_status == ResourceProcessingStatus.FAILED


@pytest.mark.asyncio
async def test_reprocessing_retires_old_chunks_before_storing_new_ones(monkeypatch):
    service = _service(monkeypatch)
    order = []
    monkeypatch.setattr(
        dps.ResourceRepository,
        "soft_delete_chunks",
        AsyncMock(side_effect=lambda _id: order.append("retire")),
    )
    service._store_chunks = AsyncMock(side_effect=lambda *a, **k: order.append("store"))
    db, resource = _db()

    await service.process_resource(resource.id, db)

    assert order == ["retire", "store"]
    assert resource.processing_status == ResourceProcessingStatus.PROCESSED
