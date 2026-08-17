import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.db.models.auth import User
from app.core.constants import UserRole
from app.schemas.question import QuestionCreateRequest, QuestionSearchParams
from app.services.question_service import QuestionService


@pytest.mark.asyncio
async def test_question_bank_search_only_returns_banked_active_questions():
    service = QuestionService(AsyncMock())
    service._repo = AsyncMock()
    service._repo.search.return_value = ([], 0)

    current_user = MagicMock(spec=User)
    current_user.id = uuid.uuid4()
    current_user.role = UserRole.LECTURER.value

    params = QuestionSearchParams(page=1, page_size=20)

    result = await service.search_questions(params, current_user)

    assert result.total == 0
    service._repo.search.assert_called_once()
    _, kwargs = service._repo.search.call_args
    assert kwargs["created_by_id"] == current_user.id
    assert kwargs["is_in_question_bank"] is True
    assert kwargs["is_active"] is True


@pytest.mark.asyncio
async def test_create_question_marks_question_as_banked():
    service = QuestionService(AsyncMock())
    service._repo = AsyncMock()

    current_user = MagicMock(spec=User)
    current_user.id = uuid.uuid4()

    created_question = MagicMock()
    created_question.id = uuid.uuid4()
    service._repo.create.return_value = created_question

    data = QuestionCreateRequest(
        content="What is 2 + 2?",
        question_type="mcq",
        difficulty="easy",
        suggested_marks=1,
        options=[
            {"option_text": "4", "is_correct": True, "order_index": 0},
            {"option_text": "5", "is_correct": False, "order_index": 1},
        ],
    )

    result = await service.create_question(data, current_user)

    assert result == created_question
    service._repo.create.assert_called_once()
    _, kwargs = service._repo.create.call_args
    assert kwargs["is_in_question_bank"] is True
    assert kwargs["bank_added_by_id"] == current_user.id
    service._repo.create_bank_entry.assert_called_once_with(
        question_id=created_question.id,
        added_by_id=current_user.id,
        subject_id=None,
        difficulty="easy",
        source_type="manual",
        source_assessment_id=None,
    )


@pytest.mark.asyncio
async def test_question_repo_create_with_table_and_ai_fields():
    from app.db.repositories.question_repo import QuestionRepository
    
    mock_db = AsyncMock()
    repo = QuestionRepository(mock_db)
    
    user_id = uuid.uuid4()
    ai_batch_id = uuid.uuid4()
    ai_log_id = uuid.uuid4()
    
    q = await repo.create(
        created_by_id=user_id,
        question_type="short_answer",
        content="Calculate total equity",
        difficulty="medium",
        source_type="ai_generated",
        source_ai_batch_id=ai_batch_id,
        ai_action_log_id=ai_log_id,
        question_table_context={"headers": ["Asset", "Value"], "rows": [["Cash", "100"]]},
        requires_table_answer=True,
        answer_table_template={"headers": ["Account", "Amount"], "min_rows": 1}
    )
    
    assert q is not None
    assert q.created_by_id == user_id
    assert q.source_ai_batch_id == ai_batch_id
    assert q.ai_action_log_id == ai_log_id
    assert q.requires_table_answer is True
    assert q.question_table_context == {"headers": ["Asset", "Value"], "rows": [["Cash", "100"]]}
    mock_db.add.assert_called_once_with(q)
    mock_db.flush.assert_called_once()
