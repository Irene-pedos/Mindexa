import pytest
import uuid
from datetime import datetime, UTC, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.study_planner_service import StudyPlannerService
from app.schemas.study_planner import (
    CreateStudyPlanRequest,
    GeneratePlanFromAssessmentRequest,
)

@pytest.mark.asyncio
async def test_create_manual_plan_success():
    db_mock = AsyncMock()
    service = StudyPlannerService(db_mock)
    
    student_id = uuid.uuid4()
    req = CreateStudyPlanRequest(
        title="Database Systems Study Plan",
        study_type="Assessment Preparation",
        start_date=datetime.now(UTC),
        end_date=datetime.now(UTC) + timedelta(days=14),
        available_days=["Monday", "Wednesday", "Friday"],
        preferred_time_start="19:00",
        preferred_time_end="21:00",
        session_duration_minutes=60,
        daily_goal="Study 1 topic per session",
        preferred_difficulty="Balanced",
        auto_generate_sessions=False,
    )

    with patch.object(service.repo, "create_plan", new_callable=AsyncMock) as mock_create_plan, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan:
        
        mock_plan = MagicMock()
        mock_plan.id = uuid.uuid4()
        mock_plan.student_id = student_id
        mock_plan.title = req.title
        mock_plan.study_type = req.study_type
        mock_plan.course_id = None
        mock_plan.teaching_workspace_id = None
        mock_plan.assessment_id = None
        mock_plan.start_date = req.start_date
        mock_plan.end_date = req.end_date
        mock_plan.available_days = req.available_days
        mock_plan.blackout_dates = []
        mock_plan.preferred_time_start = req.preferred_time_start
        mock_plan.preferred_time_end = req.preferred_time_end
        mock_plan.session_duration_minutes = req.session_duration_minutes
        mock_plan.daily_goal = req.daily_goal
        mock_plan.preferred_difficulty = req.preferred_difficulty
        mock_plan.reminder_preference_minutes = 30
        mock_plan.reminder_channels = ["in_app"]
        mock_plan.priority = "Medium"
        mock_plan.status = "ACTIVE"
        mock_plan.auto_generated = False
        mock_plan.streak_count = 0
        mock_plan.readiness_score = 80
        mock_plan.readiness_history = []
        mock_plan.covered_material_ids = []
        mock_plan.created_at = datetime.now(UTC)
        mock_plan.sessions = []
        mock_plan.is_deleted = False

        mock_create_plan.return_value = mock_plan
        mock_get_plan.return_value = mock_plan

        res = await service.create_manual_plan(student_id, req)
        assert res.title == "Database Systems Study Plan"
        assert res.student_id == student_id


@pytest.mark.asyncio
async def test_generate_session_quiz():
    db_mock = AsyncMock()
    service = StudyPlannerService(db_mock)

    session_id = uuid.uuid4()
    student_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.topic = "Database Normalization (BCNF)"
    mock_session.quiz_questions = []

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session:
        mock_get_session.return_value = mock_session
        questions = await service.generate_session_quiz(session_id, student_id, question_count=5)
        
        assert len(questions) == 5
        assert "Database Normalization (BCNF)" in questions[0]["question_text"]
