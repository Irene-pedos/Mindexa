"""
app/services/gemini_service.py

Gemini Chat Service for Mindexa Platform.
Integrated with AIGateway to respect default LLM providers (e.g. Groq) and audit logs.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai.gateway import AIGateway
from app.core.ai.provider_factory import get_ai_provider
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError, ValidationError
from app.db.enums import AIActionType
from app.db.models.auth import User
from app.schemas.gemini import ChatMessage, GeminiChatResponse

logger = structlog.get_logger("mindexa.gemini_service")


class GeminiService:
    """
    Async wrapper for chat assistant calls.
    Routes through AIGateway if db is available, falling back to GenAI SDK.
    """

    def __init__(self, db: AsyncSession | None = None) -> None:
        self.db = db
        self._api_key: str = settings.GEMINI_API_KEY
        self._model_name: str = settings.GEMINI_DEFAULT_MODEL

    # ─── Public API ───────────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        system_prompt: str | None = None,
        history: list[ChatMessage] | None = None,
        current_user: User | None = None,
    ) -> GeminiChatResponse:
        """
        Send a message to the active LLM provider and return a structured response.
        """
        if self.db:
            try:
                chat_provider = get_ai_provider()
                gateway = AIGateway(self.db, chat_provider)

                # Map roles correctly: "model" -> "assistant" to prevent 400 errors with Groq/OpenAI
                messages = []
                if system_prompt:
                    messages.append(AIMessage(role="system", content=system_prompt))
                for turn in history or []:
                    role = "assistant" if turn.role == "model" else turn.role
                    messages.append(AIMessage(role=role, content=turn.content))
                messages.append(AIMessage(role="user", content=message))

                request = AICompletionRequest(
                    messages=messages,
                    temperature=0.7,
                    max_tokens=2048,
                )

                actor_id = current_user.id if current_user else None
                actor_role = None
                if current_user:
                    actor_role = (
                        current_user.role.value
                        if hasattr(current_user.role, "value")
                        else str(current_user.role)
                    )

                action_type = (
                    AIActionType.STUDY_SUPPORT
                    if actor_role == "student"
                    else AIActionType.ASSESSMENT_DRAFT
                )

                response = await gateway.complete(
                    request,
                    action_type=action_type,
                    actor_id=actor_id,
                    actor_role=actor_role,
                    prompt_summary=f"Assistant chat: {message[:100]}",
                    prompt_version="chat_assistant_v1",
                )

                return GeminiChatResponse(
                    reply=response.content,
                    model=response.model,
                    finish_reason=response.finish_reason,
                )
            except Exception as exc:
                logger.error("gateway_chat_failed_falling_back", error=str(exc))
                if not self._api_key:
                    raise

        # ─── Fallback to direct Gemini SDK ────────────────────────────────────
        if not self._api_key:
            raise ServiceUnavailableError(
                "Gemini API key is not configured. "
                "Set GEMINI_API_KEY in your environment or .env file."
            )

        logger.info(
            "gemini_chat_request_fallback",
            model=self._model_name,
            history_turns=len(history or []),
            has_system_prompt=system_prompt is not None,
        )

        try:
            sdk_response = await asyncio.to_thread(
                self._call_gemini_sync,
                message=message,
                system_prompt=system_prompt,
                history=history or [],
            )
        except ValueError as exc:
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

        return sdk_response

    # ─── Internal sync helper (runs in thread pool) ───────────────────────────

    def _call_gemini_sync(
        self,
        message: str,
        system_prompt: str | None,
        history: list[ChatMessage],
    ) -> GeminiChatResponse:
        """
        Synchronous Gemini SDK call — executed inside asyncio.to_thread().
        """
        import google.generativeai as genai  # noqa: PLC0415

        genai.configure(api_key=self._api_key)

        generation_config: dict[str, Any] = {
            "temperature": 0.7,
            "top_p": 0.95,
            "max_output_tokens": 2048,
        }

        model_kwargs: dict[str, Any] = {
            "model_name": self._model_name,
            "generation_config": generation_config,
        }
        if system_prompt:
            model_kwargs["system_instruction"] = system_prompt

        model = genai.GenerativeModel(**model_kwargs)

        sdk_history = [
            {
                "role": turn.role,        # "user" or "model"
                "parts": [turn.content],
            }
            for turn in history
        ]

        chat_session = model.start_chat(history=sdk_history)
        result = chat_session.send_message(message)

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
