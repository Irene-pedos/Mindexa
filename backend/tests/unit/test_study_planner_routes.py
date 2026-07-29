import pytest
import uuid
from datetime import datetime, UTC, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import app.db.models
from app.services.study_planner_service import StudyPlannerService
from app.schemas.study_planner import (
    CreateStudyPlanRequest,
    GeneratePlanFromAssessmentRequest,
    CompleteSessionRequest,
    GenerateQuizRequest,
    RescheduleSessionRequest,
    AdjustPlanRequest,
)

@pytest.mark.asyncio
async def test_all_study_planner_service_methods():
    db_mock = AsyncMock()
    service = StudyPlannerService(db_mock)
    student_id = uuid.uuid4()
    plan_id = uuid.uuid4()
    session_id = uuid.uuid4()

    # 1. Mock Plan
    mock_plan = MagicMock()
    mock_plan.id = plan_id
    mock_plan.student_id = student_id
    mock_plan.title = "Database Systems Prep"
    mock_plan.study_type = "Assessment Preparation"
    mock_plan.course_id = None
    mock_plan.teaching_workspace_id = None
    mock_plan.assessment_id = None
    mock_plan.start_date = datetime.now(UTC)
    mock_plan.end_date = datetime.now(UTC) + timedelta(days=7)
    mock_plan.available_days = ["Monday", "Wednesday"]
    mock_plan.blackout_dates = []
    mock_plan.preferred_time_start = "19:00"
    mock_plan.preferred_time_end = "21:00"
    mock_plan.session_duration_minutes = 60
    mock_plan.daily_goal = "Complete 1 topic"
    mock_plan.preferred_difficulty = "Balanced"
    mock_plan.reminder_preference_minutes = 30
    mock_plan.reminder_channels = ["in_app"]
    mock_plan.priority = "High"
    mock_plan.status = "ACTIVE"
    mock_plan.auto_generated = True
    mock_plan.streak_count = 3
    mock_plan.readiness_score = 85
    mock_plan.readiness_history = []
    mock_plan.covered_material_ids = []
    mock_plan.created_at = datetime.now(UTC)
    mock_plan.is_deleted = False

    # 2. Mock Session
    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = plan_id
    mock_session.student_id = student_id
    mock_session.title = "Study Session: Database Normalization"
    mock_session.topic = "Database Normalization"
    mock_session.session_type = "STUDY"
    mock_session.scheduled_start = datetime.now(UTC)
    mock_session.scheduled_end = datetime.now(UTC) + timedelta(minutes=60)
    mock_session.duration_minutes = 60
    mock_session.status = "SCHEDULED"
    mock_session.completed_at = None
    mock_session.understanding_level = None
    mock_session.difficulty_rating = None
    mock_session.confidence_rating = None
    mock_session.feedback_notes = None
    mock_session.checklist_items = []
    mock_session.quiz_questions = []
    mock_session.recommended_resource_ids = []
    mock_session.is_deleted = False

    mock_plan.sessions = [mock_session]

    with patch.object(service.repo, "list_plans_for_student", new_callable=AsyncMock) as mock_list_plans, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan, \
         patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "list_upcoming_sessions_for_student", new_callable=AsyncMock) as mock_list_upcoming, \
         patch("app.db.repositories.assessment_repo.AssessmentRepository.list_available_for_student", new_callable=AsyncMock) as mock_list_ass:

        mock_list_plans.return_value = [mock_plan]
        mock_get_plan.return_value = mock_plan
        mock_get_session.return_value = mock_session
        mock_list_upcoming.return_value = [mock_session]
        mock_list_ass.return_value = ([], 0)

        # Test get_summary
        summary = await service.get_summary(student_id)
        assert summary.assessment_readiness_score == 98
        assert summary.streak_days == 3

        # Test complete_session
        comp = await service.complete_session(session_id, student_id, "YES", "Medium", 5, "Great session!")
        assert comp.status == "COMPLETED"

        # Test generate_session_quiz
        quiz = await service.generate_session_quiz(session_id, student_id, 5)
        assert len(quiz) == 5

        # Test reschedule_session
        resched = await service.reschedule_session(session_id, student_id, datetime.now(UTC) + timedelta(days=1), 45)
        assert resched.status == "RESCHEDULED"

        # Test adjust_plan
        adj = await service.adjust_plan(plan_id, student_id, "reduce_duration")
        assert adj.id == plan_id
