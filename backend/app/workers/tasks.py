"""
app/workers/tasks.py

Celery background tasks for Mindexa Platform.

TASKS:
    auto_submit_expired_attempts   — Submit any attempt past its expires_at
    cleanup_expired_tokens         — Delete expired refresh/verification tokens
    send_email_notification        — Send a single transactional email
    purge_old_logs                 — Delete security events older than N days
    process_ai_grading_job         — Process a queued AI grading item

DESIGN:
    - Celery tasks are synchronous wrappers that spin up asyncio event loops
      to call the async application services. This is the standard pattern
      for FastAPI + Celery integration.
    - Each task has explicit retry limits with exponential backoff.
    - All DB access goes through the async session factory.
    - Failures are logged with full context before retrying/failing.

RETRY POLICY:
    max_retries=3, countdown doubles: 60s, 120s, 240s
"""

from __future__ import annotations

import asyncio
import json
import threading
import uuid
from collections.abc import Awaitable
from datetime import UTC, datetime, timedelta
from typing import Any, TypeVar

from celery import Task
from celery.exceptions import MaxRetriesExceededError, SoftTimeLimitExceeded
from sqlalchemy import text, update
from sqlmodel import col

from app.core.celery_app import celery
from app.core.logger import get_logger
from app.db.models.question import AIGenerationBatch

logger = get_logger("mindexa.tasks")
_event_loop_local = threading.local()
T = TypeVar("T")

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _run(coro: Awaitable[T]) -> T:
    """
    Run an async coroutine from a synchronous Celery task.

    Reuses a per-thread event loop to keep async DB connections valid
    across multiple task executions in the same worker.
    """
    loop = getattr(_event_loop_local, "loop", None)
    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        _event_loop_local.loop = loop

    previous_loop = None
    try:
        try:
            previous_loop = asyncio.get_event_loop()
        except RuntimeError:
            previous_loop = None
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        if previous_loop is not None and previous_loop is not loop:
            asyncio.set_event_loop(previous_loop)


def _utcnow() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# BASE TASK CLASS
# ---------------------------------------------------------------------------

class MindexaTask(Task):
    """
    Base class for all Mindexa Celery tasks.

    Adds:
        - Structured logging on start, success, and failure
        - Consistent retry policy
    """
    abstract = True
    max_retries = 3
    default_retry_delay = 60   # seconds (doubles on each retry)

    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
        einfo: Any,
    ) -> None:
        logger.error(
            "Task %s[%s] FAILED: %s",
            self.name, task_id, str(exc),
            exc_info=exc,
            extra={"task_id": task_id, "task_name": self.name},
        )

    def on_retry(
        self,
        exc: Exception,
        task_id: str,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
        einfo: Any,
    ) -> None:
        logger.warning(
            "Task %s[%s] RETRY #%d: %s",
            self.name, task_id, self.request.retries, str(exc),
            extra={"task_id": task_id, "task_name": self.name},
        )

    def on_success(
        self, retval: Any, task_id: str, args: tuple[Any, ...], kwargs: dict[str, Any]
    ) -> None:
        logger.info(
            "Task %s[%s] completed: %s",
            self.name, task_id, str(retval),
            extra={"task_id": task_id, "task_name": self.name},
        )


# ---------------------------------------------------------------------------
# TASK 1 — AUTO-SUBMIT EXPIRED ATTEMPTS
# ---------------------------------------------------------------------------

@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.auto_submit_expired_attempts",
    max_retries=3,
)
def auto_submit_expired_attempts(self: MindexaTask) -> dict[str, Any]:
    """
    Find all IN_PROGRESS attempts past their expires_at and auto-submit them.

    Runs every 5 minutes via Celery Beat.
    Each expired attempt is submitted with status AUTO_SUBMITTED.
    """
    try:
        return _run(_auto_submit_expired_attempts_async())
    except SoftTimeLimitExceeded:
        logger.error("auto_submit_expired_attempts: soft time limit exceeded")
        raise
    except Exception as exc:
        logger.error("auto_submit_expired_attempts error: %s", str(exc), exc_info=True)
        countdown = (2 ** self.request.retries) * self.default_retry_delay
        try:
            raise self.retry(exc=exc, countdown=countdown)
        except MaxRetriesExceededError:
            logger.critical("auto_submit_expired_attempts: max retries exceeded")
            raise


