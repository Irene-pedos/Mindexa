"""
app/db/schemas/notification.py

Notification, scheduled event, and reminder schemas.
CalendarRangeRequest lives here — it is used for querying ScheduledEvents.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from app.db.enums import (NotificationChannel, NotificationType,
                          ScheduledEventType)
from app.db.schemas.base import BaseAuditedResponse, MindexaSchema
from pydantic import Field, model_validator

# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATION
# ─────────────────────────────────────────────────────────────────────────────

class NotificationResponse(BaseAuditedResponse):
    """Response schema for a single notification."""

    recipient_id: uuid.UUID
    notification_type: str
    channel: str
    title: str
    body: str
    action_url: Optional[str]
    reference_id: Optional[uuid.UUID]
    reference_type: Optional[str]
    is_read: bool
    read_at: Optional[datetime]
    is_dismissed: bool
    dismissed_at: Optional[datetime]
    delivered_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_expired: bool


class MarkNotificationsRead(MindexaSchema):
    """Mark one or more notifications as read."""

    notification_ids: List[uuid.UUID] = Field(
        min_length=1,
        max_length=100,
        description="IDs of notifications to mark as read.",
    )


class NotificationCountResponse(MindexaSchema):
    """
    Summary notification counts for the bell badge in the frontend.
    Returned by GET /notifications/count.
    """

    unread_count: int = Field(ge=0)
    total_count: int = Field(ge=0)


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULED EVENT
# ─────────────────────────────────────────────────────────────────────────────

class ScheduledEventResponse(BaseAuditedResponse):
    """Response schema for a scheduled calendar event."""

    user_id: uuid.UUID
    event_type: str
    title: str
    description: Optional[str]
    starts_at: datetime
    ends_at: Optional[datetime]
    all_day: bool
    event_source_id: uuid.UUID
    event_source_type: str
    is_cancelled: bool
    cancelled_at: Optional[datetime]
    cancellation_reason: Optional[str]
    colour_hint: Optional[str]
    action_url: Optional[str]


class CalendarRangeRequest(MindexaSchema):
    """
    Query parameters for calendar range views.

    Used by:
        GET /schedule?from_date=...&to_date=...
        GET /lecturer/schedule?from_date=...&to_date=...

    Max range is 90 days to prevent runaway queries.
    """

    from_date: datetime = Field(description="Start of calendar range (UTC).")
    to_date: datetime = Field(description="End of calendar range (UTC).")

    @model_validator(mode="after")
    def validate_range(self) -> "CalendarRangeRequest":
        if self.to_date <= self.from_date:
            raise ValueError("to_date must be after from_date.")
        delta = self.to_date - self.from_date
        if delta.days > 90:
            raise ValueError(
                "Calendar range cannot exceed 90 days. "
                "Use multiple requests for longer ranges."
            )
        return self
