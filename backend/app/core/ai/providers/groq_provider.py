from __future__ import annotations

import httpx

from app.core.exceptions import RateLimitError, ServiceUnavailableError

from .base_provider import AICompletionRequest, AICompletionResponse, AIEmbeddingRequest, AIEmbeddingResponse, BaseProvider


class GroqProvider(BaseProvider):
    """Groq chat provider using the OpenAI-compatible chat completions API."""

    name = "groq"

    def __init__(
        self,
        api_key: str,
        default_model: str,
        base_url: str = "https://api.groq.com/openai/v1",
        timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = api_key
        self.default_model = default_model
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def complete(self, request: AICompletionRequest) -> AICompletionResponse:
        if not self.api_key:
            raise ServiceUnavailableError(
                "Groq API key is not configured. Set GROQ_API_KEY in your environment."
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
                # Groq always returns a `retry-after` header with the exact
                # seconds to wait.  Forward it so the gateway's backoff logic
                # can use the precise value instead of guessing.
                retry_after = exc.response.headers.get("retry-after", "")
                raise RateLimitError(
                    f"Groq rate limit exceeded: {detail}",
                    code="AI_PROVIDER_RATE_LIMITED",
                    retry_after=float(retry_after) if retry_after else None,
                ) from exc
            raise ServiceUnavailableError(
                f"Groq request failed with status {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ServiceUnavailableError(f"Groq service is unavailable: {exc}") from exc

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
        """Groq does not provide an embeddings API."""
        raise ServiceUnavailableError(
            "Groq does not currently provide an embeddings API. "
            "Configure OpenAI or another embedding provider."
        )

    async def health(self) -> bool:
        """Check if Groq API is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return response.status_code == 200
        except Exception:
            return False
