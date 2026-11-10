import json
import pytest
from app.core.exceptions import ValidationError
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
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)

    session_id = uuid.uuid4()
    student_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = None
    mock_session.topic = "Database Normalization (BCNF)"
    mock_session.quiz_questions = []

    from app.agents.study_planner_agent import KnowledgeCheckQuestion

    mock_questions = [
        KnowledgeCheckQuestion(
            id=f"q{i}",
            question_text=f"Question {i+1} on Database Normalization (BCNF)",
            question_type="MCQ",
            options=["Option A", "Option B", "Option C", "Option D"],
            correct_option_index=0,
            correct_answer="Option A",
            explanation="Explanation",
            generated_by="ai",
        )
        for i in range(5)
    ]

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "update_session", new_callable=AsyncMock) as mock_update_session, \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_knowledge_check", new_callable=AsyncMock) as mock_gen_kc:
        mock_get_session.return_value = mock_session
        mock_gen_kc.return_value = mock_questions

        questions = await service.generate_session_quiz(session_id, student_id, question_count=5)
        
        assert len(questions) == 5
        assert "Database Normalization (BCNF)" in questions[0]["question_text"]
        assert questions[0]["generated_by"] == "ai"
        mock_update_session.assert_called_once()


@pytest.mark.asyncio
async def test_generate_session_quiz_fails_loudly_after_retries():
    from app.core.exceptions import AITemporarilyUnavailableError

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)

    session_id = uuid.uuid4()
    student_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = None
    mock_session.topic = "Database Normalization"
    mock_session.quiz_questions = []

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_knowledge_check", new_callable=AsyncMock) as mock_gen_kc, \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        mock_get_session.return_value = mock_session
        mock_gen_kc.side_effect = Exception("AI Provider Network Timeout")

        with pytest.raises(AITemporarilyUnavailableError):
            await service.generate_session_quiz(session_id, student_id, question_count=5)

        assert mock_gen_kc.call_count == 2
        mock_sleep.assert_called_once_with(1.0)


@pytest.mark.asyncio
async def test_start_guided_session_depth_and_full_output():
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
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

    from app.agents.study_planner_agent import LessonPlanOutput, LessonSection

    mock_lesson = LessonPlanOutput(
        title="Advanced Database Indexing",
        topic="B-Trees and Hash Indexes",
        estimated_duration_minutes=60,
        objectives=["Understand B-Trees", "Compare with Hash Indexes"],
        sections=[
            LessonSection(section_title=f"Section {i+1}", content=f"Content {i+1}")
            for i in range(5)
        ],
        summary="Detailed summary of B-Trees and Hash Indexes",
        glossary=[{"term": "B-Tree", "definition": "Balanced tree data structure"}],
    )

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan, \
         patch.object(service.repo, "get_or_create_learning_profile", new_callable=AsyncMock) as mock_get_profile, \
         patch.object(service.repo, "update_session", new_callable=AsyncMock) as mock_update_session, \
         patch.object(service, "_get_session_rag_context", new_callable=AsyncMock) as mock_rag_ctx, \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_lesson", new_callable=AsyncMock) as mock_gen_lesson:

        mock_get_session.return_value = mock_session
        mock_get_plan.return_value = mock_plan
        mock_get_profile.return_value = mock_profile
        mock_rag_ctx.return_value = ("Mocked RAG context about B-Trees and Hash Indexes.", [])
        mock_gen_lesson.return_value = mock_lesson

        res = await service.start_guided_session(session_id, student_id)

        assert res.lesson_status == "IN_PROGRESS"
        assert res.lesson_plan_json is not None
        assert len(res.lesson_sections_json) >= 5
        assert "objectives" in res.lesson_plan_json
        assert "summary" in res.lesson_plan_json
        assert "glossary" in res.lesson_plan_json
        mock_rag_ctx.assert_called_once()
        mock_gen_lesson.assert_called_once()


@pytest.mark.asyncio
async def test_submit_guided_knowledge_check_fails_loudly_on_empty_questions():
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
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

        with pytest.raises(ValidationError, match="no questions found"):
            await service.submit_guided_knowledge_check(session_id, student_id, answers={})


@pytest.mark.asyncio
async def test_grade_knowledge_check_uses_log_action_without_llm_call():
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
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
    db_mock.add = MagicMock()
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


def test_lesson_plan_output_coercion_for_string_examples():
    from app.agents.study_planner_agent import LessonPlanOutput

    raw_data = {
        "title": "Responsive Web Design",
        "topic": "CSS Media Queries",
        "estimated_duration_minutes": 60,
        "sections": [
            {
                "section_title": "1. Media Queries",
                "content": "Explanation of media queries...",
                "examples": ["@media only screen and (max-width: 600px) { body { background-color: lightblue; } }"],
            }
        ],
        "glossary": ["CSS: Cascading Style Sheets"],
    }

    parsed = LessonPlanOutput.model_validate(raw_data)
    assert len(parsed.sections) == 1
    assert parsed.sections[0].examples == [
        {
            "title": "Example",
            "code": "@media only screen and (max-width: 600px) { body { background-color: lightblue; } }",
            "explanation": "",
        }
    ]
    assert parsed.glossary == [{"term": "CSS", "definition": "Cascading Style Sheets"}]


@pytest.mark.asyncio
async def test_grade_knowledge_check_session_topic_handling():
    from app.agents.study_planner_agent import StudyPlannerAgent

    gateway = AsyncMock()
    gateway.log_action = AsyncMock()
    agent = StudyPlannerAgent(gateway)

    student_id = uuid.uuid4()
    session_id = uuid.uuid4()
    questions = [
        {
            "id": "q1",
            "question_text": "What is mobile-first design?",
            "question_type": "MCQ",
            "options": ["Designing for mobile screens first", "Designing for desktop screens first"],
            "correct_option_index": 0,
        }
    ]

    report = await agent.grade_knowledge_check(
        student_id=student_id,
        session_id=session_id,
        questions=questions,
        student_answers={"q1": "Designing for desktop screens first"},
        session_topic="Responsive Web Design",
    )

    assert report.total_questions == 1
    assert report.score_percentage == 0.0
    assert "Responsive Web Design" in report.weak_concepts


