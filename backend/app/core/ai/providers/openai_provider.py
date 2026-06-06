from __future__ import annotations

import httpx

from app.core.exceptions import RateLimitError, ServiceUnavailableError

from .base_provider import AICompletionRequest, AICompletionResponse, BaseProvider


class OpenAIProvider(BaseProvider):
    """OpenAI chat provider behind the same BaseProvider contract."""

    name = "openai"

    def __init__(
        self,
        api_key: str,
        default_model: str,
        base_url: str = "https://api.openai.com/v1",
        timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = api_key
        self.default_model = default_model
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def complete(self, request: AICompletionRequest) -> AICompletionResponse:
        if not self.api_key:
            raise ServiceUnavailableError(
                "OpenAI API key is not configured. Set OPENAI_API_KEY in your environment."
            )

        model = request.model or self.default_model
        payload = {
            "model": model,
            "messages": [message.model_dump() for message in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                raise RateLimitError(
                    "OpenAI rate limit exceeded.",
                    code="AI_PROVIDER_RATE_LIMITED",
                ) from exc
            raise ServiceUnavailableError(f"OpenAI service is unavailable: {exc}") from exc
        except httpx.HTTPError as exc:
            raise ServiceUnavailableError(f"OpenAI service is unavailable: {exc}") from exc

        data = response.json()
        choice = data.get("choices", [{}])[0]
        usage = data.get("usage") or {}
        return AICompletionResponse(
            content=(choice.get("message") or {}).get("content", ""),
            provider=self.name,
            model=data.get("model") or model,
            finish_reason=choice.get("finish_reason"),
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
            raw=data,
        )

    async def embed(self, request: AIEmbeddingRequest) -> AIEmbeddingResponse:
        """Generate embeddings using the OpenAI embeddings API."""
        if not self.api_key:
            raise ServiceUnavailableError(
                "OpenAI API key is not configured. Set OPENAI_API_KEY for embeddings."
            )

        model = request.model or self.default_model
        payload = {
            "model": model,
            "input": request.input,
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
                    "OpenAI rate limit exceeded for embeddings.",
                    code="AI_PROVIDER_RATE_LIMITED",
                ) from exc
            raise ServiceUnavailableError(f"OpenAI embedding request failed: {exc}") from exc
        except httpx.HTTPError as exc:
            raise ServiceUnavailableError(f"OpenAI embedding service is unavailable: {exc}") from exc

        data = response.json()
        embeddings = [item["embedding"] for item in data.get("data", [])]
        usage = data.get("usage") or {}
        
        return AIEmbeddingResponse(
            embeddings=embeddings,
            provider=self.name,
            model=data.get("model") or model,
            total_tokens=usage.get("total_tokens"),
            raw=data,
        )

    async def health(self) -> bool:
        """Check if OpenAI API is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return response.status_code == 200
        except Exception:
            return False
