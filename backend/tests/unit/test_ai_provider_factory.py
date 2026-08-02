from __future__ import annotations

from app.core.ai.provider_factory import get_ai_provider
from app.core.ai.providers import (AnthropicProvider, GroqProvider,
                                   OpenAIProvider)
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


from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_jina_provider_targets_pgvector_dimension(monkeypatch) -> None:
    from app.core.ai.providers import JinaProvider
    from app.core.ai.providers.base_provider import AIEmbeddingRequest

    provider = JinaProvider(api_key="test-key")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": [{"embedding": [0.1] * settings.PGVECTOR_DIMENSION}],
        "model": "jina-embeddings-v3",
        "usage": {"total_tokens": 10},
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        res = await provider.embed(AIEmbeddingRequest(input="test query"))

        # Verify posted payload dimensions matches resource_chunks Vector(settings.PGVECTOR_DIMENSION)
        posted_json = mock_post.call_args.kwargs["json"]
        assert posted_json["dimensions"] == settings.PGVECTOR_DIMENSION
        assert len(res.embeddings[0]) == settings.PGVECTOR_DIMENSION
