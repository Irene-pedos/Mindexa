from __future__ import annotations

import httpx

from app.core.exceptions import RateLimitError, ServiceUnavailableError

from .base_provider import (
    AICompletionRequest,
    AICompletionResponse,
    AIEmbeddingRequest,
    AIEmbeddingResponse,
    BaseProvider,
)


class GeminiProvider(BaseProvider):
    """Google Gemini chat provider using the OpenAI-compatible chat completions API."""

    name = "gemini"

    def __init__(
        self,
        api_key: str,
        default_model: str = "gemini-1.5-flash",
        base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai",
        timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = api_key
        self.default_model = default_model
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def complete(self, request: AICompletionRequest) -> AICompletionResponse:
        if not self.api_key:
            raise ServiceUnavailableError(
                "Gemini API key is not configured. Set GEMINI_API_KEY in your environment."
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
            detail = exc.response.text[:500]
            if exc.response.status_code == 429:
                raise RateLimitError(
                    f"Gemini rate limit exceeded: {detail}",
                    code="AI_PROVIDER_RATE_LIMITED",
                ) from exc
            raise ServiceUnavailableError(
                f"Gemini request failed with status {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ServiceUnavailableError(f"Gemini service is unavailable: {exc}") from exc

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
        """Gemini does not provide an embeddings API through the OpenAI compatibility endpoint in this context."""
        raise ServiceUnavailableError(
            "Gemini does not currently support embedding API in this provider. "
            "Configure OpenAI or Jina for embeddings."
        )

    async def health(self) -> bool:
        """Check if Gemini API is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return response.status_code == 200
        except Exception:
            return False
