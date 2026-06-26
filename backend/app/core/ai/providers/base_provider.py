from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Literal

from pydantic import BaseModel, Field


AIProviderName = Literal["groq", "openai", "anthropic", "jina", "gemini"]


class AIMessage(BaseModel):
    """Provider-neutral chat message."""

    role: Literal["system", "user", "assistant"]
    content: str = Field(..., min_length=1)

    model_config = {"str_strip_whitespace": True}


class AICompletionRequest(BaseModel):
    """Provider-neutral chat completion request."""

    messages: list[AIMessage] = Field(..., min_length=1)
    model: str | None = None
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tokens: int = Field(default=800, ge=1, le=8192)


class AICompletionResponse(BaseModel):
    """Provider-neutral chat completion response."""

    content: str
    provider: AIProviderName
    model: str
    finish_reason: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    raw: dict | None = None


class AIEmbeddingRequest(BaseModel):
    """Provider-neutral embedding request."""

    input: str | list[str]
    model: str | None = None


class AIEmbeddingResponse(BaseModel):
    """Provider-neutral embedding response."""

    embeddings: list[list[float]]
    provider: AIProviderName
    model: str
    total_tokens: int | None = None
    raw: dict | None = None


class BaseProvider(ABC):
    """Base contract all Mindexa AI providers must implement."""

    name: AIProviderName
    default_model: str

    @abstractmethod
    async def complete(self, request: AICompletionRequest) -> AICompletionResponse:
        """Run a chat completion through the configured provider."""

    @abstractmethod
    async def embed(self, request: AIEmbeddingRequest) -> AIEmbeddingResponse:
        """Generate embeddings for the given input."""

    @abstractmethod
    async def health(self) -> bool:
        """Check if the provider API is reachable and healthy."""
