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

from app.core.celery_app import celery
from app.core.logger import get_logger
from app.db.models.question import AIGenerationBatch
from celery import Task
from celery.exceptions import MaxRetriesExceededError, SoftTimeLimitExceeded
from sqlalchemy import text, update
from sqlmodel import col

logger = get_logger("mindexa.tasks")
_event_loop_local = threading.local()
T = TypeVar("T")

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _run(coro: Awaitable[T]) -> T:
    """
    Run an async coroutine from a synchronous Celery task.
    Safely creates a new event loop and disposes the global engine pool
    to prevent loop collision errors in background workers.
    """
    from app.db.session import engine

    async def wrapper():
        # First, ensure we start with a clean slate in this loop
        await engine.dispose()
        try:
            return await coro
        finally:
            # Cleanly shut down connections *before* the loop closes
            await engine.dispose()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(wrapper())
    finally:
        loop.close()
        asyncio.set_event_loop(None)


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

                # Dispatch background grading
                from app.workers.tasks.grading import \
                    trigger_grading_for_attempt
                trigger_grading_for_attempt.delay(str(attempt_id))
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
            logger.critical("process_ai_generation_batch: max retries for batch %s", batch_id)async def _process_ai_generation_async(batch_id: str) -> dict[str, Any]:
    from app.core.ai.question_generator import (GenerationContext,
                                                generate_questions)
    from app.db.enums import AIBatchStatus
    from app.db.repositories.ai_generation_repo import AIGenerationRepository
    from app.db.session import AsyncSessionLocal
    from app.services.rag_service import RAGService

    async with AsyncSessionLocal() as session:
        repo = AIGenerationRepository(session)
        rag = RAGService(session)
        try:
            batch_uuid = uuid.UUID(batch_id)
        except ValueError as exc:
            raise ValueError(f"Invalid batch_id format: {batch_id}") from exc
        batch = await repo.get_batch_by_id(batch_uuid)
        if not batch:
            raise ValueError(f"Batch not found: {batch_id}")

        # Mark as processing
        now = datetime.now(UTC)
        await repo.update_batch_status(
            batch_id=batch.id,
            status=AIBatchStatus.PROCESSING,
            started_at=now,
        )

        # ── RAG: retrieve course material context ──────────────────────────────
        # Try to get grounded context from the lecturer's uploaded materials.
        # If the workspace_id is not set or materials aren't processed yet,
        # retrieve_context_for_lecturer() returns "" and generation continues
        # without RAG context (graceful fallback).
        workspace_id = getattr(batch, "teaching_workspace_id", None)
        rag_topic = batch.topic or batch.subject or "General"
        course_material_context: str = ""
        if workspace_id:
            try:
                course_material_context = await rag.retrieve_context_for_lecturer(
                    topic=rag_topic,
                    teaching_workspace_id=workspace_id,
                    top_k=8,
                )
                logger.info(
                    "Lecturer RAG context retrieved for batch",
                    extra={
                        "batch_id": batch_id,
                        "workspace_id": str(workspace_id),
                        "context_chars": len(course_material_context),
                    },
                )
            except Exception as rag_exc:
                logger.warning(
                    "Lecturer RAG retrieval failed — generating without course context",
                    extra={
                        "batch_id": batch_id,
                        "error": str(rag_exc),
                    },
                )
        else:
            logger.info(
                "Batch has no teaching_workspace_id — skipping RAG",
                extra={"batch_id": batch_id},
            )

        if workspace_id and not course_material_context.strip():
            logger.info(
                "Lecturer RAG context is empty/unrelated — falling back to general AI Knowledge mode",
                extra={"batch_id": batch_id},
            )

        # Blueprint & learning outcome context stored on the batch
        blueprint_constraints = getattr(batch, "blueprint_constraints", None)
        learning_outcomes = getattr(batch, "learning_outcomes", None)
        marks_per_question = getattr(batch, "marks_per_question", None)

        # Build context or iterate over sections
        if batch.sections_json:
            total_generated = 0
            total_failed = 0
            final_status = AIBatchStatus.COMPLETED

            for sec in batch.sections_json:
                sec_id_str = sec.get("section_id")
                sec_uuid = uuid.UUID(sec_id_str) if sec_id_str else None
                sec_topic = sec.get("topic") or batch.topic
                sec_q_type = sec.get("question_type") or sec.get("type") or batch.question_type
                sec_difficulty = sec.get("difficulty") or batch.difficulty
                sec_count = sec.get("count") or 3
                sec_bloom = sec.get("bloom_level") or batch.bloom_level
                sec_marks = sec.get("marks_per_question") or batch.marks_per_question

                # Re-retrieve RAG context per section topic if topic differs from batch topic
                sec_context = course_material_context
                if workspace_id and sec_topic and sec_topic != rag_topic:
                    try:
                        sec_context = await rag.retrieve_context_for_lecturer(
                            topic=sec_topic,
                            teaching_workspace_id=workspace_id,
                            top_k=6,
                        )
                    except Exception:
                        sec_context = course_material_context  # fallback to batch-level context

                context = GenerationContext(
                    question_type=sec_q_type,
                    difficulty=sec_difficulty,
                    count=sec_count,
                    subject=batch.subject,
                    topic=sec_topic,
                    bloom_level=sec_bloom,
                    additional_context=batch.additional_context,
                    workspace_id=workspace_id,
                    course_material_context=sec_context or None,
                    blueprint_constraints=blueprint_constraints,
                    learning_outcomes=learning_outcomes,
                    marks_per_question=sec_marks,
                    request_id=str(batch.id),
                    lecturer_id=batch.created_by_id,
                )

                try:
                    result = await generate_questions(context, db=session)
                    total_generated += result.total_generated
                    total_failed += result.total_failed

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
                            raw_prompt=result.full_prompt,
                            parsed_successfully=generated.parsed_successfully,
                            parsed_question_text=generated.question_text,
                            parsed_options_json=options_json,
                            parsed_explanation=generated.explanation,
                            parse_error=generated.parse_error,
                            target_section_id=sec_uuid,
                            # True when the section had RAG context from course materials
                            grounded_by_rag=bool(sec_context and sec_context.strip()),
                        )
                except Exception as sec_exc:
                    logger.error("Failed to generate for section %s: %s", sec_id_str, str(sec_exc))
                    total_failed += sec_count

            # Determine final batch status
            if total_generated == 0:
                final_status = AIBatchStatus.FAILED
            elif total_failed > 0:
                final_status = AIBatchStatus.PARTIAL_FAILURE

            completed_at = datetime.now(UTC)
            await repo.update_batch_status(
                batch_id=batch.id,
                status=final_status,
                total_generated=total_generated,
                total_failed=total_failed,
                completed_at=completed_at,
            )

            await session.commit()
            return {
                "batch_id": batch_id,
                "status": final_status.value,
                "generated": total_generated,
            }
        else:
            # Build context from batch record (single section/default)
            context = GenerationContext(
                question_type=batch.question_type,
                difficulty=batch.difficulty,
                count=batch.total_requested,
                subject=batch.subject,
                topic=batch.topic,
                bloom_level=batch.bloom_level,
                additional_context=batch.additional_context,
                workspace_id=workspace_id,
                course_material_context=course_material_context or None,
                blueprint_constraints=blueprint_constraints,
                learning_outcomes=learning_outcomes,
                marks_per_question=marks_per_question,
                request_id=str(batch.id),
                lecturer_id=batch.created_by_id,
            )

            # Call AI generator - pass session for auditing
            result = await generate_questions(context, db=session)

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
                    raw_prompt=result.full_prompt,
                    parsed_successfully=generated.parsed_successfully,
                    parsed_question_text=generated.question_text,
                    parsed_options_json=options_json,
                    parsed_explanation=generated.explanation,
                    parse_error=generated.parse_error,
                    target_section_id=batch.target_section_id,
                    # True when the batch had RAG context from course materials
                    grounded_by_rag=bool(course_material_context and course_material_context.strip()),
                )

            # Determine final batch status
            final_status = AIBatchStatus.COMPLETED
            if result.total_generated == 0:
                final_status = AIBatchStatus.FAILED
            elif result.total_failed > 0:
                final_status = AIBatchStatus.PARTIAL_FAILURE

            completed_at = datetime.now(UTC)
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


