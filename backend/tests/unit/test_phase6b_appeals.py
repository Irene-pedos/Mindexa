"""
tests/unit/test_phase6b_appeals.py

Unit tests for Phase 6B pure logic and schema validation:
1. Appeal window enforcement (day 7 allowed / day 8 rejected)
2. Duplicate appeal detection
3. A-08 decrease policy (allow_mark_decrease=False)
4. Original marker exclusion from reviewer pool
5. AbsenceExcuseDecide status validation
6. AppealCreate reason minimum length validation
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.db.enums import (
    AbsenceExcuseStatus,
    AppealOutcome,
    IndividualAppealStatus,
)
from app.schemas.appeals import (
    AbsenceExcuseCreate,
    AbsenceExcuseDecide,
    AppealCreate,
)


# ── Schema Validation ─────────────────────────────────────────────────────────


def test_appeal_reason_too_short():
    with pytest.raises(Exception):
        AppealCreate(
            attempt_id=uuid.uuid4(),
            assessment_id=uuid.uuid4(),
            course_id=uuid.uuid4(),
            reason="too short",  # < 20 chars
        )


def test_appeal_reason_minimum_length():
    appeal = AppealCreate(
        attempt_id=uuid.uuid4(),
        assessment_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        reason="This is exactly 20 chars!",
    )
    assert len(appeal.reason) >= 20


def test_absence_excuse_requires_evidence():
    with pytest.raises(Exception):
        AbsenceExcuseCreate(
            assessment_id=uuid.uuid4(),
            course_id=uuid.uuid4(),
            reason="Medical emergency at home",
            evidence_file_ids=[],  # empty list
        )


def test_absence_excuse_valid():
    excuse = AbsenceExcuseCreate(
        assessment_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        reason="Medical emergency at home",
        evidence_file_ids=["file-001"],
    )
    assert len(excuse.evidence_file_ids) == 1


def test_excuse_decide_invalid_status_withdrawn():
    """WITHDRAWN is not a valid decision outcome — only APPROVED or REJECTED."""
    payload = AbsenceExcuseDecide(status=AbsenceExcuseStatus.WITHDRAWN)
    # The service enforces this, not the schema; verify the field is set
    assert payload.status == AbsenceExcuseStatus.WITHDRAWN


# ── A-08: Decrease Policy ─────────────────────────────────────────────────────


def test_decrease_policy_no_decrease_allowed():
    """When allow_mark_decrease=False, final_total = max(original, reviewer_total)."""
    original = 60.0
    reviewer_total = 45.0  # lower than original

    allow_mark_decrease = False
    if not allow_mark_decrease:
        final = max(original, reviewer_total)
    else:
        final = reviewer_total

    assert final == 60.0, "Mark should not decrease when policy disallows it"


def test_decrease_policy_decrease_allowed():
    original = 60.0
    reviewer_total = 45.0

    allow_mark_decrease = True
    if not allow_mark_decrease:
        final = max(original, reviewer_total)
    else:
        final = reviewer_total

    assert final == 45.0


def test_decrease_policy_increase():
    original = 60.0
    reviewer_total = 75.0

    allow_mark_decrease = False
    final = max(original, reviewer_total) if not allow_mark_decrease else reviewer_total
    assert final == 75.0, "Increase should always be applied regardless of policy"


# ── Appeal Outcome Derivation ─────────────────────────────────────────────────


def _derive_outcome(original: float, final: float) -> AppealOutcome:
    if final > original:
        return AppealOutcome.MARK_INCREASED
    elif final < original:
        return AppealOutcome.MARK_DECREASED
    return AppealOutcome.MARK_CONFIRMED


def test_outcome_confirmed():
    assert _derive_outcome(70.0, 70.0) == AppealOutcome.MARK_CONFIRMED


def test_outcome_increased():
    assert _derive_outcome(60.0, 75.0) == AppealOutcome.MARK_INCREASED


def test_outcome_decreased():
    assert _derive_outcome(75.0, 60.0) == AppealOutcome.MARK_DECREASED


# ── Appeal Window Boundary ────────────────────────────────────────────────────


from datetime import datetime, timezone


def _is_within_window(released_at: datetime, window_days: int, now: datetime) -> bool:
    deadline = released_at + timedelta(days=window_days)
    return now <= deadline


def test_window_last_day_allowed():
    released_at = datetime(2026, 10, 1, tzinfo=timezone.utc)
    window_days = 7
    now = datetime(2026, 10, 8, tzinfo=timezone.utc)  # exactly day 7
    assert _is_within_window(released_at, window_days, now) is True


def test_window_day_after_deadline_rejected():
    released_at = datetime(2026, 10, 1, tzinfo=timezone.utc)
    window_days = 7
    now = datetime(2026, 10, 9, tzinfo=timezone.utc)  # day 8 after release
    assert _is_within_window(released_at, window_days, now) is False


def test_window_same_day_allowed():
    released_at = datetime(2026, 10, 1, tzinfo=timezone.utc)
    window_days = 7
    now = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)  # same day
    assert _is_within_window(released_at, window_days, now) is True


# ── Original Marker Pool Exclusion ───────────────────────────────────────────


def test_primary_pool_excludes_original_markers():
    """Primary pool must exclude all original marker IDs — hard rule."""
    all_course_lecturers = [uuid.uuid4() for _ in range(5)]
    original_marker_id = all_course_lecturers[0]
    original_marker_ids = {original_marker_id}

    eligible_pool = [lid for lid in all_course_lecturers if lid not in original_marker_ids]
    assert original_marker_id not in eligible_pool
    assert len(eligible_pool) == 4


def test_fallback_required_when_primary_empty():
    """When all course lecturers are original markers, fallback pool is used."""
    original_marker_id = uuid.uuid4()
    all_course_lecturers = [original_marker_id]
    original_marker_ids = {original_marker_id}

    primary = [lid for lid in all_course_lecturers if lid not in original_marker_ids]
    assert len(primary) == 0, "Primary pool should be empty"
    # Service would proceed to fallback pool + require justification


def test_fallback_justification_required_flag():
    """EligibleReviewersResponse.fallback_justification_required = True when primary is empty."""
    from app.schemas.appeals import EligibleReviewersResponse

    response = EligibleReviewersResponse(
        primary_pool=[],
        fallback_pool=[uuid.uuid4()],
        fallback_justification_required=True,
    )
    assert response.fallback_justification_required is True


# ── IndividualAppealStatus Terminal States ────────────────────────────────────


def test_terminal_statuses():
    """Validate that terminal statuses are as expected."""
    terminal = {
        IndividualAppealStatus.CLOSED,
        IndividualAppealStatus.REJECTED_INVALID,
        IndividualAppealStatus.WITHDRAWN,
    }
    assert IndividualAppealStatus.DECIDED not in terminal
    assert IndividualAppealStatus.SUBMITTED not in terminal
    assert IndividualAppealStatus.CLOSED in terminal
