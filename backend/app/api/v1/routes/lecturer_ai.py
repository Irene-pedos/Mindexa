from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_lecturer
from app.schemas.lecturer_ai import LecturerSupportRequest, LecturerSupportResponse
from app.services.lecturer_ai_service import LecturerAIService

router = APIRouter(prefix="/lecturers/ai", tags=["Lecturer AI"])


@router.post(
    "/support",
    status_code=status.HTTP_200_OK,
    response_model=LecturerSupportResponse,
    summary="Ask the Lecturer AI Assistant",
)
async def lecturer_support(
    body: LecturerSupportRequest,
    current_user=Depends(require_lecturer),
    db: AsyncSession = Depends(get_db),
) -> LecturerSupportResponse:
    service = LecturerAIService(db)
    return await service.support(body, current_user)
