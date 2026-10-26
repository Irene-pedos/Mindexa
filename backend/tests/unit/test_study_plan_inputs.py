import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.schemas.study_planner import CreateStudyPlanRequest, GeneratePlanFromAssessmentRequest
from app.services.study_planner_service import StudyPlannerService
from pydantic import ValidationError


def _create(**overrides):
    start = datetime(2027, 1, 1, tzinfo=UTC)
    data = dict(title="Plan", start_date=start, end_date=start + timedelta(days=30))
    data.update(overrides)
    return CreateStudyPlanRequest(**data)


def test_a_normal_plan_is_accepted():
    plan = _create(available_days=["Monday", "Friday"], preferred_time_start="07:30", preferred_time_end="09:00")

    assert plan.available_days == ["Monday", "Friday"]


def test_plan_span_is_capped():
    start = datetime(2027, 1, 1, tzinfo=UTC)

    with pytest.raises(ValidationError, match="at most 366 days"):
        _create(end_date=start + timedelta(days=5_000))

    _create(end_date=start + timedelta(days=366))  # the limit itself is fine


@pytest.mark.parametrize("days", [["Mon"], ["monday"], ["Monday", "Funday"]])
def test_unknown_weekday_names_are_rejected(days):
    with pytest.raises(ValidationError, match="Unknown weekday"):
        _create(available_days=days)


@pytest.mark.parametrize("value", ["7pm", "25:00", "19:60", "19:0", ""])
def test_malformed_times_are_rejected(value):
    with pytest.raises(ValidationError, match="24-hour time"):
        _create(preferred_time_start=value)
    with pytest.raises(ValidationError, match="24-hour time"):
        _create(preferred_time_end=value)


def test_assessment_plan_request_gets_the_same_checks():
    start = datetime(2027, 1, 1, tzinfo=UTC)

    with pytest.raises(ValidationError, match="at most 366 days"):
        GeneratePlanFromAssessmentRequest(
            assessment_id=uuid.uuid4(), start_date=start, end_date=start + timedelta(days=900)
        )
    # Dates are optional here (they fall back to the assessment window), so absence is fine.
    GeneratePlanFromAssessmentRequest(assessment_id=uuid.uuid4())


@pytest.mark.asyncio
async def test_conflict_check_uses_preloaded_plans_instead_of_querying_per_slot():
    service = StudyPlannerService(AsyncMock())
    service.repo = MagicMock()
    service.repo.list_plans_for_student = AsyncMock(side_effect=AssertionError("must not be queried"))
    start = datetime(2027, 3, 1, 19, 0, tzinfo=UTC)
    busy = SimpleNamespace(
        id=uuid.uuid4(), is_deleted=False, status="SCHEDULED",
        scheduled_start=start, scheduled_end=start + timedelta(hours=1),
    )
    other_plan = SimpleNamespace(id=uuid.uuid4(), sessions=[busy])

    clash = await service._find_conflicts_for_slot(
        uuid.uuid4(), start + timedelta(minutes=30), start + timedelta(minutes=90), plans=[other_plan]
    )
    free = await service._find_conflicts_for_slot(
        uuid.uuid4(), start + timedelta(hours=2), start + timedelta(hours=3), plans=[other_plan]
    )

    assert clash is busy
    assert free is None
