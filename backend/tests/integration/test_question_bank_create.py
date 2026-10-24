"""
tests/integration/test_question_bank_create.py

Saving a question to the bank must keep everything that defines it. Matching pairs lost their
right-hand side and case studies lost their scenario and per-part marks; MCQ / true-false
validation compared lowercase request types with uppercase enum values and never ran.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.constants import UserRole
from tests.integration.test_moderation_and_calculation_guards import (
    TestModerationAndCalculationGuards as _GuardsSetup,
)


def _headers(make_auth_headers, user):
    return make_auth_headers(user_id=str(user.id), role=UserRole.LECTURER, email=user.email)


async def _lecturer(db):
    return (await _GuardsSetup()._setup_data(db))["lecturer"]


def _opt(text: str, **kw):
    return {"option_text": text, "order_index": kw.pop("order_index", 0), **kw}


@pytest.mark.asyncio
async def test_case_study_keeps_scenario_part_marks_and_guidance(client: AsyncClient, db, make_auth_headers):
    user = await _lecturer(db)
    body = {
        "content": "Analyze the following case scenario and answer the sub-questions below.",
        "question_type": "case_study",
        "case_study_context": "Kigali Fresh's web shop is slow during sales.",
        "difficulty": "hard",
        "suggested_marks": 10,
        "options": [
            _opt("Find the bottleneck.", is_correct=True, match_key="4", option_text_right="Slow queries", order_index=0),
            _opt("Propose a fix.", is_correct=True, match_key="6", option_text_right="Add an index", order_index=1),
        ],
    }

    resp = await client.post("/api/v1/questions", json=body, headers=_headers(make_auth_headers, user))
    assert resp.status_code in (200, 201), resp.text

    got = await client.get(f"/api/v1/questions/{resp.json()['id']}", headers=_headers(make_auth_headers, user))
    data = got.json()
    assert data["case_study_context"] == "Kigali Fresh's web shop is slow during sales."
    assert data["difficulty"].lower() == "hard"
    parts = sorted(data["options"], key=lambda o: o["order_index"])
    assert [p["match_key"] for p in parts] == ["4", "6"]
    assert [p["option_text_right"] for p in parts] == ["Slow queries", "Add an index"]


@pytest.mark.asyncio
async def test_case_study_without_scenario_or_parts_is_rejected(client: AsyncClient, db, make_auth_headers):
    user = await _lecturer(db)
    base = {"content": "Analyze the case.", "question_type": "case_study", "suggested_marks": 10}

    no_parts = await client.post(
        "/api/v1/questions",
        json={**base, "case_study_context": "A scenario.", "options": [_opt("Only one part", is_correct=True)]},
        headers=_headers(make_auth_headers, user),
    )
    no_scenario = await client.post(
        "/api/v1/questions",
        json={**base, "options": [_opt("A", is_correct=True), _opt("B", is_correct=True, order_index=1)]},
        headers=_headers(make_auth_headers, user),
    )

    assert no_parts.status_code == 409 and no_scenario.status_code == 409


@pytest.mark.asyncio
async def test_matching_keeps_the_right_hand_side(client: AsyncClient, db, make_auth_headers):
    user = await _lecturer(db)
    body = {
        "content": "Match each technology to its role.",
        "question_type": "matching",
        "suggested_marks": 4,
        "options": [
            _opt("HTML", is_correct=True, option_text_right="Structure", order_index=0),
            _opt("CSS", is_correct=True, option_text_right="Style", order_index=1),
        ],
    }

    resp = await client.post("/api/v1/questions", json=body, headers=_headers(make_auth_headers, user))
    assert resp.status_code in (200, 201), resp.text

    got = await client.get(f"/api/v1/questions/{resp.json()['id']}", headers=_headers(make_auth_headers, user))
    rights = sorted(o["option_text_right"] for o in got.json()["options"])
    assert rights == ["Structure", "Style"]


@pytest.mark.asyncio
async def test_mcq_without_a_correct_option_is_rejected(client: AsyncClient, db, make_auth_headers):
    user = await _lecturer(db)
    body = {
        "content": "What does HTML stand for?",
        "question_type": "mcq",
        "suggested_marks": 1,
        "options": [_opt("A", is_correct=False), _opt("B", is_correct=False, order_index=1)],
    }

    resp = await client.post("/api/v1/questions", json=body, headers=_headers(make_auth_headers, user))

    assert resp.status_code == 409, resp.text
