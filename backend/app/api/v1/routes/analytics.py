"""
app/api/v1/routes/analytics.py

API endpoints for assessment analytics and AI insights.
"""

import uuid
from typing import Any, List, Optional, Dict
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import LecturerOrAdminUser
from app.db.session import get_db
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])


class QuestionDifficultyItem(BaseModel):
    question_title: str
    question_type: str
    average_score: float
    max_score: float
    difficulty: str


class AssessmentAnalyticsResponse(BaseModel):
    class_average: float
    highest_score: float
    lowest_score: float
    pass_rate: float
    total_submissions: int
    pending_submissions: int
    released_submissions: int
    integrity_issues_count: int
    grade_distribution: Dict[str, int]
    question_difficulty: List[QuestionDifficultyItem]
    ai_coverage: float = 100.0
    ai_narrative: Optional[str] = None
    weak_topics: List[str] = []
    insights: List[str] = []
    recommended_interventions: List[str] = []


@router.get(
    "/assessment/{assessment_id}/ai-insights",
    response_model=AssessmentAnalyticsResponse,
    summary="Get assessment analytics aggregates and AI narrative insights.",
)
async def get_assessment_ai_insights(
    assessment_id: uuid.UUID,
    current_user: LecturerOrAdminUser,
    class_section_id: uuid.UUID | None = Query(None),
    regenerate: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate or retrieve assessment analytics aggregates and AI narrative insights.
    Supports optional class section filtering and forced AI narrative regeneration.
    """
    service = AnalyticsService(db)
    return await service.get_assessment_ai_insights(
        assessment_id=assessment_id,
        lecturer_id=current_user.id,
        class_section_id=class_section_id,
        regenerate=regenerate,
    )
