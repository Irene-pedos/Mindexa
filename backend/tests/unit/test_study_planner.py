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
    db_mock.add = MagicMock()
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
    db_mock.add = MagicMock()
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


@pytest.mark.asyncio
async def test_start_guided_session_depth_and_full_output():
    db_mock = AsyncMock()
    db_mock.execute = AsyncMock()
    db_mock.commit = AsyncMock()
    service = StudyPlannerService(db_mock)

    session_id = uuid.uuid4()
    student_id = uuid.uuid4()
    plan_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = plan_id
    mock_session.title = "Advanced Database Indexing"
    mock_session.topic = "B-Trees and Hash Indexes"
    mock_session.session_type = "STUDY"
    mock_session.status = "SCHEDULED"
    mock_session.scheduled_start = datetime.now(UTC)
    mock_session.scheduled_end = datetime.now(UTC) + timedelta(minutes=60)
    mock_session.duration_minutes = 60
    mock_session.lesson_status = "NOT_GENERATED"
    mock_session.lesson_sections_json = []
    mock_session.lesson_plan_json = None

    mock_plan = MagicMock()
    mock_plan.id = plan_id
    mock_plan.course_id = None
    mock_plan.teaching_workspace_id = None

    mock_profile = MagicMock()
    mock_profile.weak_topics = []
    mock_profile.topic_confidence = {}

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan, \
         patch.object(service.repo, "get_or_create_learning_profile", new_callable=AsyncMock) as mock_get_profile, \
         patch.object(service.repo, "update_session", new_callable=AsyncMock) as mock_update_session:

        mock_get_session.return_value = mock_session
        mock_get_plan.return_value = mock_plan
        mock_get_profile.return_value = mock_profile

        res = await service.start_guided_session(session_id, student_id)

        assert res.lesson_status == "IN_PROGRESS"
        assert res.lesson_plan_json is not None
        assert len(res.lesson_sections_json) >= 5
        assert "objectives" in res.lesson_plan_json
        assert "summary" in res.lesson_plan_json
        assert "glossary" in res.lesson_plan_json


@pytest.mark.asyncio
async def test_submit_guided_knowledge_check_fails_loudly_on_empty_questions():
    db_mock = AsyncMock()
    service = StudyPlannerService(db_mock)

    session_id = uuid.uuid4()
    student_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = uuid.uuid4()
    mock_session.topic = "Database Indexing"
    mock_session.quiz_questions = []

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service, "generate_session_quiz", new_callable=AsyncMock) as mock_gen_quiz:

        mock_get_session.return_value = mock_session
        mock_gen_quiz.return_value = []

        with pytest.raises(ValueError, match="no questions found"):
            await service.submit_guided_knowledge_check(session_id, student_id, answers={})


@pytest.mark.asyncio
async def test_grade_knowledge_check_uses_log_action_without_llm_call():
    db_mock = AsyncMock()
    from app.agents.study_planner_agent import StudyPlannerAgent
    from app.core.ai.gateway import AIGateway
    gateway = AIGateway(db_mock, MagicMock())
    gateway.log_action = AsyncMock()

    agent = StudyPlannerAgent(gateway)
    student_id = uuid.uuid4()
    session_id = uuid.uuid4()
    questions = [
        {"id": "q1", "question_type": "MCQ", "options": ["A", "B"], "correct_option_index": 0}
    ]
    answers = {"q1": 0}

    report = await agent.grade_knowledge_check(
        student_id=student_id,
        session_id=session_id,
        questions=questions,
        student_answers=answers,
    )

    assert report.score_percentage == 100.0
    gateway.log_action.assert_called_once()


@pytest.mark.asyncio
async def test_generate_guided_exercise_calls_ai_agent():
    db_mock = AsyncMock()
    service = StudyPlannerService(db_mock)

    session_id = uuid.uuid4()
    student_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = uuid.uuid4()
    mock_session.topic = "Relational Normalization"
    mock_session.lesson_sections_json = [
        {"section_title": "First Normal Form (1NF)", "content": "1NF requires atomic values."}
    ]

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan, \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_guided_exercise", new_callable=AsyncMock) as mock_agent_gen:

        mock_get_session.return_value = mock_session
        mock_get_plan.return_value = None

        from app.agents.study_planner_agent import GuidedExerciseOutput
        mock_agent_gen.return_value = GuidedExerciseOutput(
            question_text="What makes a table compliant with 1NF?",
            options=["Atomic column values", "Composite keys", "Foreign keys", "None"],
            correct_option_index=0,
            explanation="1NF strictly mandates atomic attribute values.",
        )

        res = await service.generate_guided_exercise(session_id, student_id, section_index=0)

        assert res["question_text"] == "What makes a table compliant with 1NF?"
        assert len(res["options"]) == 4
        mock_agent_gen.assert_called_once()


@pytest.mark.asyncio
async def test_generate_session_topics_with_weak_topics():
    gateway = AsyncMock()
    gateway.complete = AsyncMock()
    from app.agents.study_planner_agent import StudyPlannerAgent, SessionTopicPlan

    mock_resp = MagicMock()
    mock_resp.content = '[{"topic": "Normalization Weak Area", "session_type": "STUDY"}]'
    gateway.complete.return_value = mock_resp

    agent = StudyPlannerAgent(gateway)
    res = await agent.generate_session_topics(
        student_id=uuid.uuid4(),
        assessment_title="Database Exam",
        weak_topics=["Normalization Weak Area", "BCNF"],
        session_count=5,
    )

    assert len(res) == 1
    assert res[0].topic == "Normalization Weak Area"
    gateway.complete.assert_called_once()
    req = gateway.complete.call_args[0][0]
    assert "KNOWN STUDENT WEAK TOPICS: Normalization Weak Area, BCNF" in req.messages[0].content


def test_create_study_plan_request_date_and_blackout_validation():
    from app.schemas.study_planner import CreateStudyPlanRequest

    now = datetime.now(UTC)
    # Test M4: end_date <= start_date fails
    with pytest.raises(ValueError, match="End date must be strictly after start date"):
        CreateStudyPlanRequest(
            title="Invalid Date Plan",
            start_date=now,
            end_date=now - timedelta(days=1),
            preferred_time_start="19:00",
            preferred_time_end="21:00",
            session_duration_minutes=60,
            daily_goal="Study",
            reminder_preference_minutes=30,
            priority="Medium",
        )

    # Test M5: Invalid blackout date format fails
    with pytest.raises(ValueError, match="Invalid blackout date format"):
        CreateStudyPlanRequest(
            title="Invalid Blackout Plan",
            start_date=now,
            end_date=now + timedelta(days=7),
            blackout_dates=["2026-08-01", "invalid-date"],
            preferred_time_start="19:00",
            preferred_time_end="21:00",
            session_duration_minutes=60,
            daily_goal="Study",
            reminder_preference_minutes=30,
            priority="Medium",
        )



