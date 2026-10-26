from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.study_planner_repo import StudyPlannerRepository
from app.db.repositories.workspace_repo import WorkspaceRepository

if TYPE_CHECKING:
    from app.core.ai.gateway import AIGateway


class PlannerBase:
    """Shared state for the study planner mixins (see ``StudyPlannerService``)."""

    db: AsyncSession
    repo: StudyPlannerRepository
    workspace_repo: WorkspaceRepository

    def _build_gateway(self) -> "AIGateway":
        """Gateway over the configured chat and embedding providers (imported lazily: heavy SDKs)."""
        from app.core.ai.gateway import AIGateway
        from app.core.ai.provider_factory import get_ai_provider, get_embedding_provider

        return AIGateway(self.db, get_ai_provider(), get_embedding_provider())
