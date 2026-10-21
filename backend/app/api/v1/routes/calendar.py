"""
app/api/v1/routes/calendar.py

Phase 6C: Academic Calendar endpoints.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import CalendarEventType
from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import (
    ActiveUser,
    AdminUser,
    LecturerOrAdminUser,
    require_active_user,
    require_admin,
    require_lecturer_or_admin,
)
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventListResponse,
    CalendarEventResponse,
    UnifiedCalendarItem,
)
from app.services.calendar_service import CalendarService

router = APIRouter(tags=["Academic Calendar"])


@router.post(
    "/academic-calendar",
    response_model=CalendarEventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a calendar event (Admin / HOD)",
)
async def create_calendar_event(
    payload: CalendarEventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> CalendarEventResponse:
    service = CalendarService(db)
    event = await service.create_event(
        creator=current_user,
        institution_id=payload.institution_id,
        academic_period_id=payload.academic_period_id,
        event_type=payload.event_type,
        title=payload.title,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        department_id=payload.department_id,
    )
    return CalendarEventResponse.model_validate(event)


@router.get(
    "/academic-calendar",
    response_model=CalendarEventListResponse,
    summary="List calendar events for an institution",
)
async def list_calendar_events(
    institution_id: uuid.UUID = Query(...),
    academic_period_id: Optional[uuid.UUID] = Query(default=None),
    department_id: Optional[uuid.UUID] = Query(default=None),
    event_type: Optional[CalendarEventType] = Query(default=None),
    from_dt: Optional[datetime] = Query(default=None),
    to_dt: Optional[datetime] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_lecturer_or_admin),
) -> CalendarEventListResponse:
    service = CalendarService(db)
    items = await service.list_events(
        institution_id=institution_id,
        from_dt=from_dt,
        to_dt=to_dt,
        academic_period_id=academic_period_id,
        department_id=department_id,
        event_type=event_type,
        limit=limit,
        offset=offset,
    )
    return CalendarEventListResponse(
        items=[CalendarEventResponse.model_validate(e) for e in items],
        total=len(items),
    )


@router.delete(
    "/academic-calendar/{event_id}",
    response_model=CalendarEventResponse,
    summary="Delete a calendar event (soft-delete)",
)
async def delete_calendar_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> CalendarEventResponse:
    service = CalendarService(db)
    event = await service.delete_event(event_id=event_id, requester=current_user)
    return CalendarEventResponse.model_validate(event)


@router.get(
    "/me/calendar",
    response_model=List[UnifiedCalendarItem],
    summary="Get unified calendar for the current user",
)
async def get_my_calendar(
    institution_id: Optional[uuid.UUID] = Query(default=None),
    from_dt: Optional[datetime] = Query(default=None),
    to_dt: Optional[datetime] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
) -> List[UnifiedCalendarItem]:
    service = CalendarService(db)
    raw_items = await service.get_unified_calendar(
        user=current_user,
        from_dt=from_dt,
        to_dt=to_dt,
        institution_id=institution_id,
    )
    return [UnifiedCalendarItem(**item) for item in raw_items]
