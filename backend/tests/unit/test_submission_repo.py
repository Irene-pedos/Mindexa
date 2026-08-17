import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from sqlalchemy.exc import IntegrityError
from app.db.repositories.submission_repo import SubmissionRepository
from app.db.models.attempt import StudentResponse


@pytest.mark.asyncio
async def test_upsert_response_updates_existing_response():
    db = AsyncMock()
    repo = SubmissionRepository(db)

    attempt_id = uuid.uuid4()
    question_id = uuid.uuid4()

    existing_response = StudentResponse(
        id=uuid.uuid4(),
        attempt_id=attempt_id,
        question_id=question_id,
        answer_type="SINGLE_OPTION",
        answer_text=None,
        selected_option_ids=["opt-1"],
        is_deleted=False,
    )

    repo.get_response = AsyncMock(return_value=existing_response)

    response, created = await repo.upsert_response(
        attempt_id=attempt_id,
        question_id=question_id,
        answer_type="SINGLE_OPTION",
        selected_option_ids=["opt-2"],
    )

    assert created is False
    assert response.selected_option_ids == ["opt-2"]
    db.flush.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_response_handles_concurrent_race_condition():
    db = AsyncMock()
    
    # In SQLAlchemy, session.begin_nested() returns an async context manager
    nested_cm = MagicMock()
    nested_cm.__aenter__ = AsyncMock(return_value=None)
    nested_cm.__aexit__ = AsyncMock(return_value=None)
    db.begin_nested = MagicMock(return_value=nested_cm)

    repo = SubmissionRepository(db)

    attempt_id = uuid.uuid4()
    question_id = uuid.uuid4()

    # First get_response returns None (simulate race before insert)
    # Second get_response (in except handler) returns the row inserted by competitor request
    competitor_response = StudentResponse(
        id=uuid.uuid4(),
        attempt_id=attempt_id,
        question_id=question_id,
        answer_type="TEXT",
        answer_text="first concurrent text",
        is_deleted=False,
    )
    repo.get_response = AsyncMock(side_effect=[None, competitor_response])

    # db.flush throws IntegrityError on the first flush (concurrent collision)
    db.flush.side_effect = [IntegrityError("duplicate key", params={}, orig=Exception("unique")), None]

    response, created = await repo.upsert_response(
        attempt_id=attempt_id,
        question_id=question_id,
        answer_type="TEXT",
        answer_text="second updated text",
    )

    assert created is False
    assert response == competitor_response
    assert response.answer_text == "second updated text"
