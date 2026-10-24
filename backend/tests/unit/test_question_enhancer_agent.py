"""
tests/unit/test_question_enhancer_agent.py

The "improve this question" and "review my paper" helpers return proposals the lecturer can
accept or discard; they must keep case-study marks consistent, report what is still missing,
and map review findings back to the right question.
"""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agents.question_enhancer_agent import QuestionEnhancerAgent
from app.schemas.question_ai import (
    BlueprintSectionSummary,
    QuestionSnapshot,
    SnapshotOption,
)


def _agent(reply: dict) -> QuestionEnhancerAgent:
    gateway = MagicMock()
    gateway.complete = AsyncMock(return_value=SimpleNamespace(content=json.dumps(reply), finish_reason="stop"))
    return QuestionEnhancerAgent(gateway)


@pytest.mark.asyncio
async def test_add_sub_questions_balances_marks_and_reports_nothing_missing():
    reply = {
        "question": {
            "text": "Analyse the scenario.",
            "case_study_context": "A shop's website is slow.",
            "options": [
                {"text": "Find the bottleneck.", "explanation": "Queries", "is_correct": False, "match_key": "9"},
                {"text": "Propose a fix.", "explanation": "Index", "is_correct": False, "match_key": "9"},
                {"text": "Justify it.", "explanation": "Fewer scans", "is_correct": False, "match_key": "9"},
            ],
        },
        "summary": "Added three sub-questions.",
        "changes": ["Added 3 sub-questions"],
    }
    q = QuestionSnapshot(type="casestudy", text="Analyse the scenario.", marks=10, case_study_context="A shop's website is slow.")

    result = await _agent(reply).enhance(
        lecturer_id=uuid.uuid4(), question=q, action="add_sub_questions", instructions=None, subject="Web", topic="Perf"
    )

    marks = [int(o.match_key) for o in result.question.options]
    assert sum(marks) == 10 and marks == [4, 3, 3]  # remainder goes to the first parts
    assert all(o.is_correct for o in result.question.options)
    assert result.remaining_issues == []
    assert result.changes == ["Added 3 sub-questions"]
    assert q.options == []  # the original snapshot is not mutated


@pytest.mark.asyncio
async def test_still_incomplete_result_lists_what_is_missing():
    reply = {"question": {"text": "What is HTML?", "options": []}, "summary": "No change possible."}
    q = QuestionSnapshot(type="mcq", text="What is HTML?", marks=1)

    result = await _agent(reply).enhance(
        lecturer_id=uuid.uuid4(), question=q, action="complete_missing", instructions=None, subject=None, topic=None
    )

    assert result.remaining_issues  # e.g. fewer than 2 options: the UI must not call this "done"


@pytest.mark.asyncio
async def test_open_ended_explanation_is_filled_in():
    reply = {"question": {"text": "Define closure.", "options": [], "explanation": "A function bundled with its scope."}}
    q = QuestionSnapshot(type="shortanswer", text="Define closure.", marks=2)

    result = await _agent(reply).enhance(
        lecturer_id=uuid.uuid4(), question=q, action="add_explanation", instructions=None, subject=None, topic=None
    )

    assert result.question.explanation == "A function bundled with its scope."
    assert result.remaining_issues == []


@pytest.mark.asyncio
async def test_review_findings_are_mapped_to_question_ids():
    reply = {
        "summary": "Coverage gap in Section B.",
        "findings": [
            {"severity": "warning", "code": "TOPIC_GAP", "message": "No question covers CSS grid.", "question": None, "section": "B"},
            {"severity": "suggestion", "code": "AMBIGUOUS", "message": "Q2 has two defensible answers.", "question": 2},
            {"severity": "suggestion", "code": "OUT_OF_RANGE", "message": "Bad reference.", "question": 99},
        ],
    }
    questions = [
        QuestionSnapshot(id="q-a", type="mcq", text="One", options=[SnapshotOption(text="x", is_correct=True)]),
        QuestionSnapshot(id="q-b", type="mcq", text="Two", options=[SnapshotOption(text="y", is_correct=True)]),
    ]

    result = await _agent(reply).review_paper(
        lecturer_id=uuid.uuid4(),
        questions=questions,
        blueprint=[BlueprintSectionSummary(section="B", expected_questions=3, expected_marks=30)],
        assessment_type="SUMMATIVE",
        policy_total=100,
        subject="Web",
    )

    by_code = {f.code: f for f in result.findings}
    assert by_code["TOPIC_GAP"].severity == "warning" and by_code["TOPIC_GAP"].question_id is None
    assert by_code["AMBIGUOUS"].question_id == "q-b"
    assert by_code["OUT_OF_RANGE"].question_id is None  # invalid references are dropped, not guessed


def _sequence_agent(contents: list[str]):
    queue = [SimpleNamespace(content=c, finish_reason="stop") for c in contents]
    gateway = MagicMock()
    gateway.complete = AsyncMock(side_effect=lambda *a, **k: queue.pop(0))
    return QuestionEnhancerAgent(gateway), gateway


@pytest.mark.asyncio
async def test_bare_array_reply_is_retried_once_and_then_succeeds():
    """Seen live: for a question containing code the model replied with a JSON array of code
    lines, which failed validation and surfaced as a raw 422."""
    bad = json.dumps(["let count = 0;", "do { count++; } while (count < 3);"])
    good = json.dumps({"question": {"text": "Trace the loop and state the final value of count.", "options": []}, "summary": "Made harder."})
    agent, gateway = _sequence_agent([bad, good])
    q = QuestionSnapshot(type="shortanswer", text="What does the loop print?", marks=2)

    result = await agent.enhance(
        lecturer_id=uuid.uuid4(), question=q, action="make_harder", instructions=None, subject=None, topic=None
    )

    assert gateway.complete.await_count == 2
    assert result.question.text.startswith("Trace the loop")
    retry_request = gateway.complete.await_args_list[1].args[0]
    assert "not a single valid JSON object" in retry_request.messages[-1].content


@pytest.mark.asyncio
async def test_two_unreadable_replies_give_a_plain_message_not_a_validation_dump():
    from app.core.exceptions import ValidationError

    agent, gateway = _sequence_agent(['["x"]', '["y"]'])
    q = QuestionSnapshot(type="mcq", text="Pick one.", marks=1)

    with pytest.raises(ValidationError) as exc:
        await agent.enhance(
            lecturer_id=uuid.uuid4(), question=q, action="make_harder", instructions=None, subject=None, topic=None
        )

    assert gateway.complete.await_count == 2
    assert "pydantic" not in str(exc.value).lower() and "validation error for" not in str(exc.value)
    assert "try again" in str(exc.value).lower()