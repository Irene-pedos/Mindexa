"""
app/workers/celery_app.py

Celery application with queue definitions, task routing, and beat schedule.

Windows note: Run workers locally with --pool=solo
  celery -A app.workers.celery_app worker --pool=solo --loglevel=info
In production Linux containers, use --pool=prefork for true multiprocessing.
"""

from __future__ import annotations

from celery import Celery
from celery.signals import worker_ready, worker_shutdown
from kombu import Exchange, Queue

from app.core.config import settings

celery_app = Celery(
    "mindexa",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.tasks",
    ],
)

celery_app.conf.task_queues = (
    Queue("default",       Exchange("default"),       routing_key="default"),
    Queue("grading",       Exchange("grading"),        routing_key="grading"),
    Queue("email",         Exchange("email"),          routing_key="email"),
    Queue("cleanup",       Exchange("cleanup"),        routing_key="cleanup"),
    Queue("high_priority", Exchange("high_priority"),  routing_key="high_priority"),
)

celery_app.conf.task_routes = {
    "app.workers.tasks.process_ai_grading_job":    {"queue": "grading"},
    "app.workers.tasks.send_email_notification":   {"queue": "email"},
    "app.workers.tasks.purge_old_logs":            {"queue": "cleanup"},
    "app.workers.tasks.cleanup_expired_tokens":    {"queue": "cleanup"},
    "app.workers.tasks.auto_submit_expired_attempts": {"queue": "default"},
    "app.workers.tasks.process_ai_generation_batch": {"queue": "default"},
}

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    event_serializer="json",
    timezone="UTC",
    enable_utc=True,
    result_expires=86400,
    result_persistent=False,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    task_max_retries=3,
    task_default_retry_delay=60,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=200,
    task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER,
    task_eager_propagates=True,
    worker_send_task_events=True,
    task_send_sent_event=True,
)

celery_app.conf.beat_schedule = {
    "auto-submit-expired-attempts": {
        "task": "app.workers.tasks.auto_submit_expired_attempts",
        "schedule": 300.0,  # Every 5 minutes
    },
    "cleanup-expired-tokens": {
        "task": "app.workers.tasks.cleanup_expired_tokens",
        "schedule": 1800.0,  # Every 30 minutes
    },
    "purge-old-logs": {
        "task": "app.workers.tasks.purge_old_logs",
        "schedule": 86400.0,  # Daily
    },
}


@worker_ready.connect
def on_worker_ready(**kwargs: object) -> None:
    # Use standard logging if structlog not available or configured
    import logging
    logging.getLogger("celery.worker").info("celery_worker_ready")


@worker_shutdown.connect
def on_worker_shutdown(**kwargs: object) -> None:
    import logging
    logging.getLogger("celery.worker").info("celery_worker_shutdown")
