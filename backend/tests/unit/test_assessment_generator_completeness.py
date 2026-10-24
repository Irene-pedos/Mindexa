"""
tests/unit/test_assessment_generator_completeness.py

AI question generation must never report an unusable question as a success, never
invent answers, and must complete case studies that come back without sub-questions
(4 of the last 6 AI case studies in the dev database had none).
"""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agents.assessment_generator_agent import (
    MAX_COMPLETION_TOKENS,
    AssessmentGeneratorAgent,
    completion_token_budget,
)

SCENARIO = (
    "Kigali Fresh Ltd runs a web shop. Orders are stored in a database and the shop has been "
    "slow during sales. The team must decide how to restructure its pages and queries. " * 2
)


def _scenario_only() -> str:
    return json.dumps([{"question": SCENARIO, "options": [], "explanation": ""}])


def _with_parts(key: str = "options") -> str:
    return json.dumps(
        [
            {
                "question": SCENARIO,
                key: [
                    {"text": "Identify the main bottleneck.", "explanation": "Slow queries", "marks": 4},
                    {"text": "Propose one fix.", "explanation": "Add an index", "marks": 6},
                ],
            }
        ]
    )


def _agent(responses: list[tuple[str, str]]) -> tuple[AssessmentGeneratorAgent, MagicMock]:
    """Agent whose gateway returns (content, finish_reason) in order."""
    queue = [SimpleNamespace(content=c, finish_reason=f) for c, f in responses]
    seen_max_tokens: list[int] = []

    async def complete(request, **_kwargs):
        seen_max_tokens.append(request.max_tokens)  # the request object is mutated between attempts
        return queue.pop(0)

    gateway = MagicMock()
    gateway.complete = AsyncMock(side_effect=complete)
    gateway.seen_max_tokens = seen_max_tokens
    return AssessmentGeneratorAgent(gateway), gateway


def _kwargs(**over):
    base = dict(
        lecturer_id=uuid.uuid4(),
        question_type="case_study",
        difficulty="medium",
        count=1,
        subject="Front-end Development",
        topic="Web performance",
        marks_per_question=10,
    )
    base.update(over)
    return base


def test_case_study_token_budget_is_large_and_capped():
    assert completion_token_budget("case_study", 1) >= 1500
    assert completion_token_budget("case_study", 50) == MAX_COMPLETION_TOKENS
    assert completion_token_budget("mcq", 5) < completion_token_budget("case_study", 5)


def test_normalizer_accepts_sub_question_aliases_and_keeps_marks():
    agent = AssessmentGeneratorAgent(MagicMock())
    [q] = agent._parse_generated_questions(_with_parts("sub_questions"), expected_question_type="case_study")

    assert len(q.options) == 2
    assert not q.hard_failure
    assert [o.match_key for o in q.options] == ["4", "6"]


def test_case_study_without_parts_is_a_hard_failure_not_a_success():
    agent = AssessmentGeneratorAgent(MagicMock())
    [q] = agent._parse_generated_questions(_scenario_only(), expected_question_type="case_study")

    assert q.hard_failure
    assert any("no sub-questions" in i for i in q.issues)
    assert q.explanation is None  # nothing invented


def test_missing_model_answer_is_reported_not_invented():
    agent = AssessmentGeneratorAgent(MagicMock())
    payload = json.dumps([{"question": "Explain the box model in CSS in detail.", "options": []}])
    [q] = agent._parse_generated_questions(payload, expected_question_type="short_answer")

    assert q.explanation is None
    assert q.issues and not q.hard_failure


@pytest.mark.asyncio
async def test_missing_sub_questions_are_completed_by_a_repair_call():
    repair = json.dumps(
        [
            {"text": "Identify the main bottleneck.", "explanation": "Slow queries", "marks": 3},
            {"text": "Propose one fix.", "explanation": "Add an index", "marks": 3},
            {"text": "Justify your fix.", "explanation": "Reduces scans", "marks": 4},
        ]
    )
    agent, gateway = _agent([(_scenario_only(), "stop"), (repair, "stop")])

    questions, _ = await agent.generate(**_kwargs(marks_per_question=10))

    [q] = questions
    assert gateway.complete.await_count == 2
    assert not q.hard_failure and len(q.options) == 3
    assert sum(int(o.match_key) for o in q.options) == 10  # marks add up to the question's marks
    assert all(o.is_correct for o in q.options)


@pytest.mark.asyncio
async def test_failed_repair_leaves_a_clear_failure():
    agent, _ = _agent([(_scenario_only(), "stop"), ("not json at all", "stop")])

    [q], _ = await agent.generate(**_kwargs())

    assert q.hard_failure and q.issues


@pytest.mark.asyncio
async def test_truncated_output_is_retried_with_a_bigger_budget():
    agent, gateway = _agent([(_scenario_only(), "length"), (_with_parts(), "stop")])

    [q], _ = await agent.generate(**_kwargs())

    first, second = gateway.seen_max_tokens
    assert second > first
    assert not q.hard_failure and len(q.options) == 2


@pytest.mark.asyncio
async def test_heavy_types_are_generated_a_few_per_call():
    agent, gateway = _agent([(_with_parts(), "stop")] * 3)

    questions, _ = await agent.generate(**_kwargs(count=5))

    # 5 case studies -> chunks of 2, 2, 1; each stub call returns one complete question
    assert gateway.complete.await_count == 3
    assert len(questions) == 3