@pytest.mark.asyncio
async def test_guided_session_language_policy_blocking():
    from app.core.exceptions import AILanguageBlockedError
    from app.db.models.academic import TeachingWorkspace

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)

    session_id = uuid.uuid4()
    student_id = uuid.uuid4()
    plan_id = uuid.uuid4()
    ws_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = plan_id
    mock_session.topic = "Kinyarwanda Grammar and Syntax"
    mock_session.lesson_sections_json = [{"section_title": "1. Inyuguti", "content": "Inyuguti mu kinyarwanda"}]
    mock_session.tutor_chat_history = []

    mock_plan = MagicMock()
    mock_plan.id = plan_id
    mock_plan.teaching_workspace_id = ws_id

    mock_ws = MagicMock()
    mock_ws.id = ws_id
    mock_ws.language = "RW"

    db_mock.get.return_value = mock_ws

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan:

        mock_get_session.return_value = mock_session
        mock_get_plan.return_value = mock_plan

        # 1. generate_session_quiz must raise AILanguageBlockedError
        with pytest.raises(AILanguageBlockedError):
            await service.generate_session_quiz(session_id, student_id)

        # 2. generate_guided_exercise must raise AILanguageBlockedError
        with pytest.raises(AILanguageBlockedError):
            await service.generate_guided_exercise(session_id, student_id, section_index=0)

        # 3. ask_guided_session_question must raise AILanguageBlockedError
        with pytest.raises(AILanguageBlockedError):
            await service.ask_guided_session_question(session_id, student_id, question="Mbisobanurire")


@pytest.mark.asyncio
async def test_guided_session_learning_unit_hard_rag_scoping():
    from app.db.models.learning_unit import LearningUnit
    from app.db.models.resource_chunk import ResourceChunk

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)

    session_id = uuid.uuid4()
    student_id = uuid.uuid4()
    plan_id = uuid.uuid4()
    lu_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    mat_id = uuid.uuid4()

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = plan_id
    mock_session.learning_unit_id = lu_id
    mock_session.topic = "Relational Decomposition"
    mock_session.lesson_sections_json = [{"section_title": "Lossless Join", "content": "R1 and R2 must join lossless."}]
    mock_session.tutor_chat_history = []

    mock_plan = MagicMock()
    mock_plan.id = plan_id
    mock_plan.teaching_workspace_id = uuid.uuid4()

    mock_lu = MagicMock(spec=LearningUnit)
    mock_lu.id = lu_id
    mock_lu.title = "Learning Unit 3: Relational Decomposition"
    mock_lu.source_material_id = mat_id
    mock_lu.source_chunk_ids = [str(chunk_id)]

    mock_chunk = MagicMock(spec=ResourceChunk)
    mock_chunk.id = chunk_id
    mock_chunk.resource_id = uuid.uuid4()
    mock_chunk.chunk_index = 0
    mock_chunk.content = "Lossless-join decomposition ensures that no spurious tuples are generated when relations are joined."
    mock_chunk.metadata_json = {"page": 12}

    # db_mock.get returns mock_lu when called with LearningUnit
    def mock_db_get(model_cls, pk):
        if model_cls == LearningUnit and pk == lu_id:
            return mock_lu
        return None

    db_mock.get.side_effect = mock_db_get

    mock_chunks_exec = MagicMock()
    mock_chunks_exec.scalars.return_value.all.return_value = [mock_chunk]
    db_mock.execute.return_value = mock_chunks_exec

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan, \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_guided_exercise", new_callable=AsyncMock) as mock_gen_ex, \
         patch("app.agents.student_support_agent.StudySupportAgent.answer", new_callable=AsyncMock) as mock_tutor_ans:

        mock_get_session.return_value = mock_session
        mock_get_plan.return_value = mock_plan

        from app.agents.study_planner_agent import GuidedExerciseOutput
        mock_gen_ex.return_value = GuidedExerciseOutput(
            question_text="What does lossless join guarantee?",
            options=["No spurious tuples", "No NULLs", "No duplicates", "Primary keys only"],
            correct_option_index=0,
            explanation="It prevents spurious tuples upon natural join.",
        )

        from app.agents.student_support_agent import StudySupportAgentResponse
        mock_tutor_ans.return_value = StudySupportAgentResponse(
            answer="Lossless join prevents spurious tuples.",
            citations=[],
            fallback_used=False,
        )

        # Test 1: generate_guided_exercise receives LU chunk context
        await service.generate_guided_exercise(session_id, student_id, section_index=0)
        mock_gen_ex.assert_called_once()
        assert "Lossless-join decomposition" in mock_gen_ex.call_args.kwargs["rag_context"]

        # Test 2: ask_guided_session_question passes selected_resource_id=lu.source_material_id
        await service.ask_guided_session_question(session_id, student_id, question="Explain lossless join")
        mock_tutor_ans.assert_called_once()
        assert mock_tutor_ans.call_args.kwargs["selected_resource_id"] == mat_id
        assert "Lossless-join decomposition" in mock_tutor_ans.call_args.kwargs["question"]


@pytest.mark.asyncio
async def test_generate_session_quiz_idempotency_and_force_regenerate():
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)

    session_id = uuid.uuid4()
    student_id = uuid.uuid4()

    existing_questions = [
        {
            "id": "q1",
            "question_text": "What is 2+2?",
            "options": ["3", "4", "5"],
            "correct_option_index": 1,
            "explanation": "2+2=4",
            "generated_by": "ai",
        }
    ]

    mock_session = MagicMock()
    mock_session.id = session_id
    mock_session.study_plan_id = uuid.uuid4()
    mock_session.topic = "Math"
    mock_session.lesson_sections_json = []
    mock_session.quiz_questions = existing_questions
    mock_session.learning_unit_id = None

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as mock_get_session, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as mock_get_plan, \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_knowledge_check", new_callable=AsyncMock) as mock_gen_kc:

        mock_get_session.return_value = mock_session
        mock_get_plan.return_value = None

        # Call 1: force_regenerate=False -> returns existing questions immediately, no AI call
        res = await service.generate_session_quiz(session_id, student_id, question_count=5, force_regenerate=False)
        assert res == existing_questions
        mock_gen_kc.assert_not_called()

        # Call 2: force_regenerate=True -> invokes AI agent and updates session
        from app.agents.study_planner_agent import KnowledgeCheckQuestion
        mock_gen_kc.return_value = [
            KnowledgeCheckQuestion(
                id="q2",
                question_text="What is 3+3?",
                options=["5", "6", "7"],
                correct_option_index=1,
                explanation="3+3=6",
            )
        ]

        res2 = await service.generate_session_quiz(session_id, student_id, question_count=5, force_regenerate=True)
        assert len(res2) == 1
        assert res2[0]["question_text"] == "What is 3+3?"
        # One valid question is below the minimum of 3, so generation is retried once before
        # the small batch is accepted.
        assert mock_gen_kc.call_count == 2


def _kc_question(qid: str):
    from app.agents.study_planner_agent import KnowledgeCheckQuestion

    return KnowledgeCheckQuestion(
        id=qid,
        question_text=f"Question {qid}",
        options=["a", "b", "c"],
        correct_option_index=1,
        explanation="because",
    )


def _quiz_service_and_session():
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)
    mock_session = MagicMock()
    mock_session.id = uuid.uuid4()
    mock_session.study_plan_id = uuid.uuid4()
    mock_session.topic = "Math"
    mock_session.lesson_sections_json = [
        {"section_title": f"Part {i}", "content": "x" * 3000, "key_points": [f"point {i}"]}
        for i in range(1, 7)
    ]
    mock_session.quiz_questions = []
    mock_session.learning_unit_id = None
    return service, mock_session


