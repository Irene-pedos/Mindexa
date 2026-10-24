"""
app/services/assessment_marks.py

Central pure calculation module for assessment marks, choice pools, and summative structure.
Single source of truth per Section 6.2 of the institutional workflows spec.
"""

from __future__ import annotations

import contextlib
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.core.constants import AssessmentType, OverAnswerPolicy, SectionKind


@dataclass(frozen=True)
class ChoicePoolIssue:
    """Represents a validation issue in a choice-based section."""
    section_id: uuid.UUID | None
    section_title: str | None
    code: str
    message: str


@dataclass(frozen=True)
class StructureViolation:
    """Represents a hard or soft structure rule violation."""
    code: str
    message: str
    is_blocking: bool


@dataclass
class SummativeStructureResult:
    """Summary of summative blueprint and structure rule evaluations."""
    is_valid: bool
    hard_violations: list[StructureViolation] = field(default_factory=list)
    soft_warnings: list[StructureViolation] = field(default_factory=list)

    @property
    def all_issues(self) -> list[StructureViolation]:
        return self.hard_violations + self.soft_warnings


def _effective_aq_marks(aq: Any) -> int:
    """Helper to get effective marks of an AssessmentQuestion row."""
    if getattr(aq, "is_deleted", False):
        return 0
    if getattr(aq, "marks_override", None) is not None:
        return int(aq.marks_override)
    q = getattr(aq, "question", None)
    if q and getattr(q, "marks", None) is not None:
        return int(q.marks)
    return 0


def required_marks(assessment: Any) -> int:
    """
    Calculate the total required marks for an assessment.
    Single source of truth (Spec Section 6.2).

    Rules:
    - For each section:
      - If `questions_to_answer` (N) is set:
        `N * marks_per_question` (all questions in a choice pool must have equal marks).
        If pool is empty, contributes 0.
      - Else: sum of effective marks of all questions in the section.
    - Questions with no section (`assessment_section_id is None`):
      Count as compulsory; sum their effective marks.
    """
    if not assessment:
        return 0

    all_secs = getattr(assessment, "sections", None) or []
    sections = [s for s in all_secs if not getattr(s, "is_deleted", False)]
    all_aqs = getattr(assessment, "assessment_questions", None) or []
    questions = [aq for aq in all_aqs if not getattr(aq, "is_deleted", False)]

    section_map = {s.id: s for s in sections}
    sec_questions: dict[uuid.UUID | None, list[Any]] = {s.id: [] for s in sections}
    unsectioned_questions: list[Any] = []

    for aq in questions:
        sec_id = getattr(aq, "assessment_section_id", None)
        if sec_id is not None:
            if sec_id in sec_questions:
                sec_questions[sec_id].append(aq)
        else:
            unsectioned_questions.append(aq)

    total = 0

    # 1. Section marks
    for sec_id, sec in section_map.items():
        aqs = sec_questions.get(sec_id, [])
        n = getattr(sec, "questions_to_answer", None)
        if n is not None:
            # Choice pool: N * marks_per_question
            if aqs:
                marks_per_question = _effective_aq_marks(aqs[0])
                total += max(0, int(n)) * marks_per_question
        else:
            # Compulsory section: sum of all questions
            total += sum(_effective_aq_marks(aq) for aq in aqs)

    # 2. Unsectioned questions (all compulsory)
    total += sum(_effective_aq_marks(aq) for aq in unsectioned_questions)

    return total


def max_possible_score(assessment: Any) -> int:
    """
    Authoritative maximum possible score for an assessment.
    Equal to required_marks(assessment).
    """
    return required_marks(assessment)


