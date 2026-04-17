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

    # Start beat scheduler:
    celery -A app.core.celery_app.celery beat -l info

    # Send a task manually:
    from app.workers.tasks import auto_submit_expired_attempts
    auto_submit_expired_attempts.delay()
"""

from __future__ import annotations

from app.core.config import settings
from celery import Celery
from celery.schedules import crontab
from kombu import Exchange, Queue

# ---------------------------------------------------------------------------
# FACTORY
# ---------------------------------------------------------------------------

def create_celery() -> Celery:
    """Create and configure the Celery application instance."""

    app = Celery(
        "mindexa",
        broker=settings.CELERY_BROKER_URL,
        backend=settings.CELERY_RESULT_BACKEND,
        include=["app.workers.tasks"],
    )

    # ── Serialization ─────────────────────────────────────────────────────────
    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
    )

    # ── Result TTL ────────────────────────────────────────────────────────────
    app.conf.result_expires = 3600  # 1 hour

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

    app.conf.task_queues = [
        Queue("default", default_exchange, routing_key="default"),
        Queue("grading", grading_exchange, routing_key="grading"),
        Queue("email", email_exchange, routing_key="email"),
        Queue("cleanup", cleanup_exchange, routing_key="cleanup"),
    ]
    app.conf.task_default_queue = "default"
    app.conf.task_default_exchange = "default"
    app.conf.task_default_routing_key = "default"

    # ── Task routing ──────────────────────────────────────────────────────────
    app.conf.task_routes = {
        "app.workers.tasks.send_email_notification": {"queue": "email"},
        "app.workers.tasks.process_ai_grading_job": {"queue": "grading"},
        "app.workers.tasks.auto_submit_expired_attempts": {"queue": "cleanup"},
        "app.workers.tasks.cleanup_expired_tokens": {"queue": "cleanup"},
        "app.workers.tasks.purge_old_logs": {"queue": "cleanup"},
    }

    # ── Beat schedule (periodic tasks) ────────────────────────────────────────
    app.conf.beat_schedule = {
        # Check for expired attempts every 5 minutes
        "auto-submit-expired-attempts": {
            "task": "app.workers.tasks.auto_submit_expired_attempts",
            "schedule": 300,   # seconds
            "options": {"queue": "cleanup"},
        },
        # Clean up expired refresh/verification tokens every 30 minutes
        "cleanup-expired-tokens": {
            "task": "app.workers.tasks.cleanup_expired_tokens",
            "schedule": 1800,  # seconds
            "options": {"queue": "cleanup"},
        },
        # Purge old security event logs daily at 02:00 UTC
        "purge-old-logs": {
            "task": "app.workers.tasks.purge_old_logs",
            "schedule": crontab(hour=2, minute=0),
            "options": {"queue": "cleanup"},
        },
    }

    return app


# ---------------------------------------------------------------------------
# SINGLETON
# ---------------------------------------------------------------------------

celery = create_celery()