@pytest.mark.asyncio
async def test_generate_session_quiz_retries_when_too_few_valid_questions():
    service, mock_session = _quiz_service_and_session()
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as get_session, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as get_plan, \
         patch.object(service.repo, "update_session", new_callable=AsyncMock), \
         patch.object(service, "_get_session_rag_context", new_callable=AsyncMock) as rag, \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_knowledge_check", new_callable=AsyncMock) as gen:
        get_session.return_value = mock_session
        get_plan.return_value = None
        rag.return_value = ("", [])
        gen.side_effect = [[_kc_question("a")], [_kc_question("a"), _kc_question("b"), _kc_question("c")]]

        res = await service.generate_session_quiz(mock_session.id, uuid.uuid4(), question_count=5)

        assert len(res) == 3
        assert gen.call_count == 2


@pytest.mark.asyncio
async def test_generate_session_quiz_covers_every_lesson_section_within_budget():
    service, mock_session = _quiz_service_and_session()
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock) as get_session, \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock) as get_plan, \
         patch.object(service.repo, "update_session", new_callable=AsyncMock), \
         patch.object(service, "_get_session_rag_context", new_callable=AsyncMock) as rag, \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_knowledge_check", new_callable=AsyncMock) as gen:
        get_session.return_value = mock_session
        get_plan.return_value = None
        rag.return_value = ("", [])
        gen.return_value = [_kc_question(str(i)) for i in range(3)]

        await service.generate_session_quiz(mock_session.id, uuid.uuid4(), question_count=5)

        lesson_content = gen.await_args.kwargs["lesson_content"]
        # Long sections no longer crowd out later ones: all six are present in the budget
        # the agent actually reads.
        for i in range(1, 7):
            assert f"Section {i}: Part {i}" in lesson_content
        assert "spread across all 6 sections" in lesson_content
        assert len(lesson_content) <= 6000
        gen.assert_awaited_once()


def test_lesson_plan_output_filters_string_fragments_from_sections():
    """LessonPlanOutput._filter_sections must silently drop bare string items
    (truncation artifacts) and validate remaining dict items successfully.

    Reproduces the exact failure seen in:
      sections.3: Input should be a valid dictionary [input_value='.', input_type=str]
      sections.4: Input should be a valid dictionary [input_value='n\\n#### ...', input_type=str]
    """
    from app.agents.study_planner_agent import LessonPlanOutput

    raw = {
        "title": "JavaScript Events",
        "topic": "DOM Event Handling",
        "sections": [
            # â”€â”€ valid sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            {"section_title": "Introduction", "content": "Overview of events."},
            {"section_title": "Event Listeners", "content": "addEventListener usage."},
            {"section_title": "Event Object", "content": "The event parameter."},
            # â”€â”€ string fragments leaked by truncation repair â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            ".",
            "n\n#### The event object\nWhen a listener runs",
            "the browser passes an **...ul data (`event.target`",
            "event.type`",
            "event.key`). You can use...work for many elements.",
        ],
    }

    output = LessonPlanOutput.model_validate(raw)
    # 3 valid sections survive; the 5 string fragments are dropped
    assert len(output.sections) == 3, (
        f"Expected 3 sections after filtering, got {len(output.sections)}"
    )
    # Valid sections preserved in order
    assert output.sections[0].section_title == "Introduction"
    assert output.sections[1].section_title == "Event Listeners"
    assert output.sections[2].section_title == "Event Object"

    # A truncated section dict (no title or content) is no longer kept as an empty section:
    # the lesson is rejected so the caller can retry or fall back instead of showing a blank one.
    import pytest

    truncated = {
        **raw,
        "sections": raw["sections"][:3] + [{"key_points": ["`addEventListener` vs `onclick`"]}],
    }
    with pytest.raises(ValueError, match="title and teaching content"):
        LessonPlanOutput.model_validate(truncated)


def test_lesson_section_soft_defaults_on_missing_required_fields():
    """LessonSection must not raise a validation error when section_title or
    content are absent â€” truncated AI output produces incomplete section dicts
    that should degrade gracefully rather than failing the entire lesson.
    """
    from app.agents.study_planner_agent import LessonSection

    section = LessonSection.model_validate({
        "key_points": ["Point A", "Point B"],
        "estimated_minutes": 10,
    })
    assert section.section_title == ""
    assert section.content == ""
    assert section.key_points == ["Point A", "Point B"]





# â”€â”€ Open-answer AI grading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _open_answer_agent(complete_side_effect):
    from app.agents.study_planner_agent import StudyPlannerAgent
    from app.core.ai.gateway import AIGateway

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    gateway = AIGateway(db_mock, MagicMock())
    gateway.log_action = AsyncMock()
    gateway.complete = AsyncMock(side_effect=complete_side_effect)
    return StudyPlannerAgent(gateway), gateway


def _ai_response(content: str, finish_reason: str = "stop"):
    response = MagicMock()
    response.content = content
    response.finish_reason = finish_reason
    return response


_OPEN_QUESTIONS = [
    {"id": "q1", "question_type": "MCQ", "options": ["A", "B"], "correct_option_index": 0},
    {
        "id": "q2",
        "question_type": "OPEN_QUESTION",
        "question_text": "Why do B-trees stay balanced?",
        "correct_answer": "Every leaf is at the same depth because nodes split and merge to keep it so.",
        "explanation": "Splits and merges keep all leaves at equal depth.",
    },
]


@pytest.mark.asyncio
async def test_open_answer_is_marked_for_meaning_with_feedback():
    """A correct paraphrase with no shared keywords passes, and the student gets feedback."""
    agent, gateway = _open_answer_agent(
        [
            _ai_response(
                '{"grades": [{"question_id": "q2", "score": 70, '
                '"feedback": "You explained the balance idea.", '
                '"missing_points": ["nodes split when full"]}]}'
            )
        ]
    )
    report = await agent.grade_knowledge_check(
        student_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        questions=_OPEN_QUESTIONS,
        student_answers={"q1": 0, "q2": "The tree rebalances itself so searching stays fast."},
    )
    open_grade = next(g for g in report.question_grades if g.question_id == "q2")
    assert open_grade.is_correct is True
    assert open_grade.score == pytest.approx(0.7)
    assert "You explained the balance idea." in open_grade.feedback
    assert "nodes split when full" in open_grade.feedback
    assert report.generated_by == "ai_assisted"
    assert report.score_percentage == pytest.approx(85.0)
    gateway.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_open_answer_keyword_stuffing_gets_low_ai_score():
    agent, _ = _open_answer_agent(
        [
            _ai_response(
                '{"grades": [{"question_id": "q2", "score": 10, '
                '"feedback": "This lists words without explaining anything.", "missing_points": []}]}'
            )
        ]
    )
    report = await agent.grade_knowledge_check(
        student_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        questions=_OPEN_QUESTIONS,
        student_answers={"q2": "leaf depth nodes split merge every same balanced"},
    )
    open_grade = next(g for g in report.question_grades if g.question_id == "q2")
    assert open_grade.is_correct is False
    assert open_grade.score == pytest.approx(0.1)
    assert "B-trees" not in (open_grade.feedback or "")


