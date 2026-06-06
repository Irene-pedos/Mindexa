from __future__ import annotations

from app.core.ai.provider_factory import get_ai_provider
from app.core.ai.providers import AnthropicProvider, GroqProvider, OpenAIProvider
from app.core.config import settings


def test_provider_factory_defaults_to_groq(monkeypatch) -> None:
    monkeypatch.setattr(settings, "DEFAULT_LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "test-key")

    provider = get_ai_provider()

    assert isinstance(provider, GroqProvider)
    assert provider.default_model == settings.GROQ_DEFAULT_MODEL


def test_provider_factory_can_select_future_providers(monkeypatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")

    assert isinstance(get_ai_provider("openai"), OpenAIProvider)
    assert isinstance(get_ai_provider("anthropic"), AnthropicProvider)
