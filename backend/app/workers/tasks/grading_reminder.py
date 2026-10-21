"""
app/workers/tasks/grading_reminder.py

Phase 6C: Grading deadline reminder Celery task.

Runs every 6 hours (beat schedule in celery_app.py).
For each MARKS_DEADLINE calendar event:
  - At T-7d, T-3d, T-1d: remind lecturers with ungraded attempts
  - At T+0 (overdue): notify HOD of overdue marks

Idempotent: milestone-keyed deduplication via Redis to prevent double-notify.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import timedelta

import structlog

from app.core.celery_app import celery
from app.db.base import utcnow

log = structlog.get_logger(__name__)

_REMINDER_MILESTONES_DAYS = [7, 3, 1]


def _milestone_key(event_id: uuid.UUID, days_before: int) -> str:
    return f"grading_reminder:{event_id}:t_minus_{days_before}d"


def _overdue_key(event_id: uuid.UUID) -> str:
    return f"grading_reminder:{event_id}:overdue"


async def _run_grading_reminder() -> None:
    from sqlalchemy import select

    from app.db.enums import CalendarEventType, NotificationType
    from app.db.models.assessment import Assessment
    from app.db.models.attempt import AssessmentAttempt, AttemptStatus
    from app.db.models.auth import User
    from app.db.models.calendar import AcademicCalendarEvent
    from app.db.repositories.calendar_repo import CalendarRepository
    from app.db.repositories.notification_repo import NotificationRepository
    from app.db.session import AsyncSessionLocal

    try:
        from app.core.config import settings
        import redis.asyncio as aioredis
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        redis_client = None

    async with AsyncSessionLocal() as db:
        calendar_repo = CalendarRepository(db)
        notif_repo = NotificationRepository(db)
        now = utcnow()

        # Find upcoming MARKS_DEADLINE events (within 7 days from now)
        events = await calendar_repo.list_upcoming_deadline_events(
            institution_id=None,  # type: ignore[arg-type]
            after=now,
        )

        for event in events:
            time_until = event.ends_at - now

            # Overdue
            if event.ends_at <= now:
                key = _overdue_key(event.id)
                already_sent = redis_client and await redis_client.exists(key)
                if not already_sent:
                    await _notify_hod_overdue(db, notif_repo, event)
                    if redis_client:
                        await redis_client.set(key, "1", ex=86400 * 30)
                continue

            # Upcoming milestones
            for days in _REMINDER_MILESTONES_DAYS:
                if timedelta(days=days - 1) < time_until <= timedelta(days=days):
                    key = _milestone_key(event.id, days)
                    already_sent = redis_client and await redis_client.exists(key)
                    if not already_sent:
                        await _remind_lecturers(db, notif_repo, event, days_remaining=days)
                        if redis_client:
                            await redis_client.set(key, "1", ex=86400 * (days + 2))

        await db.commit()

    if redis_client:
        await redis_client.aclose()


async def _remind_lecturers(db, notif_repo, event, days_remaining: int) -> None:
    from sqlalchemy import select

    from app.db.enums import AssessmentType, AttemptStatus, NotificationType
    from app.db.models.assessment import Assessment
    from app.db.models.attempt import AssessmentAttempt
    from app.db.models.academic import TeachingAssignment

    # Find assessments for this period/institution that have ungraded attempts
    assessments_res = await db.execute(
        select(Assessment).where(
            Assessment.academic_period_id == event.academic_period_id,
            Assessment.is_deleted == False,  # noqa: E712
        )
    )
    assessments = assessments_res.scalars().all()

    for assessment in assessments:
        ungraded_res = await db.execute(
            select(AssessmentAttempt).where(
                AssessmentAttempt.assessment_id == assessment.id,
                AssessmentAttempt.status.in_([
                    AttemptStatus.SUBMITTED,
                    AttemptStatus.AUTO_SUBMITTED,
                ]),
                AssessmentAttempt.is_deleted == False,  # noqa: E712
            )
        )
        ungraded = list(ungraded_res.scalars().all())
        if not ungraded:
            continue

        # Notify assigned lecturers
        assignments_res = await db.execute(
            select(TeachingAssignment.lecturer_id).where(
                TeachingAssignment.course_id == assessment.course_id,
                TeachingAssignment.is_deleted == False,  # noqa: E712
            )
        )
        for lecturer_id in assignments_res.scalars().all():
            await notif_repo.create_notification(
                user_id=lecturer_id,
                notification_type=NotificationType.MARKS_DEADLINE_REMINDER,
                content={
                    "event_id": str(event.id),
                    "assessment_id": str(assessment.id),
                    "days_remaining": days_remaining,
                    "ungraded_count": len(ungraded),
                },
            )

    log.info(
        "grading_reminder.lecturers_notified",
        event_id=str(event.id),
        days_remaining=days_remaining,
    )


async def _notify_hod_overdue(db, notif_repo, event) -> None:
    from sqlalchemy import select

    from app.db.enums import NotificationType
    from app.db.models.academic import Department
    from app.db.models.duty import UserDutyAssignment

    # Notify all HODs in the institution
    hod_res = await db.execute(
        select(UserDutyAssignment.user_id).where(
            UserDutyAssignment.is_deleted == False,  # noqa: E712
        )
    )
    for hod_id in hod_res.scalars().all():
        await notif_repo.create_notification(
            user_id=hod_id,
            notification_type=NotificationType.MARKS_OVERDUE,
            content={
                "event_id": str(event.id),
                "event_title": event.title,
                "deadline": event.ends_at.isoformat(),
            },
        )

    log.info("grading_reminder.hod_notified_overdue", event_id=str(event.id))


@celery.task(
    name="app.workers.tasks.grading_reminder",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    queue="cleanup",
)
def grading_reminder(self) -> None:
    """Periodic task: send grading deadline reminders and overdue alerts."""
    try:
        asyncio.run(_run_grading_reminder())
    except Exception as exc:
        log.error("grading_reminder.failed", error=str(exc))
        raise self.retry(exc=exc)
