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
    assert response.items[0].status == "NOT_SUBMITTED"
    assert response.items[0].can_release is False


@pytest.mark.asyncio
async def test_unsubmitted_student_does_not_block_graded_student_release():
    """Verify that absent/unsubmitted students do not block graded students from being released."""
    db = AsyncMock()
    s1_id = uuid.uuid4()  # Completed & graded student
    s2_id = uuid.uuid4()  # Absent / non-submitted student
    attempt1_id = uuid.uuid4()

    # 1. Students query
    mock_students_res = MagicMock()
    mock_students_res.all.return_value = [
        (s1_id, "s1@example.com", "Student One", "Student", "One"),
        (s2_id, "s2@example.com", "Student Two", "Student", "Two"),
    ]

    # 2. Attempts query (only s1 has an attempt)
    mock_attempt1 = MagicMock()
    mock_attempt1.id = attempt1_id
    mock_attempt1.student_id = s1_id

    mock_attempts_res = MagicMock()
    mock_attempts_res.scalars.return_value.all.return_value = [mock_attempt1]

    # 3. Results query (s1 has a fully calculated result)
    mock_result1 = MagicMock()
    mock_result1.student_id = s1_id
    mock_result1.attempt_id = attempt1_id
    mock_result1.total_question_count = 5
    mock_result1.graded_question_count = 5
    mock_result1.integrity_hold = False
    mock_result1.is_released = False
    mock_result1.is_group_result = False
    mock_result1.total_score = 45.0
    mock_result1.max_score = 50.0
    mock_result1.percentage = 90.0
    mock_result1.letter_grade = MagicMock(value="A")

    mock_results_res = MagicMock()
    mock_results_res.scalars.return_value.all.return_value = [mock_result1]

    # 4. Resp counts query
    mock_resp_res = MagicMock()
    mock_resp_res.all.return_value = [(attempt1_id, 5)]

    # 5. Final counts query
    mock_final_res = MagicMock()
    mock_final_res.all.return_value = [(attempt1_id, 5)]

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
        db=db,
    )

    assert len(response.items) == 2
    
    # Student 1 must be eligible for release despite Student 2 having no submission
    item1 = next(item for item in response.items if item.student_id == s1_id)
    assert item1.can_release is True
    assert item1.status == "PENDING_RELEASE"
    assert item1.graded_question_count == 5

    # Student 2 is not submitted and cannot release
    item2 = next(item for item in response.items if item.student_id == s2_id)
    assert item2.can_release is False
    assert item2.status == "NOT_SUBMITTED"

    # All submitted students (1 out of 1) are fully graded
    assert response.class_fully_graded is True

