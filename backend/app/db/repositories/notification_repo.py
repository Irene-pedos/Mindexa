from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import NotificationChannel, NotificationType
from app.db.models.notification import Notification


class NotificationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_by_recipient(
        self,
        recipient_id: uuid.UUID,
        unread_only: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Notification], int]:
        filters = [
            Notification.recipient_id == recipient_id,
            Notification.is_dismissed == False,
            Notification.is_deleted == False,
        ]
        if unread_only:
            filters.append(Notification.is_read == False)

        count_result = await self.db.execute(
            select(func.count(Notification.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(Notification)
            .where(*filters)
            .order_by(Notification.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def mark_as_read(self, notification_id: uuid.UUID, recipient_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.id == notification_id,
                Notification.recipient_id == recipient_id
            )
            .values(is_read=True, read_at=datetime.now(UTC))
        )
        return result.rowcount > 0

    async def mark_all_as_read(self, recipient_id: uuid.UUID) -> int:
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.recipient_id == recipient_id,
                Notification.is_read == False
            )
            .values(is_read=True, read_at=datetime.now(UTC))
        )
        return result.rowcount

    async def create(self, **kwargs) -> Notification:
        notification = Notification(**kwargs)
        self.db.add(notification)
        return notification

    async def create_notification(
        self,
        user_id: uuid.UUID,
        notification_type: NotificationType,
        content: dict | None = None,
        title: str | None = None,
        body: str | None = None,
        reference_id: uuid.UUID | None = None,
        reference_type: str | None = None,
        action_url: str | None = None,
        channel: NotificationChannel = NotificationChannel.IN_APP,
    ) -> Notification:
        import json
        t = title or str(notification_type.value).replace("_", " ").title()
        b = body or (json.dumps(content) if content else t)
        notification = Notification(
            recipient_id=user_id,
            notification_type=notification_type,
            title=t,
            body=b,
            channel=channel,
            reference_id=reference_id,
            reference_type=reference_type,
            action_url=action_url,
        )
        self.db.add(notification)
        return notification

