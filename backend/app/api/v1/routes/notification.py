from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.db.repositories.notification_repo import NotificationRepository
from app.schemas.notification import NotificationListResponse, MarkReadResponse

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get(
    "/me",
    response_model=NotificationListResponse,
    summary="List your own notifications",
)
async def list_my_notifications(
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationListResponse:
    repo = NotificationRepository(db)
    items, total = await repo.list_by_recipient(
        recipient_id=current_user.id,
        unread_only=unread_only,
        page=page,
        page_size=page_size
    )
    return NotificationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )

@router.post(
    "/{notification_id}/read",
    response_model=MarkReadResponse,
    summary="Mark a notification as read",
)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> MarkReadResponse:
    repo = NotificationRepository(db)
    success = await repo.mark_as_read(notification_id, current_user.id)
    return MarkReadResponse(
        success=success,
        message="Notification marked as read" if success else "Notification not found"
    )

@router.post(
    "/mark-all-read",
    response_model=MarkReadResponse,
    summary="Mark all notifications as read",
)
async def mark_all_notifications_read(
    current_user = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> MarkReadResponse:
    repo = NotificationRepository(db)
    count = await repo.mark_all_as_read(current_user.id)
    return MarkReadResponse(
        success=True,
        message=f"{count} notifications marked as read"
    )
