"""
app/services/analytics_service.py

Service for computing assessment performance aggregates and generating AI insights.
"""

import uuid
from typing import Any, List
from sqlalchemy import select, func, and_, or_, exists, not_
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.analytics_agent import AnalyticsAgent, AnalyticsAgentOutput
from app.core.ai.gateway import AIGateway
from app.core.ai.provider_factory import get_ai_provider
from app.db.models.result import AssessmentResult, ResultBreakdown
from app.db.models.assessment import Assessment
from app.db.models.question import Question
from app.core.exceptions import NotFoundError


class AnalyticsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_assessment_ai_insights(
        self,
        assessment_id: uuid.UUID,
        lecturer_id: uuid.UUID,
    ) -> AnalyticsAgentOutput:
        """
        Compute aggregates and call the AnalyticsAgent for narrative insights.
        """
        # 1. Load assessment
        assessment = await self.db.get(Assessment, assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found")

        # 2. Compute aggregates (Never pass raw student data to the agent)
        stats = await self._compute_aggregates(assessment_id)

        # 3. Call AI Agent
        provider = get_ai_provider()
        gateway = AIGateway(self.db, provider)
        agent = AnalyticsAgent(gateway)

        return await agent.analyze_assessment(
            lecturer_id=lecturer_id,
            assessment_id=assessment_id,
            assessment_title=assessment.title,
            stats=stats
        )

    async def _compute_aggregates(self, assessment_id: uuid.UUID) -> dict[str, Any]:
        """
        Internal helper to compute performance statistics for an assessment.
        """
        # Cohort summary
        stmt = select(
            func.count(AssessmentResult.id),
            func.avg(AssessmentResult.percentage),
            func.max(AssessmentResult.percentage),
            func.min(AssessmentResult.percentage),
            func.sum(AssessmentResult.is_passing.cast(func.Integer))
        ).where(AssessmentResult.assessment_id == assessment_id)
        
        res = await self.db.execute(stmt)
        cohort_size, avg_score, max_score, min_score, pass_count = res.fetchone() or (0, 0, 0, 0, 0)
        
        pass_rate = (pass_count / cohort_size * 100) if cohort_size > 0 else 0.0

        # Grade distribution
        grade_stmt = select(
            AssessmentResult.letter_grade,
            func.count(AssessmentResult.id)
        ).where(AssessmentResult.assessment_id == assessment_id).group_by(AssessmentResult.letter_grade)
        
        grade_res = await self.db.execute(grade_stmt)
        grade_distribution = {str(row[0]): row[1] for row in grade_res.fetchall()}

        # Question-level difficulty analysis (Troublesome questions)
        # Find questions where average score < 50%
        q_stmt = select(
            ResultBreakdown.question_id,
            func.avg(ResultBreakdown.score / ResultBreakdown.max_score * 100).label("avg_pct")
        ).where(ResultBreakdown.attempt_id.in_(
            select(AssessmentResult.attempt_id).where(AssessmentResult.assessment_id == assessment_id)
        )).group_by(ResultBreakdown.question_id).having(func.avg(ResultBreakdown.score / ResultBreakdown.max_score * 100) < 50)
        
        q_res = await self.db.execute(q_stmt)
        hard_questions_ids = [row[0] for row in q_res.fetchall()]
        
        hard_questions_text = []
        if hard_questions_ids:
            # Fetch first 50 chars of question text for context
            text_stmt = select(Question.question_text).where(Question.id.in_(hard_questions_ids))
            text_res = await self.db.execute(text_stmt)
            hard_questions_text = [row[0][:50] + "..." for row in text_res.fetchall()]

        # Placeholder for topic analysis (assuming topics are tagged on questions)
        # In a real system, we'd join with Question.topic
        
        return {
            "cohort_size": cohort_size,
            "average_score": avg_score or 0.0,
            "max_score": max_score or 0.0,
            "min_score": min_score or 0.0,
            "pass_rate": pass_rate,
            "grade_distribution": grade_distribution,
            "hard_questions": hard_questions_text,
            "top_topics": ["General Performance"], # Dummy
            "weak_topics": ["Specific Hard Questions"] if hard_questions_text else [], # Dummy
        }
