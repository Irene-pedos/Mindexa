"""
tests/unit/test_phase6a_eligibility_rules.py

Unit test suite for Phase 6A pure functions (eligibility_rules.py):
1. Percentage calculations & boundary handling
2. Deterministic UNWEIGHTED coursework average (R-20)
3. Excused absence exclusion vs unexcused absence 0% (A-03)
4. Reassessment exclusion from coursework average (A-02)
5. Formative reassessment requirement boundary (49.99/50, 69.99/70)
6. Summative entry decisions for all policy branches (ELIGIBLE, ENTRY_THRESHOLD_NOT_MET, MARKS_PENDING, MANUAL_REVIEW_REQUIRED, NO_COURSEWORK)
7. Summative outcome (PASS, RETAKE_REQUIRED)
"""

from __future__ import annotations

import pytest

from app.db.enums import (
    EligibilityResult,
    NoCourseworkBehavior,
    PendingMarksBehavior,
)
from app.services.eligibility_rules import (
    coursework_average,
    formative_requires_reassessment,
    percentage,
    summative_entry,
    summative_outcome,
)


class DummyPolicy:
    def __init__(
        self,
        formative_exempt_pct: float = 70.0,
        summative_entry_pct: float = 50.0,
        summative_pass_pct: float = 50.0,
        pending_marks_behavior: PendingMarksBehavior = PendingMarksBehavior.BLOCK,
        no_coursework_behavior: NoCourseworkBehavior = NoCourseworkBehavior.MANUAL_REVIEW,
    ):
        self.formative_exempt_pct = formative_exempt_pct
        self.summative_entry_pct = summative_entry_pct
        self.summative_pass_pct = summative_pass_pct
        self.pending_marks_behavior = pending_marks_behavior
        self.no_coursework_behavior = no_coursework_behavior


def test_percentage_calculation():
    assert percentage(10.0, 10.0) == 100.0
    assert percentage(0.0, 50.0) == 0.0
    assert percentage(25.0, 50.0) == 50.0
    assert percentage(10.0, 0.0) == 0.0  # Zero division guard
    assert percentage(-5.0, 50.0) == 0.0  # Negative score floor


def test_unweighted_coursework_average_pinned_example():
    """
    Pinned spec test:
    CAT 10/10 (100%) + Formative 10/50 (20%) => unweighted average 60%, eligible.
    Weighted by marks would give (10 + 10) / (10 + 50) = 20/60 = 33.33%.
    The test pins the unweighted behavior (R-20).
    """
    items = [
        {"score": 10.0, "max_marks": 10.0},
        {"score": 10.0, "max_marks": 50.0},
    ]
    avg = coursework_average(items)
    assert avg == 60.0


def test_coursework_average_absence_and_reassessment_rules():
    """
    A-03: Unexcused absence -> 0%.
    Excused absence -> excluded.
    A-02: Reassessment scores -> excluded.
    """
    items = [
        {"score": 80.0, "max_marks": 100.0},          # 80%
        {"is_unexcused_absence": True},                # 0%
        {"score": 90.0, "max_marks": 100.0, "is_excused": True},  # Excluded
        {"score": 100.0, "max_marks": 100.0, "is_reassessment": True},  # Excluded
    ]
    # Eligible: [80.0, 0.0] -> average 40.0%
    avg = coursework_average(items)
    assert avg == 40.0


def test_coursework_average_pending_and_empty():
    # Only pending items -> None
    items = [{"is_pending": True}]
    assert coursework_average(items) is None

    # Empty list -> None
    assert coursework_average([]) is None


def test_formative_requires_reassessment_boundaries():
    policy = DummyPolicy(formative_exempt_pct=70.0)

    # 69.99% requires reassessment
    assert formative_requires_reassessment(69.99, policy) is True
    # 70.00% is exempt
    assert formative_requires_reassessment(70.00, policy) is False
    # 70.01% is exempt
    assert formative_requires_reassessment(70.01, policy) is False


def test_summative_entry_decisions():
    policy = DummyPolicy(
        summative_entry_pct=50.0,
        pending_marks_behavior=PendingMarksBehavior.BLOCK,
        no_coursework_behavior=NoCourseworkBehavior.MANUAL_REVIEW,
    )

    # Eligible: 50.0% boundary meets threshold
    dec_50 = summative_entry(avg=50.0, pending_count=0, has_coursework=True, policy=policy)
    assert dec_50.result == EligibilityResult.ELIGIBLE
    assert dec_50.reason_code == "ELIGIBLE"

    # Blocked: 49.99% below 50% threshold
    dec_49 = summative_entry(avg=49.99, pending_count=0, has_coursework=True, policy=policy)
    assert dec_49.result == EligibilityResult.BLOCKED
    assert dec_49.reason_code == "ENTRY_THRESHOLD_NOT_MET"

    # Blocked: Pending marks with BLOCK behavior
    dec_pending = summative_entry(avg=75.0, pending_count=1, has_coursework=True, policy=policy)
    assert dec_pending.result == EligibilityResult.BLOCKED
    assert dec_pending.reason_code == "MARKS_PENDING"

    # No coursework with MANUAL_REVIEW
    dec_no_cw = summative_entry(avg=None, pending_count=0, has_coursework=False, policy=policy)
    assert dec_no_cw.result == EligibilityResult.MANUAL_REVIEW
    assert dec_no_cw.reason_code == "MANUAL_REVIEW_REQUIRED"

    # No coursework with BLOCK
    policy_block_cw = DummyPolicy(no_coursework_behavior=NoCourseworkBehavior.BLOCK)
    dec_block_cw = summative_entry(avg=None, pending_count=0, has_coursework=False, policy=policy_block_cw)
    assert dec_block_cw.result == EligibilityResult.BLOCKED
    assert dec_block_cw.reason_code == "NO_COURSEWORK"

    # No coursework with ALLOW
    policy_allow_cw = DummyPolicy(no_coursework_behavior=NoCourseworkBehavior.ALLOW)
    dec_allow_cw = summative_entry(avg=None, pending_count=0, has_coursework=False, policy=policy_allow_cw)
    assert dec_allow_cw.result == EligibilityResult.ELIGIBLE
    assert dec_allow_cw.reason_code == "NO_COURSEWORK_ALLOWED"


def test_summative_outcome():
    policy = DummyPolicy(summative_pass_pct=50.0)

    res_pass, msg_pass = summative_outcome(50.0, policy)
    assert res_pass == EligibilityResult.PASS
    assert msg_pass == "PASSED"

    res_fail, msg_fail = summative_outcome(49.99, policy)
    assert res_fail == EligibilityResult.RETAKE_REQUIRED
    assert msg_fail == "SUMMATIVE_FAILED"
