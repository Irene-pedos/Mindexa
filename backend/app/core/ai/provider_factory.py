from __future__ import annotations

from app.core.config import settings
from app.core.exceptions import ValidationError

from .providers import AnthropicProvider, BaseProvider, GroqProvider, JinaProvider, OpenAIProvider


def get_ai_providers() -> list[BaseProvider]:
    """Build the configured chat provider and any fallbacks."""
    primary_name = settings.DEFAULT_LLM_PROVIDER
    # In a real setup, we might have FALLBACK_LLM_PROVIDER in settings
    providers = [_create_provider(primary_name)]
    return providers


def get_embedding_providers() -> list[BaseProvider]:
    """Build the configured embedding provider and any fallbacks."""
    primary_name = settings.DEFAULT_EMBEDDING_PROVIDER
    providers = [_create_provider(primary_name)]
    return providers


def get_ai_provider(provider_name: str | None = None) -> BaseProvider:
    """Build the configured chat provider (legacy/single provider entrypoint)."""
    selected = provider_name or settings.DEFAULT_LLM_PROVIDER
    return _create_provider(selected)


def get_embedding_provider(provider_name: str | None = None) -> BaseProvider:
    """Build the configured embedding provider (legacy/single provider entrypoint)."""
    selected = provider_name or settings.DEFAULT_EMBEDDING_PROVIDER
    return _create_provider(selected)


def _create_provider(name: str) -> BaseProvider:
    """Internal helper to instantiate providers."""

    if name == "groq":
        return GroqProvider(
            api_key=settings.GROQ_API_KEY,
            default_model=settings.GROQ_DEFAULT_MODEL or settings.DEFAULT_LLM_MODEL,
            base_url=settings.GROQ_BASE_URL,
            timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS,
        )
    if name == "openai":
        return OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            default_model=settings.OPENAI_DEFAULT_MODEL,
            timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS,
        )
    if name == "anthropic":
        return AnthropicProvider(
            api_key=settings.ANTHROPIC_API_KEY,
            default_model=settings.ANTHROPIC_DEFAULT_MODEL,
            timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS,
        )
    if name == "jina":
        return JinaProvider(
            api_key=settings.JINA_API_KEY,
            default_model=settings.JINA_DEFAULT_MODEL,
            base_url=settings.JINA_BASE_URL,
            timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS,
        )

    raise ValidationError(
        f"Unsupported AI provider '{name}'.",
        code="UNSUPPORTED_AI_PROVIDER",
    )