@pytest.mark.asyncio
async def test_open_answer_falls_back_to_keywords_when_ai_fails():
    agent, _ = _open_answer_agent(RuntimeError("provider down"))
    report = await agent.grade_knowledge_check(
        student_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        questions=_OPEN_QUESTIONS,
        student_answers={
            "q1": 0,
            "q2": "Every leaf is at the same depth because nodes split and merge.",
        },
    )
    open_grade = next(g for g in report.question_grades if g.question_id == "q2")
    assert open_grade.is_correct is True  # keyword overlap still passes
    assert "keyword match" in open_grade.feedback
    assert report.generated_by == "deterministic"


@pytest.mark.asyncio
async def test_open_answer_ai_grading_can_be_disabled_and_skips_blank_answers():
    agent, gateway = _open_answer_agent([])
    report = await agent.grade_knowledge_check(
        student_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        questions=_OPEN_QUESTIONS,
        student_answers={"q1": 0, "q2": "   "},
        use_ai_grading=False,
    )
    gateway.complete.assert_not_awaited()
    open_grade = next(g for g in report.question_grades if g.question_id == "q2")
    assert open_grade.is_correct is False
    assert open_grade.feedback is None  # blank answers get no marker note


@pytest.mark.asyncio
async def test_open_answer_ignores_marks_for_unknown_questions_and_clamps_scores():
    agent, _ = _open_answer_agent(
        [
            _ai_response(
                '{"grades": [{"question_id": "other", "score": 100, "feedback": "x"}, '
                '{"question_id": "q2", "score": 250, "feedback": "Great."}]}'
            )
        ]
    )
    report = await agent.grade_knowledge_check(
        student_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        questions=_OPEN_QUESTIONS,
        student_answers={"q2": "Nodes split and merge so every leaf is at the same depth."},
    )
    open_grade = next(g for g in report.question_grades if g.question_id == "q2")
    assert open_grade.score == pytest.approx(1.0)


# â”€â”€ Lesson generation reliability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _lesson_json(section_count: int) -> str:
    import json

    return json.dumps(
        {
            "title": "Indexing",
            "topic": "B-Trees",
            "sections": [
                {"section_title": f"Section {i + 1}", "content": f"Teaching content {i + 1}."}
                for i in range(section_count)
            ],
        }
    )


def _lesson_session(duration: int = 60):
    session = MagicMock()
    session.id = uuid.uuid4()
    session.student_id = uuid.uuid4()
    session.topic = "B-Trees"
    session.title = "Indexing"
    session.duration_minutes = duration
    return session


@pytest.mark.asyncio
async def test_generate_lesson_retries_compactly_when_output_is_truncated():
    agent, gateway = _open_answer_agent(
        [
            _ai_response(_lesson_json(2), finish_reason="length"),
            _ai_response(_lesson_json(5), finish_reason="stop"),
        ]
    )
    lesson = await agent.generate_lesson(session=_lesson_session(60), rag_context="material")
    assert len(lesson.sections) == 5
    assert gateway.complete.await_count == 2
    retry_request = gateway.complete.await_args_list[1].args[0]
    assert "cut off" in retry_request.messages[-1].content


@pytest.mark.asyncio
async def test_generate_lesson_does_not_retry_when_complete():
    agent, gateway = _open_answer_agent([_ai_response(_lesson_json(6))])
    lesson = await agent.generate_lesson(session=_lesson_session(60))
    assert len(lesson.sections) == 6
    gateway.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_lesson_keeps_best_attempt_when_both_are_a_little_short():
    agent, gateway = _open_answer_agent(
        [_ai_response(_lesson_json(3)), _ai_response(_lesson_json(3))]
    )
    lesson = await agent.generate_lesson(session=_lesson_session(60))
    assert len(lesson.sections) == 3  # acceptable: one below the 4 wanted
    assert gateway.complete.await_count == 2


@pytest.mark.asyncio
async def test_generate_lesson_rejects_a_lesson_too_short_to_teach_from():
    agent, _ = _open_answer_agent(
        [_ai_response(_lesson_json(1), "length"), _ai_response(_lesson_json(1), "length")]
    )
    with pytest.raises(ValidationError):
        await agent.generate_lesson(session=_lesson_session(60))


@pytest.mark.asyncio
async def test_generate_lesson_recovers_when_first_output_is_unparseable():
    agent, gateway = _open_answer_agent(
        [_ai_response("not json at all"), _ai_response(_lesson_json(5))]
    )
    lesson = await agent.generate_lesson(session=_lesson_session(60))
    assert len(lesson.sections) == 5
    assert gateway.complete.await_count == 2


# â”€â”€ Written practice, and feedback backfill for older reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_submit_exercise_request_requires_exactly_one_answer():
    from pydantic import ValidationError as PydanticValidationError
    from app.schemas.study_planner import SubmitGuidedExerciseRequest

    assert SubmitGuidedExerciseRequest(exercise_id="e1", selected_option_index=2).answer_text is None
    assert SubmitGuidedExerciseRequest(exercise_id="e1", answer_text="my answer").selected_option_index is None
    for bad in (
        {"exercise_id": "e1"},
        {"exercise_id": "e1", "answer_text": "   "},
        {"exercise_id": "e1", "selected_option_index": 1, "answer_text": "both"},
    ):
        with pytest.raises(PydanticValidationError):
            SubmitGuidedExerciseRequest(**bad)


def test_written_exercise_output_requires_a_reference_answer():
    from app.agents.study_planner_agent import GuidedWrittenExerciseOutput

    ok = GuidedWrittenExerciseOutput(
        question_text="Explain why 1NF needs atomic values.",
        model_answer="Atomic values let every cell be queried and updated on its own.",
    )
    assert ok.generated_by == "ai"
    with pytest.raises(ValueError):
        GuidedWrittenExerciseOutput(question_text="Explain?", model_answer="short")


def _written_service(exercises=None, attempts=None):
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)
    session = MagicMock()
    session.id = uuid.uuid4()
    session.study_plan_id = uuid.uuid4()
    session.topic = "Normalization"
    session.lesson_sections_json = [{"section_title": "1NF", "content": "Atomic values."}]
    session.guided_practice_exercises_json = list(exercises or [])
    session.guided_practice_attempts_json = list(attempts or [])
    return service, session


_WRITTEN_EXERCISE = {
    "id": "e1",
    "section_index": 0,
    "section_title": "1NF",
    "question_text": "Explain why 1NF needs atomic values.",
    "question_type": "SHORT_ANSWER",
    "options": [],
    "correct_option_index": None,
    "explanation": "Atomic values keep every cell queryable.",
    "model_answer": "Atomic values let each cell be queried and updated independently.",
}


