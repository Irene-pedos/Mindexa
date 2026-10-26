import time
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.cache import cache
from app.core.exceptions import ValidationError
from app.schemas.study_reader import (
    PageCheckAnswerItem,
    PageCheckQuestion,
    PageCheckSubmitRequest,
)
from app.services.study_reader_service import StudyReaderService


def _questions():
    return [
        PageCheckQuestion(id=f"q{i}", question=f"Q{i}?", options=["A", "B", "C"], correct_option_index=0, explanation="e")
        for i in (1, 2, 3)
    ]


def _service():
    service = StudyReaderService(AsyncMock())
    service.assert_access = AsyncMock(return_value=("Title", {}))
    service.repo = MagicMock()
    service.repo.create_key_point = AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4()))
    StudyReaderService._page_check_cache.clear()
    return service


def _no_shared_cache(monkeypatch):
    monkeypatch.setattr(cache, "get", AsyncMock(return_value=None))
    monkeypatch.setattr(cache, "set", AsyncMock())


async def _seed(service, student_id, source_id, page=2):
    await service._store_page_check(student_id, "lecturer_material", source_id, page, _questions())


@pytest.mark.asyncio
async def test_score_is_out_of_the_whole_quiz_not_out_of_the_answers_given(monkeypatch):
    _no_shared_cache(monkeypatch)
    service, student_id, source_id = _service(), uuid.uuid4(), uuid.uuid4()
    await _seed(service, student_id, source_id)

    result = await service.submit_page_check(
        student_id,
        "lecturer_material",
        source_id,
        PageCheckSubmitRequest(page_number=2, answers=[PageCheckAnswerItem(question_id="q1", selected_option_index=0)]),
    )

    assert (result.score, result.max_score) == (1, 3)
    assert result.percentage == 33.3
    assert result.passed is False


@pytest.mark.asyncio
async def test_the_same_question_cannot_be_answered_twice(monkeypatch):
    _no_shared_cache(monkeypatch)
    service, student_id, source_id = _service(), uuid.uuid4(), uuid.uuid4()
    await _seed(service, student_id, source_id)
    same = PageCheckAnswerItem(question_id="q1", selected_option_index=0)

    with pytest.raises(ValidationError) as exc_info:
        await service.submit_page_check(
            student_id,
            "lecturer_material",
            source_id,
            PageCheckSubmitRequest(page_number=2, answers=[same, same]),
        )

    assert exc_info.value.code == "DUPLICATE_PAGE_CHECK_ANSWER"


@pytest.mark.asyncio
async def test_quiz_generated_on_another_worker_can_be_graded_via_the_shared_cache(monkeypatch):
    service, student_id, source_id = _service(), uuid.uuid4(), uuid.uuid4()
    # Nothing in this worker's local dict; the quiz only exists in Redis.
    monkeypatch.setattr(cache, "get", AsyncMock(return_value=[q.model_dump() for q in _questions()]))

    loaded = await service._load_page_check(student_id, "lecturer_material", source_id, 2)

    assert [q.id for q in loaded] == ["q1", "q2", "q3"]
    assert loaded[0].correct_option_index == 0


@pytest.mark.asyncio
async def test_expired_or_missing_quiz_asks_for_a_new_one(monkeypatch):
    _no_shared_cache(monkeypatch)
    service = _service()

    with pytest.raises(ValidationError) as exc_info:
        await service.submit_page_check(
            uuid.uuid4(),
            "lecturer_material",
            uuid.uuid4(),
            PageCheckSubmitRequest(page_number=2, answers=[]),
        )

    assert exc_info.value.code == "PAGE_CHECK_NOT_FOUND"


@pytest.mark.asyncio
async def test_local_fallback_cache_drops_expired_entries_and_stays_bounded(monkeypatch):
    _no_shared_cache(monkeypatch)
    service = _service()
    monkeypatch.setattr(StudyReaderService, "_PAGE_CHECK_LOCAL_MAX", 3)
    stale_key = (uuid.uuid4(), "lecturer_material", uuid.uuid4(), 1)
    StudyReaderService._page_check_cache[stale_key] = (time.monotonic() - 1, _questions())

    for page in range(2, 8):
        await service._store_page_check(uuid.uuid4(), "lecturer_material", uuid.uuid4(), page, _questions())

    assert stale_key not in StudyReaderService._page_check_cache
    assert len(StudyReaderService._page_check_cache) <= 3


def test_progress_response_carries_every_persisted_view_setting():
    progress = SimpleNamespace(
        id=uuid.uuid4(), student_id=uuid.uuid4(), source_kind="lecturer_material", source_id=uuid.uuid4(),
        last_page=7, last_scale=125.0, rotation=90, zoom_mode="fit-page", two_page_view=True,
        furthest_page_reached=12, page_count_seen=12, updated_at=datetime.now(UTC),
    )

    response = StudyReaderService._progress_response(progress)

    assert (response.rotation, response.zoom_mode, response.two_page_view) == (90, "fit-page", True)
    assert response.furthest_page_reached == 12
