from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.study_planner_repo import StudyPlannerRepository
from app.db.repositories.workspace_repo import WorkspaceRepository
from app.services.study_planner.common import (  # noqa: F401
    _clamp_session_duration,
    _ensure_utc,
    _wall_clock_utc,
)
from app.services.study_planner.guided import GuidedSessionMixin
from app.services.study_planner.planning import PlanningMixin
from app.services.study_planner.progress import ProgressMixin
from app.services.study_planner.scheduling import SchedulingMixin


class StudyPlannerService(PlanningMixin, SchedulingMixin, ProgressMixin, GuidedSessionMixin):
    """Public entry point; behaviour lives in the mixins under ``app.services.study_planner``."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = StudyPlannerRepository(db)
        self.workspace_repo = WorkspaceRepository(db)
