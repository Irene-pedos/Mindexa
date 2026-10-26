import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.core.exceptions import ConflictError
from app.services.study_planner_service import StudyPlannerService


def _service():
    db = AsyncMock()
    db.add = MagicMock()
    service = StudyPlannerService(db)
    service.repo = MagicMock()
    service.repo.update_session = AsyncMock()
    service.repo.update_plan = AsyncMock()
    return service


def _session(**overrides):
    base = dict(
        id=uuid.uuid4(),
        study_plan_id=uuid.uuid4(),
        learning_unit_id=None,
        status="SCHEDULED",
        lesson_status="NOT_GENERATED",
        lesson_plan_json=None,
        lesson_sections_json=[],
        session_summary_text=None,
        lesson_generated_at=None,
        completed_at=None,
        topic="B-Trees",
        title="Study B-Trees",
        duration_minutes=30,
        knowledge_check_report=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ── reschedule ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["COMPLETED", "CANCELLED"])
async def test_finished_sessions_cannot_be_rescheduled_even_with_force(status):
    service = _service()
    service.repo.get_session_by_id = AsyncMock(return_value=_session(status=status))

    with pytest.raises(ConflictError):
        await service.reschedule_session(
            uuid.uuid4(), uuid.uuid4(), datetime.now(UTC) + timedelta(days=1), 30, force=True
        )


@pytest.mark.asyncio
async def test_force_does_not_allow_a_start_time_in_the_past():
    service = _service()
    service.repo.get_session_by_id = AsyncMock(return_value=_session())

    with pytest.raises(ConflictError, match="already passed"):
        await service.reschedule_session(
            uuid.uuid4(), uuid.uuid4(), datetime.now(UTC) - timedelta(days=2), 30, force=True
        )


# ── completion ───────────────────────────────────────────────────────────────


def _plan(streak):
    return SimpleNamespace(
        id=uuid.uuid4(),
        course_id=None,
        streak_count=streak,
        readiness_score=10,
        sessions=[],
    )


async def _complete_guided(session, plan):
    service = _service()
    service.repo.get_session_by_id = AsyncMock(return_value=session)
    service.repo.get_plan_by_id = AsyncMock(return_value=plan)
    service.repo.get_or_create_learning_profile = AsyncMock(
        return_value=SimpleNamespace(id=uuid.uuid4(), total_sessions_completed=0, current_streak_days=0)
    )
    service.repo.update_learning_profile = AsyncMock()
    with patch(
        "app.agents.study_planner_agent.StudyPlannerAgent.generate_session_summary",
        new=AsyncMock(side_effect=RuntimeError("no ai in unit tests")),
    ):
        await service.complete_guided_session(session.id, uuid.uuid4())
    return service


@pytest.mark.asyncio
async def test_guided_completion_after_complete_session_does_not_count_the_streak_twice():
    session = _session(status="COMPLETED", lesson_status="IN_PROGRESS", completed_at=datetime.now(UTC))
    plan = _plan(streak=4)

    service = await _complete_guided(session, plan)

    assert plan.streak_count == 4
    service.repo.update_learning_profile.assert_not_called()
    assert session.lesson_status == "COMPLETED"


@pytest.mark.asyncio
async def test_first_completion_counts_the_streak_once():
    session = _session(status="SCHEDULED", lesson_status="IN_PROGRESS")
    plan = _plan(streak=4)

    service = await _complete_guided(session, plan)

    assert plan.streak_count == 5
    service.repo.update_learning_profile.assert_called_once()


# ── lesson start / regenerate ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_blocked_language_lesson_is_persisted_with_sections_and_a_valid_status():
    service = _service()
    session = _session()
    service.repo.get_session_by_id = AsyncMock(return_value=session)
    service.repo.get_plan_by_id = AsyncMock(
        return_value=SimpleNamespace(course_id=None, teaching_workspace_id=uuid.uuid4())
    )
    service.repo.get_or_create_learning_profile = AsyncMock(
        return_value=SimpleNamespace(weak_topics=[], topic_confidence={})
    )
    service.db.get = AsyncMock(return_value=SimpleNamespace(language="RW"))

    await service.start_guided_session(session.id, uuid.uuid4())

    assert session.lesson_status == "IN_PROGRESS"  # the old code stored the invalid "GENERATED"
    assert session.lesson_sections_json, "sections must be saved or the page shows 0 modules"
    assert session.lesson_plan_json["generated_by"] == "fallback"


@pytest.mark.asyncio
@pytest.mark.parametrize("regenerate,expected_calls", [(False, 0), (True, 1)])
async def test_fallback_lesson_is_only_regenerated_on_explicit_request(regenerate, expected_calls):
    service = _service()
    session = _session(lesson_status="IN_PROGRESS", lesson_plan_json={"generated_by": "fallback"})
    service.repo.get_session_by_id = AsyncMock(return_value=session)
    service.repo.get_plan_by_id = AsyncMock(return_value=None)
    service.repo.get_or_create_learning_profile = AsyncMock(
        return_value=SimpleNamespace(weak_topics=[], topic_confidence={})
    )
    service._get_session_rag_context = AsyncMock(return_value=("", []))

    with patch(
        "app.agents.study_planner_agent.StudyPlannerAgent.generate_lesson",
        new=AsyncMock(side_effect=RuntimeError("ai down")),
    ):
        await service.start_guided_session(session.id, uuid.uuid4(), regenerate=regenerate)

    assert service._get_session_rag_context.call_count == expected_calls


@pytest.mark.asyncio
async def test_a_real_ai_lesson_is_never_regenerated_even_when_asked():
    service = _service()
    session = _session(lesson_status="IN_PROGRESS", lesson_plan_json={"title": "AI lesson", "generated_by": "ai"})
    service.repo.get_session_by_id = AsyncMock(return_value=session)
    service._get_session_rag_context = AsyncMock(return_value=("", []))

    await service.start_guided_session(session.id, uuid.uuid4(), regenerate=True)

    service._get_session_rag_context.assert_not_called()
