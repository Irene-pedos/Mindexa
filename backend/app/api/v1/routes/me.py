"""
app/api/v1/routes/me.py

Endpoints for authenticated user-context queries (e.g. /me/duties).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.schemas.duty import DutyAssignmentResponse
from app.services.duty_service import DutyService

router = APIRouter(prefix="/me", tags=["Current User"])


@router.get(
    "/duties",
    response_model=list[DutyAssignmentResponse],
    summary="Get current user's duty assignments",
)
async def get_my_duties(
    active_only: bool = Query(True, description="Filter for active assignments only"),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[DutyAssignmentResponse]:
    """
    Retrieve duty assignments for the currently authenticated user.
    Accessible to any active authenticated user.
    """
    service = DutyService(db)
    assignments = await service.get_user_duties(
        user_id=current_user.id,
        active_only=active_only,
    )
    return [DutyService.build_response(a) for a in assignments]
