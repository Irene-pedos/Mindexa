from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_student
import uuid
from app.schemas.student_ai import (
    StudentSupportRequest,
    StudentSupportResponse,
    StudentChatHistoryItem,
    StudentConversationSummary,
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
    "/conversations",
    status_code=status.HTTP_200_OK,
    response_model=list[StudentConversationSummary],
    summary="Get student AI conversations summary list",
)
async def get_conversations(
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> list[StudentConversationSummary]:
    service = StudentAIService(db)
    return await service.get_conversations(current_user.id, limit=limit, offset=offset)


@router.get(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_200_OK,
    response_model=list[StudentChatHistoryItem],
    summary="Get all turns in a student AI conversation thread",
)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> list[StudentChatHistoryItem]:
    service = StudentAIService(db)
    return await service.get_conversation(current_user.id, conversation_id)


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a student AI conversation thread",
)
async def delete_conversation(
    conversation_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = StudentAIService(db)
    success = await service.delete_conversation(current_user.id, conversation_id)
    return {"success": success, "conversation_id": conversation_id}


@router.get(
    "/history",
    status_code=status.HTTP_200_OK,
    response_model=list[StudentChatHistoryItem],
    summary="Get student AI chat history (legacy)",
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
