import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.services.study_planner_service import StudyPlannerService


def _service():
    return StudyPlannerService(AsyncMock())


def _heavy_session():
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        study_plan_id=uuid.uuid4(),
        learning_unit_id=None,
        title="Study B-Trees",
        topic="B-Trees",
        session_type="STUDY",
        scheduled_start=now,
        scheduled_end=now + timedelta(hours=1),
        duration_minutes=60,
        status="COMPLETED",
        completed_at=now,
        understanding_level="YES",
        difficulty_rating="Medium",
        confidence_rating=4,
        feedback_notes="ok",
        checklist_items=[{"id": "1", "text": "read", "completed": True}],
        quiz_questions=[{"id": "q1", "question_text": "?", "options": ["a"], "explanation": "e"}],
        recommended_resource_ids=["r1"],
        source_material_ids=["m1"],
        lesson_sections_json=[{"section_title": "Intro", "content": "x" * 5000}],
        lesson_plan_json={"title": "Lesson", "sections": []},
        lesson_status="COMPLETED",
        current_section_index=2,
        lesson_generated_at=now,
        knowledge_check_answers={"q1": "a"},
        knowledge_check_score=80.0,
        knowledge_check_report={"total_questions": 1},
        session_summary_text="summary",
        student_notes="my notes",
        tutor_chat_history=[{"role": "user", "content": "hi"}],
    )


def test_full_format_keeps_every_payload():
    response = _service()._format_session(_heavy_session())

    assert response.lesson_sections_json and response.lesson_plan_json
    assert response.quiz_questions and response.tutor_chat_history
    assert response.student_notes == "my notes"
    assert response.knowledge_check_report == {"total_questions": 1}


def test_list_format_drops_the_bulky_payloads_but_keeps_what_lists_show():
    response = _service()._format_session(_heavy_session(), include_content=False)

    # Dropped: nothing in a list or dashboard renders these, and they dominated the response size.
    assert response.lesson_sections_json == []
    assert response.lesson_plan_json is None
    assert response.quiz_questions == []
    assert response.tutor_chat_history == []
    assert response.checklist_items == []
    assert response.student_notes is None
    assert response.session_summary_text is None
    assert response.knowledge_check_answers is None
    assert response.knowledge_check_report is None
    # Kept: what agendas, banners and progress UI read.
    assert response.title == "Study B-Trees"
    assert response.status == "COMPLETED"
    assert response.lesson_status == "COMPLETED"
    assert response.current_section_index == 2
    assert response.knowledge_check_score == 80.0
    assert response.source_material_ids == ["m1"]


def test_plan_list_format_slims_every_nested_session():
    plan = SimpleNamespace(
        id=uuid.uuid4(), student_id=uuid.uuid4(), title="Plan", study_type="Assessment Preparation",
        course_id=None, teaching_workspace_id=None, assessment_id=None, target_mode="full_assessment_coverage",
        target_learning_unit_id=None, start_date=datetime.now(UTC), end_date=datetime.now(UTC) + timedelta(days=7),
        available_days=["Monday"], blackout_dates=[], preferred_time_start="19:00", preferred_time_end="21:00",
        session_duration_minutes=60, daily_goal="goal", preferred_difficulty="Balanced",
        reminder_preference_minutes=30, reminder_channels=[], priority="High", status="ACTIVE",
        auto_generated=False, streak_count=0, readiness_score=40, readiness_history=[],
        covered_material_ids=[], created_at=datetime.now(UTC), sessions=[_heavy_session(), _heavy_session()],
    )
    for session in plan.sessions:
        session.is_deleted = False

    slim = _service()._format_plan(plan, include_content=False)
    full = _service()._format_plan(plan)

    assert all(s.lesson_sections_json == [] for s in slim.sessions)
    assert all(s.lesson_sections_json for s in full.sessions)
    assert len(slim.model_dump_json()) < len(full.model_dump_json()) / 2
