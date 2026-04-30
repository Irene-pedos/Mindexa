"""
app/services/gemini_service.py

Gemini Chat Service for Mindexa Platform.

Responsibilities:
    - chat()  — Send a message (with optional history/system prompt) to Gemini
                and return a structured GeminiChatResponse.

DESIGN NOTES:
    - Uses the google-generativeai SDK (synchronous).
    - Runs SDK calls in asyncio.to_thread() so the FastAPI event loop is never blocked.
    - The client is configured once at __init__ time; the SDK caches the config
      module-wide, so multiple service instances are safe.
    - A missing or empty GEMINI_API_KEY raises a descriptive ServiceUnavailableError
      at call time (not at startup) so the API still boots without the key.

USAGE:
    svc = GeminiService()
    response = await svc.chat(message="Hello!", system_prompt="You are a study assistant.")
"""

import asyncio
from typing import Any

import structlog

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError, ValidationError
from app.schemas.gemini import ChatMessage, GeminiChatResponse

logger = structlog.get_logger("mindexa.gemini_service")


class GeminiService:
    """
    Thin async wrapper around the google-generativeai SDK.

    No DB dependency — this service does not touch the database.
    Instantiate per-request (lightweight; config is module-level in the SDK).
    """

    def __init__(self) -> None:
        self._api_key: str = settings.GEMINI_API_KEY
        self._model_name: str = settings.GEMINI_DEFAULT_MODEL

    # ─── Public API ───────────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        system_prompt: str | None = None,
        history: list[ChatMessage] | None = None,
    ) -> GeminiChatResponse:
        """
        Send a message to Gemini and return a structured response.

        Args:
            message:       The current user message.
            system_prompt: Optional system instruction injected at the start.
            history:       Prior turns for multi-turn conversation context.

        Returns:
            GeminiChatResponse with reply text, model name, and finish reason.

        Raises:
            ServiceUnavailableError: GEMINI_API_KEY is not configured.
            ValidationError:         Gemini rejected the request (e.g. safety block).
            ServiceUnavailableError: Any other SDK / network error.
        """
        if not self._api_key:
            raise ServiceUnavailableError(
                "Gemini API key is not configured. "
                "Set GEMINI_API_KEY in your environment or .env file."
            )

        logger.info(
            "gemini_chat_request",
            model=self._model_name,
            history_turns=len(history or []),
            has_system_prompt=system_prompt is not None,
        )

        try:
            response = await asyncio.to_thread(
                self._call_gemini_sync,
                message=message,
                system_prompt=system_prompt,
                history=history or [],
            )
        except ValueError as exc:
            # SDK raises ValueError for blocked / safety-filtered content
            logger.warning("gemini_content_blocked", reason=str(exc))
            raise ValidationError(
                f"Gemini refused to generate a response: {exc}",
                code="GEMINI_CONTENT_BLOCKED",
            ) from exc
        except Exception as exc:
            logger.error("gemini_call_failed", error=str(exc))
            raise ServiceUnavailableError(
                f"Gemini service is currently unavailable: {exc}"
            ) from exc

        return response

    # ─── Internal sync helper (runs in thread pool) ───────────────────────────

    def _call_gemini_sync(
        self,
        message: str,
        system_prompt: str | None,
        history: list[ChatMessage],
    ) -> GeminiChatResponse:
        """
        Synchronous Gemini SDK call — executed inside asyncio.to_thread().

        Builds the conversation in the format Gemini expects:
            [{"role": "user"|"model", "parts": ["text"]}]
        """
        import google.generativeai as genai  # noqa: PLC0415

        genai.configure(api_key=self._api_key)

        # Build generation config
        generation_config: dict[str, Any] = {
            "temperature": 0.7,
            "top_p": 0.95,
            "max_output_tokens": 2048,
        }

        # Initialise model — system_instruction is supported from gemini-1.5+
        model_kwargs: dict[str, Any] = {
            "model_name": self._model_name,
            "generation_config": generation_config,
        }
        if system_prompt:
            model_kwargs["system_instruction"] = system_prompt

        model = genai.GenerativeModel(**model_kwargs)

        # Build history in SDK format
        sdk_history = [
            {
                "role": turn.role,        # "user" or "model"
                "parts": [turn.content],
            }
            for turn in history
        ]

        # Start a chat session with prior history, then send the new message
        chat_session = model.start_chat(history=sdk_history)
        result = chat_session.send_message(message)

        # Extract finish reason safely
        finish_reason: str | None = None
        try:
            candidate = result.candidates[0]
            finish_reason = str(candidate.finish_reason.name)
        except (AttributeError, IndexError):
            pass

        logger.info(
            "gemini_chat_response",
            model=self._model_name,
            finish_reason=finish_reason,
            reply_length=len(result.text),
        )

        return GeminiChatResponse(
            reply=result.text,
            model=self._model_name,
            finish_reason=finish_reason,
        )