# ---------------------------------------------------------------------------
# TASK 7 — PROCESS STUDENT RESOURCE (RAG)
# ---------------------------------------------------------------------------

@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.process_student_resource",
    max_retries=2,
    queue="default",
)
def process_student_resource(self: MindexaTask, resource_id: str) -> dict[str, Any]:
    """Parse, chunk, and embed a student resource in the background."""
    try:
        return _run(_process_student_resource_async(resource_id))
    except Exception as exc:
        countdown = (2 ** self.request.retries) * self.default_retry_delay
        raise self.retry(exc=exc, countdown=countdown)


async def _process_student_resource_async(resource_id: str) -> dict[str, Any]:
    from app.core.ai.gateway import AIGateway
    from app.core.ai.provider_factory import (get_ai_provider,
                                              get_embedding_provider)
    from app.db.session import AsyncSessionLocal
    from app.services.rag_service import RAGService

    async with AsyncSessionLocal() as session:
        # Use embedding provider for RAG
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(session, chat_provider, embed_provider)
        rag_service = RAGService(session, gateway)

        await rag_service.process_student_resource(uuid.UUID(resource_id))
        return {"resource_id": resource_id, "status": "processed"}


# ---------------------------------------------------------------------------
# TASK 8 — PROCESS LECTURER MATERIAL (RAG)
# ---------------------------------------------------------------------------