def validate_choice_pools(assessment: Any) -> list[ChoicePoolIssue]:
    """
    Validate that all choice pools in an assessment satisfy:
    1. N >= 1
    2. N <= pool_size
    3. All questions in the choice pool have equal effective marks.
    """
    if not assessment:
        return []

    all_secs = getattr(assessment, "sections", None) or []
    sections = [s for s in all_secs if not getattr(s, "is_deleted", False)]
    all_aqs = getattr(assessment, "assessment_questions", None) or []
    questions = [aq for aq in all_aqs if not getattr(aq, "is_deleted", False)]

    issues: list[ChoicePoolIssue] = []

    for sec in sections:
        n = getattr(sec, "questions_to_answer", None)
        if n is None:
            continue

        sec_aqs = [
            aq for aq in questions
            if getattr(aq, "assessment_section_id", None) == sec.id
        ]
        pool_size = len(sec_aqs)

        # 1. N >= 1
        if int(n) < 1:
            issues.append(
                ChoicePoolIssue(
                    section_id=sec.id,
                    section_title=sec.title,
                    code="INVALID_N",
                    message=(
                        f"Section '{sec.title}' questions_to_answer must be at least 1 "
                        f"(got {n})."
                    ),
                )
            )

        # 2. N <= pool_size
        if int(n) > pool_size:
            issues.append(
                ChoicePoolIssue(
                    section_id=sec.id,
                    section_title=sec.title,
                    code="N_EXCEEDS_POOL",
                    message=(
                        f"Section '{sec.title}' requires answering {n} questions, "
                        f"but only contains {pool_size} questions."
                    ),
                )
            )

        # 3. Equal marks in choice pool
        if sec_aqs:
            distinct_marks = {_effective_aq_marks(aq) for aq in sec_aqs}
            if len(distinct_marks) > 1:
                issues.append(
                    ChoicePoolIssue(
                        section_id=sec.id,
                        section_title=sec.title,
                        code="UNEQUAL_MARKS",
                        message=(
                            f"All questions in choice pool '{sec.title}' must have equal marks. "
                            f"Found differing marks: {sorted(distinct_marks)}."
                        ),
                    )
                )

    return issues


