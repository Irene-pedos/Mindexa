from __future__ import annotations

import httpx

from app.core.exceptions import RateLimitError, ServiceUnavailableError

from .base_provider import AICompletionRequest, AICompletionResponse, BaseProvider


class AnthropicProvider(BaseProvider):
    """Anthropic chat provider behind the same BaseProvider contract."""

    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        default_model: str,
        base_url: str = "https://api.anthropic.com/v1",
        timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = api_key
        self.default_model = default_model
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def complete(self, request: AICompletionRequest) -> AICompletionResponse:
        if not self.api_key:
            raise ServiceUnavailableError(
                "Anthropic API key is not configured. Set ANTHROPIC_API_KEY in your environment."
            )

        model = request.model or self.default_model
        system_prompt = "\n\n".join(
            message.content for message in request.messages if message.role == "system"
        )
        messages = [
            message.model_dump()
            for message in request.messages
            if message.role in {"user", "assistant"}
        ]
        payload = {
            "model": model,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        if system_prompt:
            payload["system"] = system_prompt

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/messages",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                raise RateLimitError(
                    "Anthropic rate limit exceeded.",
                    code="AI_PROVIDER_RATE_LIMITED",
                ) from exc
            raise ServiceUnavailableError(f"Anthropic service is unavailable: {exc}") from exc
        except httpx.HTTPError as exc:
            raise ServiceUnavailableError(f"Anthropic service is unavailable: {exc}") from exc

        data = response.json()
        usage = data.get("usage") or {}
        content_blocks = data.get("content") or []
        text = "\n".join(
            block.get("text", "") for block in content_blocks if block.get("type") == "text"
        )
        return AICompletionResponse(
            content=text,
            provider=self.name,
            model=data.get("model") or model,
            finish_reason=data.get("stop_reason"),
            prompt_tokens=usage.get("input_tokens"),
            completion_tokens=usage.get("output_tokens"),
            total_tokens=(
                usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
                if usage
                else None
            ),
            raw=data,
        )

    async def embed(self, request: AIEmbeddingRequest) -> AIEmbeddingResponse:
        """Anthropic does not provide an embeddings API."""
        raise ServiceUnavailableError(
            "Anthropic does not currently provide an embeddings API. "
            "Configure OpenAI or another embedding provider."
        )

    async def health(self) -> bool:
        """Check if Anthropic API is reachable."""
        # Anthropic doesn't have a /models endpoint, so we can do a dummy request
        # or just ping the base URL. A dummy request is safer.
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    f"{self.base_url}/messages",
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    json={
                        "model": self.default_model,
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 1,
                    }
                )
                return response.status_code in [200, 400] # 400 might happen if payload is wrong, but it means API is up
        except Exception:
            return False
