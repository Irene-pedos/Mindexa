"""
app/api/v1/routes/admin_ai_audit.py

Admin endpoint for querying and monitoring the AIActionLog.
This allows institutions to verify how AI is being used across the platform.
"""

import uuid
from typing import Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import datetime

from app.dependencies.auth import AdminUser
from app.db.session import get_db
from app.db.models.ai import AIActionLog
from app.db.enums import AIActionType, AIActionStatus
from app.core.exceptions import NotFoundError

router = APIRouter(prefix="/admin/ai-audit", tags=["admin_ai_audit"])


class AIActionLogResponse(BaseModel):
    id: uuid.UUID
    created_at: datetime
    action_type: AIActionType
    status: AIActionStatus
    actor_id: uuid.UUID | None
    actor_role: str | None
    subject_entity_type: str | None
    subject_entity_id: uuid.UUID | None
    provider_name: str | None
    model_name: str
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    latency_ms: int | None
    cost_estimate: float | None
    prompt_summary: str | None
    error_message: str | None
    human_reviewed: bool | None
    parent_log_id: uuid.UUID | None
    
    class Config:
        from_attributes = True

class AIActionLogDetailResponse(AIActionLogResponse):
    raw_output: dict | None


class AIAuditListResponse(BaseModel):
    total: int
    page: int
    items: list[AIActionLogResponse]


@router.get("", response_model=AIAuditListResponse)
async def list_ai_action_logs(
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
    action_type: AIActionType | None = Query(default=None),
    status: AIActionStatus | None = Query(default=None),
    provider_name: str | None = Query(default=None),
    actor_id: uuid.UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    """
    List AI Action Logs with filtering.
    Restricted to Admins.
    """
    stmt = select(AIActionLog)
    count_stmt = select(func.count(AIActionLog.id))

    filters = []
    if action_type:
        filters.append(AIActionLog.action_type == action_type)
    if status:
        filters.append(AIActionLog.status == status)
    if provider_name:
        filters.append(AIActionLog.provider_name == provider_name)
    if actor_id:
        filters.append(AIActionLog.actor_id == actor_id)

    if filters:
        stmt = stmt.where(*filters)
        count_stmt = count_stmt.where(*filters)

    # Execute count
    total = await db.scalar(count_stmt) or 0

    # Execute fetch
    stmt = stmt.order_by(desc(AIActionLog.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    return AIAuditListResponse(
        total=total,
        page=page,
        items=[AIActionLogResponse.model_validate(log) for log in logs]
    )


@router.get("/{log_id}", response_model=AIActionLogDetailResponse)
async def get_ai_action_log_detail(
    log_id: uuid.UUID,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed information for a specific AI Action Log, including the raw output.
    """
    log = await db.get(AIActionLog, log_id)
    if not log:
        raise NotFoundError("AI Action Log not found")

    return AIActionLogDetailResponse.model_validate(log)


class MarkReviewedRequest(BaseModel):
    category: str
    item_id: uuid.UUID


@router.get("/language-policy/report")
async def get_language_policy_audit_report(
    current_user: AdminUser,
    include_reviewed: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """
    Generates a 4-category remediation audit report for any AI usage
    associated with Kinyarwanda courses/workspaces/assessments.
    """
    from app.services.ai_language_audit_service import AILanguageAuditService
    service = AILanguageAuditService(db)
    return await service.generate_audit_report(include_reviewed=include_reviewed, limit=limit)


@router.post("/language-policy/mark-reviewed")
async def mark_language_audit_item_reviewed(
    body: MarkReviewedRequest,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Marks an audit remediation item as manually reviewed and verified by staff.
    """
    from app.services.ai_language_audit_service import AILanguageAuditService
    service = AILanguageAuditService(db)
    success = await service.mark_item_manually_reviewed(
        category=body.category,
        item_id=body.item_id,
        reviewer_id=current_user.id,
    )
    if not success:
        raise NotFoundError("Audit item not found or failed to update")
    return {"success": True, "item_id": str(body.item_id), "category": body.category}
