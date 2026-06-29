"""
app/workers/celery_app.py

Celery application with queue definitions, task routing, and beat schedule.

Windows note: Run workers locally with --pool=solo
  celery -A app.workers.celery_app worker --pool=solo --loglevel=info
In production Linux containers, use --pool=prefork for true multiprocessing.
"""

from __future__ import annotations

from celery.signals import worker_ready, worker_shutdown

from app.core.config import settings
from app.core.celery_app import celery as celery_app


@worker_ready.connect
def on_worker_ready(**kwargs: object) -> None:
    # Use standard logging if structlog not available or configured
    import logging
    logging.getLogger("celery.worker").info("celery_worker_ready")


@worker_shutdown.connect
def on_worker_shutdown(**kwargs: object) -> None:
    import logging
    logging.getLogger("celery.worker").info("celery_worker_shutdown")
