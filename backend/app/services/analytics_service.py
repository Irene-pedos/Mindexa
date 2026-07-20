"""
app/services/analytics_service.py

Service for computing assessment performance aggregates and generating AI insights.
"""

import uuid
import inspect
from typing import Any, List, Optional, Dict
from sqlalchemy import Integer, and_, exists, func, not_, or_, select, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.analytics_agent import AnalyticsAgent, AnalyticsAgentOutput
from app.core.ai.gateway import AIGateway
from app.core.ai.provider_factory import get_ai_provider
from app.core.exceptions import NotFoundError
from app.db.models.assessment import Assessment, AssessmentTargetSection
from app.db.models.question import Question, AssessmentQuestion
from app.db.models.result import AssessmentResult, ResultBreakdown
from app.db.models.attempt import AssessmentAttempt
from app.db.models.academic import StudentEnrollment
from app.db.models.ai import AIActionLog
from app.db.enums import AIActionType, AIActionStatus


class AnalyticsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_assessment_ai_insights(
        self,
        assessment_id: uuid.UUID,
        lecturer_id: uuid.UUID,
        class_section_id: Optional[uuid.UUID] = None,
        regenerate: bool = False,
    ) -> Dict[str, Any]:
        """
        Compute aggregates and retrieve or generate AI insights for an assessment.
        """
        # 1. Load assessment
        assessment = await self.db.get(Assessment, assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found")

        # 2. Compute cohort aggregates (filtered by class section if provided)
        stats = await self._compute_aggregates(assessment_id, class_section_id)

        # 3. Check for cached AI narrative insights in Append-Only AIActionLog
        ai_narrative = None
        weak_topics = []
        insights = []
        recommended_interventions = []

        if not regenerate:
            stmt = (
                select(AIActionLog.raw_output)
                .where(
                    and_(
                        AIActionLog.action_type == AIActionType.NARRATE_ANALYTICS,
                        AIActionLog.subject_entity_id == assessment_id,
                        AIActionLog.status == AIActionStatus.COMPLETED,
                    )
                )
                .order_by(AIActionLog.created_at.desc())
                .limit(1)
            )
            cached_res = await self.db.execute(stmt)
            if cached_res:
                row = cached_res.fetchone()
                if inspect.iscoroutine(row):
                    row = None
                if row and row[0]:
                    raw = row[0]
                    if isinstance(raw, dict):
                        ai_narrative = raw.get("summary")
                        weak_topics = raw.get("weak_topics", [])
                        insights = raw.get("insights", [])
                        recommended_interventions = raw.get("recommended_interventions", [])

        # 4. If no cached narrative found or regeneration is requested, run the AI Agent
        if not ai_narrative:
            provider = get_ai_provider()
            gateway = AIGateway(self.db, provider)
            agent = AnalyticsAgent(gateway)

            agent_output = await agent.analyze_assessment(
                lecturer_id=lecturer_id,
                assessment_id=assessment_id,
                assessment_title=assessment.title,
                stats=stats,
            )

            ai_narrative = agent_output.summary
            weak_topics = agent_output.weak_topics
            insights = agent_output.insights
            recommended_interventions = agent_output.recommended_interventions

        return {
            "class_average": round(stats.get("average_score", 0.0), 1),
            "highest_score": round(stats.get("max_score", 0.0), 1),
            "lowest_score": round(stats.get("min_score", 0.0), 1),
            "pass_rate": round(stats.get("pass_rate", 0.0), 1),
            "total_submissions": stats.get("total_submissions", 0),
            "pending_submissions": stats.get("pending_submissions", 0),
            "released_submissions": stats.get("released_submissions", 0),
            "integrity_issues_count": stats.get("integrity_issues_count", 0),
            "grade_distribution": stats.get("grade_distribution", {}),
            "question_difficulty": stats.get("question_difficulty", []),
            "ai_coverage": round(stats.get("ai_coverage_pct", 100.0), 1),
            "ai_narrative": ai_narrative,
            "weak_topics": weak_topics,
            "insights": insights,
            "recommended_interventions": recommended_interventions,
        }

    async def _compute_aggregates(
        self, assessment_id: uuid.UUID, class_section_id: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        """
        Internal helper to compute performance statistics and question difficulties.
        """
        from app.db.models.attempt import StudentResponse, SubmissionGrade, AssessmentAttempt
        from app.db.models.question import Question
        from app.db.enums import QuestionType
        # Base query for results
        stmt = select(
            func.count(AssessmentResult.id),
            func.coalesce(func.avg(AssessmentResult.percentage), 0.0),
            func.coalesce(func.max(AssessmentResult.percentage), 0.0),
            func.coalesce(func.min(AssessmentResult.percentage), 0.0),
            func.coalesce(func.sum(AssessmentResult.is_passing.cast(Integer)), 0),
        ).where(AssessmentResult.assessment_id == assessment_id)

        if class_section_id:
            stmt = stmt.join(
                AssessmentAttempt, AssessmentResult.attempt_id == AssessmentAttempt.id
            ).where(
                AssessmentAttempt.student_id.in_(
                    select(StudentEnrollment.student_id).where(
                        StudentEnrollment.class_section_id == class_section_id
                    )
                )
            )

        res = await self.db.execute(stmt)
        row = res.fetchone()
        if inspect.iscoroutine(row):
            row = (0, 0.0, 0.0, 0.0, 0)
        cohort_size, avg_score, max_score, min_score, pass_count = row or (
            0,
            0.0,
            0.0,
            0.0,
            0,
        )

        pass_rate = (pass_count / cohort_size * 100) if cohort_size > 0 else 0.0

        # Grade distribution
        grade_stmt = (
            select(AssessmentResult.letter_grade, func.count(AssessmentResult.id))
            .where(AssessmentResult.assessment_id == assessment_id)
            .group_by(AssessmentResult.letter_grade)
        )
        if class_section_id:
            grade_stmt = grade_stmt.join(
                AssessmentAttempt, AssessmentResult.attempt_id == AssessmentAttempt.id
            ).where(
                AssessmentAttempt.student_id.in_(
                    select(StudentEnrollment.student_id).where(
                        StudentEnrollment.class_section_id == class_section_id
                    )
                )
            )

        grade_res = await self.db.execute(grade_stmt)
        grade_distribution = {}
        if grade_res:
            rows = grade_res.fetchall()
            if inspect.iscoroutine(rows):
                rows = []
            grade_distribution = {str(r[0]): int(r[1]) for r in rows}

        # Submissions metrics
        attempt_stmt = select(
            func.count(AssessmentAttempt.id),
            func.coalesce(func.sum(case((AssessmentAttempt.submission_status == "PENDING_GRADING", 1), else_=0)), 0),
            func.coalesce(func.sum(case((AssessmentAttempt.integrity_risk_score > 50, 1), else_=0)), 0),
        ).where(AssessmentAttempt.assessment_id == assessment_id)

        if class_section_id:
            attempt_stmt = attempt_stmt.where(
                AssessmentAttempt.student_id.in_(
                    select(StudentEnrollment.student_id).where(
                        StudentEnrollment.class_section_id == class_section_id
                    )
                )
            )

        attempt_res = await self.db.execute(attempt_stmt)
        row_attempt = attempt_res.fetchone()
        if inspect.iscoroutine(row_attempt):
            row_attempt = (0, 0, 0)
        total_submissions, pending_submissions, integrity_issues_count = row_attempt or (
            0,
            0,
            0,
        )

        released_stmt = select(func.count(AssessmentResult.id)).where(
            and_(
                AssessmentResult.assessment_id == assessment_id,
                AssessmentResult.is_released == True,
            )
        )
        if class_section_id:
            released_stmt = released_stmt.join(
                AssessmentAttempt, AssessmentResult.attempt_id == AssessmentAttempt.id
            ).where(
                AssessmentAttempt.student_id.in_(
                    select(StudentEnrollment.student_id).where(
                        StudentEnrollment.class_section_id == class_section_id
                    )
                )
            )
        released_res = await self.db.execute(released_stmt)
        released_submissions = 0
        if released_res:
            val = released_res.scalar()
            if inspect.iscoroutine(val):
                val = 0
            released_submissions = val or 0

        # Detailed Question Difficulty aggregates
        attempt_subquery = select(AssessmentResult.attempt_id).where(
            AssessmentResult.assessment_id == assessment_id
        )
        if class_section_id:
            attempt_subquery = attempt_subquery.join(
                AssessmentAttempt, AssessmentResult.attempt_id == AssessmentAttempt.id
            ).where(
                AssessmentAttempt.student_id.in_(
                    select(StudentEnrollment.student_id).where(
                        StudentEnrollment.class_section_id == class_section_id
                    )
                )
            )

        q_stmt = (
            select(
                Question.id,
                Question.content,
                Question.question_type,
                func.coalesce(func.avg(ResultBreakdown.score), 0.0).label("avg_score"),
                func.coalesce(func.max(ResultBreakdown.max_score), Question.marks).label("max_score"),
            )
            .select_from(Question)
            .join(AssessmentQuestion, AssessmentQuestion.question_id == Question.id)
            .outerjoin(
                ResultBreakdown,
                and_(
                    ResultBreakdown.question_id == Question.id,
                    ResultBreakdown.attempt_id.in_(attempt_subquery),
                ),
            )
            .where(AssessmentQuestion.assessment_id == assessment_id)
            .group_by(Question.id, Question.content, Question.question_type)
        )

        q_res = await self.db.execute(q_stmt)
        question_difficulty = []
        hard_questions_text = []

        if q_res:
            rows_q = q_res.fetchall()
            if inspect.iscoroutine(rows_q):
                rows_q = []
            for r in rows_q:
                q_id, q_content, q_type, q_avg_score, q_max_score = r
                avg_pct = (q_avg_score / q_max_score * 100) if q_max_score > 0 else 0.0
                difficulty = "Easy"
                if avg_pct < 50:
                    difficulty = "Hard"
                    hard_questions_text.append(q_content[:50] + "...")
                elif avg_pct <= 75:
                    difficulty = "Medium"

                question_difficulty.append(
                    {
                        "question_title": q_content[:100] + ("..." if len(q_content) > 100 else ""),
                        "question_type": q_type,
                        "average_score": round(q_avg_score, 1),
                        "max_score": float(q_max_score),
                        "difficulty": difficulty,
                    }
                )

        # Calculate real AI coverage:
        # 1. Total open-ended responses
        # 2. Open-ended responses with an AI suggested score
        
        open_ended_types = [
            QuestionType.SHORT_ANSWER.value,
            QuestionType.ESSAY.value,
            QuestionType.COMPUTATIONAL.value,
            QuestionType.CASE_STUDY.value
        ]

        total_open_ended_stmt = (
            select(func.count(StudentResponse.id))
            .join(Question, Question.id == StudentResponse.question_id)
            .join(AssessmentAttempt, AssessmentAttempt.id == StudentResponse.attempt_id)
            .where(
                AssessmentAttempt.assessment_id == assessment_id,
                Question.question_type.in_(open_ended_types),
                AssessmentAttempt.is_deleted == False,
                StudentResponse.is_deleted == False
            )
        )

        ai_graded_stmt = (
            select(func.count(StudentResponse.id))
            .join(Question, Question.id == StudentResponse.question_id)
            .join(AssessmentAttempt, AssessmentAttempt.id == StudentResponse.attempt_id)
            .join(SubmissionGrade, SubmissionGrade.response_id == StudentResponse.id)
            .where(
                AssessmentAttempt.assessment_id == assessment_id,
                Question.question_type.in_(open_ended_types),
                SubmissionGrade.ai_suggested_score != None,
                AssessmentAttempt.is_deleted == False,
                StudentResponse.is_deleted == False,
                SubmissionGrade.is_deleted == False
            )
        )

        if class_section_id:
            total_open_ended_stmt = total_open_ended_stmt.where(
                AssessmentAttempt.student_id.in_(
                    select(StudentEnrollment.student_id).where(
                        StudentEnrollment.class_section_id == class_section_id
                    )
                )
            )
            ai_graded_stmt = ai_graded_stmt.where(
                AssessmentAttempt.student_id.in_(
                    select(StudentEnrollment.student_id).where(
                        StudentEnrollment.class_section_id == class_section_id
                    )
                )
            )

        total_open_ended_res = await self.db.execute(total_open_ended_stmt)
        total_open_ended = total_open_ended_res.scalar_one()

        ai_graded_res = await self.db.execute(ai_graded_stmt)
        ai_graded = ai_graded_res.scalar_one()

        ai_coverage_pct = (ai_graded / total_open_ended * 100) if total_open_ended > 0 else 100.0

        return {
            "cohort_size": cohort_size,
            "average_score": avg_score,
            "max_score": max_score,
            "min_score": min_score,
            "pass_rate": pass_rate,
            "grade_distribution": grade_distribution,
            "question_difficulty": question_difficulty,
            "total_submissions": int(total_submissions),
            "pending_submissions": int(pending_submissions),
            "released_submissions": int(released_submissions),
            "integrity_issues_count": int(integrity_issues_count),
            "hard_questions": hard_questions_text,
            "top_topics": ["General Performance"],
            "weak_topics": ["Specific Hard Questions"] if hard_questions_text else [],
            "ai_coverage_pct": ai_coverage_pct,
        }
