import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.ai import gateway as gateway_module
from app.core.ai.gateway import AIGateway
from app.core.ai.providers import (
    AICompletionRequest,
    AICompletionResponse,
    AIMessage,
    BaseProvider,
)
from app.core.ai.token_budget import trim_rag_context
from app.core.config import settings
from app.core.exceptions import RateLimitError, ServiceUnavailableError


def _db():
    db = MagicMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    return db


def _request():
    return AICompletionRequest(
        messages=[AIMessage(role="user", content="hi")], temperature=0.2, max_tokens=10
    )


def _ok_provider():
    provider = MagicMock(spec=BaseProvider)
    provider.name = "groq"
    provider.default_model = "m"
    provider.complete = AsyncMock(
        return_value=AICompletionResponse(
            content="ok", provider="groq", model="m", finish_reason="stop",
            prompt_tokens=1, completion_tokens=1, total_tokens=2, raw={},
        )
    )
    return provider


def _used(monkeypatch, tokens):
    monkeypatch.setattr(
        gateway_module.AIUsageRepository,
        "completion_tokens_since",
        AsyncMock(return_value=tokens),
    )


@pytest.mark.asyncio
async def test_student_over_daily_budget_is_refused_before_calling_a_provider(monkeypatch):
    monkeypatch.setattr(settings, "AI_DAILY_TOKEN_BUDGET_STUDENT", 1_000)
    _used(monkeypatch, 1_000)
    provider = _ok_provider()
    gateway = AIGateway(_db(), [provider], [])

    with pytest.raises(RateLimitError) as exc_info:
        await gateway.complete(
            _request(), action_type="STUDY_SUPPORT", actor_id=uuid.uuid4(), actor_role="student"
        )

    assert exc_info.value.code == "ai_daily_budget_exceeded"
    provider.complete.assert_not_called()


@pytest.mark.asyncio
async def test_student_under_budget_is_served(monkeypatch):
    monkeypatch.setattr(settings, "AI_DAILY_TOKEN_BUDGET_STUDENT", 1_000)
    _used(monkeypatch, 999)
    gateway = AIGateway(_db(), [_ok_provider()], [])

    result = await gateway.complete(
        _request(), action_type="STUDY_SUPPORT", actor_id=uuid.uuid4(), actor_role="student"
    )

    assert result.content == "ok"


@pytest.mark.asyncio
@pytest.mark.parametrize("role,actor", [("admin", uuid.uuid4()), ("student", None)])
async def test_budget_does_not_apply_to_unbudgeted_roles_or_system_calls(monkeypatch, role, actor):
    monkeypatch.setattr(settings, "AI_DAILY_TOKEN_BUDGET_STUDENT", 1)
    _used(monkeypatch, 10**9)
    gateway = AIGateway(_db(), [_ok_provider()], [])

    result = await gateway.complete(
        _request(), action_type="STUDY_SUPPORT", actor_id=actor, actor_role=role
    )

    assert result.content == "ok"


@pytest.mark.asyncio
async def test_zero_budget_disables_the_limit(monkeypatch):
    monkeypatch.setattr(settings, "AI_DAILY_TOKEN_BUDGET_LECTURER", 0)
    _used(monkeypatch, 10**9)
    gateway = AIGateway(_db(), [_ok_provider()], [])

    result = await gateway.complete(
        _request(), action_type="GENERATE_RUBRIC", actor_id=uuid.uuid4(), actor_role="lecturer"
    )

    assert result.content == "ok"


@pytest.mark.asyncio
async def test_hung_provider_is_cut_off_by_the_overall_deadline(monkeypatch):
    monkeypatch.setattr(settings, "AI_TOTAL_TIMEOUT_SECONDS", 0.05)
    provider = MagicMock(spec=BaseProvider)
    provider.name = "slow"
    provider.default_model = "m"

    async def hang(_request):
        await asyncio.sleep(5)

    provider.complete = hang
    gateway = AIGateway(_db(), [provider], [])

    with pytest.raises(ServiceUnavailableError):
        await asyncio.wait_for(
            gateway.complete(_request(), action_type="STUDY_SUPPORT", actor_id=None, actor_role=None),
            timeout=10,  # only a safety net: the gateway's own 0.05s deadline must fire first
        )


def test_trim_rag_context_logs_without_crashing_when_it_trims():
    long_context = "word " * 20_000

    trimmed = trim_rag_context(long_context, max_tokens_budget=4_000, reserved_for_completion=500)

    assert 0 < len(trimmed) < len(long_context)


def test_trim_rag_context_logs_without_crashing_when_no_budget_is_left():
    assert trim_rag_context("some context", max_tokens_budget=1_000, reserved_for_completion=900) == ""
