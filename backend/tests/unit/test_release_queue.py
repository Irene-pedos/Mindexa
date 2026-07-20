import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock
from app.api.v1.routes.result import get_release_readiness_queue
from app.schemas.result import ReleaseQueueResponse

@pytest.mark.asyncio
async def test_get_release_readiness_queue_empty():
    db = AsyncMock()
    # Mock return value for students query - empty class section
    mock_res = MagicMock()
    mock_res.all.return_value = []
    db.execute.return_value = mock_res

    assessment_id = uuid.uuid4()
    class_section_id = uuid.uuid4()
    current_user = MagicMock()

    response = await get_release_readiness_queue(
        assessment_id=assessment_id,
        class_section_id=class_section_id,
        current_user=current_user,
        db=db
    )

    assert isinstance(response, ReleaseQueueResponse)
    assert len(response.items) == 0
    assert response.class_fully_graded is True


@pytest.mark.asyncio
async def test_get_release_readiness_queue_with_null_display_name():
    db = AsyncMock()
    student_id = uuid.uuid4()
    
    # 1. Students query return value with display_name = None
    mock_students_res = MagicMock()
    # tuple: (id, email, display_name, first_name, last_name)
    mock_students_res.all.return_value = [(student_id, "student@example.com", None, "Jane", "Doe")]

    # 2. Attempts query
    mock_attempts_res = MagicMock()
    mock_attempts_res.scalars.return_value.all.return_value = []

    # 3. Results query
    mock_results_res = MagicMock()
    mock_results_res.scalars.return_value.all.return_value = []

    # 4. Resp counts query
    mock_resp_res = MagicMock()
    mock_resp_res.all.return_value = []

    # 5. Final counts query
    mock_final_res = MagicMock()
    mock_final_res.all.return_value = []

    db.execute.side_effect = [
        mock_students_res,
        mock_attempts_res,
        mock_results_res,
        mock_resp_res,
        mock_final_res,
    ]

    response = await get_release_readiness_queue(
        assessment_id=uuid.uuid4(),
        class_section_id=uuid.uuid4(),
        current_user=MagicMock(),
        db=db
    )

    assert isinstance(response, ReleaseQueueResponse)
    assert len(response.items) == 1
    assert response.items[0].student_name == "Jane Doe"

