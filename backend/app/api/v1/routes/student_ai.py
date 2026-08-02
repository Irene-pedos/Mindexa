from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_student
from app.schemas.student_ai import (
    StudentSupportRequest,
    StudentSupportResponse,
    StudentChatHistoryItem,
    RevisionGuideRequest,
    RevisionGuideOutput,
)
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


@router.get(
    "/history",
    status_code=status.HTTP_200_OK,
    response_model=list[StudentChatHistoryItem],
    summary="Get student AI chat history",
)
async def get_chat_history(
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> list[StudentChatHistoryItem]:
    service = StudentAIService(db)
    return await service.get_chat_history(current_user.id)


@router.post(
    "/revision",
    status_code=status.HTTP_200_OK,
    response_model=RevisionGuideOutput,
    summary="Generate structured revision guide",
)
async def generate_revision_guide(
    body: RevisionGuideRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> RevisionGuideOutput:
    service = StudentAIService(db)
    return await service.generate_revision_guide(body, current_user.id)
