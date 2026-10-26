from __future__ import annotations

import uuid
from datetime import datetime

from app.db.enums import AIActionStatus, AIActionType
from app.db.models.ai import AIActionLog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


class AIUsageRepository:
    """Read-only aggregates over the append-only AI audit log."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def completion_tokens_since(self, actor_id: uuid.UUID, since: datetime) -> int:
        """Tokens the actor's completed chat/generation calls consumed since ``since``.

        Embeddings are excluded: they are bounded by upload quotas, and counting them here
        would let one large document upload exhaust the actor's chat budget.
        """
        stmt = select(func.coalesce(func.sum(AIActionLog.total_tokens), 0)).where(
            AIActionLog.actor_id == actor_id,
            AIActionLog.status == AIActionStatus.COMPLETED,
            AIActionLog.action_type != AIActionType.EMBEDDING,
            AIActionLog.created_at >= since,
        )
        return int((await self.db.execute(stmt)).scalar_one())
