"""
app/schemas/gemini.py

Pydantic schemas for the Gemini Chat domain.
"""

from pydantic import BaseModel, Field


# ─── Chat Request ─────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    """A single message in a multi-turn conversation history."""

    role: str = Field(..., description="Either 'user' or 'model'")
    content: str = Field(..., min_length=1, description="Message text")

    model_config = {"str_strip_whitespace": True}


class GeminiChatRequest(BaseModel):
    """
    Request body for the Gemini chat endpoint.

    Fields:
        message        — The current user message (required).
        system_prompt  — Optional system-level instructions prepended to the conversation.
        history        — Optional prior turns for multi-turn context.
    """

    message: str = Field(
        ...,
        min_length=1,
        max_length=8_000,
        description="The user's current message.",
    )
    system_prompt: str | None = Field(
        default=None,
        max_length=4_000,
        description="Optional system-level instruction for the model.",
    )
    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=20,
        description="Prior conversation turns for multi-turn context (max 20 turns).",
    )

    model_config = {"str_strip_whitespace": True}


# ─── Chat Response ────────────────────────────────────────────────────────────


class GeminiChatResponse(BaseModel):
    """
    Structured response from the Gemini chat endpoint.

    Fields:
        reply         — The model's text reply.
        model         — The Gemini model that produced this response.
        finish_reason — Why generation stopped (e.g. 'STOP', 'MAX_TOKENS').
    """

    reply: str
    model: str
    finish_reason: str | None = None