@pytest.mark.asyncio
async def test_generate_written_exercise_keeps_reference_answer_server_side():
    from app.agents.study_planner_agent import GuidedWrittenExerciseOutput

    service, session = _written_service()
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock, return_value=session), \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock, return_value=None), \
         patch.object(service.repo, "update_session", new_callable=AsyncMock), \
         patch.object(service, "_get_session_rag_context", new_callable=AsyncMock, return_value=("", [])), \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_guided_written_exercise", new_callable=AsyncMock) as gen:
        gen.return_value = GuidedWrittenExerciseOutput(
            question_text="Explain why 1NF needs atomic values.",
            model_answer="Atomic values let each cell be queried and updated independently.",
            explanation="Because of querying.",
        )

        res = await service.generate_guided_exercise(
            session.id, uuid.uuid4(), section_index=0, exercise_type="SHORT_ANSWER"
        )

        assert res["question_type"] == "SHORT_ANSWER"
        assert res["options"] == []
        assert "model_answer" not in res  # not sent to the browser with the question
        stored = session.guided_practice_exercises_json[-1]
        assert stored["model_answer"].startswith("Atomic values")

        # and it is also stripped from every session payload until the student answers
        payload = service._format_session(session)
        assert all("model_answer" not in ex for ex in payload.guided_practice_exercises_json)


@pytest.mark.asyncio
async def test_written_practice_answer_is_marked_by_ai_with_feedback():
    from app.agents.study_planner_agent import OpenAnswerGrade

    service, session = _written_service(exercises=[dict(_WRITTEN_EXERCISE)])
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock, return_value=session), \
         patch.object(service.repo, "update_session", new_callable=AsyncMock), \
         patch.object(service, "_ai_marking_allowed", new_callable=AsyncMock, return_value=True), \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.mark_written_answers", new_callable=AsyncMock) as mark:
        mark.return_value = {
            "e1": OpenAnswerGrade(
                question_id="e1", score=80, feedback="Good explanation.", missing_points=["independent updates"]
            )
        }

        res = await service.submit_guided_exercise_attempt(
            session.id, uuid.uuid4(), "e1", None, answer_text="Each cell holds one value so it can be queried."
        )

    assert res["is_correct"] is True
    assert res["score"] == pytest.approx(0.8)
    assert res["graded_by"] == "ai"
    assert "Missing: independent updates." in res["feedback"]
    assert res["model_answer"].startswith("Atomic values")  # revealed only now
    assert session.guided_practice_attempts_json[-1]["answer_text"].startswith("Each cell")


@pytest.mark.asyncio
async def test_written_practice_answer_falls_back_to_keywords_when_ai_not_allowed():
    service, session = _written_service(exercises=[dict(_WRITTEN_EXERCISE)])
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock, return_value=session), \
         patch.object(service.repo, "update_session", new_callable=AsyncMock), \
         patch.object(service, "_ai_marking_allowed", new_callable=AsyncMock, return_value=False), \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.mark_written_answers", new_callable=AsyncMock) as mark:
        res = await service.submit_guided_exercise_attempt(
            session.id,
            uuid.uuid4(),
            "e1",
            None,
            answer_text="Atomic values let each cell be queried and updated independently.",
        )

    mark.assert_not_awaited()
    assert res["graded_by"] == "keyword"
    assert res["is_correct"] is True
    assert "keyword match" in res["feedback"]


@pytest.mark.asyncio
async def test_exercise_submission_validates_the_answer_for_its_type():
    mcq = {
        "id": "m1", "section_index": 0, "question_text": "Q?", "question_type": "MCQ",
        "options": ["a", "b", "c", "d"], "correct_option_index": 1, "explanation": "e",
    }
    service, session = _written_service(exercises=[dict(_WRITTEN_EXERCISE), mcq])
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock, return_value=session), \
         patch.object(service.repo, "update_session", new_callable=AsyncMock):
        with pytest.raises(ValidationError, match="Write an answer"):
            await service.submit_guided_exercise_attempt(session.id, uuid.uuid4(), "e1", None, answer_text="  ")
        with pytest.raises(ValidationError, match="Choose one of the options"):
            await service.submit_guided_exercise_attempt(session.id, uuid.uuid4(), "m1", None, answer_text="text")
        ok = await service.submit_guided_exercise_attempt(session.id, uuid.uuid4(), "m1", 1)
        assert ok["is_correct"] is True


def _feedback_service(grades, answers_graded_by=None):
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)
    session = MagicMock()
    session.id = uuid.uuid4()
    session.study_plan_id = uuid.uuid4()
    session.topic = "Normalization"
    session.quiz_questions = [
        {"id": "q1", "question_type": "MCQ", "question_text": "MCQ?", "concept_tag": "1NF"},
        {
            "id": "q2",
            "question_type": "OPEN_QUESTION",
            "question_text": "Why atomic values?",
            "correct_answer": "Atomic values let each cell be queried and updated independently.",
            "concept_tag": "Atomicity",
        },
    ]
    session.knowledge_check_score = 50.0
    session.knowledge_check_report = {
        "total_questions": 2,
        "score_percentage": 50.0,
        "question_grades": grades,
        "mastered_concepts": ["1NF"],
        "weak_concepts": ["Atomicity"],
        "estimated_confidence_level": 50,
        "recommendations": ["Review weak concepts."],
        "recommended_materials": [{"resource_id": "r1", "title": "Notes"}],
    }
    plan = MagicMock()
    plan.course_id = None
    profile = MagicMock()
    profile.id = uuid.uuid4()
    profile.knowledge_check_count = 2
    profile.average_knowledge_check_score = 60.0
    profile.topic_confidence = {}
    profile.weak_topics = ["Atomicity", "Joins"]
    return service, session, plan, profile


_OLD_GRADES = [
    {"question_id": "q1", "is_correct": True, "score": 1.0, "student_answer": "A", "correct_answer": "A", "explanation": "x"},
    {"question_id": "q2", "is_correct": False, "score": 0.0, "student_answer": "Each cell holds one value.", "correct_answer": "ref", "explanation": "x"},
]


@pytest.mark.asyncio
async def test_old_report_gets_ai_feedback_and_profile_moves_by_the_difference():
    from app.agents.study_planner_agent import OpenAnswerGrade

    service, session, plan, profile = _feedback_service([dict(g) for g in _OLD_GRADES])
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock, return_value=session), \
         patch.object(service.repo, "update_session", new_callable=AsyncMock), \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock, return_value=plan), \
         patch.object(service.repo, "get_or_create_learning_profile", new_callable=AsyncMock, return_value=profile), \
         patch.object(service.repo, "update_learning_profile", new_callable=AsyncMock) as update_profile, \
         patch.object(service, "_ai_marking_allowed", new_callable=AsyncMock, return_value=True), \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.mark_written_answers", new_callable=AsyncMock) as mark:
        mark.return_value = {
            "q2": OpenAnswerGrade(question_id="q2", score=90, feedback="Well explained.", missing_points=[])
        }

        report = await service.add_written_answer_feedback(session.id, uuid.uuid4())

    q2 = next(g for g in report["question_grades"] if g["question_id"] == "q2")
    assert q2["graded_by"] == "ai" and q2["is_correct"] is True
    assert q2["feedback"] == "Well explained."
    assert report["score_percentage"] == pytest.approx(95.0)
    assert report["weak_concepts"] == []
    assert report["recommended_materials"] == [{"resource_id": "r1", "title": "Notes"}]  # kept
    assert session.knowledge_check_score == pytest.approx(95.0)
    kwargs = update_profile.await_args.kwargs
    # avg 60 over 2 checks: (60*2 - 50 + 95) / 2 = 82.5 â€” this session is not counted twice
    assert kwargs["average_knowledge_check_score"] == pytest.approx(82.5)
    assert "Atomicity" not in kwargs["weak_topics"] and "Joins" in kwargs["weak_topics"]
    assert "knowledge_check_count" not in kwargs


