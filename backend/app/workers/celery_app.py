"""
app/workers/celery_app.py

Celery application with queue definitions, task routing, and beat schedule.

Windows note: Run workers locally with --pool=solo
  celery -A app.workers.celery_app worker --pool=solo --loglevel=info
In production Linux containers, use --pool=prefork for true multiprocessing.
"""

from __future__ import annotations

from app.core.config import settings
from celery import Celery
from celery.signals import worker_ready, worker_shutdown
from kombu import Exchange, Queue

celery_app = Celery(
    "mindexa",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.tasks.grading",
        "app.workers.tasks.notifications",
        "app.workers.tasks.documents",
        "app.workers.tasks.integrity",
        "app.workers.tasks.reports",
    ],
)

celery_app.conf.task_queues = (
    Queue("default",       Exchange("default"),       routing_key="default"),
    Queue("grading",       Exchange("grading"),        routing_key="grading"),
    Queue("documents",     Exchange("documents"),      routing_key="documents"),
    Queue("integrity",     Exchange("integrity"),      routing_key="integrity"),
    Queue("high_priority", Exchange("high_priority"),  routing_key="high_priority"),
)

celery_app.conf.task_routes = {
    "app.workers.tasks.grading.*":       {"queue": "grading"},
    "app.workers.tasks.documents.*":     {"queue": "documents"},
    "app.workers.tasks.integrity.*":     {"queue": "integrity"},
    "app.workers.tasks.notifications.*": {"queue": "default"},
    "app.workers.tasks.reports.*":       {"queue": "default"},
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
    "send-assessment-reminders": {
        "task": "app.workers.tasks.notifications.send_assessment_reminders",
        "schedule": 3600.0,
    },
    "close-expired-assessments": {
        "task": "app.workers.tasks.grading.close_expired_assessments",
        "schedule": 300.0,
    },
    "cleanup-stale-attempts": {
        "task": "app.workers.tasks.grading.cleanup_stale_attempts",
        "schedule": 1800.0,
    },
}


@worker_ready.connect
def on_worker_ready(**kwargs: object) -> None:
    import structlog
    structlog.get_logger("celery.worker").info("celery_worker_ready")


@worker_shutdown.connect
def on_worker_shutdown(**kwargs: object) -> None:
    import structlog
    structlog.get_logger("celery.worker").info("celery_worker_shutdown")
