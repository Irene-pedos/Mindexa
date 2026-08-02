from __future__ import annotations

import httpx
from app.core.config import settings
from app.core.exceptions import RateLimitError, ServiceUnavailableError
from app.core.logging import get_logger

from .base_provider import (AICompletionRequest, AICompletionResponse,
                            AIEmbeddingRequest, AIEmbeddingResponse,
                            BaseProvider)


class JinaProvider(BaseProvider):
    """Jina AI provider implementation."""

    def __init__(
        self,
        api_key: str,
        default_model: str = "jina-embeddings-v3",
        base_url: str = "https://api.jina.ai/v1",
        timeout_seconds: float = 30.0,
    ) -> None:
        self.name = "jina"
        self.api_key = api_key
        self.default_model = default_model
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds

    async def complete(self, request: AICompletionRequest) -> AICompletionResponse:
        """Jina does not currently provide a chat completion API in this implementation."""
        raise ServiceUnavailableError(
            "JinaProvider does not support chat completions. Use Groq or OpenAI for chat."
        )

    async def embed(self, request: AIEmbeddingRequest) -> AIEmbeddingResponse:
        """Generate embeddings using the Jina embeddings API."""
        if not self.api_key:
            raise ServiceUnavailableError(
                "Jina API key is not configured. Set JINA_API_KEY for embeddings."
            )

        model = request.model or self.default_model

        # Jina expects a list of strings
        inputs = request.input if isinstance(request.input, list) else [request.input]

        # Target dimension matching resource_chunks pgvector column
        target_dim = settings.PGVECTOR_DIMENSION
        jina_dim = settings.PGVECTOR_DIMENSION

        payload = {
            "model": model,
            "input": inputs,
            "task": "retrieval.query" if len(inputs) == 1 else "retrieval.passage",
            "dimensions": jina_dim,
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/embeddings",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                raise RateLimitError(
                    "Jina rate limit exceeded for embeddings.",
                    code="AI_PROVIDER_RATE_LIMITED",
                ) from exc
            raise ServiceUnavailableError(f"Jina embedding request failed with status {exc.response.status_code}: {exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise ServiceUnavailableError(f"Jina embedding service is unavailable: {exc}") from exc

        data = response.json()
        raw_embeddings = [item["embedding"] for item in data.get("data", [])]

        # Ensure returned embeddings match target PGVECTOR_DIMENSION
        embeddings = []
        padded_or_truncated = False
        for emb in raw_embeddings:
            if len(emb) != target_dim and not padded_or_truncated:
                logger.warning(
                    "Jina embedding dimension mismatch detected",
                    provider=self.name,
                    model=model,
                    original_dimension=len(emb),
                    target_dimension=target_dim,
                )
                padded_or_truncated = True
            if len(emb) < target_dim:
                emb = emb + [0.0] * (target_dim - len(emb))
            elif len(emb) > target_dim:
                emb = emb[:target_dim]
            embeddings.append(emb)

        usage = data.get("usage") or {}

        return AIEmbeddingResponse(
            embeddings=embeddings,
            provider=self.name,
            model=data.get("model") or model,
            total_tokens=usage.get("total_tokens"),
            raw=data,
        )

    async def health(self) -> bool:
        """Check if Jina API is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Jina has a simple heartbeat or models endpoint
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return response.status_code == 200
        except Exception:
            return False
