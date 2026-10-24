"""
tests/integration/test_question_ai_routes.py

The question-authoring AI routes are lecturer-only and validate their input; they must be in
the AI rate-limit tier (the old table listed a path that did not match the router).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.constants import UserRole
from app.middleware.rate_limit import _resolve_tier  # type: ignore[attr-defined]

BODY = {
    "question": {"type": "mcq", "text": "What does HTML stand for?", "marks": 1},
    "action": "complete_missing",
}


def _headers(make_auth_headers, role: UserRole):
    return make_auth_headers(role=role)


@pytest.mark.asyncio
async def test_students_cannot_use_the_authoring_assistant(client: AsyncClient, make_auth_headers):
    resp = await client.post(
        "/api/v1/lecturers/ai/questions/enhance", json=BODY, headers=_headers(make_auth_headers, UserRole.STUDENT)
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_unknown_action_is_rejected_before_any_ai_call(client: AsyncClient, make_auth_headers):
    resp = await client.post(
        "/api/v1/lecturers/ai/questions/enhance",
        json={**BODY, "action": "write_my_exam"},
        headers=_headers(make_auth_headers, UserRole.LECTURER),
    )
    assert resp.status_code in (401, 403, 422)


def test_lecturer_ai_routes_use_the_ai_rate_limit_tier():
    assert _resolve_tier("/api/v1/lecturers/ai/questions/enhance") == "ai_heavy"
    assert _resolve_tier("/api/v1/lecturers/ai/questions/review") == "ai_heavy"
