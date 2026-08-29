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
    db_mock.add = MagicMock()
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

    mock_exec_sub = MagicMock()
    mock_exec_sub.scalars.return_value.all.return_value = []
    db_mock.execute = AsyncMock(return_value=mock_exec_sub)

    with patch.object(service.repo, "list_plans_for_student", new_callable=AsyncMock) as mock_list_plans, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan, \
         patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "list_upcoming_sessions_for_student", new_callable=AsyncMock) as mock_list_upcoming, \
         patch.object(service.repo, "update_session", new_callable=AsyncMock) as mock_update_session, \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_knowledge_check", new_callable=AsyncMock) as mock_gen_kc, \
         patch("app.db.repositories.assessment_repo.AssessmentRepository.list_available_for_student", new_callable=AsyncMock) as mock_list_ass:

        from app.agents.study_planner_agent import KnowledgeCheckQuestion
        mock_gen_kc.return_value = [
            KnowledgeCheckQuestion(
                id="q1",
                question_text="Sample Q",
                question_type="MCQ",
                options=["A", "B", "C", "D"],
                correct_option_index=0,
                correct_answer="A",
                explanation="Exp",
                generated_by="ai",
            )
        ]

        mock_list_plans.return_value = [mock_plan]
        mock_get_plan.return_value = mock_plan
        mock_get_session.return_value = mock_session
        mock_list_upcoming.return_value = [mock_session]
        mock_list_ass.return_value = ([], 0)

        # Test get_summary
        summary = await service.get_summary(student_id)
        assert summary.assessment_readiness_score == mock_plan.readiness_score
        assert summary.streak_days == 3

        # Test complete_session
        comp = await service.complete_session(session_id, student_id, "YES", "Medium", 5, "Great session!")
        assert comp.status == "COMPLETED"

        # Test generate_session_quiz
        quiz = await service.generate_session_quiz(session_id, student_id, 5)
        assert len(quiz) >= 1
        assert quiz[0]["generated_by"] == "ai"

        # Test reschedule_session
        resched = await service.reschedule_session(session_id, student_id, datetime.now(UTC) + timedelta(days=1), 45)
        assert resched.status == "RESCHEDULED"

        # Test adjust_plan
        adj = await service.adjust_plan(plan_id, student_id, "reduce_duration")
        assert adj.id == plan_id


@pytest.mark.asyncio
async def test_reschedule_contract_schema_and_route():
    from app.schemas.study_planner import RescheduleSessionRequest

    # Test 1: Frontend sends new_duration_minutes
    data1 = {"new_start": "2026-08-01T10:00:00Z", "new_duration_minutes": 45}
    req1 = RescheduleSessionRequest.model_validate(data1)
    assert req1.new_duration_minutes == 45
    assert req1.new_duration == 45

    # Test 2: Client sends legacy new_duration
    data2 = {"new_start": "2026-08-01T10:00:00Z", "new_duration": 30}
    req2 = RescheduleSessionRequest.model_validate(data2)
    assert req2.new_duration_minutes == 30
    assert req2.new_duration == 30

    # Test 3: Route execution contract
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)
    session_id = uuid.uuid4()
    student_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = uuid.uuid4()
    mock_session.title = "Study Session: Database Normalization"
    mock_session.topic = "Database Normalization"
    mock_session.session_type = "STUDY"
    mock_session.scheduled_start = datetime.now(UTC)
    mock_session.scheduled_end = datetime.now(UTC) + timedelta(minutes=60)
    mock_session.duration_minutes = 60
    mock_session.status = "SCHEDULED"

    mock_plan = MagicMock()
    mock_plan.id = mock_session.study_plan_id
    mock_plan.start_date = datetime(2026, 7, 1, tzinfo=UTC)
    mock_plan.end_date = datetime(2026, 8, 31, tzinfo=UTC)
    mock_plan.blackout_dates = []

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan, \
         patch.object(service.repo, "list_plans_for_student", new_callable=AsyncMock) as mock_list_plans, \
         patch.object(service.repo, "update_session", new_callable=AsyncMock) as mock_update_session:
        mock_get_session.return_value = mock_session
        mock_get_plan.return_value = mock_plan
        mock_list_plans.return_value = []

        # Route reads body.new_duration_minutes
        resched = await service.reschedule_session(
            session_id, student_id, req1.new_start, req1.new_duration_minutes
        )
        assert resched.duration_minutes == 45
        assert resched.status == "RESCHEDULED"