async def _auto_submit_expired_attempts_async() -> dict[str, Any]:
    from app.db.enums import AttemptStatus
    from app.db.session import AsyncSessionLocal

    now = _utcnow()
    submitted_count = 0
    error_count = 0

    async with AsyncSessionLocal() as session:
        # Find all expired IN_PROGRESS attempts
        result = await session.execute(
            text(
                """
                SELECT id, student_id, assessment_id
                FROM assessment_attempt
                WHERE status = :status
                  AND expires_at IS NOT NULL
                  AND expires_at < :now
                ORDER BY expires_at
                LIMIT 100
                """
            ),
            {"now": now, "status": AttemptStatus.IN_PROGRESS.value},
        )
        expired = result.fetchall()

        if not expired:
            logger.info("auto_submit: no expired attempts found")
            return {"submitted": 0, "errors": 0}

        logger.info("auto_submit: found %d expired attempts to process", len(expired))

        for row in expired:
            attempt_id, student_id, _ = row[0], row[1], row[2]
            try:
                await session.execute(
                    text(
                        """
                        UPDATE assessment_attempt
                        SET status = :status,
                            submitted_at = :now,
                            updated_at = :now
                        WHERE id = :id
                        """
                    ),
                    {
                        "now": now,
                        "id": attempt_id,
                        "status": AttemptStatus.AUTO_SUBMITTED.value
                    },
                )
                submitted_count += 1
                logger.info(
                    "auto_submit: submitted attempt %s (student=%s)",
                    attempt_id, student_id,
                )
            except Exception as exc:
                error_count += 1
                logger.error(
                    "auto_submit: failed to submit attempt %s: %s",
                    attempt_id, str(exc),
                )
                await session.rollback()
                continue

        await session.commit()

    return {"submitted": submitted_count, "errors": error_count}


# ---------------------------------------------------------------------------
# TASK 2 — CLEANUP EXPIRED TOKENS
# ---------------------------------------------------------------------------

@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.cleanup_expired_tokens",
    max_retries=3,
)
def cleanup_expired_tokens(self: MindexaTask) -> dict[str, Any]:
    """
    Delete expired refresh tokens and password reset tokens from the DB.

    Runs every 30 minutes via Celery Beat.
    Expired tokens are safe to delete — they can never be used again.
    """
    try:
        return _run(_cleanup_expired_tokens_async())
    except SoftTimeLimitExceeded:
        logger.error("cleanup_expired_tokens: soft time limit exceeded")
        raise
    except Exception as exc:
        countdown = (2 ** self.request.retries) * self.default_retry_delay
        try:
            raise self.retry(exc=exc, countdown=countdown)
        except MaxRetriesExceededError:
            logger.critical("cleanup_expired_tokens: max retries exceeded")
            raise


async def _cleanup_expired_tokens_async() -> dict[str, Any]:
    from app.db.session import AsyncSessionLocal

    now = _utcnow()
    async with AsyncSessionLocal() as session:
        # Delete expired refresh tokens
        rt_result = await session.execute(
            text(
                "DELETE FROM refresh_token WHERE expires_at < :now"
            ),
            {"now": now},
        )

        # Delete used or expired password reset / verification tokens
        prt_result = await session.execute(
            text(
                "DELETE FROM password_reset_token WHERE expires_at < :now OR used = true"
            ),
            {"now": now},
        )

        await session.commit()

        rt_deleted = getattr(rt_result, "rowcount", 0)
        prt_deleted = getattr(prt_result, "rowcount", 0)

        logger.info(
            "cleanup_expired_tokens: removed %d refresh tokens, %d reset tokens",
            rt_deleted, prt_deleted,
        )
        return {
            "refresh_tokens_deleted": rt_deleted,
            "reset_tokens_deleted": prt_deleted,
        }



# ---------------------------------------------------------------------------
# TASK 3 — SEND EMAIL NOTIFICATION
# ---------------------------------------------------------------------------

@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.send_email_notification",
    max_retries=5,
    default_retry_delay=30,
    queue="email",
)
def send_email_notification(
    self: MindexaTask,
    *,
    to_email: str,
    subject: str,
    template_name: str,
    context: dict[str, Any],
) -> dict[str, Any]:
    """
    Send a single transactional email.

    Args:
        to_email:      Recipient email address
        subject:       Email subject line
        template_name: Template identifier (verification, reset, notification)
        context:       Dict of template variables

    Retried up to 5 times with 30s, 60s, 120s, 240s, 480s delays.
    """
    try:
        return _run(
            _send_email_async(
                to_email=to_email,
                subject=subject,
                template_name=template_name,
                context=context,
            )
        )
    except SoftTimeLimitExceeded:
        logger.error("send_email_notification: soft time limit exceeded for %s", to_email)
        raise
    except Exception as exc:
        logger.error(
            "send_email_notification: failed for %s: %s", to_email, str(exc)
        )
        countdown = (2 ** self.request.retries) * self.default_retry_delay
        try:
            raise self.retry(exc=exc, countdown=countdown)
        except MaxRetriesExceededError:
            logger.critical(
                "send_email_notification: max retries exceeded for %s", to_email
            )
            raise