def validate_summative_structure(
    assessment: Any,
    policy_total: int | None = 100,
    rules: dict[str, Any] | None = None,
) -> SummativeStructureResult:
    """
    Validate summative structure rules (Spec Section 6.4):
    - Total required marks == policy_total (HARD rule, is_blocking=True). Skipped when the
      institution sets no fixed total (policy_total is None).
    - Exactly 3 sections (A, B, C) (SOFT rule).
    - Section A is CLOSED (SOFT rule).
    - Section C is OPEN (SOFT rule).
    - Sections B and C have pool_size > questions_to_answer (SOFT rule).

    `rules` is the STRUCTURE rule of the institution's compliance settings
    (expected_sections / section_a_closed / section_c_open / choice_pools); omitted keys keep the
    original behaviour above.

    Non-summative assessments return is_valid=True with no violations or warnings.
    """
    rules = rules or {}
    expected_sections = rules.get("expected_sections", 3)
    check_a_closed = rules.get("section_a_closed", True)
    check_c_open = rules.get("section_c_open", True)
    check_pools = rules.get("choice_pools", True)
    if not assessment:
        return SummativeStructureResult(is_valid=True)

    ass_type = getattr(assessment, "assessment_type", None)
    if isinstance(ass_type, str):
        with contextlib.suppress(ValueError):
            ass_type = AssessmentType(ass_type)

    if ass_type != AssessmentType.SUMMATIVE:
        return SummativeStructureResult(is_valid=True)

    hard_violations: list[StructureViolation] = []
    soft_warnings: list[StructureViolation] = []

    # If policy_total was left as default 100, check if assessment has custom policy total configured
    if policy_total == 100:
        custom_total = getattr(assessment, "configured_policy_total", None) or getattr(
            assessment, "summative_total_marks", None
        )
        if isinstance(custom_total, (int, float)) or (isinstance(custom_total, str) and custom_total.isdigit()):
            policy_total = int(custom_total)

    # 1. HARD RULE: Total required marks == policy total (default 100). An institution that sets no
    #    fixed total (policy_total is None) is not checked.
    req = required_marks(assessment)
    if policy_total is not None and req != policy_total:
        hard_violations.append(
            StructureViolation(
                code="SUMMATIVE_MARKS_TOTAL",
                message=(
                    f"Summative assessment total required marks must be exactly {policy_total}, "
                    f"got {req}."
                ),
                is_blocking=True,
            )
        )

    all_secs = getattr(assessment, "sections", None) or []
    sections = [s for s in all_secs if not getattr(s, "is_deleted", False)]
    sections.sort(key=lambda s: getattr(s, "order_index", 0))

    # 2. SOFT RULE: Expected number of sections (3 = A, B, C unless the institution says otherwise)
    if expected_sections is not None and len(sections) != expected_sections:
        soft_warnings.append(
            StructureViolation(
                code="SUMMATIVE_SECTION_COUNT",
                message=(
                    "Summative paper is expected to have exactly 3 sections (A, B, C), "
                    f"found {len(sections)}."
                    if expected_sections == 3
                    else f"Summative paper is expected to have exactly {expected_sections} "
                    f"section(s), found {len(sections)}."
                ),
                is_blocking=False,
            )
        )

    # Identify Sections A, B, C by order or title
    sec_a = sections[0] if len(sections) >= 1 else None
    sec_b = sections[1] if len(sections) >= 2 else None
    sec_c = sections[2] if len(sections) >= 3 else None

    # 3. SOFT RULE: Section A is CLOSED
    if check_a_closed and sec_a:
        sk_a = getattr(sec_a, "section_kind", None)
        sk_a_val = sk_a.value if hasattr(sk_a, "value") else str(sk_a or "")
        if sk_a_val != SectionKind.CLOSED.value:
            soft_warnings.append(
                StructureViolation(
                    code="SECTION_A_KIND",
                    message=f"Section A should be CLOSED questions, found {sk_a_val or 'UNSET'}.",
                    is_blocking=False,
                )
            )

    # 4. SOFT RULE: Section C is OPEN
    if check_c_open and sec_c:
        sk_c = getattr(sec_c, "section_kind", None)
        sk_c_val = sk_c.value if hasattr(sk_c, "value") else str(sk_c or "")
        if sk_c_val != SectionKind.OPEN.value:
            soft_warnings.append(
                StructureViolation(
                    code="SECTION_C_KIND",
                    message=f"Section C should be OPEN questions, found {sk_c_val or 'UNSET'}.",
                    is_blocking=False,
                )
            )

    all_aqs = getattr(assessment, "assessment_questions", None) or []
    questions = [aq for aq in all_aqs if not getattr(aq, "is_deleted", False)]

    # 5. SOFT RULE: Sections B and C have pool_size > questions_to_answer (choice pools)
    for sec in (sec_b, sec_c) if check_pools else ():
        if sec:
            sec_aqs = [
                aq for aq in questions
                if getattr(aq, "assessment_section_id", None) == sec.id
            ]
            p_size = len(sec_aqs) if sec_aqs else getattr(sec, "pool_size", 0)
            q_to_ans = getattr(sec, "questions_to_answer", None)
            if q_to_ans is None or p_size <= int(q_to_ans):
                soft_warnings.append(
                    StructureViolation(
                        code=f"{sec.title.upper().replace(' ', '_')}_CHOICE_POOL",
                        message=(
                            f"Section '{sec.title}' should have more questions than required "
                            f"(found pool_size={p_size}, questions_to_answer={q_to_ans})."
                        ),
                        is_blocking=False,
                    )
                )

    is_valid = len(hard_violations) == 0
    return SummativeStructureResult(
        is_valid=is_valid,
        hard_violations=hard_violations,
        soft_warnings=soft_warnings,
    )


@dataclass
class ResponseCountDecision:
    """Decision on whether a student response is counted towards attempt score."""
    response_id: uuid.UUID
    question_id: uuid.UUID
    is_counted: bool
    score: float
    reason: str