@pytest.mark.asyncio
async def test_feedback_backfill_does_nothing_when_already_ai_marked():
    grades = [dict(g) for g in _OLD_GRADES]
    grades[1]["graded_by"] = "ai"
    service, session, _plan, _profile = _feedback_service(grades)
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock, return_value=session), \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.mark_written_answers", new_callable=AsyncMock) as mark:
        report = await service.add_written_answer_feedback(session.id, uuid.uuid4())

    mark.assert_not_awaited()
    assert report is session.knowledge_check_report


@pytest.mark.asyncio
async def test_feedback_backfill_reports_when_the_ai_is_unavailable():
    from app.core.exceptions import AITemporarilyUnavailableError

    service, session, _plan, _profile = _feedback_service([dict(g) for g in _OLD_GRADES])
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock, return_value=session), \
         patch.object(service, "_ai_marking_allowed", new_callable=AsyncMock, return_value=True), \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.mark_written_answers", new_callable=AsyncMock, side_effect=RuntimeError("down")):
        with pytest.raises(AITemporarilyUnavailableError):
            await service.add_written_answer_feedback(session.id, uuid.uuid4())
    assert session.knowledge_check_report["score_percentage"] == 50.0  # untouched


# â”€â”€ Faded example shape, tutor history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_faded_example_is_kept_only_when_the_student_can_act_on_it():
    from app.agents.study_planner_agent import LessonSection

    good = LessonSection.model_validate({
        "section_title": "Loops",
        "content": "Loops repeat work.",
        "faded_example": {
            "problem": "Sum the numbers 1 to 4.",
            "solution_steps": ["total = 0", "for n in 1..4: total += n"],
            "completion_prompt": "What does total equal at the end?",
            "answer": "10",
            "hint": "Add them in order.",
            "ignored_extra": "dropped",
        },
    })
    assert good.faded_example == {
        "problem": "Sum the numbers 1 to 4.",
        "solution_steps": ["total = 0", "for n in 1..4: total += n"],
        "completion_prompt": "What does total equal at the end?",
        "answer": "10",
        "hint": "Add them in order.",
    }

    # Older/looser shapes: a lone "prompt" key is accepted, a missing answer is allowed.
    loose = LessonSection.model_validate({
        "section_title": "t", "content": "c",
        "faded_example": {"problem": "P", "prompt": "Finish it", "solution_steps": "only one step"},
    })
    assert loose.faded_example["completion_prompt"] == "Finish it"
    assert loose.faded_example["answer"] == ""
    assert loose.faded_example["solution_steps"] == ["only one step"]
    assert "hint" not in loose.faded_example

    for unusable in (None, "a string", {}, {"problem": "P"}, {"completion_prompt": "C"}, {"problem": " ", "completion_prompt": "C"}):
        section = LessonSection.model_validate({"section_title": "t", "content": "c", "faded_example": unusable})
        assert section.faded_example is None, unusable


@pytest.mark.asyncio
async def test_tutor_saves_the_fallback_flag_and_sends_only_recent_history():
    from app.services.study_planner.guided import MAX_TUTOR_HISTORY_MESSAGES

    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)

    old_history = []
    for i in range(30):
        old_history.append({"role": "user", "content": f"question {i}"})
        old_history.append({"role": "assistant", "content": f"answer {i}"})
    mock_session = MagicMock()
    mock_session.id = uuid.uuid4()
    mock_session.study_plan_id = None
    mock_session.topic = "Normalization"
    mock_session.learning_unit_id = None
    mock_session.tutor_chat_history = list(old_history)

    output = MagicMock()
    output.answer = "General answer."
    output.citations = []
    output.fallback_used = True

    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock, return_value=mock_session), \
         patch.object(service.repo, "update_session", new_callable=AsyncMock), \
         patch.object(service, "_get_session_rag_context", new_callable=AsyncMock, return_value=("", [])), \
         patch("app.agents.student_support_agent.StudySupportAgent.answer", new_callable=AsyncMock, return_value=output) as answer:
        res = await service.ask_guided_session_question(mock_session.id, uuid.uuid4(), "What is 2NF?", "ctx")

    sent_history = answer.await_args.kwargs["conversation_history"]
    assert len(sent_history) == MAX_TUTOR_HISTORY_MESSAGES
    assert sent_history[-1] == {"role": "assistant", "content": "answer 29"}  # the newest turns
    # The full conversation is still stored and returned.
    assert len(res["history"]) == len(old_history) + 2
    assert res["history"][-1]["fallback_used"] is True
    assert res["history"][-1]["content"] == "General answer."


# â”€â”€ Lesson generation: provider rate limits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

_GROQ_429 = (
    "All configured AI providers failed. Details: groq: Request exceeds the provider token limit "
    "(Groq rate limit exceeded (429): Rate limit reached ... on tokens per minute (TPM): Limit 8000, "
    "Used 6064, Requested 4519. Please try again in {wait}. Need more tokens?)"
)


@pytest.mark.parametrize(
    "message, expected",
    [
        (_GROQ_429.format(wait="19.3725s."), 19.3725),
        (_GROQ_429.format(wait="850ms."), 0.85),
        (_GROQ_429.format(wait="2m3.5s."), 123.5),
        (_GROQ_429.format(wait="1m."), 60.0),
        ("Rate limit hit (429). Please try again in 7s", 7.0),
        ("Connection refused to provider", None),  # not a rate limit: never waited on
        ("Server error 503. Please try again in 5s", None),  # "try again" without a rate limit
        ("Groq rate limit exceeded (429) with no hint about timing", None),
    ],
)
def test_provider_retry_after_seconds_parses_the_wait(message, expected):
    from app.agents.study_planner_agent import provider_retry_after_seconds

    result = provider_retry_after_seconds(message)
    if expected is None:
        assert result is None
    else:
        assert result == pytest.approx(expected)


