"""
tests/integration/test_rate_limit_identity.py

Rate limits count the signed-in USER, not the IP: a lab or exam hall shares one campus address,
and an IP key would let a single class exhaust everyone's budget. Before this the default tier
never applied at all (a "/" prefix entry exempted every path).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from starlette.requests import Request

from app.core.config import settings
from app.core.constants import UserRole
from app.middleware.rate_limit import _client_identity, _resolve_tier


def _request(auth: str | None = None, ip: str = "10.20.30.40") -> Request:
    headers = [(b"authorization", auth.encode())] if auth else []
    return Request({"type": "http", "method": "GET", "path": "/x", "headers": headers, "client": (ip, 5000)})


@pytest.mark.parametrize(
    "path, tier",
    [
        ("/api/v1/assessments", "default"),
        ("/api/v1/lecturers/me/dashboard", "default"),
        ("/api/v1/auth/login", "login"),
        ("/api/v1/attempts/123/submit", "high_volume"),
        ("/api/v1/integrity/event", "high_volume"),
        ("/api/v1/grading/queue", "high_volume"),
        ("/api/v1/grading/grade-attempt", "ai_heavy"),  # AI grading stays in the strict tier
        ("/api/v1/lecturers/ai/questions/enhance", "ai_heavy"),
        ("/api/v1/students/study-plans/sessions/1/guided/ask", "ai_heavy"),
        ("/api/v1/students/study-plans/sessions/1/guided", "default"),  # plain read, no model call
        ("/api/v1/grading/response/1/draft-feedback", "ai_heavy"),
        ("/health", "exempt"),
        ("/docs", "exempt"),
        ("/", "exempt"),
    ],
)
def test_tier_resolution(path: str, tier: str):
    assert _resolve_tier(path) == tier


def test_signed_in_callers_are_counted_per_user_not_per_ip(make_auth_headers):
    alice = make_auth_headers(user_id=str(uuid.uuid4()), role=UserRole.STUDENT)["Authorization"]
    bob = make_auth_headers(user_id=str(uuid.uuid4()), role=UserRole.STUDENT)["Authorization"]

    a = _client_identity(_request(alice), "default")
    b = _client_identity(_request(bob), "default")

    assert a.startswith("user:") and b.startswith("user:")
    assert a != b  # same campus address, separate budgets


def test_bad_or_missing_token_falls_back_to_the_address():
    assert _client_identity(_request(), "default") == "ip:10.20.30.40"
    assert _client_identity(_request("Bearer not-a-real-token"), "default") == "ip:10.20.30.40"


def test_login_tier_is_always_counted_by_address(make_auth_headers):
    token = make_auth_headers(user_id=str(uuid.uuid4()), role=UserRole.STUDENT)["Authorization"]
    assert _client_identity(_request(token), "login") == "ip:10.20.30.40"


@pytest.mark.asyncio
async def test_one_user_hitting_the_limit_does_not_throttle_a_classmate(
    client: AsyncClient, make_auth_headers, monkeypatch
):
    monkeypatch.setattr(settings, "RATE_LIMIT_DEFAULT_PER_MINUTE", 3)
    alice = make_auth_headers(user_id=str(uuid.uuid4()), role=UserRole.STUDENT)
    bob = make_auth_headers(user_id=str(uuid.uuid4()), role=UserRole.STUDENT)

    alice_codes = [(await client.get("/api/v1/notifications/me", headers=alice)).status_code for _ in range(5)]
    bob_code = (await client.get("/api/v1/notifications/me", headers=bob)).status_code

    assert alice_codes[:3].count(429) == 0
    assert alice_codes[3] == 429 and alice_codes[4] == 429
    assert bob_code != 429  # same IP in the test client, different user