def resolve_choice_section_responses(
    *,
    section_id: uuid.UUID,
    questions_to_answer: int | None,
    over_answer_policy: OverAnswerPolicy | str,
    responses: Sequence[Any],
    selections: Sequence[Any] | None = None,
    grades: Sequence[Any] | None = None,
) -> list[ResponseCountDecision]:
    """
    Resolve which responses in a section are counted and which are excluded.
    Spec Section 6.3:
    - If questions_to_answer is None: all responses are counted.
    - If responses count <= N: all are counted.
    - If responses count > N:
      - FIRST_N: the first N by selected_order, or earliest answered time for legacy responses.
      - BEST_N: the N highest-scoring responses (ties broken by earliest selection/time).
      - Excluded responses get is_counted=False and score=0.
    """
    if questions_to_answer is None:
        # All compulsory
        decisions: list[ResponseCountDecision] = []
        for r in responses:
            score = _get_response_score(r, grades)
            decisions.append(
                ResponseCountDecision(
                    response_id=r.id,
                    question_id=r.question_id,
                    is_counted=True,
                    score=score,
                    reason="Compulsory section question",
                )
            )
        return decisions

    n = max(0, int(questions_to_answer))
    if not responses:
        return []

    policy_val = (
        over_answer_policy.value
        if hasattr(over_answer_policy, "value")
        else str(over_answer_policy or OverAnswerPolicy.FIRST_N.value)
    )

    # Build lookup of selection orders
    selection_order_map: dict[uuid.UUID, int] = {}
    if selections:
        for s in selections:
            if getattr(s, "assessment_section_id", None) == section_id:
                selection_order_map[s.question_id] = getattr(s, "selected_order", 999999)

    # Associate metadata with each response for sorting
    scored_items: list[dict[str, Any]] = []
    for r in responses:
        score = _get_response_score(r, grades)
        sel_order = selection_order_map.get(r.question_id)
        timestamp = (
            getattr(r, "submitted_at", None)
            or getattr(r, "saved_at", None)
            or getattr(r, "created_at", None)
        )
        if timestamp is None:
            timestamp = datetime.min.replace(tzinfo=UTC)
        elif timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=UTC)

        scored_items.append({
            "response": r,
            "score": score,
            "has_selection": sel_order is not None,
            "selected_order": sel_order if sel_order is not None else 999999,
            "timestamp": timestamp,
        })

    if policy_val == OverAnswerPolicy.BEST_N.value:
        # Sort by score DESC, then selection order ASC, then timestamp ASC
        scored_items.sort(
            key=lambda item: (-item["score"], item["selected_order"], item["timestamp"])
        )
    else:
        # FIRST_N: Sort by selection order ASC (if selected), then timestamp ASC
        scored_items.sort(
            key=lambda item: (
                0 if item["has_selection"] else 1,
                item["selected_order"],
                item["timestamp"],
            )
        )

    decisions = []
    for idx, item in enumerate(scored_items):
        r = item["response"]
        orig_score = item["score"]
        if idx < n:
            decisions.append(
                ResponseCountDecision(
                    response_id=r.id,
                    question_id=r.question_id,
                    is_counted=True,
                    score=orig_score,
                    reason=f"Counted under {policy_val} (rank {idx + 1}/{len(scored_items)})",
                )
            )
        else:
            decisions.append(
                ResponseCountDecision(
                    response_id=r.id,
                    question_id=r.question_id,
                    is_counted=False,
                    score=0.0,
                    reason=(
                        f"Excluded under {policy_val} over-answer limit "
                        f"(rank {idx + 1}/{len(scored_items)})"
                    ),
                )
            )

    return decisions


def _get_response_score(response: Any, grades: Sequence[Any] | None = None) -> float:
    """Extract awarded score for a response from grades list or auto_grade_score."""
    if grades:
        for g in grades:
            if (
                getattr(g, "response_id", None) == response.id
                and getattr(g, "score", None) is not None
            ):
                return float(g.score)
    if getattr(response, "auto_grade_score", None) is not None:
        return float(response.auto_grade_score)
    if getattr(response, "ai_grade_score", None) is not None:
        return float(response.ai_grade_score)
    return 0.0
