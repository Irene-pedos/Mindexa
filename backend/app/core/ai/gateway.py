from __future__ import annotations

import time
import uuid
from asyncio import sleep

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai.providers import (
    AICompletionRequest,
    AICompletionResponse,
    AIEmbeddingRequest,
    AIEmbeddingResponse,
    BaseProvider,
)
from app.core.config import settings
from app.core.exceptions import RateLimitError, ServiceUnavailableError
from app.db.enums import AIActionStatus, AIActionType
from app.db.models.ai import AIActionLog


class AIGateway:
    """Audited gateway for provider calls.

    Agents call this gateway instead of calling providers directly. The gateway
    creates append-only INITIATED and terminal audit rows around every call.
    """

    def __init__(
        self,
        db: AsyncSession,
        chat_providers: list[BaseProvider] | BaseProvider,
        embedding_providers: list[BaseProvider] | BaseProvider | None = None,
    ) -> None:
        self.db = db
        # Support both single provider and list of fallbacks
        self.chat_providers = chat_providers if isinstance(chat_providers, list) else [chat_providers]
        self.active_chat_provider = self.chat_providers[0]
        
        if embedding_providers:
            self.embedding_providers = embedding_providers if isinstance(embedding_providers, list) else [embedding_providers]
        else:
            self.embedding_providers = self.chat_providers
        self.active_embedding_provider = self.embedding_providers[0]

    async def complete(
        self,
        request: AICompletionRequest,
        *,
        action_type: AIActionType,
        actor_id: uuid.UUID | None,
        actor_role: str | None,
        subject_entity_type: str | None = None,
        subject_entity_id: uuid.UUID | None = None,
        prompt_summary: str | None = None,
        prompt_version: str | None = None,
        human_reviewed: bool | None = None,
    ) -> AICompletionResponse:
        model_name = request.model or self.active_chat_provider.default_model
        initiated = AIActionLog(
            action_type=action_type,
            status=AIActionStatus.INITIATED,
            actor_id=actor_id,
            actor_role=actor_role,
            subject_entity_type=subject_entity_type,
            subject_entity_id=subject_entity_id,
            provider_name=self.active_chat_provider.name,
            model_name=model_name,
            prompt_summary=prompt_summary,
            human_reviewed=human_reviewed,
        )
        self.db.add(initiated)
        await self.db.flush()
        await self.db.commit()

        started = time.perf_counter()
        try:
            response = await self._complete_with_retries(request)
        except Exception as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            self.db.add(
                AIActionLog(
                    action_type=action_type,
                    status=AIActionStatus.FAILED,
                    actor_id=actor_id,
                    actor_role=actor_role,
                    subject_entity_type=subject_entity_type,
                    subject_entity_id=subject_entity_id,
                    provider_name=self.active_chat_provider.name,
                    model_name=model_name,
                    latency_ms=latency_ms,
                    prompt_summary=prompt_summary,
                    raw_output={
                        "provider": self.active_chat_provider.name,
                        "model": model_name,
                        "prompt_version": prompt_version,
                    },
                    error_message=str(exc)[:2000],
                    human_reviewed=human_reviewed,
                    parent_log_id=initiated.id,
                )
            )
            await self.db.flush()
            await self.db.commit()
            raise

        latency_ms = int((time.perf_counter() - started) * 1000)
        self.db.add(
            AIActionLog(
                action_type=action_type,
                status=AIActionStatus.COMPLETED,
                actor_id=actor_id,
                actor_role=actor_role,
                subject_entity_type=subject_entity_type,
                subject_entity_id=subject_entity_id,
                provider_name=response.provider,
                model_name=response.model,
                prompt_tokens=response.prompt_tokens,
                completion_tokens=response.completion_tokens,
                total_tokens=response.total_tokens,
                latency_ms=latency_ms,
                cost_estimate=0.0, # Placeholder for Phase 7
                prompt_summary=prompt_summary,
                raw_output={
                    "provider": response.provider,
                    "model": response.model,
                    "prompt_version": prompt_version,
                    "prompt_tokens": response.prompt_tokens,
                    "completion_tokens": response.completion_tokens,
                    "total_tokens": response.total_tokens,
                    "response": response.raw or {"content": response.content},
                },
                human_reviewed=human_reviewed,
                parent_log_id=initiated.id,
            )
        )
        await self.db.flush()
        await self.db.commit()
        return response

    async def _complete_with_retries(
        self,
        request: AICompletionRequest,
    ) -> AICompletionResponse:
        max_retries = max(0, settings.AI_MAX_RETRIES)
        
        for provider in self.chat_providers:
            self.active_chat_provider = provider
            attempt = 0
            while True:
                try:
                    return await provider.complete(request)
                except RateLimitError:
                    if attempt >= max_retries:
                        break  # Fallback to next provider
                    attempt += 1
                    await sleep(settings.AI_RETRY_BACKOFF_SECONDS * attempt)
                except ServiceUnavailableError:
                    break  # Fallback to next provider immediately

        raise ServiceUnavailableError("All configured AI providers failed.")

    async def embed(
        self,
        request: AIEmbeddingRequest,
        *,
        actor_id: uuid.UUID | None = None,
        actor_role: str | None = None,
        subject_entity_type: str | None = None,
        subject_entity_id: uuid.UUID | None = None,
        prompt_summary: str | None = None,
    ) -> AIEmbeddingResponse:
        """Audited embedding call."""
        model_name = request.model or self.active_embedding_provider.default_model
        initiated = AIActionLog(
            action_type=AIActionType.EMBEDDING,
            status=AIActionStatus.INITIATED,
            actor_id=actor_id,
            actor_role=actor_role,
            subject_entity_type=subject_entity_type,
            subject_entity_id=subject_entity_id,
            provider_name=self.active_embedding_provider.name,
            model_name=model_name,
            prompt_summary=prompt_summary,
        )
        self.db.add(initiated)
        await self.db.flush()
        await self.db.commit()

        started = time.perf_counter()
        try:
            response = await self._embed_with_retries(request)
        except Exception as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            self.db.add(
                AIActionLog(
                    action_type=AIActionType.EMBEDDING,
                    status=AIActionStatus.FAILED,
                    actor_id=actor_id,
                    actor_role=actor_role,
                    subject_entity_type=subject_entity_type,
                    subject_entity_id=subject_entity_id,
                    provider_name=self.active_embedding_provider.name,
                    model_name=model_name,
                    latency_ms=latency_ms,
                    prompt_summary=prompt_summary,
                    error_message=str(exc)[:2000],
                    parent_log_id=initiated.id,
                )
            )
            await self.db.flush()
            await self.db.commit()
            raise

        latency_ms = int((time.perf_counter() - started) * 1000)
        self.db.add(
            AIActionLog(
                action_type=AIActionType.EMBEDDING,
                status=AIActionStatus.COMPLETED,
                actor_id=actor_id,
                actor_role=actor_role,
                subject_entity_type=subject_entity_type,
                subject_entity_id=subject_entity_id,
                provider_name=response.provider,
                model_name=response.model,
                total_tokens=response.total_tokens,
                latency_ms=latency_ms,
                cost_estimate=0.0, # Placeholder
                prompt_summary=prompt_summary,
                raw_output={
                    "provider": response.provider,
                    "model": response.model,
                    "total_tokens": response.total_tokens,
                },
                parent_log_id=initiated.id,
            )
        )
        await self.db.flush()
        await self.db.commit()
        return response

    async def _embed_with_retries(
        self,
        request: AIEmbeddingRequest,
    ) -> AIEmbeddingResponse:
        max_retries = max(0, settings.AI_MAX_RETRIES)
        
        for provider in self.embedding_providers:
            self.active_embedding_provider = provider
            attempt = 0
            while True:
                try:
                    return await provider.embed(request)
                except RateLimitError:
                    if attempt >= max_retries:
                        break
                    attempt += 1
                    await sleep(settings.AI_RETRY_BACKOFF_SECONDS * attempt)
                except ServiceUnavailableError:
                    break

        raise ServiceUnavailableError("All configured embedding providers failed.")
