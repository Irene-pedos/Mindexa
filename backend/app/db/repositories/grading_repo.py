"""
app/db/repositories/grading_repo.py

Data access for SubmissionGrade and GradingQueueItem.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.core.exceptions import NotFoundError
from app.db.enums import (AIGradeDecision, GradingQueuePriority,
                          GradingQueueStatus)
from app.db.models.assessment import Assessment
from app.db.models.attempt import GradingQueueItem, SubmissionGrade
from app.db.models.auth import User, UserProfile
from sqlalchemy import and_, exists, func, not_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession


def _utcnow() -> datetime:
    return datetime.now(UTC)


class GradingRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # SubmissionGrade — CREATE
    # -----------------------------------------------------------------------

    async def create_grade(
        self,
        *,
        response_id: uuid.UUID,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        question_id: uuid.UUID,
        max_score: float,
        grading_mode: str,
        created_by_id: uuid.UUID | None = None,
        score: float | None = None,
        ai_suggested_score: float | None = None,
        ai_rationale: str | None = None,
        ai_confidence: float | None = None,
        feedback: str | None = None,
        internal_notes: str | None = None,
        rubric_scores: list | None = None,
        is_final: bool = False,
    ) -> SubmissionGrade:
        grade = SubmissionGrade(
            response_id=response_id,
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            question_id=question_id,
            max_score=max_score,
            grading_mode=grading_mode,
            created_by_id=created_by_id,
            updated_by_id=created_by_id,
            score=score,
            ai_suggested_score=ai_suggested_score,
            ai_rationale=ai_rationale,
            ai_confidence=ai_confidence,
            feedback=feedback,
            internal_notes=internal_notes,
            rubric_scores=rubric_scores,
            is_final=is_final,
            graded_at=_utcnow() if is_final else None,
        )
        self.db.add(grade)
        await self.db.flush()
        return grade

    # -----------------------------------------------------------------------
    # SubmissionGrade — READS
    # -----------------------------------------------------------------------

    async def get_grade_by_response(
        self, response_id: uuid.UUID
    ) -> SubmissionGrade | None:
        result = await self.db.execute(
            select(SubmissionGrade).where(
                SubmissionGrade.response_id == response_id,
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_grade_by_id(self, grade_id: uuid.UUID) -> SubmissionGrade | None:
        result = await self.db.execute(
            select(SubmissionGrade).where(
                SubmissionGrade.id == grade_id,
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_full_grade_detail(self, response_id: uuid.UUID) -> SubmissionGrade | None:
        """
        Fetch grade with response, question, and rubric details.
        """
        from app.db.models.assessment import (Rubric, RubricCriterion,
                                              RubricCriterionLevel)
        from app.db.models.attempt import StudentResponse
        from app.db.models.question import Question
        from sqlalchemy.orm import selectinload

        result = await self.db.execute(
            select(SubmissionGrade)
            .options(
                selectinload(SubmissionGrade.student_response),
                selectinload(SubmissionGrade.student_response).selectinload(StudentResponse.question)
                .selectinload(Question.rubric)
                .selectinload(Rubric.criteria)
                .selectinload(RubricCriterion.levels)
            )
            .where(
                SubmissionGrade.response_id == response_id,
                SubmissionGrade.is_deleted.is_(False)
            )
        )
        return result.scalar_one_or_none()

    async def list_grades_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[SubmissionGrade]:
        result = await self.db.execute(
            select(SubmissionGrade).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return list(result.scalars().all())

    async def list_final_grades_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[SubmissionGrade]:
        result = await self.db.execute(
            select(SubmissionGrade).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_final.is_(True),
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return list(result.scalars().all())

    async def count_final_grades(self, attempt_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(SubmissionGrade.id)).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_final.is_(True),
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return result.scalar_one()

    async def sum_final_scores(self, attempt_id: uuid.UUID) -> float:
        result = await self.db.execute(
            select(func.coalesce(func.sum(SubmissionGrade.score), 0.0)).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_final.is_(True),
                SubmissionGrade.is_deleted.is_(False),
                SubmissionGrade.score.is_not(None),
            )
        )
        return float(result.scalar_one())

    async def sum_max_scores(self, attempt_id: uuid.UUID) -> float:
        result = await self.db.execute(
            select(func.coalesce(func.sum(SubmissionGrade.max_score), 0.0)).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_final.is_(True),
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return float(result.scalar_one())

    # -----------------------------------------------------------------------
    # SubmissionGrade — UPDATES
    # -----------------------------------------------------------------------

    async def update_grade(
        self,
        grade_id: uuid.UUID,
        updated_by_id: uuid.UUID,
        **fields,
    ) -> None:
        fields["updated_by_id"] = updated_by_id
        if fields.get("is_final") and "graded_at" not in fields:
            fields["graded_at"] = _utcnow()
        await self.db.execute(
            update(SubmissionGrade)
            .where(SubmissionGrade.id == grade_id)
            .values(**fields)
        )

    async def finalize_grade(
        self,
        grade_id: uuid.UUID,
        score: float,
        updated_by_id: uuid.UUID,
        feedback: str | None = None,
        rubric_scores: list | None = None,
        lecturer_override: bool = False,
        grading_mode: str | None = None,
        is_final: bool = True,
        feedback_author_basis: str | None = None,
    ) -> None:
        values = {
            "score": score,
            "is_final": is_final,
            "graded_at": _utcnow() if is_final else None,
            "updated_by_id": updated_by_id,
            "lecturer_override": lecturer_override,
        }
        if feedback is not None:
            values["feedback"] = feedback
        if rubric_scores is not None:
            values["rubric_scores"] = rubric_scores
        if grading_mode is not None:
            values["grading_mode"] = grading_mode
        if feedback_author_basis is not None:
            values["feedback_author_basis"] = feedback_author_basis
        await self.db.execute(
            update(SubmissionGrade)
            .where(SubmissionGrade.id == grade_id)
            .values(**values)
        )

    # -----------------------------------------------------------------------
    # GradingQueueItem — CREATE
    # -----------------------------------------------------------------------

    async def create_queue_item(
        self,
        *,
        response_id: uuid.UUID,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        question_id: uuid.UUID,
        student_id: uuid.UUID,
        grading_mode: str,
        priority: str = GradingQueuePriority.NORMAL,
    ) -> GradingQueueItem:
        item = GradingQueueItem(
            response_id=response_id,
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            question_id=question_id,
            student_id=student_id,
            grading_mode=grading_mode,
            status=GradingQueueStatus.PENDING,
            priority=priority,
            ai_pre_graded=False,
        )
        self.db.add(item)
        await self.db.flush()
        return item

    # -----------------------------------------------------------------------
    # GradingQueueItem — READS
    # -----------------------------------------------------------------------

    async def get_queue_item_by_id(self, item_id: uuid.UUID) -> GradingQueueItem | None:
        result = await self.db.execute(
            select(GradingQueueItem).where(GradingQueueItem.id == item_id)
        )
        return result.scalar_one_or_none()

    async def get_active_queue_item_for_response(
        self, response_id: uuid.UUID
    ) -> GradingQueueItem | None:
        result = await self.db.execute(
            select(GradingQueueItem).where(
                GradingQueueItem.response_id == response_id,
                GradingQueueItem.status.in_([
                    GradingQueueStatus.PENDING,
                    GradingQueueStatus.ASSIGNED,
                    GradingQueueStatus.IN_PROGRESS,
                    GradingQueueStatus.AI_SUGGESTED,
                ]),
            ).order_by(GradingQueueItem.created_at.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def list_queue(
        self,
        *,
        assessment_ids: list[uuid.UUID] | None = None,
        class_section_id: uuid.UUID | None = None,
        question_type: str | None = None,
        statuses: list[str] | None = None,
        assigned_to_id: uuid.UUID | None = None,
        priority: str | None = None,
        search_query: str | None = None,
        sort_by: str | None = "date_asc",
        page: int = 1,
        page_size: int = 30,
    ) -> tuple[list[dict[str, Any]], int]:
        from app.db.models.academic import ClassSection, StudentEnrollment, Course, Institution
        from app.db.models.attempt import (AssessmentAttempt, StudentResponse,
                                           SubmissionGrade)
        from app.db.models.question import Question
        from sqlalchemy.orm import aliased

        filters = [GradingQueueItem.is_deleted == False]
        if assessment_ids:
            filters.append(GradingQueueItem.assessment_id.in_(assessment_ids))
        if statuses:
            filters.append(GradingQueueItem.status.in_(statuses))
        if assigned_to_id:
            filters.append(GradingQueueItem.assigned_to_id == assigned_to_id)
        if priority:
            filters.append(GradingQueueItem.priority == priority)
        if class_section_id:
            filters.append(StudentEnrollment.class_section_id == class_section_id)
        if question_type:
            filters.append(Question.question_type == question_type)
        if search_query:
            filters.append(
                or_(
                    UserProfile.first_name.ilike(f"%{search_query}%"),
                    UserProfile.last_name.ilike(f"%{search_query}%"),
                    UserProfile.display_name.ilike(f"%{search_query}%"),
                    Assessment.title.ilike(f"%{search_query}%"),
                )
            )

        # Aliases for assignment name join
        AssignedToUser = aliased(User)
        AssignedToProfile = aliased(UserProfile)

        base_query = (
            select(
                GradingQueueItem,
                UserProfile.first_name.label("student_first_name"),
                UserProfile.last_name.label("student_last_name"),
                UserProfile.display_name.label("student_display_name"),
                Assessment.title.label("assessment_title"),
                ClassSection.id.label("class_section_id"),
                ClassSection.name.label("class_section_name"),
                Question.question_type.label("question_type"),
                Question.content.label("question_title"),
                Question.rubric_id.label("rubric_id"),
                Question.marks.label("max_score"),
                SubmissionGrade.ai_suggested_score.label("ai_suggested_score"),
                SubmissionGrade.ai_confidence.label("ai_confidence"),
                AssessmentAttempt.integrity_risk_score.label("integrity_risk_score"),
                AssessmentAttempt.is_flagged.label("is_flagged"),
                AssessmentAttempt.submitted_at.label("submitted_at"),
                func.concat(AssignedToProfile.first_name, ' ', AssignedToProfile.last_name).label("assigned_to_name"),
                Institution.name.label("institution_name"),
                Course.name.label("workspace_title"),
            )
            .join(User, GradingQueueItem.student_id == User.id)
            .outerjoin(UserProfile, User.profile)
            .join(Assessment, GradingQueueItem.assessment_id == Assessment.id)
            .join(Course, Assessment.course_id == Course.id)
            .join(Institution, Course.institution_id == Institution.id)
            .join(Question, GradingQueueItem.question_id == Question.id)
            .join(AssessmentAttempt, GradingQueueItem.attempt_id == AssessmentAttempt.id)
            # Link to SubmissionGrade for AI info
            .outerjoin(SubmissionGrade, GradingQueueItem.response_id == SubmissionGrade.response_id)
            # Resolve class section (assumes active enrollment in the course's section)
            .outerjoin(StudentEnrollment, and_(
                StudentEnrollment.student_id == GradingQueueItem.student_id,
                StudentEnrollment.is_deleted == False
            ))
            .outerjoin(ClassSection, StudentEnrollment.class_section_id == ClassSection.id)
            # Join for assigned lecturer name
            .outerjoin(AssignedToUser, GradingQueueItem.assigned_to_id == AssignedToUser.id)
            .outerjoin(AssignedToProfile, AssignedToUser.profile)
            .where(*filters)
        )

        # Handle Sorting
        if sort_by == "date_asc":
            base_query = base_query.order_by(GradingQueueItem.created_at.asc())
        elif sort_by == "date_desc":
            base_query = base_query.order_by(GradingQueueItem.created_at.desc())
        elif sort_by == "ai_confidence":
            base_query = base_query.order_by(SubmissionGrade.ai_confidence.desc().nullslast())
        elif sort_by == "risk_level":
            base_query = base_query.order_by(AssessmentAttempt.integrity_risk_score.desc().nullslast())

        # Count total
        count_result = await self.db.execute(
            select(func.count(GradingQueueItem.id))
            .select_from(GradingQueueItem)
            .join(User, GradingQueueItem.student_id == User.id)
            .outerjoin(UserProfile, User.profile)
            .join(Assessment, GradingQueueItem.assessment_id == Assessment.id)
            .join(Question, GradingQueueItem.question_id == Question.id)
            .join(AssessmentAttempt, GradingQueueItem.attempt_id == AssessmentAttempt.id)
            .outerjoin(StudentEnrollment, and_(
                StudentEnrollment.student_id == GradingQueueItem.student_id,
                StudentEnrollment.is_deleted == False
            ))
            .where(*filters)
        )
        total = count_result.scalar_one()

        # Paginate
        result = await self.db.execute(
            base_query.offset((page - 1) * page_size).limit(page_size)
        )

        items = []
        for row in result.all():
            item = row[0]

            # Map extra columns from the row
            student_name = (
                " ".join(part for part in [row.student_first_name, row.student_last_name] if part).strip()
                or row.student_display_name
                or "Student"
            )

            # Convert model to dict and add extra fields
            item_dict = item.model_dump()
            item_dict.update({
                "student_name": student_name,
                "assessment_title": row.assessment_title,
                "class_section_id": row.class_section_id,
                "class_section_name": row.class_section_name,
                "question_type": row.question_type,
                "question_title": row.question_title,
                "ai_suggested_score": row.ai_suggested_score,
                "ai_confidence": row.ai_confidence,
                "ai_grading_basis": "RUBRIC" if row.rubric_id is not None else "GENERAL_KNOWLEDGE",
                "max_score": row.max_score,
                "institution_name": row.institution_name,
                "workspace_title": row.workspace_title,
                "integrity_risk_score": row.integrity_risk_score,
                "is_flagged": row.is_flagged,
                "submitted_at": row.submitted_at,
                "assigned_to_name": row.assigned_to_name,
            })

            items.append(item_dict)

        return items, total

    # -----------------------------------------------------------------------
    # GradingQueueItem — UPDATES
    # -----------------------------------------------------------------------

    async def update_queue_item(self, item_id: uuid.UUID, **fields) -> None:
        await self.db.execute(
            update(GradingQueueItem)
            .where(GradingQueueItem.id == item_id)
            .values(**fields)
        )

    async def assign_queue_item(
        self,
        item_id: uuid.UUID,
        assigned_to_id: uuid.UUID,
        priority: str | None = None,
    ) -> None:
        values: dict = {
            "assigned_to_id": assigned_to_id,
            "assigned_at": _utcnow(),
            "status": GradingQueueStatus.ASSIGNED,
        }
        if priority:
            values["priority"] = priority
        await self.db.execute(
            update(GradingQueueItem)
            .where(GradingQueueItem.id == item_id)
            .values(**values)
        )

    async def complete_queue_item(self, item_id: uuid.UUID) -> None:
        await self.db.execute(
            update(GradingQueueItem)
            .where(GradingQueueItem.id == item_id)
            .values(status=GradingQueueStatus.COMPLETED, completed_at=_utcnow())
        )

    async def mark_ai_pre_graded(self, item_id: uuid.UUID) -> None:
        await self.db.execute(
            update(GradingQueueItem)
            .where(GradingQueueItem.id == item_id)
            .values(ai_pre_graded=True)
        )

    async def get_moderation_stats(self, question_id: uuid.UUID) -> dict[str, Any]:
        """
        Fetch score distribution and outliers for a specific question.
        """
        from app.db.models.attempt import (AssessmentAttempt, StudentResponse,
                                           SubmissionGrade)
        from app.db.models.auth import User, UserProfile
        from app.db.models.question import Question
        from sqlalchemy import case, func

        # 1. Distribution
        dist_stmt = (
            select(SubmissionGrade.score, func.count(SubmissionGrade.id))
            .where(
                SubmissionGrade.question_id == question_id,
                SubmissionGrade.is_final == True,
                SubmissionGrade.is_current == True,
                SubmissionGrade.is_deleted == False
            )
            .group_by(SubmissionGrade.score)
            .order_by(SubmissionGrade.score.asc())
        )
        dist_res = await self.db.execute(dist_stmt)
        distribution = [{"score": row[0], "count": row[1]} for row in dist_res.all()]

        # 2. Outliers (Risk > 70 or |Score - AI| > 30% or explicitly flagged)
        outlier_stmt = (
            select(
                SubmissionGrade.response_id,
                UserProfile.first_name,
                UserProfile.last_name,
                UserProfile.display_name,
                SubmissionGrade.score,
                SubmissionGrade.ai_suggested_score,
                SubmissionGrade.max_score,
                AssessmentAttempt.integrity_risk_score
            )
            .join(AssessmentAttempt, SubmissionGrade.attempt_id == AssessmentAttempt.id)
            .join(User, SubmissionGrade.student_id == User.id)
            .outerjoin(UserProfile, User.profile)
            .where(
                SubmissionGrade.question_id == question_id,
                SubmissionGrade.is_final == True,
                SubmissionGrade.is_current == True,
                SubmissionGrade.is_deleted == False,
                or_(
                    AssessmentAttempt.integrity_risk_score > 70,
                    AssessmentAttempt.is_flagged == True,
                    and_(
                        SubmissionGrade.ai_suggested_score.isnot(None),
                        func.abs(SubmissionGrade.score - SubmissionGrade.ai_suggested_score) > (SubmissionGrade.max_score * 0.3)
                    )
                )
            )
        )
        outlier_res = await self.db.execute(outlier_stmt)
        outliers = []
        for row in outlier_res.all():
            student_name = " ".join(filter(None, [row.first_name, row.last_name])) or row.display_name or "Student"
            deviation = None
            if row.score is not None and row.ai_suggested_score is not None:
                deviation = row.score - row.ai_suggested_score

            outliers.append({
                "response_id": row.response_id,
                "student_name": student_name,
                "score": row.score,
                "ai_suggested_score": row.ai_suggested_score,
                "deviation": deviation,
                "risk_score": row.integrity_risk_score or 0.0
            })

        # 3. Basic Aggregates
        agg_stmt = (
            select(
                func.count(SubmissionGrade.id),
                func.avg(SubmissionGrade.score),
                # Logic for significant deviations (e.g. > 20% of max score)
                func.count(case((
                    and_(
                        SubmissionGrade.ai_suggested_score.isnot(None),
                        func.abs(SubmissionGrade.score - SubmissionGrade.ai_suggested_score) > (SubmissionGrade.max_score * 0.2)
                    ), 1
                )))
            )
            .where(
                SubmissionGrade.question_id == question_id,
                SubmissionGrade.is_final == True,
                SubmissionGrade.is_current == True,
                SubmissionGrade.is_deleted == False
            )
        )
        agg_res = (await self.db.execute(agg_stmt)).one()

        return {
            "total_graded": agg_res[0],
            "average_score": float(agg_res[1]) if agg_res[1] else 0.0,
            "significant_deviations_count": agg_res[2],
            "score_distribution": distribution,
            "outliers": outliers
        }

    async def supersede_grade(
        self,
        *,
        old_grade_id: uuid.UUID,
        new_score: float,
        moderator_id: uuid.UUID,
        revision_reason: str,
        feedback_update: str | None = None,
        internal_notes: str | None = None
    ) -> SubmissionGrade:
        """
        Implements the immutable moderation pattern.
        """
        # 1. Get old grade
        old_grade = await self.get_grade_by_id(old_grade_id)
        if not old_grade:
            raise NotFoundError(
                f"Grade not found: {old_grade_id}",
                code="GRADE_NOT_FOUND",
            )

        # 2. Mark old as superseded
        now = _utcnow()
        old_grade.is_current = False
        old_grade.superseded_at = now
        old_grade.revision_reason = revision_reason # Trace why it was superseded

        # 3. Insert new grade (copying everything but score/final fields)
        new_grade = SubmissionGrade(
            response_id=old_grade.response_id,
            attempt_id=old_grade.attempt_id,
            assessment_id=old_grade.assessment_id,
            student_id=old_grade.student_id,
            question_id=old_grade.question_id,
            max_score=old_grade.max_score,
            grading_mode=old_grade.grading_mode,
            score=new_score,
            ai_suggested_score=old_grade.ai_suggested_score,
            ai_rationale=old_grade.ai_rationale,
            ai_confidence=old_grade.ai_confidence,
            feedback=feedback_update or old_grade.feedback,
            internal_notes=internal_notes or old_grade.internal_notes,
            rubric_scores=old_grade.rubric_scores, # Might need adjustment if rubric-based
            is_final=True,
            is_current=True,
            graded_at=now,
            created_by_id=moderator_id, # Record who made the revision
            updated_by_id=moderator_id,
        )
        self.db.add(new_grade)
        await self.db.flush()

        # 4. Link old to new
        old_grade.superseded_by_id = new_grade.id

        return new_grade

    async def create_ai_grade_review(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        response_id: uuid.UUID | None = None,
        submission_grade_id: uuid.UUID | None = None,
        ai_action_log_id: uuid.UUID | None = None,
        grading_decision: AIGradeDecision,
        ai_suggested_total: float | None = None,
        lecturer_final_total: float | None = None,
        score_delta: float | None = None,
        max_possible_score: float | None = None,
        lecturer_id: uuid.UUID | None = None,
        review_started_at: datetime | None = None,
        review_completed_at: datetime | None = None,
        review_duration_seconds: int | None = None,
        lecturer_notes: str | None = None,
    ) -> "AIGradeReview":
        from app.db.models.ai import AIGradeReview
        review = AIGradeReview(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            response_id=response_id,
            submission_grade_id=submission_grade_id,
            ai_action_log_id=ai_action_log_id,
            grading_decision=grading_decision,
            ai_suggested_total=ai_suggested_total,
            lecturer_final_total=lecturer_final_total,
            score_delta=score_delta,
            max_possible_score=max_possible_score,
            lecturer_id=lecturer_id,
            review_started_at=review_started_at,
            review_completed_at=review_completed_at,
            review_duration_seconds=review_duration_seconds,
            lecturer_notes=lecturer_notes,
        )
        self.db.add(review)
        await self.db.flush()
        return review
