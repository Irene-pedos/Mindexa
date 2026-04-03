"""
app/db/models/notification.py

Notification, scheduled event, and reminder models for Mindexa.

Tables defined here:
    notification       — A single notification record for one recipient
    scheduled_event    — A calendar/schedule entry derived from academic activity
    reminder           — A time-based trigger that generates a notification

Architectural principles applied here:

    1. Notifications are RECIPIENT-SCOPED.
       Every notification is for exactly one user (recipient_id). There is no
       broadcast row — if 50 students need the same notification, 50 rows are
       created. This is correct for a system where per-user read state,
       dismissal, and delivery tracking matters.
       High-volume fan-out (e.g. publishing an assessment to 200 students) is
       handled by a Celery bulk-insert task, not by creating rows one-by-one
       in the request thread.

    2. Notifications are TYPED but content is flexible.
       notification_type drives the UI icon and routing on the frontend.
       The title and body are pre-rendered by the service layer at creation
       time so the notification can be displayed without additional DB lookups.
       The reference_id and reference_type fields allow the frontend to build
       a deep-link ("View Result" → /student/results/{reference_id}) without
       embedding logic in the notification row itself.

    3. Scheduled events are DERIVED from academic objects.
       A scheduled_event is NOT an assessment row — it is a calendar
       representation of an academic object for the student/lecturer schedule
       view. When an assessment is published, the service layer creates
       a scheduled_event for each enrolled student and the supervising
       lecturers. When the assessment window changes, the scheduled_event
       is updated. This keeps the schedule view fast (no complex joins
       against assessment + attempt + enrollment at query time).

    4. Reminders are DETACHED from notifications.
       A reminder is a future-scheduled trigger. When the trigger fires
       (Celery beat task), the reminder creates a notification. The reminder
       row remains after firing so it can be rescheduled or audited.
       This two-table design means the notification table stays clean and
       does not carry undelivered scheduling state.

Import order safety:
    This file imports from:
        app.db.base    → BaseModel, utcnow
        app.db.enums   → NotificationType, NotificationChannel,
                         ScheduledEventType
        app.db.mixins  → composite_index

    This file does NOT reference any other model modules at runtime.
    All cross-model references are via plain UUIDs validated at service layer.

Cascade rules:
    All FKs to user.id use ondelete=RESTRICT — notifications must not
    disappear when a user is soft-deleted. Academic communication history
    is preserved for compliance purposes.

    reminder → CASCADE from assessment. If an assessment is deleted (admin
    action only), its pending reminders are removed. Reminders that have
    already fired are retained as NotificationChannel records.

JSONB:
    None in this module. Notification content is stored as plain text/varchar
    fields (title, body, action_url). This avoids the overhead of JSONB for
    a high-read, insert-heavy table.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from app.db.base import BaseModel, utcnow
from app.db.enums import (NotificationChannel, NotificationType,
                          ScheduledEventType)
from app.db.mixins import composite_index
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship

# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATION
# ─────────────────────────────────────────────────────────────────────────────

class Notification(BaseModel, table=True):
    """
    A single notification record for one recipient.

    Notifications are created by the service layer in response to platform
    events. They are never created directly by route handlers.

    notification_type drives the frontend icon and routing:
        RESULT_RELEASED       → Student: "Your result for X is available."
        ASSESSMENT_PUBLISHED  → Student: "A new assessment has been published."
        ASSESSMENT_UPCOMING   → Student: "Reminder: X starts in 24 hours."
        ASSESSMENT_OVERDUE    → Student: "X is now past due."
        DEADLINE_EXTENDED     → Student: "Deadline for X has been extended."
        GRADE_REVIEWED        → Student: "Your grade for X has been updated."
        APPEAL_DECISION       → Student: "Your appeal for X has been resolved."
        FEEDBACK_AVAILABLE    → Student: "Feedback for X is now available."
        NEW_SUBMISSION        → Lecturer: "A student submitted X."
        PENDING_GRADING       → Lecturer: "You have N submissions to grade."
        INTEGRITY_ALERT       → Lecturer: "Integrity flag raised on attempt."
        REASSESSMENT_REQUEST  → Lecturer: "Student requested reassessment."
        REVIEW_REQUEST        → Lecturer: "Student submitted an appeal."
        SYSTEM_ANNOUNCEMENT   → All roles: platform-level announcement.

    channel (NotificationChannel enum):
        IN_APP   → Shown in the notifications dropdown (always created).
        EMAIL    → Delivered via email (created when email is enabled for
                   this notification type in user preferences).
        In MVP, only IN_APP is implemented. EMAIL is modelled now so the
        schema does not need to change when email delivery is added.

    is_read:
        False until the student/lecturer opens the notification.
        Updated by the mark-as-read endpoint.

    is_dismissed:
        True when the user explicitly dismisses the notification.
        Dismissed notifications are hidden from the count badge but
        remain in the notification history.

    reference_id / reference_type:
        Optional deep-link target. The frontend uses these to build
        action buttons:
            reference_type = "assessment"
            reference_id = <assessment_uuid>
            → action_url = /student/assessments/{reference_id}

        reference_type values (not an enum — extensible):
            "assessment", "attempt", "submission_grade", "result_appeal",
            "integrity_flag", "assessment_question"

    action_url:
        Pre-built deep-link URL. Stored to avoid frontend URL-building
        logic that could diverge from backend routing. Built by the service
        layer at notification creation time.

    delivered_at:
        For IN_APP: set when the notification is returned in the first
        read response (i.e. "seen" by the frontend polling or push).
        For EMAIL: set when the email service confirms delivery.
        NULL until delivered.

    expires_at:
        Optional expiry. Expired notifications are hidden from the UI
        but not deleted (preserved for audit). Celery task marks them
        as expired daily.
    """

    __tablename__ = "notification"

    __table_args__ = (
        # Primary: unread notifications for a user (notification bell query)
        composite_index(
            "notification",
            "recipient_id", "is_read", "is_dismissed",
        ),
        # Secondary: notifications by type for a user
        composite_index(
            "notification",
            "recipient_id", "notification_type",
        ),
        # Delivery queue: undelivered notifications by channel
        composite_index(
            "notification",
            "channel", "delivered_at",
        ),
        # Reference lookup: all notifications linked to a specific object
        composite_index(
            "notification",
            "reference_type", "reference_id",
        ),
        # Expiry cleanup task
        composite_index("notification", "expires_at"),
    )

    # ── Recipient ─────────────────────────────────────────────────────────────

    recipient_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )

    # ── Content ───────────────────────────────────────────────────────────────

    notification_type: NotificationType = Field(nullable=False, index=True)
    channel: NotificationChannel = Field(
        default=NotificationChannel.IN_APP,
        nullable=False,
        index=True,
    )
    title: str = Field(nullable=False, max_length=255)
    body: str = Field(nullable=False, max_length=1000)
    action_url: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
    )

    # ── Deep-link reference ───────────────────────────────────────────────────

    reference_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
        # Plain UUID — the referenced object's PK. No FK declared because
        # reference_type determines which table this points to and SQLAlchemy
        # does not support polymorphic FK references natively.
    )
    reference_type: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=50,
        index=True,
    )

    # ── State ─────────────────────────────────────────────────────────────────

    is_read: bool = Field(default=False, nullable=False, index=True)
    read_at: Optional[datetime] = Field(default=None, nullable=True)
    is_dismissed: bool = Field(default=False, nullable=False, index=True)
    dismissed_at: Optional[datetime] = Field(default=None, nullable=True)

    # ── Delivery tracking ─────────────────────────────────────────────────────

    delivered_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    delivery_error: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
        # Error message if delivery failed (e.g. email bounce).
        # NULL on successful delivery.
    )

    # ── Expiry ────────────────────────────────────────────────────────────────

    expires_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    is_expired: bool = Field(default=False, nullable=False, index=True)


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULED EVENT
# ─────────────────────────────────────────────────────────────────────────────

class ScheduledEvent(BaseModel, table=True):
    """
    A calendar representation of an academic event for one user.

    ScheduledEvents are the data source for the student and lecturer
    schedule/calendar views. They are derived from academic objects
    (assessments, group work deadlines, reassessment windows) and
    kept synchronised by the service layer when the source object changes.

    One ScheduledEvent row exists per (event_source_id, user_id) pair.
    If an assessment is targeted at 3 class sections with 50 students each,
    150 student rows and N lecturer rows are created. This is correct:
        - Each student's calendar is personal (their own start time, state).
        - Fan-out is handled by bulk insert in a Celery task.

    event_type (ScheduledEventType enum):
        ASSESSMENT_WINDOW    → The open window for taking an assessment.
        HOMEWORK_DEADLINE    → Due date for homework/group work submission.
        RESULT_RELEASE       → Scheduled result release date.
        REASSESSMENT_WINDOW  → The window for a reassessment attempt.
        REVIEW_WINDOW        → The window within which appeals can be raised.
        SUPERVISION_SHIFT    → A lecturer's assigned supervision slot.

    event_source_id / event_source_type:
        The academic object this event derives from. Same polymorphic
        pattern as Notification.reference_id:
            event_source_type = "assessment"
            event_source_id   = <assessment_uuid>
        Used by the frontend to navigate to the source object on click.

    is_cancelled:
        True when the source assessment is cancelled or postponed.
        Cancelled events appear in the calendar with a strikethrough
        but are not deleted — they preserve the history of what was
        scheduled and when it changed.

    colour_hint:
        Optional hex colour code for calendar display. Defaults are
        defined by the frontend based on event_type. Custom colours
        can be set per institution or per course by admin configuration.
        Stored here so the API can override the frontend default when needed.
    """

    __tablename__ = "scheduled_event"

    __table_args__ = (
        UniqueConstraint(
            "event_source_id", "event_source_type", "user_id",
            name="uq_scheduled_event_source_user",
        ),
        # Primary: a user's calendar for a date range (calendar view query)
        composite_index(
            "scheduled_event",
            "user_id", "starts_at", "is_cancelled",
        ),
        # Secondary: all events for a user by type
        composite_index(
            "scheduled_event",
            "user_id", "event_type", "is_cancelled",
        ),
        # Source lookup: all schedule entries for a given assessment
        composite_index(
            "scheduled_event",
            "event_source_id", "event_source_type",
        ),
    )

    # ── Owner ─────────────────────────────────────────────────────────────────

    user_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )

    # ── Event identity ────────────────────────────────────────────────────────

    event_type: ScheduledEventType = Field(nullable=False, index=True)
    title: str = Field(nullable=False, max_length=255)
    description: Optional[str] = Field(default=None, nullable=True)

    # ── Timing ────────────────────────────────────────────────────────────────

    starts_at: datetime = Field(nullable=False, index=True)
    ends_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        # NULL for point-in-time events (e.g. RESULT_RELEASE).
        # Set for window events (e.g. ASSESSMENT_WINDOW).
    )
    all_day: bool = Field(
        default=False,
        nullable=False,
        # True for events like REVIEW_WINDOW that span entire days.
    )

    # ── Source reference (polymorphic) ────────────────────────────────────────

    event_source_id: uuid.UUID = Field(
        nullable=False,
        index=True,
        # Plain UUID — no declared FK because source_type determines the table.
    )
    event_source_type: str = Field(
        nullable=False,
        max_length=50,
        index=True,
        # "assessment" | "submission_grade" | "result_appeal" | "assessment_attempt"
    )

    # ── State ─────────────────────────────────────────────────────────────────

    is_cancelled: bool = Field(default=False, nullable=False, index=True)
    cancelled_at: Optional[datetime] = Field(default=None, nullable=True)
    cancellation_reason: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
    )

    # ── Display ───────────────────────────────────────────────────────────────

    colour_hint: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=7,
        # Hex colour code, e.g. "#E53935". 7 chars = # + 6 hex digits.
    )
    action_url: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
        # Pre-built deep-link for this event in the calendar UI.
    )


# ─────────────────────────────────────────────────────────────────────────────
# REMINDER
# ─────────────────────────────────────────────────────────────────────────────

class Reminder(BaseModel, table=True):
    """
    A time-based trigger that generates a notification when it fires.

    Reminders are created by the service layer when:
        - An assessment is published → reminder created for enrolled students
          (e.g. "24 hours before window opens", "1 hour before deadline")
        - A result is not yet released → reminder created for the lecturer
          (e.g. "You have pending grades from 3 days ago")
        - A reassessment window is approaching → reminder for eligible students

    The Celery beat task (reminders_beat) queries:
        SELECT * FROM reminder
        WHERE fires_at <= NOW()
        AND is_fired = FALSE
        AND is_cancelled = FALSE
        ORDER BY fires_at ASC
        LIMIT 500
    and processes each reminder by creating the corresponding notification.

    reminder_type:
        Re-uses NotificationType values. The notification created when the
        reminder fires will have this notification_type.

    recipient_id:
        The user who will receive the notification when this reminder fires.
        One reminder row = one future notification for one recipient.
        Bulk reminders (e.g. 200 students) = 200 reminder rows,
        created by a Celery fan-out task.

    reference_id / reference_type:
        Passed through to the notification created when this reminder fires.
        Same polymorphic pattern as Notification.

    fires_at:
        The UTC datetime when this reminder should be processed.
        The Celery beat task checks this with a small tolerance window
        (fires_at BETWEEN NOW() - INTERVAL '5 minutes' AND NOW())
        to handle task queue delays without missing reminders.

    is_fired:
        Set to True after the notification is successfully created.
        A fired reminder is never reprocessed.

    fired_at:
        Timestamp of actual processing. May differ from fires_at due
        to queue delay. The difference is logged for SLA monitoring.

    fired_notification_id:
        Plain UUID reference to the Notification row that was created.
        Allows the audit trail to link reminder → notification.

    is_cancelled:
        True when the source event is cancelled (e.g. assessment postponed).
        Cancelled reminders are skipped by the processing task.
    """

    __tablename__ = "reminder"

    __table_args__ = (
        # Primary: unprocessed reminders by fire time (Celery query)
        composite_index(
            "reminder",
            "fires_at", "is_fired", "is_cancelled",
        ),
        # All reminders for a recipient
        composite_index("reminder", "recipient_id", "is_fired"),
        # All reminders linked to a source object
        composite_index(
            "reminder",
            "reference_id", "reference_type",
        ),
        # Assessment-scoped reminder management (cancel all when postponed)
        composite_index(
            "reminder",
            "assessment_id", "is_cancelled",
        ),
    )

    # ── Recipient ─────────────────────────────────────────────────────────────

    recipient_id: uuid.UUID = Field(
        nullable=False,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"ondelete": "RESTRICT"},
    )

    # ── Content template ──────────────────────────────────────────────────────

    reminder_type: NotificationType = Field(nullable=False, index=True)
    title_template: str = Field(
        nullable=False,
        max_length=255,
        # The notification title that will be created when this fires.
        # Pre-rendered at reminder creation time (not a template with
        # variables) — the service layer resolves all variable substitutions
        # before storing the reminder.
    )
    body_template: str = Field(
        nullable=False,
        max_length=1000,
        # Same pattern as title_template.
    )

    # ── Source reference ──────────────────────────────────────────────────────

    reference_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        index=True,
    )
    reference_type: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=50,
    )
    action_url: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
    )
    # Assessment FK — used for bulk cancellation when an assessment changes
    assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        foreign_key="assessment.id",
        index=True,
        sa_column_kwargs={"ondelete": "CASCADE"},
        # CASCADE: if an assessment is deleted, its pending reminders are removed.
        # This is the only CASCADE-to-assessment in this module.
    )

    # ── Scheduling ────────────────────────────────────────────────────────────

    fires_at: datetime = Field(nullable=False, index=True)

    # ── State ─────────────────────────────────────────────────────────────────

    is_fired: bool = Field(default=False, nullable=False, index=True)
    fired_at: Optional[datetime] = Field(default=None, nullable=True)
    fired_notification_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        # Plain UUID — the Notification row created when this reminder fired.
    )
    is_cancelled: bool = Field(default=False, nullable=False, index=True)
    cancelled_at: Optional[datetime] = Field(default=None, nullable=True)
    cancellation_reason: Optional[str] = Field(
        default=None,
        nullable=True,
        max_length=500,
    )