@pytest.mark.asyncio
async def test_source_citation_contract_and_guided_ask_ai():
    from app.db.schemas.rag import SourceCitation

    # Test 1: Schema computed fields title and snippet
    resource_id = uuid.uuid4()
    cit = SourceCitation(
        resource_name="Lecture 1 - Normalization.pdf",
        resource_id=resource_id,
        page_number=4,
        chunk_index=2,
        excerpt="BCNF resolves non-trivial functional dependencies where X is not a superkey.",
    )

    assert cit.title == "Lecture 1 - Normalization.pdf"
    assert cit.snippet == "BCNF resolves non-trivial functional dependencies where X is not a superkey."

    dumped = cit.model_dump()
    assert dumped["title"] == "Lecture 1 - Normalization.pdf"
    assert dumped["snippet"] == "BCNF resolves non-trivial functional dependencies where X is not a superkey."
    assert dumped["resource_name"] == "Lecture 1 - Normalization.pdf"
    assert dumped["excerpt"] == "BCNF resolves non-trivial functional dependencies where X is not a superkey."

    # Test 2: Service ask_guided_session_question returns citations with title and snippet
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)
    session_id = uuid.uuid4()
    student_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = None
    mock_session.topic = "Database Normalization"
    mock_session.tutor_chat_history = []

    mock_output = MagicMock()
    mock_output.answer = "BCNF is a stricter form of 3NF."
    mock_output.citations = [cit]
    mock_output.fallback_used = False

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "update_session", new_callable=AsyncMock) as mock_update_session, \
         patch("app.agents.student_support_agent.StudySupportAgent.answer", new_callable=AsyncMock) as mock_answer:
        mock_get_session.return_value = mock_session
        mock_answer.return_value = mock_output

        res = await service.ask_guided_session_question(
            session_id=session_id,
            student_id=student_id,
            question="What is BCNF?",
            section_context="Section 2: BCNF",
        )

        assert res["answer"] == "BCNF is a stricter form of 3NF."
        assert len(res["citations"]) == 1
        assert res["citations"][0]["title"] == "Lecture 1 - Normalization.pdf"
        assert res["citations"][0]["snippet"] == "BCNF resolves non-trivial functional dependencies where X is not a superkey."


@pytest.mark.asyncio
async def test_get_summary_course_name_attribute():
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)
    student_id = uuid.uuid4()
    plan_id = uuid.uuid4()

    mock_plan = MagicMock()
    mock_plan.id = plan_id
    mock_plan.student_id = student_id
    mock_plan.readiness_score = 90
    mock_plan.streak_count = 5
    mock_plan.sessions = []
    mock_plan.covered_material_ids = []
    mock_plan.teaching_workspace_id = uuid.uuid4()

    mock_course = MagicMock(spec=["id", "code", "name"])
    mock_course.code = "CS301"
    mock_course.name = "Advanced Database Systems"

    mock_workspace = MagicMock()
    mock_workspace.id = mock_plan.teaching_workspace_id
    mock_workspace.course = mock_course

    mock_exec_sub = MagicMock()
    mock_exec_sub.scalars.return_value.all.return_value = []

    mock_exec_tw = MagicMock()
    mock_exec_tw.scalar_one_or_none.return_value = mock_workspace

    mock_exec_mats = MagicMock()
    mock_exec_mats.scalar_one_or_none.return_value = 5

    db_mock.execute = AsyncMock(side_effect=[mock_exec_sub, mock_exec_tw, mock_exec_mats])

    with patch.object(service.repo, "list_plans_for_student", new_callable=AsyncMock) as mock_list_plans, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan, \
         patch.object(service.repo, "list_today_sessions_for_student", new_callable=AsyncMock) as mock_list_today, \
         patch.object(service.repo, "list_upcoming_sessions_for_student", new_callable=AsyncMock) as mock_list_upcoming, \
         patch.object(service, "detect_schedule_conflicts", new_callable=AsyncMock) as mock_conflicts, \
         patch("app.db.repositories.assessment_repo.AssessmentRepository.list_available_for_student", new_callable=AsyncMock) as mock_list_ass:

        mock_list_plans.return_value = [mock_plan]
        mock_get_plan.return_value = mock_plan
        mock_list_today.return_value = []
        mock_list_upcoming.return_value = []
        mock_conflicts.return_value = []
        mock_list_ass.return_value = ([], 0)

        summary = await service.get_summary(student_id)
        assert summary is not None
        assert len(summary.material_coverage) == 1
        assert summary.material_coverage[0].course_code == "CS301"
        assert summary.material_coverage[0].course_title == "Advanced Database Systems"


def test_knowledge_check_question_coerces_boolean_options():
    from app.agents.study_planner_agent import KnowledgeCheckQuestion, KnowledgeCheckQuestionGrade, GuidedExerciseOutput

    q = KnowledgeCheckQuestion.model_validate({
        "id": "q1",
        "question_text": "Is b-tree self balancing?",
        "question_type": "TRUE_FALSE",
        "options": [True, False],
        "correct_answer": False,
        "explanation": "Explanation here",
    })
    assert q.options == ["True", "False"]
    assert q.correct_answer == "False"

    g = KnowledgeCheckQuestionGrade.model_validate({
        "question_id": "q1",
        "is_correct": False,
        "score": 0.0,
        "student_answer": True,
        "correct_answer": False,
        "explanation": "Explanation here",
    })
    assert g.student_answer == "True"
    assert g.correct_answer == "False"

    e = GuidedExerciseOutput.model_validate({
        "question_text": "Sample exercise",
        "options": [True, False],
        "correct_option_index": 0,
        "explanation": "Exercise explanation",
    })
    assert e.options == ["True", "False"]