async def _send_email_async(
    to_email: str,
    subject: str,
    template_name: str,
    context: dict[str, Any],
) -> dict[str, Any]:
    from app.services.email_service import EmailService

    email_service = EmailService()
    await email_service.send(
        to_email=to_email,
        subject=subject,
        template_name=template_name,
        context=context,
    )
    return {"sent_to": to_email, "template": template_name}


# ---------------------------------------------------------------------------
# TASK 4 — PURGE OLD SECURITY EVENT LOGS
# ---------------------------------------------------------------------------

@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.purge_old_logs",
    max_retries=2,
    queue="cleanup",
)
def purge_old_logs(
    self: MindexaTask,
    retention_days: int = 90,
) -> dict[str, Any]:
    """
    Delete security_events older than retention_days.

    Runs daily at 02:00 UTC via Celery Beat.
    Default retention: 90 days (configurable per invocation).
    """
    try:
        return _run(_purge_old_logs_async(retention_days=retention_days))
    except SoftTimeLimitExceeded:
        logger.error("purge_old_logs: soft time limit exceeded")
        raise
    except Exception as exc:
        countdown = (2 ** self.request.retries) * self.default_retry_delay
        try:
            raise self.retry(exc=exc, countdown=countdown)
        except MaxRetriesExceededError:
            logger.critical("purge_old_logs: max retries exceeded")
            raise


async def _purge_old_logs_async(retention_days: int) -> dict[str, Any]:
    from app.db.session import AsyncSessionLocal

    cutoff = _utcnow() - timedelta(days=retention_days)

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("DELETE FROM security_event WHERE created_at < :cutoff"),
            {"cutoff": cutoff},
        )
        deleted = getattr(result, "rowcount", 0)
        await session.commit()

    logger.info(
        "purge_old_logs: deleted %d security events older than %d days",
        deleted, retention_days,
    )
    return {"deleted": deleted, "cutoff": cutoff.isoformat()}


# ---------------------------------------------------------------------------
# TASK 5 — PROCESS AI GRADING JOB
# ---------------------------------------------------------------------------

@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.process_ai_grading_job",
    max_retries=3,
    default_retry_delay=45,
    queue="grading",
    soft_time_limit=240,
    time_limit=300,
)
def process_ai_grading_job(
    self: MindexaTask,
    grading_queue_item_id: str,
) -> dict[str, Any]:
    """
    Process a single queued AI grading item.

    Called when a GradingQueueItem is created with grading_mode=AI_ASSISTED.
    The AI produces a suggested score and rationale; a human must confirm.

    Args:
        grading_queue_item_id: UUID string of the GradingQueueItem row
    """
    try:
        return _run(_process_ai_grading_async(grading_queue_item_id))
    except SoftTimeLimitExceeded:
        logger.error(
            "process_ai_grading_job: soft time limit for item %s",
            grading_queue_item_id,
        )
        # Mark as failed in DB so it can be retried manually
        _run(_mark_grading_item_failed(grading_queue_item_id, "soft_time_limit"))
        raise
    except Exception as exc:
        logger.error(
            "process_ai_grading_job: error for item %s: %s",
            grading_queue_item_id, str(exc),
            exc_info=True,
        )
        countdown = (2 ** self.request.retries) * self.default_retry_delay
        try:
            raise self.retry(exc=exc, countdown=countdown)
        except MaxRetriesExceededError:
            _run(_mark_grading_item_failed(grading_queue_item_id, "max_retries_exceeded"))
            logger.critical(
                "process_ai_grading_job: max retries for item %s",
                grading_queue_item_id,
            )
            raise


async def _process_ai_grading_async(grading_queue_item_id: str) -> dict[str, Any]:
    from app.db.session import AsyncSessionLocal
    from app.services.grading_service import GradingService

    async with AsyncSessionLocal() as session:
        grading_service = GradingService(db=session)
        result = await grading_service.process_ai_queue_item(grading_queue_item_id)
        await session.commit()
        return result


async def _mark_grading_item_failed(item_id: str, reason: str) -> None:
    """Update GradingQueueItem status to failed (best-effort, non-blocking)."""
    try:
        from app.db.enums import GradingQueueStatus
        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await session.execute(
                text(
                    """
                    UPDATE grading_queue_item
                    SET status = :status,
                        updated_at = :now
                    WHERE id = :id
                    """
                ),
                {"status": GradingQueueStatus.FAILED.value, "now": _utcnow(), "id": item_id},
            )
            await session.commit()
    except Exception as exc:
        logger.error("_mark_grading_item_failed error: %s", str(exc))


# ---------------------------------------------------------------------------
# TASK 6 — PROCESS AI GENERATION BATCH
# ---------------------------------------------------------------------------

