from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.db.enums import NotificationType

class NotificationResponse(BaseModel):
    id: uuid.UUID
    notification_type: NotificationType
    title: str
    body: str
    action_url: Optional[str] = None   # deep-link URL (preferred over related_id where available)
    related_id: Optional[uuid.UUID] = None  # BUG-06: UUID of the related result/assessment
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int

class MarkReadResponse(BaseModel):
    success: bool
    message: str

# Rebuild models
NotificationResponse.model_rebuild()
NotificationListResponse.model_rebuild()
MarkReadResponse.model_rebuild()

