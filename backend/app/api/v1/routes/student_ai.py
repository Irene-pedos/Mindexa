from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_student
from app.schemas.student_ai import StudentSupportRequest, StudentSupportResponse
from app.services.student_ai_service import StudentAIService

router = APIRouter(prefix="/student/ai", tags=["Student AI"])


@router.post(
    "/support",
    status_code=status.HTTP_200_OK,
    response_model=StudentSupportResponse,
    summary="Ask the Student Support Agent",
)
async def student_support(
    body: StudentSupportRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudentSupportResponse:
    service = StudentAIService(db)
    return await service.support(body, current_user)
