"""R-20 pending-marks handling: what counts as pending, and what each policy mode does."""
from __future__ import annotations

import uuid
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.db.base import utcnow
from app.db.enums import (AssessmentStatus, AssessmentType, AttemptStatus,
                          EligibilityResult, PendingMarksBehavior)
from app.services.eligibility_rules import summative_entry
from app.services.eligibility_service import EligibilityService


def _result(rows):
    """Stand-in for a SQLAlchemy Result exposing the two accessors the collector uses."""
    res = MagicMock()
    res.scalars.return_value.all.return_value = list(rows)
    res.scalars.return_value.first.return_value = rows[0] if rows else None
    return res


def _asm(title="CAT 1", status=AssessmentStatus.CLOSED, window_end=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        title=title,
        status=status,
        window_end=window_end,
        reassessment_of_id=None,
        assessment_type=AssessmentType.CAT,
    )


def _service(assessments, per_assessment):
    """db.execute answers: the assessment list, then (result, attempts) for each assessment."""
    db = AsyncMock()
    answers = [_result(assessments)]
    for released_result, attempts in per_assessment:
        answers.append(_result([released_result] if released_result else []))
        answers.append(_result(attempts))
    db.execute = AsyncMock(side_effect=answers)
    service = EligibilityService(db)
    service.repo.get_active_override = AsyncMock(return_value=None)
    return service


async def _collect(service, course_id=None):
    return await service._collect_coursework_items(uuid.uuid4(), course_id or uuid.uuid4())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status",
    [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED, AttemptStatus.TIMED_OUT, AttemptStatus.FLAGGED],
)
async def test_finished_but_ungraded_attempt_is_pending_not_absent(status):
    asm = _asm()
    service = _service([asm], [(None, [SimpleNamespace(status=status)])])

    items = await _collect(service)

    assert [i["status"] for i in items] == ["UNGRADED_PENDING"]
    assert items[0]["is_pending"] is True


@pytest.mark.asyncio
async def test_unattempted_open_assessment_is_not_an_absence_yet():
    asm = _asm(status=AssessmentStatus.PUBLISHED, window_end=utcnow() + timedelta(days=3))
    service = _service([asm], [(None, [])])

    assert await _collect(service) == []


@pytest.mark.asyncio
async def test_unattempted_closed_assessment_is_an_unexcused_absence():
    asm = _asm(status=AssessmentStatus.CLOSED)
    service = _service([asm], [(None, [])])

    items = await _collect(service)

    assert items[0]["status"] == "UNEXCUSED_ABSENCE"
    assert items[0]["percentage"] == 0.0


@pytest.mark.asyncio
async def test_unattempted_assessment_past_its_window_is_an_absence():
    asm = _asm(status=AssessmentStatus.PUBLISHED, window_end=utcnow() - timedelta(hours=1))
    service = _service([asm], [(None, [])])

    assert (await _collect(service))[0]["status"] == "UNEXCUSED_ABSENCE"


@pytest.mark.asyncio
async def test_abandoned_attempt_on_closed_assessment_counts_as_absence():
    asm = _asm()
    service = _service([asm], [(None, [SimpleNamespace(status=AttemptStatus.ABANDONED)])])

    assert (await _collect(service))[0]["status"] == "UNEXCUSED_ABSENCE"


def _policy(behavior):
    return SimpleNamespace(
        no_coursework_behavior="MANUAL_REVIEW",
        pending_marks_behavior=behavior,
        summative_entry_pct=50.0,
    )


def test_block_message_names_the_pending_assessments():
    decision = summative_entry(
        avg=None, pending_count=2, has_coursework=True,
        policy=_policy(PendingMarksBehavior.BLOCK), pending_titles=["CAT 1", "Quiz 2"],
    )

    assert decision.result == EligibilityResult.BLOCKED
    assert decision.reason_code == "MARKS_PENDING"
    assert "CAT 1, Quiz 2" in decision.message


def test_manual_review_mode_holds_entry_for_review():
    decision = summative_entry(
        avg=80.0, pending_count=1, has_coursework=True, policy=_policy(PendingMarksBehavior.MANUAL_REVIEW),
    )

    assert decision.result == EligibilityResult.MANUAL_REVIEW
    assert decision.reason_code == "MARKS_PENDING"


def test_exclude_mode_ignores_pending_and_uses_the_average():
    decision = summative_entry(
        avg=80.0, pending_count=3, has_coursework=True, policy=_policy(PendingMarksBehavior.EXCLUDE),
    )

    assert decision.eligible
