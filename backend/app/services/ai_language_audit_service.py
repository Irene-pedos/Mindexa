"""
app/services/ai_language_audit_service.py

Audit service for detecting and remediating historical or unauthorized AI usage
on Kinyarwanda-medium academic courses and assessments.

Scans 4 categories:
  1. AI Question Generation (questions created via AI or linked generation batches)
  2. AI Grading Records (responses graded with AI scores)
  3. AI Integrity Explanations (AI-generated flag explanations)
  4. AI Assistant & Study Tutor Sessions (scoped to RW workspaces)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, List, Optional
from pydantic import BaseModel
from sqlalchemy import select, and_, or_, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import LanguageEnum, AIActionType, QuestionSourceType
from app.db.models.academic import Course, TeachingWorkspace
from app.db.models.assessment import Assessment
from app.db.models.question import Question, AIGenerationBatch, AIGeneratedQuestion
from app.db.models.attempt import StudentResponse, AssessmentAttempt
from app.db.models.ai import AIActionLog


class AILanguageAuditItem(BaseModel):
    category: str  # "QUESTION_GENERATION", "AI_GRADING", "INTEGRITY_EXPLANATION", "AI_ASSISTANT"
    item_id: str
    assessment_id: Optional[str] = None
    assessment_title: Optional[str] = None
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    workspace_id: Optional[str] = None
    language: str
    details: dict[str, Any]
    detected_at: datetime
    is_manually_reviewed: bool = False
    reviewed_by_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class AILanguageAuditReport(BaseModel):
    generated_at: datetime
    total_flagged: int
    unreviewed_count: int
    by_category: dict[str, int]
    items: List[AILanguageAuditItem]


class AILanguageAuditService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def generate_audit_report(
        self,
        include_reviewed: bool = False,
        limit: int = 100,
    ) -> AILanguageAuditReport:
        items: List[AILanguageAuditItem] = []

        # 1. AI Question Generation under RW assessments or workspaces
        q_stmt = (
            select(Question, Assessment, Course)
            .outerjoin(Assessment, Question.source_assessment_id == Assessment.id)
            .outerjoin(Course, Question.course_id == Course.id)
            .where(
                Question.source_type == QuestionSourceType.AI_GENERATED,
                Question.is_deleted == False,
                or_(
                    Assessment.language == LanguageEnum.RW,
                    Course.language == LanguageEnum.RW,
                ),
            )
            .order_by(desc(Question.created_at))
            .limit(limit)
        )
        q_res = await self.db.execute(q_stmt)
        for q, ass, crs in q_res.all():
            items.append(
                AILanguageAuditItem(
                    category="QUESTION_GENERATION",
                    item_id=str(q.id),
                    assessment_id=str(ass.id) if ass else None,
                    assessment_title=ass.title if ass else None,
                    course_code=crs.code if crs else None,
                    course_name=crs.name if crs else None,
                    language=LanguageEnum.RW.value,
                    details={
                        "question_type": str(q.question_type),
                        "marks": q.marks,
                        "content_preview": q.content[:150] if q.content else "",
                    },
                    detected_at=q.created_at or datetime.now(UTC),
                    is_manually_reviewed=getattr(q, "is_approved", False),
                    reviewed_by_id=str(q.approved_by_id) if getattr(q, "approved_by_id", None) else None,
                    reviewed_at=q.approved_at if hasattr(q, "approved_at") else None,
                )
            )

        # 2. AI Grading on RW assessments
        g_stmt = (
            select(StudentResponse, Assessment, Course)
            .join(AssessmentAttempt, StudentResponse.attempt_id == AssessmentAttempt.id)
            .join(Assessment, AssessmentAttempt.assessment_id == Assessment.id)
            .outerjoin(Course, Assessment.course_id == Course.id)
            .where(
                Assessment.language == LanguageEnum.RW,
                StudentResponse.ai_grade_score.isnot(None),
                StudentResponse.is_deleted == False,
            )
            .order_by(desc(StudentResponse.created_at))
            .limit(limit)
        )
        g_res = await self.db.execute(g_stmt)
        for resp, ass, crs in g_res.all():
            is_reviewed = resp.lecturer_score is not None or resp.graded_by_id is not None
            items.append(
                AILanguageAuditItem(
                    category="AI_GRADING",
                    item_id=str(resp.id),
                    assessment_id=str(ass.id),
                    assessment_title=ass.title,
                    course_code=crs.code if crs else None,
                    course_name=crs.name if crs else None,
                    language=LanguageEnum.RW.value,
                    details={
                        "ai_grade_score": resp.ai_grade_score,
                        "ai_confidence": resp.ai_confidence,
                        "ai_feedback": (resp.ai_feedback or "")[:150],
                    },
                    detected_at=resp.created_at or datetime.now(UTC),
                    is_manually_reviewed=is_reviewed,
                    reviewed_by_id=str(resp.graded_by_id) if resp.graded_by_id else None,
                    reviewed_at=resp.graded_at,
                )
            )

        # 3. AI Integrity Explanations on RW assessments
        i_stmt = (
            select(AIActionLog, Assessment)
            .join(AssessmentAttempt, AIActionLog.subject_entity_id == AssessmentAttempt.id)
            .join(Assessment, AssessmentAttempt.assessment_id == Assessment.id)
            .where(
                AIActionLog.action_type == AIActionType.ANALYZE_INTEGRITY,
                Assessment.language == LanguageEnum.RW,
                AIActionLog.is_deleted == False,
            )
            .order_by(desc(AIActionLog.created_at))
            .limit(limit)
        )
        i_res = await self.db.execute(i_stmt)
        for log, ass in i_res.all():
            items.append(
                AILanguageAuditItem(
                    category="INTEGRITY_EXPLANATION",
                    item_id=str(log.id),
                    assessment_id=str(ass.id),
                    assessment_title=ass.title,
                    language=LanguageEnum.RW.value,
                    details={
                        "action_type": log.action_type.value,
                        "prompt_summary": log.prompt_summary,
                        "model": log.model_name,
                    },
                    detected_at=log.created_at or datetime.now(UTC),
                    is_manually_reviewed=bool(log.human_reviewed),
                )
            )

        # 4. AI Assistant & Tutor Logs scoped to RW workspaces
        a_stmt = (
            select(AIActionLog, TeachingWorkspace, Course)
            .join(TeachingWorkspace, AIActionLog.subject_entity_id == TeachingWorkspace.id)
            .outerjoin(Course, TeachingWorkspace.course_id == Course.id)
            .where(
                TeachingWorkspace.language == LanguageEnum.RW,
                AIActionLog.action_type.in_([
                    AIActionType.STUDY_SUPPORT,
                    AIActionType.DOCUMENT_SUMMARY,
                    AIActionType.SUGGEST_FEEDBACK,
                    AIActionType.NARRATE_ANALYTICS,
                ]),
                AIActionLog.is_deleted == False,
            )
            .order_by(desc(AIActionLog.created_at))
            .limit(limit)
        )
        a_res = await self.db.execute(a_stmt)
        for log, ws, crs in a_res.all():
            items.append(
                AILanguageAuditItem(
                    category="AI_ASSISTANT",
                    item_id=str(log.id),
                    workspace_id=str(ws.id),
                    course_code=crs.code if crs else None,
                    course_name=crs.name if crs else None,
                    language=LanguageEnum.RW.value,
                    details={
                        "action_type": log.action_type.value,
                        "prompt_summary": log.prompt_summary,
                        "actor_role": log.actor_role,
                    },
                    detected_at=log.created_at or datetime.now(UTC),
                    is_manually_reviewed=bool(log.human_reviewed),
                )
            )

        if not include_reviewed:
            items = [item for item in items if not item.is_manually_reviewed]

        by_cat: dict[str, int] = {}
        for item in items:
            by_cat[item.category] = by_cat.get(item.category, 0) + 1

        unreviewed = sum(1 for item in items if not item.is_manually_reviewed)

        return AILanguageAuditReport(
            generated_at=datetime.now(UTC),
            total_flagged=len(items),
            unreviewed_count=unreviewed,
            by_category=by_cat,
            items=items,
        )

    async def mark_item_manually_reviewed(
        self,
        category: str,
        item_id: uuid.UUID,
        reviewer_id: uuid.UUID,
    ) -> bool:
        """Persist manual verification for an audit remediation item."""
        now = datetime.now(UTC)
        if category == "QUESTION_GENERATION":
            q = await self.db.get(Question, item_id)
            if q:
                q.is_approved = True
                q.approved_by_id = reviewer_id
                q.approved_at = now
                await self.db.commit()
                return True
        elif category == "AI_GRADING":
            resp = await self.db.get(StudentResponse, item_id)
            if resp:
                resp.graded_by_id = reviewer_id
                resp.graded_at = now
                if resp.lecturer_score is None and resp.ai_grade_score is not None:
                    resp.lecturer_score = resp.ai_grade_score
                await self.db.commit()
                return True
        elif category in {"INTEGRITY_EXPLANATION", "AI_ASSISTANT"}:
            log = await self.db.get(AIActionLog, item_id)
            if log:
                log.human_reviewed = True
                await self.db.commit()
                return True
        return False
