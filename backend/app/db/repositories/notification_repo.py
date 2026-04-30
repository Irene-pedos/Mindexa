from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import List, Tuple

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

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
    ) -> Tuple[List[Notification], int]:
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
