"""
app/workers/tasks/sealing_deadline.py

Phase 3: Periodic Celery task to monitor assessment sealing deadlines.
Runs every 15 minutes (or on demand with an injected clock for unit tests).

Spec Section 7.5:
For assessments with requires_moderation=True and not yet SEALED:
    - If sealing_warning_days is set and window_start - now <= warning:
        schedule_state = AT_RISK
        notify author + moderators + HOD (once per state change)
    - If window_start <= now and not SEALED:
        schedule_state = SHIFT_REQUIRED
        notify author, HOD, exam officer (once per state change)
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.celery_app import celery
from app.core.constants import Duty
from app.db.enums import (
    AssessmentStatus,
    NotificationType,
    ScheduleState,
)
from app.db.models.academic import Course
from app.db.models.assessment import Assessment
from app.db.models.audit import AuditLog
from app.db.models.duty import UserDutyAssignment
from app.db.models.policy import ApprovalPolicy
from app.db.repositories.notification_repo import NotificationRepository
from app.db.session import AsyncSessionLocal


async def run_check_sealing_deadlines(
    db: AsyncSession,
    now: Optional[datetime] = None,
) -> dict:
    """
    Check all assessments requiring moderation that have not been sealed yet.
    Accepts an injected clock `now` to enable deterministic unit testing (Spec 3.6).
    """
    current_time = now or datetime.now(UTC)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=UTC)

    notification_repo = NotificationRepository(db)

    # 1. Fetch all assessments that are not yet sealed/published/archived
    unsealed_statuses = [
        AssessmentStatus.DRAFT,
        AssessmentStatus.PENDING_MODERATION,
        AssessmentStatus.CHANGES_REQUESTED,
        AssessmentStatus.APPROVED,
    ]

    stmt = (
        select(Assessment)
        .where(
            Assessment.is_deleted == False,  # noqa: E712
            Assessment.status.in_(unsealed_statuses),
            Assessment.window_start.is_not(None),
        )
        .options(selectinload(Assessment.course))
    )
    result = await db.execute(stmt)
    assessments = list(result.scalars().all())

    updated_at_risk = 0
    updated_shift_required = 0

    for asmt in assessments:
        # Check if policy requires moderation
        if not asmt.course or not asmt.course.institution_id:
            continue

        policy_stmt = (
            select(ApprovalPolicy)
            .where(
                ApprovalPolicy.institution_id == asmt.course.institution_id,
                ApprovalPolicy.assessment_type == asmt.assessment_type,
                ApprovalPolicy.is_deleted == False,  # noqa: E712
                ApprovalPolicy.is_active == True,  # noqa: E712
            )
        )
        p_res = await db.execute(policy_stmt)
        policy = p_res.scalar_one_or_none()
        if not policy or not policy.requires_moderation:
            continue

        w_start = asmt.window_start
        if w_start.tzinfo is None:
            w_start = w_start.replace(tzinfo=UTC)

        dept_id = asmt.course.department_id
        inst_id = asmt.course.institution_id

        # Condition 2: window_start <= now and not sealed -> SHIFT_REQUIRED
        if w_start <= current_time:
            if asmt.schedule_state != ScheduleState.SHIFT_REQUIRED:
                prev_state = asmt.schedule_state
                asmt.schedule_state = ScheduleState.SHIFT_REQUIRED
                updated_shift_required += 1

                # Notify author
                await notification_repo.create(
                    recipient_id=asmt.created_by_id,
                    notification_type=NotificationType.SCHEDULE_SHIFT_REQUIRED,
                    title="Assessment Schedule Shift Required",
                    body=f"Assessment '{asmt.title}' exam window has begun without exam office seal. Exam must be shifted.",
                    reference_id=asmt.id,
                    reference_type="assessment",
                    action_url=f"/lecturer/assessments/{asmt.id}",
                )

                # Notify HOD
                if dept_id:
                    hod_stmt = select(UserDutyAssignment.user_id).where(
                        UserDutyAssignment.duty == Duty.DEPARTMENT_HEAD,
                        UserDutyAssignment.department_id == dept_id,
                        UserDutyAssignment.is_active == True,  # noqa: E712
                        UserDutyAssignment.is_deleted == False,  # noqa: E712
                    )
                    hod_ids = (await db.execute(hod_stmt)).scalars().all()
                    for hod_id in hod_ids:
                        await notification_repo.create(
                            recipient_id=hod_id,
                            notification_type=NotificationType.SCHEDULE_SHIFT_REQUIRED,
                            title="Assessment Shift Required",
                            body=f"Assessment '{asmt.title}' window reached without sealing.",
                            reference_id=asmt.id,
                            reference_type="assessment",
                            action_url=f"/hod/assessments/{asmt.id}",
                        )

                # Notify Exam Officer
                eo_stmt = select(UserDutyAssignment.user_id).where(
                    UserDutyAssignment.duty == Duty.EXAM_OFFICER,
                    UserDutyAssignment.institution_id == inst_id,
                    UserDutyAssignment.is_active == True,  # noqa: E712
                    UserDutyAssignment.is_deleted == False,  # noqa: E712
                )
                eo_ids = (await db.execute(eo_stmt)).scalars().all()
                for eo_id in eo_ids:
                    await notification_repo.create(
                        recipient_id=eo_id,
                        notification_type=NotificationType.SCHEDULE_SHIFT_REQUIRED,
                        title="Assessment Shift Required",
                        body=f"Assessment '{asmt.title}' window open without seal.",
                        reference_id=asmt.id,
                        reference_type="assessment",
                        action_url=f"/exam-office/assessments/{asmt.id}",
                    )

                # Audit
                audit = AuditLog(
                    actor_id=None,
                    actor_role="SYSTEM",
                    entity_type="assessment",
                    entity_id=asmt.id,
                    action="schedule_state_changed",
                    description=f"Assessment '{asmt.title}' schedule state changed from {prev_state.value} to SHIFT_REQUIRED.",
                    before_state={"schedule_state": prev_state.value},
                    after_state={"schedule_state": ScheduleState.SHIFT_REQUIRED.value},
                )
                db.add(audit)

        # Condition 1: window_start - now <= warning_days -> AT_RISK
        elif policy.sealing_warning_days is not None:
            warning_delta = timedelta(days=policy.sealing_warning_days)
            if (w_start - current_time) <= warning_delta:
                if asmt.schedule_state == ScheduleState.ON_TRACK:
                    asmt.schedule_state = ScheduleState.AT_RISK
                    updated_at_risk += 1

                    # Notify author
                    await notification_repo.create(
                        recipient_id=asmt.created_by_id,
                        notification_type=NotificationType.SCHEDULE_AT_RISK,
                        title="Assessment Sealing Deadline Approaching",
                        body=f"Assessment '{asmt.title}' starts in less than {policy.sealing_warning_days} days and is not yet sealed.",
                        reference_id=asmt.id,
                        reference_type="assessment",
                        action_url=f"/lecturer/assessments/{asmt.id}",
                    )

                    # Notify Moderators
                    if dept_id:
                        mod_stmt = select(UserDutyAssignment.user_id).where(
                            UserDutyAssignment.duty == Duty.MODERATOR,
                            UserDutyAssignment.department_id == dept_id,
                            UserDutyAssignment.is_active == True,  # noqa: E712
                            UserDutyAssignment.is_deleted == False,  # noqa: E712
                        )
                        mod_ids = (await db.execute(mod_stmt)).scalars().all()
                        for mod_id in mod_ids:
                            await notification_repo.create(
                                recipient_id=mod_id,
                                notification_type=NotificationType.SCHEDULE_AT_RISK,
                                title="Moderation Deadline Approaching",
                                body=f"Assessment '{asmt.title}' is at risk of missing sealing deadline.",
                                reference_id=asmt.id,
                                reference_type="assessment",
                                action_url=f"/moderator/assessments/{asmt.id}",
                            )

                        # Notify HOD
                        hod_stmt = select(UserDutyAssignment.user_id).where(
                            UserDutyAssignment.duty == Duty.DEPARTMENT_HEAD,
                            UserDutyAssignment.department_id == dept_id,
                            UserDutyAssignment.is_active == True,  # noqa: E712
                            UserDutyAssignment.is_deleted == False,  # noqa: E712
                        )
                        hod_ids = (await db.execute(hod_stmt)).scalars().all()
                        for hod_id in hod_ids:
                            await notification_repo.create(
                                recipient_id=hod_id,
                                notification_type=NotificationType.SCHEDULE_AT_RISK,
                                title="Assessment at Risk",
                                body=f"Assessment '{asmt.title}' is at risk of missing sealing deadline.",
                                reference_id=asmt.id,
                                reference_type="assessment",
                                action_url=f"/hod/assessments/{asmt.id}",
                            )

                    # Audit
                    audit = AuditLog(
                        actor_id=None,
                        actor_role="SYSTEM",
                        entity_type="assessment",
                        entity_id=asmt.id,
                        action="schedule_state_changed",
                        description=f"Assessment '{asmt.title}' schedule state changed from ON_TRACK to AT_RISK.",
                        before_state={"schedule_state": ScheduleState.ON_TRACK.value},
                        after_state={"schedule_state": ScheduleState.AT_RISK.value},
                    )
                    db.add(audit)
            else:
                # Outside warning window (rescheduled into the future)
                if asmt.schedule_state in (ScheduleState.AT_RISK, ScheduleState.SHIFT_REQUIRED):
                    prev_state = asmt.schedule_state
                    asmt.schedule_state = ScheduleState.ON_TRACK
                    audit = AuditLog(
                        actor_id=None,
                        actor_role="SYSTEM",
                        entity_type="assessment",
                        entity_id=asmt.id,
                        action="schedule_state_changed",
                        description=f"Assessment '{asmt.title}' window rescheduled; schedule state reset from {prev_state.value} to ON_TRACK.",
                        before_state={"schedule_state": prev_state.value},
                        after_state={"schedule_state": ScheduleState.ON_TRACK.value},
                    )
                    db.add(audit)
        else:
            # No warning days configured, but window is in the future
            if asmt.schedule_state == ScheduleState.SHIFT_REQUIRED:
                prev_state = asmt.schedule_state
                asmt.schedule_state = ScheduleState.ON_TRACK
                audit = AuditLog(
                    actor_id=None,
                    actor_role="SYSTEM",
                    entity_type="assessment",
                    entity_id=asmt.id,
                    action="schedule_state_changed",
                    description=f"Assessment '{asmt.title}' window rescheduled; schedule state reset from {prev_state.value} to ON_TRACK.",
                    before_state={"schedule_state": prev_state.value},
                    after_state={"schedule_state": ScheduleState.ON_TRACK.value},
                )
                db.add(audit)

    await db.commit()

    return {
        "checked": len(assessments),
        "updated_at_risk": updated_at_risk,
        "updated_shift_required": updated_shift_required,
    }


@celery.task(name="app.workers.tasks.check_sealing_deadlines")
def check_sealing_deadlines() -> dict:
    """Periodic Celery beat task executing the sealing deadline check."""
    async def _async_run():
        async with AsyncSessionLocal() as db:
            return await run_check_sealing_deadlines(db)

    return asyncio.run(_async_run())