@pytest.mark.asyncio
async def test_generate_lesson_waits_out_a_rate_limit_instead_of_falling_back():
    from app.core.exceptions import ServiceUnavailableError

    agent, gateway = _open_answer_agent(
        [
            _ai_response(_lesson_json(2), finish_reason="length"),  # cut off
            ServiceUnavailableError(_GROQ_429.format(wait="8.3s.")),  # retry refused, briefly
            _ai_response(_lesson_json(5)),  # after waiting, the compact retry works
        ]
    )
    with patch("app.agents.study_planner_agent.asyncio.sleep", new_callable=AsyncMock) as sleep:
        lesson = await agent.generate_lesson(session=_lesson_session(60))

    assert len(lesson.sections) == 5
    assert gateway.complete.await_count == 3
    sleep.assert_awaited_once()
    assert sleep.await_args.args[0] == pytest.approx(9.3)  # the provider's wait plus a second


@pytest.mark.asyncio
async def test_generate_lesson_hands_a_medium_wait_back_instead_of_freezing_the_request():
    from app.core.exceptions import ServiceUnavailableError

    agent, gateway = _open_answer_agent([ServiceUnavailableError(_GROQ_429.format(wait="19.3s."))])
    with patch("app.agents.study_planner_agent.asyncio.sleep", new_callable=AsyncMock) as sleep:
        with pytest.raises(ServiceUnavailableError, match="19.3s"):
            await agent.generate_lesson(session=_lesson_session(60))
    sleep.assert_not_awaited()
    gateway.complete.assert_awaited_once()


def _start_session_service(lesson_status="NOT_GENERATED", plan=None):
    db_mock = AsyncMock()
    db_mock.add = MagicMock()
    service = StudyPlannerService(db_mock)
    session = MagicMock()
    session.id = uuid.uuid4()
    session.study_plan_id = uuid.uuid4()
    session.title = "Pointers"
    session.topic = "C Pointers"
    session.session_type = "STUDY"
    session.status = "SCHEDULED"
    session.duration_minutes = 30
    session.lesson_status = lesson_status
    session.lesson_sections_json = []
    session.lesson_plan_json = plan
    session.scheduled_start = datetime.now(UTC)
    session.scheduled_end = datetime.now(UTC) + timedelta(minutes=30)
    return service, session


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error_text, expected_hint",
    [
        (_GROQ_429.format(wait="19.3s."), 21),  # 19 + 2 seconds of margin
        (_GROQ_429.format(wait="2m3.5s."), None),  # too long to promise an automatic retry
        ("All configured AI providers failed.", None),  # a plain outage has no "try again in"
    ],
)
async def test_fallback_lesson_carries_a_retry_hint_only_for_short_rate_limits(error_text, expected_hint):
    from app.core.exceptions import ServiceUnavailableError

    service, session = _start_session_service()
    plan = MagicMock(course_id=None, teaching_workspace_id=None)
    with patch.object(service.repo, "get_session_by_id", new_callable=AsyncMock, return_value=session), \
         patch.object(service.repo, "get_plan_by_id", new_callable=AsyncMock, return_value=plan), \
         patch.object(service.repo, "get_or_create_learning_profile", new_callable=AsyncMock, return_value=MagicMock(weak_topics=[], topic_confidence={})), \
         patch.object(service.repo, "update_session", new_callable=AsyncMock), \
         patch.object(service, "_get_session_rag_context", new_callable=AsyncMock, return_value=("context", [])), \
         patch("app.services.study_planner.guided.assert_student_ai_allowed", new_callable=AsyncMock), \
         patch("app.agents.study_planner_agent.StudyPlannerAgent.generate_lesson", new_callable=AsyncMock, side_effect=ServiceUnavailableError(error_text)):
        res = await service.start_guided_session(session.id, uuid.uuid4())

    assert res.lesson_plan_json["generated_by"] == "fallback"
    assert res.lesson_plan_json.get("ai_retry_after_seconds") == expected_hint
    assert len(res.lesson_sections_json) >= 1


@pytest.mark.asyncio
async def test_generate_lesson_does_not_wait_for_a_long_rate_limit():
    from app.core.exceptions import ServiceUnavailableError

    agent, gateway = _open_answer_agent([ServiceUnavailableError(_GROQ_429.format(wait="2m3.5s."))])
    with patch("app.agents.study_planner_agent.asyncio.sleep", new_callable=AsyncMock) as sleep:
        with pytest.raises(ServiceUnavailableError):
            await agent.generate_lesson(session=_lesson_session(60))

    sleep.assert_not_awaited()
    gateway.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_lesson_does_not_retry_after_a_plain_provider_outage():
    from app.core.exceptions import ServiceUnavailableError

    agent, gateway = _open_answer_agent([ServiceUnavailableError("All configured AI providers failed.")])
    with pytest.raises(ServiceUnavailableError):
        await agent.generate_lesson(session=_lesson_session(60))
    gateway.complete.assert_awaited_once()  # a second identical call would not help


@pytest.mark.asyncio
async def test_generate_lesson_keeps_a_good_first_lesson_when_the_retry_provider_fails():
    from app.core.exceptions import ServiceUnavailableError

    agent, gateway = _open_answer_agent(
        [
            _ai_response(_lesson_json(3), finish_reason="length"),  # usable (3 >= 3) but cut off
            ServiceUnavailableError("All configured AI providers failed."),
        ]
    )
    lesson = await agent.generate_lesson(session=_lesson_session(60))
    assert len(lesson.sections) == 3
    assert gateway.complete.await_count == 2


def test_lesson_prompt_asks_for_a_compact_lesson_without_the_optional_extras():
    from app.core.ai.prompt_registry import get_prompt

    prompt = get_prompt("study_lesson", "v1")
    for removed in ("suggested_video_search", "technique_justification", '"activities"', '"charts"'):
        assert removed not in prompt, removed
    assert "COMPACT JSON" in prompt
    for kept in ('"micro_check"', '"self_explanation_prompt"', '"faded_example"', '"glossary"', "diagram_prompt"):
        assert kept in prompt, kept


# â”€â”€ Shared JSON parser: fences inside values, double-escaped quotes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class _ParseProbe(__import__("pydantic").BaseModel):
    title: str
    sections: list[dict]


def _probe_agent():
    from app.agents.base import BaseAgent

    return BaseAgent.__new__(BaseAgent)


def test_parser_keeps_a_json_response_whose_string_holds_a_code_fence():
    """A lesson's code example is a ``` block inside a JSON string. That is not the response's own fence."""
    payload = json.dumps(
        {
            "title": "C",
            "sections": [{"examples": [{"code": "```c\n#include <stdio.h>\nint main(void) { return 0; }\n```"}]}],
        }
    )
    out = _probe_agent()._parse_json_output(payload, _ParseProbe)
    assert out.title == "C"
    assert out.sections[0]["examples"][0]["code"].startswith("```c")


