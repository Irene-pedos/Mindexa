"""
app/core/celery_app.py

Celery application factory for Mindexa Platform.

BROKER:  Redis (DB 1) — task queue
BACKEND: Redis (DB 2) — result storage

QUEUES:
    default    — general tasks
    grading    — AI grading jobs (can be routed to GPU worker)
    email      — email notifications (isolated for retry control)
    cleanup    — maintenance tasks (expired tokens, old logs)

BEAT SCHEDULE (periodic tasks):
    Every 5  min: auto_submit_expired_attempts
    Every 30 min: cleanup_expired_tokens
    Every 24 hr : purge_old_logs

USAGE:
    # Start a worker (from project root):
    celery -A app.core.celery_app.celery worker -Q default,grading,email -l info
    # On Windows (solo pool):
    MINDEXA_RUNTIME=celery celery -A app.core.celery_app.celery worker --pool=solo -Q default,grading,email -l info

    # Start beat scheduler:
    celery -A app.core.celery_app.celery beat -l info

    # Send a task manually:
    from app.workers.tasks import auto_submit_expired_attempts
    auto_submit_expired_attempts.delay()
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from kombu import Exchange, Queue

from app.core.config import settings

# ---------------------------------------------------------------------------
# FACTORY
# ---------------------------------------------------------------------------

def create_celery() -> Celery:
    """Create and configure the Celery application instance."""

    app = Celery(
        "mindexa",
        broker=settings.CELERY_BROKER_URL,
        backend=settings.CELERY_RESULT_BACKEND,
        include=[
            "app.workers.tasks",
            "app.workers.tasks.grading",
            "app.workers.tasks.document_processing",
        ],
    )

    # ── Serialization & Worker Behavior ───────────────────────────────────────
    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        event_serializer="json",
        timezone="UTC",
        enable_utc=True,
        result_expires=86400,
        result_persistent=False,
        task_track_started=True,
        task_max_retries=3,
        task_default_retry_delay=60,
        worker_send_task_events=True,
        task_send_sent_event=True,
        worker_max_tasks_per_child=200,
    )

    # ── Task execution ────────────────────────────────────────────────────────
    app.conf.task_always_eager = settings.CELERY_TASK_ALWAYS_EAGER
    app.conf.task_eager_propagates = True   # surface errors in eager mode

    # ── Retry defaults ────────────────────────────────────────────────────────
    app.conf.task_acks_late = True          # acknowledge AFTER task completes
    app.conf.task_reject_on_worker_lost = True

    # ── Concurrency & prefetch ────────────────────────────────────────────────
    app.conf.worker_prefetch_multiplier = 1   # one task at a time per slot
    app.conf.task_soft_time_limit = 300       # 5 min soft limit → SoftTimeLimitExceeded
    app.conf.task_time_limit = 360            # 6 min hard limit → worker restart

    # ── Queues ────────────────────────────────────────────────────────────────
    default_exchange = Exchange("default", type="direct")
    grading_exchange = Exchange("grading", type="direct")
    email_exchange = Exchange("email", type="direct")
    cleanup_exchange = Exchange("cleanup", type="direct")
    high_priority_exchange = Exchange("high_priority", type="direct")
    rag_exchange = Exchange("rag", type="direct")

    app.conf.task_queues = [
        Queue("default", default_exchange, routing_key="default"),
        Queue("grading", grading_exchange, routing_key="grading"),
        Queue("email", email_exchange, routing_key="email"),
        Queue("cleanup", cleanup_exchange, routing_key="cleanup"),
        Queue("high_priority", high_priority_exchange, routing_key="high_priority"),
        Queue("rag", rag_exchange, routing_key="rag"),
    ]
    app.conf.update(
        task_default_queue="default",
        task_default_exchange="default",
        task_default_routing_key="default",
    )

    # ── Task routing ──────────────────────────────────────────────────────────
    app.conf.task_routes = {
        "tasks.process_uploaded_document": {"queue": "rag"},
        "app.workers.tasks.grading.trigger_grading_for_attempt": {"queue": "grading"},
        "app.workers.tasks.process_ai_grading_job": {"queue": "grading"},
        "app.workers.tasks.grading.trigger_ai_grading_for_group_submission": {"queue": "grading"},
        "app.workers.tasks.grading.trigger_ai_grading_for_group_question": {"queue": "grading"},
        "app.workers.tasks.send_email_notification": {"queue": "email"},
        "app.workers.tasks.purge_old_logs": {"queue": "cleanup"},
        "app.workers.tasks.cleanup_expired_tokens": {"queue": "cleanup"},
        "app.workers.tasks.auto_submit_expired_attempts": {"queue": "cleanup"},
        "app.workers.tasks.process_ai_generation_batch": {"queue": "default"},
        "app.workers.tasks.grading_reminder": {"queue": "cleanup"},
    }

    # ── Beat schedule (periodic tasks) ────────────────────────────────────────
    app.conf.beat_schedule = {
        # Check for expired attempts every 5 minutes
        "auto-submit-expired-attempts": {
            "task": "app.workers.tasks.auto_submit_expired_attempts",
            "schedule": 300.0,   # seconds
            "options": {"queue": "cleanup"},
        },
        # Clean up expired refresh/verification tokens every 30 minutes
        "cleanup-expired-tokens": {
            "task": "app.workers.tasks.cleanup_expired_tokens",
            "schedule": 1800.0,  # seconds
            "options": {"queue": "cleanup"},
        },
        # Purge old security event logs daily at 02:00 UTC
        "purge-old-logs": {
            "task": "app.workers.tasks.purge_old_logs",
            "schedule": crontab(hour=2, minute=0),
            "options": {"queue": "cleanup"},
        },
        # TODO: Implement and re-enable grading_reminder task
        # "grading-reminder": {
        #     "task": "app.workers.tasks.grading_reminder",
        #     "schedule": 43200.0,
        #     "options": {"queue": "cleanup"},
        # },
    }

    return app


# ---------------------------------------------------------------------------
# SINGLETON
# ---------------------------------------------------------------------------

celery = create_celery()
