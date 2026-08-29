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
        mock_gen_kc.assert_called_once()


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
            # ── valid sections ──────────────────────────────────────────────
            {"section_title": "Introduction", "content": "Overview of events."},
            {"section_title": "Event Listeners", "content": "addEventListener usage."},
            {"section_title": "Event Object", "content": "The event parameter."},
            # ── string fragments leaked by truncation repair ─────────────────
            ".",
            "n\n#### The event object\nWhen a listener runs",
            "the browser passes an **...ul data (`event.target`",
            "event.type`",
            "event.key`). You can use...work for many elements.",
            # ── truncated section (missing section_title and content) ────────
            {"key_points": ["`addEventListener` vs `onclick`"]},
        ],
    }

    output = LessonPlanOutput.model_validate(raw)
    # 3 valid + 1 truncated-but-dict = 4 sections survive; 5 string fragments dropped
    assert len(output.sections) == 4, (
        f"Expected 4 sections after filtering, got {len(output.sections)}"
    )
    # Valid sections preserved in order
    assert output.sections[0].section_title == "Introduction"
    assert output.sections[1].section_title == "Event Listeners"
    assert output.sections[2].section_title == "Event Object"
    # Truncated section (missing fields) gets safe empty-string defaults
    assert output.sections[3].section_title == ""
    assert output.sections[3].content == ""
    assert output.sections[3].key_points == ["`addEventListener` vs `onclick`"]


def test_lesson_section_soft_defaults_on_missing_required_fields():
    """LessonSection must not raise a validation error when section_title or
    content are absent — truncated AI output produces incomplete section dicts
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