@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.process_lecturer_material",
    max_retries=2,
    queue="default",
)
def process_lecturer_material(self: MindexaTask, material_id: str) -> dict[str, Any]:
    """Parse, chunk, and embed a lecturer material in the background."""
    try:
        return _run(_process_lecturer_material_async(material_id))
    except Exception as exc:
        countdown = (2 ** self.request.retries) * self.default_retry_delay
        raise self.retry(exc=exc, countdown=countdown)


async def _process_lecturer_material_async(material_id: str) -> dict[str, Any]:
    from app.core.ai.gateway import AIGateway
    from app.core.ai.provider_factory import (get_ai_provider,
                                              get_embedding_provider)
    from app.db.session import AsyncSessionLocal
    from app.services.rag_service import RAGService

    async with AsyncSessionLocal() as session:
        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(session, chat_provider, embed_provider)
        rag_service = RAGService(session, gateway)

        await rag_service.process_lecturer_material(uuid.UUID(material_id))
        return {"material_id": material_id, "status": "processed"}


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


# ---------------------------------------------------------------------------
# GRADING REMINDERS (Phase 5)
# ---------------------------------------------------------------------------

@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.grading_reminder",
    max_retries=1,
    queue="cleanup",
)
def grading_reminder(self: MindexaTask) -> dict[str, Any]:
    """Find and notify lecturers of pending grading work."""
    return _run(_grading_reminder_async())


async def _grading_reminder_async() -> dict[str, Any]:
    from app.db.enums import GradingQueueStatus, NotificationType
    from app.db.models.assessment import Assessment, AssessmentSupervisor
    from app.db.models.attempt import GradingQueueItem
    from app.db.models.auth import User
    from app.db.session import AsyncSessionLocal
    from sqlalchemy import and_, func, select

    async with AsyncSessionLocal() as session:
        # Find assessments with pending items older than 24 hours
        threshold = _utcnow() - timedelta(hours=24)

        stmt = (
            select(
                GradingQueueItem.assessment_id,
                func.count(GradingQueueItem.id).label("pending_count")
            )
            .where(
                and_(
                    GradingQueueItem.status.in_([GradingQueueStatus.PENDING, GradingQueueStatus.AI_SUGGESTED]),
                    GradingQueueItem.created_at <= threshold,
                    GradingQueueItem.is_deleted == False
                )
            )
            .group_by(GradingQueueItem.assessment_id)
        )
        res = await session.execute(stmt)
        pending_assessments = res.all()

        reminders_sent = 0
        for assessment_id, count in pending_assessments:
            assessment = await session.get(Assessment, assessment_id)
            if not assessment:
                continue

            # Find supervisors to notify
            sup_stmt = select(AssessmentSupervisor.supervisor_id).where(
                AssessmentSupervisor.assessment_id == assessment_id
            )
            supervisors = (await session.execute(sup_stmt)).scalars().all()

            for sup_id in set(supervisors):
                lecturer = await session.get(User, sup_id)
                if lecturer and lecturer.email:
                    send_email_notification.delay(
                        to_email=lecturer.email,
                        subject=f"Grading Reminder: {assessment.title}",
                        template_name="grading_reminder",
                        context={
                            "lecturer_name": lecturer.profile.first_name if lecturer.profile else "Lecturer",
                            "assessment_title": assessment.title,
                            "pending_count": count,
                            "grading_url": f"/lecturer/grading?assessment_id={assessment_id}",
                            "notification_type": NotificationType.ASSESSMENT_REMINDER.value
                        }
                    )
                    reminders_sent += 1

        return {"reminders_sent": reminders_sent}