def test_parser_still_handles_every_way_the_json_can_be_wrapped():
    agent = _probe_agent()
    body = '{"title": "T", "sections": []}'
    for wrapped in (
        body,
        f"```json\n{body}\n```",
        f"```\n{body}\n```",
        f"Here is the lesson:\n```json\n{body}\n```\nHope that helps!",
        f"Sure! {body} Let me know.",
    ):
        assert agent._parse_json_output(wrapped, _ParseProbe).title == "T", wrapped


def test_parser_repairs_double_escaped_quotes_inside_a_diagram_string():
    """Seen in a real response: the model escaped the quotes of a Mermaid label twice."""
    broken = (
        '{"title": "T", "sections": [{"diagram_prompt": "flowchart TD\\n  A[\\"Start\\"] --> D[\\\\"End\\\\"]", '
        '"section_title": "4. Choosing"}]}'
    )
    out = _probe_agent()._parse_json_output(broken, _ParseProbe)
    assert out.sections[0]["section_title"] == "4. Choosing"


def test_parser_recovers_a_response_cut_off_mid_string_even_with_a_fence_inside():
    cut = (
        '{"title": "T", "sections": [{"examples": [{"code": "```c\\nint x;\\n```"}], "section_title": "One"}, '
        '{"section_title": "Two", "content": "Trees are'
    )
    out = _probe_agent()._parse_json_output(cut, _ParseProbe)
    assert [s["section_title"] for s in out.sections][0] == "One"


def test_parser_rejects_a_response_with_no_json_at_all():
    from app.core.exceptions import ValidationError as AppValidationError

    for junk in ("I cannot help with that.", "", "```c\nint x;\n```", '"just a string"'):
        with pytest.raises(AppValidationError):
            _probe_agent()._parse_json_output(junk, _ParseProbe)



# ── Knowledge check generation: cut-off output, spares, repairs ──────────────

def _kc_item(i, **extra):
    base = {
        "id": f"q{i}", "concept_tag": f"concept {i}", "question_text": f"What is idea {i} of loops?",
        "question_type": "MCQ", "options": ["a", "b", "c", "d"], "correct_option_index": 1,
        "correct_answer": "b", "explanation": "because", "premises": [], "matches": [], "blank_answers": {},
    }
    base.update(extra)
    return base


async def _generate_kc(content, finish_reason="stop", question_count=5):
    agent, gateway = _open_answer_agent([_ai_response(content, finish_reason)])
    session = _lesson_session(30)
    session.topic = "Loops"
    questions = await agent.generate_knowledge_check(session=session, lesson_content="lesson", question_count=question_count)
    return questions, gateway


@pytest.mark.asyncio
async def test_knowledge_check_asks_for_spares_and_returns_exactly_the_count_wanted():
    questions, gateway = await _generate_kc(json.dumps([_kc_item(i) for i in range(1, 8)]))
    assert len(questions) == 5
    assert [q.id for q in questions] == ["q1", "q2", "q3", "q4", "q5"]
    request = gateway.complete.await_args.args[0]
    assert "7 knowledge check questions" in request.messages[-1].content  # 5 + 2 spares
    assert request.max_tokens >= 3000


@pytest.mark.asyncio
async def test_knowledge_check_keeps_the_complete_questions_when_the_last_is_cut_off():
    full = json.dumps([_kc_item(i) for i in range(1, 6)])
    cut = full[: full.rfind('{"id": "q5"')] + '{"id": "q5", "question_text": "What is idea 5 of lo'
    questions, _ = await _generate_kc(cut, finish_reason="length")
    assert [q.id for q in questions] == ["q1", "q2", "q3", "q4"]


@pytest.mark.asyncio
async def test_knowledge_check_one_malformed_question_does_not_lose_the_others():
    bad = _kc_item(3, question_type="FILL_BLANKS", question_text="No blank marker here", options=[])
    questions, _ = await _generate_kc(json.dumps([_kc_item(1), _kc_item(2), bad, _kc_item(4), _kc_item(5), _kc_item(6)]))
    assert [q.id for q in questions] == ["q1", "q2", "q4", "q5", "q6"]


@pytest.mark.asyncio
async def test_knowledge_check_accepts_a_wrapped_object_and_fenced_output():
    wrapped = "```json\n" + json.dumps({"questions": [_kc_item(1), _kc_item(2)]}) + "\n```"
    questions, _ = await _generate_kc(wrapped, question_count=2)
    assert len(questions) == 2


@pytest.mark.asyncio
async def test_knowledge_check_unusable_output_is_reported_not_swallowed():
    from app.core.exceptions import ValidationError as AppValidationError

    agent, _ = _open_answer_agent([_ai_response("Sorry, I cannot do that.")])
    with pytest.raises(AppValidationError):
        await agent.generate_knowledge_check(session=_lesson_session(30), lesson_content="x", question_count=5)


def test_knowledge_check_repairs_only_what_is_unambiguous():
    from app.agents.study_planner_agent import repair_knowledge_check_item

    # fill-in-the-blanks: one word-bank entry per blank -> those are the answers, in order
    blanks = repair_knowledge_check_item(
        {"question_type": "FILL_IN_BLANK", "question_text": "A ___ is LIFO and a ___ is FIFO.", "options": ["stack", "queue"]}
    )
    assert blanks["blank_answers"] == {"0": "stack", "1": "queue"}

    # ...but a bank with distractors is ambiguous, so nothing is guessed
    ambiguous = repair_knowledge_check_item(
        {"question_type": "FILL_BLANKS", "question_text": "A ___ is LIFO.", "options": ["stack", "queue", "tree"]}
    )
    assert not ambiguous.get("blank_answers")

    # existing answers are never overwritten
    kept = repair_knowledge_check_item(
        {"question_type": "FILL_BLANKS", "question_text": "A ___ is LIFO.", "options": ["x"], "blank_answers": {"0": "stack"}}
    )
    assert kept["blank_answers"] == {"0": "stack"}

    # written questions: the explanation stands in for a missing reference answer
    written = repair_knowledge_check_item({"question_type": "OPEN_QUESTION", "explanation": "Mentions LIFO and push/pop."})
    assert written["correct_answer"] == "Mentions LIFO and push/pop."
    own = repair_knowledge_check_item({"question_type": "SHORT_ANSWER", "correct_answer": "LIFO", "explanation": "e"})
    assert own["correct_answer"] == "LIFO"
    none = repair_knowledge_check_item({"question_type": "OPEN_QUESTION"})
    assert not none.get("correct_answer")


@pytest.mark.asyncio
async def test_knowledge_check_topic_prefix_only_for_short_topics():
    short, _ = await _generate_kc(json.dumps([_kc_item(1, question_text="Explain it.")]), question_count=1)
    assert short[0].question_text.startswith("Regarding Loops:")

    agent, _ = _open_answer_agent([_ai_response(json.dumps([_kc_item(1, question_text="Explain it.")]))])
    session = _lesson_session(30)
    session.topic = "Spaced Revision: time_blocking_pomodoro, cat_section_focus"
    long_topic = await agent.generate_knowledge_check(session=session, lesson_content="x", question_count=1)
    assert long_topic[0].question_text == "Explain it."
