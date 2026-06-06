"""
app/api/v1/routes/analytics.py

API endpoints for assessment analytics and AI insights.
"""

import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import LecturerOrAdminUser
from app.db.session import get_db
from app.services.analytics_service import AnalyticsService
from app.agents.analytics_agent import AnalyticsAgentOutput

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/assessment/{assessment_id}/ai-insights", response_model=AnalyticsAgentOutput)
async def get_assessment_ai_insights(
    assessment_id: uuid.UUID,
    current_user: LecturerOrAdminUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate AI narrative insights for an assessment based on cohort performance.
    
    Accessible only to lecturers and admins.
    """
    service = AnalyticsService(db)
    return await service.get_assessment_ai_insights(
        assessment_id=assessment_id,
        lecturer_id=current_user.id,
    )
