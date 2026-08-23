import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.services.result_service import ResultService
from app.db.models.attempt import SubmissionGrade, StudentResponse


@pytest.mark.asyncio
async def test_generate_breakdown_falls_back_to_ai_feedback_draft():
    db = AsyncMock()
    service = ResultService(db)
    service.result_repo = AsyncMock()
    service.submission_repo = AsyncMock()
    service.grading_repo = AsyncMock()

    attempt_id = uuid.uuid4()
    result_id = uuid.uuid4()
    q1_id = uuid.uuid4()
    q2_id = uuid.uuid4()

    # q1 has lecturer feedback; q2 has only ai_feedback_draft
    grade1 = MagicMock(spec=SubmissionGrade)
    grade1.question_id = q1_id
    grade1.score = 5.0
    grade1.max_score = 10.0
    grade1.feedback = "Good attempt, improve structure."
    grade1.ai_feedback_draft = "AI suggestion."
    grade1.grading_mode = "MANUAL"
    grade1.feedback_author_basis = "LECTURER"

    grade2 = MagicMock(spec=SubmissionGrade)
    grade2.question_id = q2_id
    grade2.score = 8.0
    grade2.max_score = 10.0
    grade2.feedback = None  # Lecturer accepted AI grade without manual feedback typing
    grade2.ai_feedback_draft = "Clear argument, consider adding more citations."
    grade2.grading_mode = "AI_ASSISTED"
    grade2.feedback_author_basis = "LECTURER"

    resp1 = MagicMock(spec=StudentResponse)
    resp1.question_id = q1_id
    resp1.is_skipped = False

    resp2 = MagicMock(spec=StudentResponse)
    resp2.question_id = q2_id
    resp2.is_skipped = False

    service.grading_repo.list_final_grades_for_attempt.return_value = [grade1, grade2]
    service.submission_repo.list_responses_for_attempt.return_value = [resp1, resp2]

    await service.generate_breakdown(result_id=result_id, attempt_id=attempt_id)

    # Verify replace_breakdowns called with expected breakdowns
    service.result_repo.replace_breakdowns.assert_called_once()
    called_result_id, breakdowns = service.result_repo.replace_breakdowns.call_args[0]
    assert called_result_id == result_id
    assert len(breakdowns) == 2

    bd_map = {b["question_id"]: b for b in breakdowns}
    
    # q1: lecturer feedback takes precedence
    assert bd_map[q1_id]["feedback"] == "Good attempt, improve structure."
    assert bd_map[q1_id]["feedback_author_basis"] == "LECTURER"

    # q2: falls back to ai_feedback_draft and sets basis to AI
    assert bd_map[q2_id]["feedback"] == "Clear argument, consider adding more citations."
    assert bd_map[q2_id]["feedback_author_basis"] == "AI"