@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.process_ai_generation_batch",
    max_retries=2,
    queue="default",
    soft_time_limit=300,
    time_limit=360,
)
def process_ai_generation_batch(
    self: MindexaTask,
    batch_id: str,
) -> dict[str, Any]:
    """
    Orchestrate AI question generation for a batch in the background.

    Args:
        batch_id: UUID string of the AIGenerationBatch row
    """
    try:
        return _run(_process_ai_generation_async(batch_id))
    except SoftTimeLimitExceeded:
        logger.error("process_ai_generation_batch: soft time limit for batch %s", batch_id)
        _run(_mark_batch_failed(batch_id, "soft_time_limit"))
        raise
    except Exception as exc:
        logger.error(
            "process_ai_generation_batch: error for batch %s: %s",
            batch_id, str(exc),
            exc_info=True,
        )
        countdown = (2 ** self.request.retries) * self.default_retry_delay
        try:
            raise self.retry(exc=exc, countdown=countdown)
        except MaxRetriesExceededError:
            _run(_mark_batch_failed(batch_id, str(exc)))
            logger.critical("process_ai_generation_batch: max retries for batch %s", batch_id)
            raise


async def _process_ai_generation_async(batch_id: str) -> dict[str, Any]:
    from app.core.ai.question_generator import (
        GenerationContext,
        build_prompt,
        generate_questions,
    )
    from app.db.enums import AIBatchStatus
    from app.db.repositories.ai_generation_repo import AIGenerationRepository
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        repo = AIGenerationRepository(session)
        try:
            batch_uuid = uuid.UUID(batch_id)
        except ValueError as exc:
            raise ValueError(f"Invalid batch_id format: {batch_id}") from exc
        batch = await repo.get_batch_by_id(batch_uuid)
        if not batch:
            raise ValueError(f"Batch not found: {batch_id}")

        # Mark as processing
        now = datetime.now(datetime.UTC)
        await repo.update_batch_status(
            batch_id=batch.id,
            status=AIBatchStatus.PROCESSING,
            started_at=now,
        )

        # Build context from batch record
        context = GenerationContext(
            question_type=batch.question_type,
            difficulty=batch.difficulty,
            count=batch.total_requested,
            subject=batch.subject,
            topic=batch.topic,
            bloom_level=batch.bloom_level,
            additional_context=batch.additional_context,
            request_id=str(batch.id),
        )

        full_prompt = build_prompt(context)
        # Store the prompt back to the batch
        await session.execute(
            update(AIGenerationBatch)
            .where(col(AIGenerationBatch.id) == batch.id)
            .values(full_prompt=full_prompt)
        )

        # Call AI generator
        result = await generate_questions(context)

        # Store each generated question
        for generated in result.questions:
            options_json = (
                json.dumps(generated.options) if generated.options else None
            )
            await repo.create_generated_question(
                batch_id=batch.id,
                generated_content=generated.raw_content,
                question_type=generated.question_type,
                difficulty=generated.difficulty,
                raw_prompt=full_prompt,
                parsed_successfully=generated.parsed_successfully,
                parsed_question_text=generated.question_text,
                parsed_options_json=options_json,
                parsed_explanation=generated.explanation,
                parse_error=generated.parse_error,
            )

        # Determine final batch status
        final_status = AIBatchStatus.COMPLETED
        if result.total_generated == 0:
            final_status = AIBatchStatus.FAILED
        elif result.total_failed > 0:
            final_status = AIBatchStatus.PARTIAL_FAILURE

        completed_at = datetime.now(datetime.UTC)
        await repo.update_batch_status(
            batch_id=batch.id,
            status=final_status,
            total_generated=result.total_generated,
            total_failed=result.total_failed,
            completed_at=completed_at,
            error_message=result.error,
            ai_model_used=result.model_used,
            ai_provider=result.provider,
            total_tokens_used=result.tokens_used,
        )

        await session.commit()
        return {
            "batch_id": batch_id,
            "status": final_status.value,
            "generated": result.total_generated,
        }


async def _mark_batch_failed(batch_id: str, error: str) -> None:
    """Update AIGenerationBatch status to failed."""
    try:
        from app.db.enums import AIBatchStatus
        from app.db.session import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await session.execute(
                text(
                    """
                    UPDATE ai_generation_batch
                    SET status = :status,
                        error_message = :error,
                        completed_at = :now,
                        updated_at = :now
                    WHERE id = :id
                    """
                ),
                {
                    "status": AIBatchStatus.FAILED.value,
                    "error": error,
                    "now": _utcnow(),
                    "id": batch_id
                },
            )
            await session.commit()
    except Exception as exc:
        logger.error("_mark_batch_failed error: %s", str(exc))

