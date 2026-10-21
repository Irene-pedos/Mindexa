"""
app/services/eligibility_rules.py

Phase 6A: Pure deterministic evaluation functions for academic eligibility,
coursework averages, reassessment requirements, and retake decisions.
Zero database dependencies. Fully unit-tested.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional

from app.db.enums import (
    EligibilityResult,
    NoCourseworkBehavior,
    PendingMarksBehavior,
)


@dataclass
class CourseworkMarkItem:
    """Represents one coursework item for unweighted average calculation."""
    percentage: Optional[float] = None
    is_excused: bool = False
    is_unexcused_absence: bool = False
    is_reassessment: bool = False
    is_ungraded: bool = False
    is_pending: bool = False


@dataclass
class EntryDecision:
    """Represents a computed eligibility decision for summative exam entry."""
    result: EligibilityResult
    reason_code: str
    average_percentage: Optional[float] = None
    pending_count: int = 0
    message: str = ""

    @property
    def eligible(self) -> bool:
        return self.result == EligibilityResult.ELIGIBLE

    @property
    def detail(self) -> str:
        return self.message


def percentage(score: float, max_possible: float) -> float:
    """Compute score percentage relative to max possible marks."""
    if max_possible <= 0:
        return 0.0
    val = (score / max_possible) * 100.0
    return round(max(0.0, val), 4)


def coursework_average(items: List[Any]) -> Optional[float]:
    """
    Compute mean of percentages across finalized courseworks (CAT and Formative).
    Deterministic rule R-20: UNWEIGHTED average of percentages, NOT weighted by marks.

    Accepts both CourseworkMarkItem dataclasses and legacy dicts with keys:
        percentage, is_excused, is_unexcused_absence, is_reassessment, is_pending,
        score, max_marks (dict-only fallback for percentage calculation).
    """
    eligible_percentages: list[float] = []

    for item in items:
        if isinstance(item, CourseworkMarkItem):
            if item.is_reassessment:
                continue
            if item.is_excused:
                continue
            if item.is_unexcused_absence:
                eligible_percentages.append(0.0)
                continue
            if item.is_ungraded or item.is_pending:
                continue
            if item.percentage is not None:
                eligible_percentages.append(float(item.percentage))
        else:
            # Legacy dict format
            if item.get("is_reassessment", False):
                continue
            if item.get("is_excused", False):
                continue
            if item.get("is_unexcused_absence", False):
                eligible_percentages.append(0.0)
                continue
            if item.get("is_pending", False):
                continue
            pct = item.get("percentage")
            if pct is None and item.get("score") is not None and item.get("max_marks"):
                pct = percentage(float(item["score"]), float(item["max_marks"]))
            if pct is not None:
                eligible_percentages.append(float(pct))

    if not eligible_percentages:
        return None

    unweighted_mean = sum(eligible_percentages) / len(eligible_percentages)
    return round(unweighted_mean, 4)


def formative_requires_reassessment(pct: float, policy: Any) -> bool:
    """
    Determine if a formative assessment result requires reassessment.
    Boundary rule: Strict inequality pct < formative_exempt_pct.
    """
    threshold = getattr(policy, "formative_exempt_pct", 70.0)
    return pct < threshold


def summative_entry(
    avg: Optional[float],
    pending_count: int,
    has_coursework: bool,
    policy: Any,
) -> EntryDecision:
    """
    Evaluate summative exam entry eligibility against institutional policy (R-20).
    """
    no_cw_behavior = getattr(policy, "no_coursework_behavior", NoCourseworkBehavior.MANUAL_REVIEW)
    pending_behavior = getattr(policy, "pending_marks_behavior", PendingMarksBehavior.BLOCK)
    entry_pct = getattr(policy, "summative_entry_pct", 50.0)

    # 1. No coursework present
    if not has_coursework:
        if no_cw_behavior == NoCourseworkBehavior.ALLOW:
            return EntryDecision(
                result=EligibilityResult.ELIGIBLE,
                reason_code="NO_COURSEWORK_ALLOWED",
                average_percentage=avg,
                pending_count=pending_count,
                message="Eligible: Coursework policy allows summative entry without coursework.",
            )
        if no_cw_behavior == NoCourseworkBehavior.BLOCK:
            return EntryDecision(
                result=EligibilityResult.BLOCKED,
                reason_code="NO_COURSEWORK",
                average_percentage=avg,
                pending_count=pending_count,
                message="Blocked: Student has no recorded coursework for this course.",
            )
        # Default: MANUAL_REVIEW
        return EntryDecision(
            result=EligibilityResult.MANUAL_REVIEW,
            reason_code="MANUAL_REVIEW_REQUIRED",
            average_percentage=avg,
            pending_count=pending_count,
            message="Manual Review Required: No coursework submitted; requires HOD/board review.",
        )

    # 2. Pending marks exist and policy blocks on pending
    if pending_count > 0 and pending_behavior == PendingMarksBehavior.BLOCK:
        return EntryDecision(
            result=EligibilityResult.BLOCKED,
            reason_code="MARKS_PENDING",
            average_percentage=avg,
            pending_count=pending_count,
            message=f"Blocked: Student has {pending_count} pending coursework assessment(s) awaiting grading.",
        )

    # 3. Average threshold evaluation
    if avg is None:
        return EntryDecision(
            result=EligibilityResult.MANUAL_REVIEW,
            reason_code="MANUAL_REVIEW_REQUIRED",
            average_percentage=avg,
            pending_count=pending_count,
            message="Manual Review Required: Unable to compute coursework average.",
        )

    if avg < entry_pct:
        return EntryDecision(
            result=EligibilityResult.BLOCKED,
            reason_code="ENTRY_THRESHOLD_NOT_MET",
            average_percentage=avg,
            pending_count=pending_count,
            message=f"Blocked: Coursework average ({avg:.2f}%) is below the {entry_pct:.1f}% entry threshold.",
        )

    return EntryDecision(
        result=EligibilityResult.ELIGIBLE,
        reason_code="ELIGIBLE",
        average_percentage=avg,
        pending_count=pending_count,
        message=f"Eligible: Coursework average ({avg:.2f}%) meets the {entry_pct:.1f}% entry threshold.",
    )


def summative_outcome(pct: float, policy: Any) -> tuple[EligibilityResult, str]:
    """
    Evaluate summative exam outcome (PASS | RETAKE_REQUIRED).
    """
    pass_pct = getattr(policy, "summative_pass_pct", 50.0)
    if pct >= pass_pct:
        return EligibilityResult.PASS, "PASSED"
    return EligibilityResult.RETAKE_REQUIRED, "SUMMATIVE_FAILED"
