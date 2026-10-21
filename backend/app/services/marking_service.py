"""
app/services/marking_service.py

Business logic for Phase 5:
- Marking schemes and partial credit / method marks (R-12)
- Material key points and question key point links (R-13)
- Sample-check trust-building mode before bulk-accepting AI suggestions (R-13)
- Delegated grading and anonymous marking (R-11)
"""
from __future__ import annotations

import math
import random
import uuid
from datetime import UTC, datetime
from typing import List, Optional, Sequence

from sqlalchemy import and_, or_, select, update
from sqlalchemy import func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.core.logger import get_logger
from app.db.enums import (
    AIGradeDecision,
    DelegationStatus,
    Duty,
    GradingDelegationScope,
    KeyPointImportance,
    SampleCheckStatus,
    StepKind,
    UserRole,
)
from app.db.models.academic import Course, LecturerCourseAssignment, TeachingAssignment
from app.db.models.ai import AIGradeReview
from app.db.models.assessment import Assessment, AssessmentSection
from app.db.models.attempt import AssessmentAttempt, SubmissionGrade
from app.db.models.audit import AuditLog
from app.db.models.auth import User
from app.db.models.marking import (
    AIGradeSampleCheck,
    GradingDelegation,
    MarkingScheme,
    MaterialKeyPoint,
    QuestionKeyPoint,
    QuestionMarkStep,
)
from app.db.models.question import Question
from app.db.models.resource import LecturerMaterial
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.marking_repo import MarkingRepository
from app.schemas.marking import (
    GradingDelegationCreate,
    MaterialKeyPointCreate,
    MarkingSchemeCreate,
    MarkingSchemeUpdate,
    QuestionMarkStepCreate,
    SampleCheckItem,
    SampleCheckResponse,
    SampleCheckVerifyItem,
)
from app.services.assessment_service import AssessmentService

logger = get_logger("mindexa.marking_service")


class MarkingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = MarkingRepository(db)

    # ── Authorization Helpers ────────────────────────────────────────────────

    async def _get_question_and_verify_access(
        self, question_id: uuid.UUID, user: User
    ) -> Question:
        stmt = (
            select(Question)
            .where(Question.id == question_id, Question.is_deleted == False)
        )
        res = await self.db.execute(stmt)
        question = res.scalar_one_or_none()
        if not question:
            raise NotFoundError("Question not found", code="QUESTION_NOT_FOUND")

        if user.role == UserRole.ADMIN:
            return question

        if question.created_by_id == user.id:
            return question

        if question.course_id:
            await self._verify_course_lecturer_or_admin(question.course_id, user)
            return question

        raise AuthorizationError(
            "You do not have permission to access or modify this question's marking details",
            code="QUESTION_ACCESS_DENIED",
        )

    async def _get_material_and_verify_access(
        self, material_id: uuid.UUID, user: User
    ) -> LecturerMaterial:
        stmt = select(LecturerMaterial).where(
            LecturerMaterial.id == material_id, LecturerMaterial.is_deleted == False
        )
        res = await self.db.execute(stmt)
        material = res.scalar_one_or_none()
        if not material:
            raise NotFoundError("Material not found", code="MATERIAL_NOT_FOUND")

        if user.role == UserRole.ADMIN:
            return material

        if material.lecturer_id == user.id:
            return material

        if material.course_id:
            await self._verify_course_lecturer_or_admin(material.course_id, user)
            return material

        raise AuthorizationError(
            "You do not have permission to access or modify this material's key points",
            code="MATERIAL_ACCESS_DENIED",
        )

    async def _verify_course_lecturer_or_admin(
        self, course_id: uuid.UUID, user: User
    ) -> None:
        if user.role == UserRole.ADMIN:
            return

        # Check TeachingAssignment or LecturerCourseAssignment
        stmt1 = select(TeachingAssignment.id).where(
            TeachingAssignment.course_id == course_id,
            TeachingAssignment.lecturer_id == user.id,
            TeachingAssignment.is_active == True,
        )
        res1 = await self.db.execute(stmt1)
        if res1.scalars().first():
            return

        stmt2 = select(LecturerCourseAssignment.course_id).where(
            LecturerCourseAssignment.course_id == course_id,
            LecturerCourseAssignment.lecturer_id == user.id,
            LecturerCourseAssignment.is_active == True,
        )
        res2 = await self.db.execute(stmt2)
        if res2.scalars().first():
            return

        raise AuthorizationError(
            "You are not assigned to teach this course",
            code="NOT_COURSE_LECTURER",
        )

    async def _verify_assessment_access(
        self, assessment_id: uuid.UUID, user: User
    ) -> Assessment:
        stmt = select(Assessment).where(
            Assessment.id == assessment_id, Assessment.is_deleted == False
        )
        res = await self.db.execute(stmt)
        assessment = res.scalar_one_or_none()
        if not assessment:
            raise NotFoundError("Assessment not found", code="ASSESSMENT_NOT_FOUND")

        if user.role == UserRole.ADMIN:
            return assessment

        if assessment.created_by_id == user.id:
            return assessment

        # Check co-author
        from app.db.models.authoring import AssessmentCollaborator
        collab_stmt = select(AssessmentCollaborator.id).where(
            AssessmentCollaborator.assessment_id == assessment_id,
            AssessmentCollaborator.lecturer_id == user.id,
            AssessmentCollaborator.is_active == True,
        )
        if (await self.db.execute(collab_stmt)).scalars().first():
            return assessment

        # Check course assignment
        if assessment.course_id:
            try:
                await self._verify_course_lecturer_or_admin(assessment.course_id, user)
                return assessment
            except AuthorizationError:
                pass

        # Check active grading delegation
        now = datetime.now(UTC)
        delegation = await self.repo.find_active_delegation(assessment_id, user.id, now)
        if delegation:
            return assessment

        raise AuthorizationError(
            "You do not have access to manage grading for this assessment",
            code="FORBIDDEN_ASSESSMENT_ACCESS",
        )

    # ── Marking Schemes ──────────────────────────────────────────────────────

    async def get_marking_scheme(
        self, question_id: uuid.UUID, user: User
    ) -> MarkingScheme:
        await self._get_question_and_verify_access(question_id, user)
        scheme = await self.repo.get_marking_scheme_by_question(question_id)
        if not scheme:
            raise NotFoundError("Marking scheme not found", code="MARKING_SCHEME_NOT_FOUND")
        return scheme

    async def create_or_update_marking_scheme(
        self,
        question_id: uuid.UUID,
        user: User,
        data: MarkingSchemeCreate | MarkingSchemeUpdate,
    ) -> MarkingScheme:
        question = await self._get_question_and_verify_access(question_id, user)
        existing_scheme = await self.repo.get_marking_scheme_by_question(question_id)

        scheme = await self.repo.create_or_update_marking_scheme(
            question_id=question_id,
            model_answer=data.model_answer or "",
            created_by_id=user.id,
            allow_partial_credit=data.allow_partial_credit if data.allow_partial_credit is not None else True,
            notes=data.notes,
            rubric_id=data.rubric_id,
        )

        audit_action = "marking_scheme_updated" if existing_scheme else "marking_scheme_created"
        audit = AuditLog(
            actor_id=user.id,
            actor_role=user.role if isinstance(user.role, str) else user.role.value,
            entity_type="marking_scheme",
            entity_id=scheme.id,
            action=audit_action,
            description=f"Marking scheme {audit_action.replace('_', ' ')} for question {question_id}.",
            after_state={"question_id": str(question_id), "allow_partial_credit": scheme.allow_partial_credit},
        )
        self.db.add(audit)
        await self.db.commit()
        return scheme

    async def delete_marking_scheme(
        self, question_id: uuid.UUID, user: User
    ) -> bool:
        question = await self._get_question_and_verify_access(question_id, user)
        existing_scheme = await self.repo.get_marking_scheme_by_question(question_id)

        success = await self.repo.delete_marking_scheme(question_id)
        if success:
            audit = AuditLog(
                actor_id=user.id,
                actor_role=user.role if isinstance(user.role, str) else user.role.value,
                entity_type="marking_scheme",
                entity_id=existing_scheme.id if existing_scheme else question_id,
                action="marking_scheme_deleted",
                description=f"Marking scheme deleted for question {question_id}.",
            )
            self.db.add(audit)
        await self.db.commit()
        return success

    # ── Question Mark Steps (Method Marks) ───────────────────────────────────

    async def list_steps(
        self, question_id: uuid.UUID, user: User
    ) -> List[QuestionMarkStep]:
        await self._get_question_and_verify_access(question_id, user)
        return await self.repo.list_steps_by_question(question_id)

    async def batch_save_steps(
        self,
        question_id: uuid.UUID,
        user: User,
        steps: List[QuestionMarkStepCreate],
    ) -> List[QuestionMarkStep]:
        question = await self._get_question_and_verify_access(question_id, user)

        # Invariant check: sum(step.marks) must equal question.marks (Section 9.1)
        total_step_marks = sum(s.marks for s in steps)
        if abs(total_step_marks - question.marks) > 0.001:
            raise ValidationError(
                f"Sum of step marks ({total_step_marks}) must equal the question's marks ({question.marks})",
                code="STEP_MARKS_SUM_MISMATCH",
            )

        steps_data = [s.model_dump() for s in steps]
        saved_steps = await self.repo.batch_replace_steps(question_id, steps_data)

        audit = AuditLog(
            actor_id=user.id,
            actor_role=user.role if isinstance(user.role, str) else user.role.value,
            entity_type="question",
            entity_id=question_id,
            action="question_mark_steps_updated",
            description=f"Saved {len(saved_steps)} step mark(s) totaling {total_step_marks} marks for question {question_id}.",
            after_state={"steps_count": len(saved_steps), "total_marks": total_step_marks},
        )
        self.db.add(audit)
        await self.db.commit()
        return saved_steps

    async def delete_step(
        self, question_id: uuid.UUID, step_id: uuid.UUID, user: User
    ) -> bool:
        question = await self._get_question_and_verify_access(question_id, user)

        success = await self.repo.delete_step(step_id)
        if success:
            audit = AuditLog(
                actor_id=user.id,
                actor_role=user.role if isinstance(user.role, str) else user.role.value,
                entity_type="question_mark_step",
                entity_id=step_id,
                action="question_mark_step_deleted",
                description=f"Step mark {step_id} deleted for question {question_id}.",
            )
            self.db.add(audit)
        await self.db.commit()
        return success

    # ── Material Key Points ──────────────────────────────────────────────────

    async def list_material_key_points(
        self, material_id: uuid.UUID, user: User
    ) -> List[MaterialKeyPoint]:
        await self._get_material_and_verify_access(material_id, user)
        return await self.repo.list_key_points_by_material(material_id)

    async def create_material_key_point(
        self, material_id: uuid.UUID, user: User, data: MaterialKeyPointCreate
    ) -> MaterialKeyPoint:
        material = await self._get_material_and_verify_access(material_id, user)

        kp = await self.repo.create_key_point(
            material_id=material_id,
            text=data.text,
            created_by_id=user.id,
            importance=data.importance,
            chunk_id=data.chunk_id,
            page_number=data.page_number,
        )

        audit = AuditLog(
            actor_id=user.id,
            actor_role=user.role if isinstance(user.role, str) else user.role.value,
            entity_type="material_key_point",
            entity_id=kp.id,
            action="material_key_point_created",
            description=f"Key point created for material {material_id}.",
            after_state={"material_id": str(material_id), "importance": kp.importance.value if hasattr(kp.importance, "value") else str(kp.importance)},
        )
        self.db.add(audit)
        await self.db.commit()
        return kp

    async def delete_material_key_point(
        self, key_point_id: uuid.UUID, user: User
    ) -> bool:
        kp = await self.repo.get_key_point(key_point_id)
        if not kp:
            raise NotFoundError("Key point not found", code="KEY_POINT_NOT_FOUND")

        await self._get_material_and_verify_access(kp.lecturer_material_id, user)

        success = await self.repo.delete_key_point(key_point_id)
        if success:
            audit = AuditLog(
                actor_id=user.id,
                actor_role=user.role if isinstance(user.role, str) else user.role.value,
                entity_type="material_key_point",
                entity_id=key_point_id,
                action="material_key_point_deleted",
                description=f"Key point {key_point_id} deleted.",
            )
            self.db.add(audit)
        await self.db.commit()
        return success

    async def list_question_key_points(
        self, question_id: uuid.UUID, user: User
    ) -> List[MaterialKeyPoint]:
        await self._get_question_and_verify_access(question_id, user)
        return await self.repo.list_key_points_for_question(question_id)

    async def attach_key_points_to_question(
        self, question_id: uuid.UUID, user: User, key_point_ids: Sequence[uuid.UUID]
    ) -> List[MaterialKeyPoint]:
        await self._get_question_and_verify_access(question_id, user)
        for kp_id in key_point_ids:
            kp = await self.repo.get_key_point(kp_id)
            if not kp:
                raise NotFoundError(f"Key point {kp_id} not found", code="KEY_POINT_NOT_FOUND")
            await self._get_material_and_verify_access(kp.lecturer_material_id, user)

        kps = await self.repo.attach_key_points_to_question(question_id, key_point_ids)

        audit = AuditLog(
            actor_id=user.id,
            actor_role=user.role if isinstance(user.role, str) else user.role.value,
            entity_type="question",
            entity_id=question_id,
            action="key_points_attached",
            description=f"Attached {len(key_point_ids)} key point(s) to question {question_id}.",
            after_state={"key_point_ids": [str(k) for k in key_point_ids]},
        )
        self.db.add(audit)
        await self.db.commit()
        return kps

    async def detach_key_point_from_question(
        self, question_id: uuid.UUID, key_point_id: uuid.UUID, user: User
    ) -> bool:
        await self._get_question_and_verify_access(question_id, user)
        success = await self.repo.detach_key_point_from_question(question_id, key_point_id)
        if success:
            audit = AuditLog(
                actor_id=user.id,
                actor_role=user.role if isinstance(user.role, str) else user.role.value,
                entity_type="question",
                entity_id=question_id,
                action="key_point_detached",
                description=f"Detached key point {key_point_id} from question {question_id}.",
                after_state={"detached_key_point_id": str(key_point_id)},
            )
            self.db.add(audit)
        await self.db.commit()
        return success

    # ── AI Grade Sample Check & Bulk Accept (R-13) ───────────────────────────

    async def to_sample_check_response(self, check: AIGradeSampleCheck) -> SampleCheckResponse:
        """Sample check plus the sampled items, so the lecturer can actually verify them."""
        response = SampleCheckResponse.model_validate(check)
        items = await self.repo.list_sample_items(check.sampled_review_ids or [])
        pending = await self.repo.list_pending_ai_reviews_for_assessment(check.assessment_id)
        return response.model_copy(
            update={
                "items": [SampleCheckItem.model_validate(i) for i in items],
                "pending_review_count": len(pending),
            }
        )

    async def get_latest_sample_check(
        self, assessment_id: uuid.UUID, user: User
    ) -> SampleCheckResponse:
        await self._verify_assessment_access(assessment_id, user)
        check = await self.repo.get_latest_sample_check_for_assessment(assessment_id)
        if not check:
            raise NotFoundError("No sample check found for this assessment", code="SAMPLE_CHECK_NOT_FOUND")
        return await self.to_sample_check_response(check)

    async def _complete_finalized_grades(self, grade_ids: Sequence[uuid.UUID]) -> None:
        """
        After grades are finalised outside the per-item grading flow (sample check,
        bulk accept): close their queue items and calculate results for attempts
        that are now fully graded — previously these attempts were left hanging.
        """
        if not grade_ids:
            return
        from app.db.models.attempt import GradingQueueItem
        from app.db.enums import GradingQueueStatus
        from app.services.result_service import ResultService

        grades = (
            await self.db.execute(select(SubmissionGrade).where(SubmissionGrade.id.in_(list(grade_ids))))
        ).scalars().all()
        response_ids = [g.response_id for g in grades if g.response_id]
        if response_ids:
            await self.db.execute(
                update(GradingQueueItem)
                .where(
                    GradingQueueItem.response_id.in_(response_ids),
                    GradingQueueItem.status.in_([
                        GradingQueueStatus.PENDING,
                        GradingQueueStatus.ASSIGNED,
                        GradingQueueStatus.AI_SUGGESTED,
                        GradingQueueStatus.IN_PROGRESS,
                        GradingQueueStatus.FAILED,
                    ]),
                )
                .values(status=GradingQueueStatus.COMPLETED)
            )
        await self.db.flush()

        result_service = ResultService(self.db)
        for attempt_id in {g.attempt_id for g in grades}:
            attempt = await self.db.get(AssessmentAttempt, attempt_id)
            if not attempt:
                continue
            final_count = (
                await self.db.execute(
                    select(sa_func.count(SubmissionGrade.id)).where(
                        SubmissionGrade.attempt_id == attempt_id,
                        SubmissionGrade.is_final == True,  # noqa: E712
                        SubmissionGrade.is_current == True,  # noqa: E712
                        SubmissionGrade.is_deleted == False,  # noqa: E712
                    )
                )
            ).scalar_one()
            question_count = await AssessmentRepository(self.db).count_assessment_questions(
                attempt.assessment_id
            )
            if question_count and final_count >= question_count:
                await result_service.calculate_result(attempt_id=attempt_id)

    async def create_sample_check(
        self,
        assessment_id: uuid.UUID,
        user: User,
        sample_size: Optional[int] = None,
    ) -> SampleCheckResponse:
        assessment = await self._verify_assessment_access(assessment_id, user)

        # Reuse an unfinished sample instead of drawing a new one each time
        latest = await self.repo.get_latest_sample_check_for_assessment(assessment_id)
        if latest and latest.status == SampleCheckStatus.PENDING:
            return await self.to_sample_check_response(latest)

        pending_reviews = await self.repo.list_pending_ai_reviews_for_assessment(assessment_id)
        count = len(pending_reviews)
        if count == 0:
            raise ConflictError(
                "No pending AI reviews available to sample",
                code="NO_PENDING_AI_REVIEWS",
            )

        # Default sample size: max(5, math.ceil(0.10 * count)), capped at available count
        default_size = max(5, math.ceil(0.10 * count))
        target_size = min(count, sample_size or default_size)

        # Random sample
        sampled_reviews = random.sample(pending_reviews, target_size)
        sampled_ids = [str(r.id) for r in sampled_reviews]

        check = await self.repo.create_sample_check(
            assessment_id=assessment_id,
            lecturer_id=user.id,
            sample_size=target_size,
            sampled_review_ids=sampled_ids,
        )

        audit = AuditLog(
            actor_id=user.id,
            actor_role=user.role if isinstance(user.role, str) else user.role.value,
            entity_type="ai_grade_sample_check",
            entity_id=check.id,
            action="sample_check_created",
            description=f"Sample check created for assessment {assessment_id} with sample size {target_size}.",
            after_state={"sample_size": target_size, "assessment_id": str(assessment_id)},
        )
        self.db.add(audit)
        await self.db.commit()
        return await self.to_sample_check_response(check)

    async def verify_sample_check(
        self,
        assessment_id: uuid.UUID,
        sample_check_id: uuid.UUID,
        user: User,
        verifications: List[SampleCheckVerifyItem],
    ) -> SampleCheckResponse:
        await self._verify_assessment_access(assessment_id, user)
        check = await self.repo.get_sample_check(sample_check_id)
        if not check or check.assessment_id != assessment_id:
            raise NotFoundError("Sample check not found", code="SAMPLE_CHECK_NOT_FOUND")

        sampled_set = set(check.sampled_review_ids)
        agreed_count = 0
        now = datetime.now(UTC)
        finalized_grade_ids: list[uuid.UUID] = []

        for item in verifications:
            str_id = str(item.review_id)
            if str_id not in sampled_set:
                continue

            # Load the review
            review_stmt = select(AIGradeReview).where(AIGradeReview.id == item.review_id)
            review = (await self.db.execute(review_stmt)).scalar_one_or_none()
            if not review:
                continue

            if item.agreed:
                agreed_count += 1
                decision = AIGradeDecision.ACCEPTED
                final_score = review.ai_suggested_total or 0.0
            else:
                decision = AIGradeDecision.MODIFIED
                final_score = item.lecturer_score if item.lecturer_score is not None else (review.ai_suggested_total or 0.0)

            # Update AIGradeReview
            review.grading_decision = decision
            review.lecturer_final_total = final_score
            review.score_delta = final_score - (review.ai_suggested_total or 0.0)
            review.lecturer_id = user.id
            review.review_completed_at = now
            if item.lecturer_feedback:
                review.lecturer_notes = item.lecturer_feedback
            self.db.add(review)

            # Update SubmissionGrade. Feedback: the lecturer's text if given; an
            # agreed item also accepts the AI draft (this check is the human
            # review). Never overwrite existing feedback with nothing.
            if review.submission_grade_id:
                grade = await self.db.get(SubmissionGrade, review.submission_grade_id)
                values: dict = {
                    "is_final": True,
                    "score": final_score,
                    "graded_by_id": user.id,
                    "graded_at": now,
                }
                if item.lecturer_feedback:
                    values["feedback"] = item.lecturer_feedback
                elif item.agreed and grade and not grade.feedback and grade.ai_feedback_draft:
                    values["feedback"] = grade.ai_feedback_draft
                await self.db.execute(
                    update(SubmissionGrade)
                    .where(SubmissionGrade.id == review.submission_grade_id)
                    .values(**values)
                )
                finalized_grade_ids.append(review.submission_grade_id)

        await self._complete_finalized_grades(finalized_grade_ids)

        checked_count = len(verifications)
        agreement_rate = (agreed_count / checked_count) if checked_count > 0 else 0.0
        # The agreement threshold is enforced at bulk-accept time.
        status = SampleCheckStatus.VERIFIED

        updated_check = await self.repo.update_sample_check(
            sample_check_id,
            checked_count=checked_count,
            agreement_rate=agreement_rate,
            status=status,
        )

        audit = AuditLog(
            actor_id=user.id,
            actor_role=user.role if isinstance(user.role, str) else user.role.value,
            entity_type="ai_grade_sample_check",
            entity_id=sample_check_id,
            action="sample_check_verified",
            description=f"Sample check {sample_check_id} verified with agreement rate {agreement_rate:.2%}.",
            after_state={"agreement_rate": agreement_rate, "checked_count": checked_count, "status": status.value if hasattr(status, "value") else str(status)},
        )
        self.db.add(audit)
        await self.db.commit()
        return await self.to_sample_check_response(updated_check or check)

    async def bulk_accept_grades(
        self,
        assessment_id: uuid.UUID,
        user: User,
        *,
        override_low_agreement: bool = False,
        override_reason: Optional[str] = None,
        agreement_threshold: Optional[float] = None,
    ) -> dict:
        assessment = await self._verify_assessment_access(assessment_id, user)

        # Configurable agreement threshold (Section 9.6, default 80%)
        from app.core.config import settings
        effective_threshold = agreement_threshold
        if effective_threshold is None:
            inst_settings = getattr(getattr(getattr(assessment, "course", None), "institution", None), "settings", None)
            if isinstance(inst_settings, dict):
                effective_threshold = inst_settings.get("sample_check_agreement_threshold")
        if effective_threshold is None or not isinstance(effective_threshold, (int, float)):
            effective_threshold = settings.SAMPLE_CHECK_AGREEMENT_THRESHOLD

        # 1. Check sample check requirement (Section 9.6)
        latest_check = await self.repo.get_latest_sample_check_for_assessment(assessment_id)
        if not latest_check or latest_check.status == SampleCheckStatus.PENDING:
            raise ConflictError(
                "A verified sample check is required before bulk-accepting AI suggestions",
                code="SAMPLE_CHECK_REQUIRED",
            )

        if latest_check.agreement_rate < effective_threshold:
            if not override_low_agreement:
                raise ConflictError(
                    f"Sample check agreement rate ({latest_check.agreement_rate:.2%}) is below {effective_threshold:.0%} threshold",
                    code="AGREEMENT_BELOW_THRESHOLD",
                )
            if not override_reason or len(override_reason.strip()) < 10:
                raise ValidationError(
                    "Explicit override reason of at least 10 characters is required to bypass low agreement rate",
                    code="OVERRIDE_REASON_REQUIRED",
                )

        # 2. Bulk accept all pending AI grade reviews
        pending_reviews = await self.repo.list_pending_ai_reviews_for_assessment(assessment_id)
        now = datetime.now(UTC)
        accepted_count = 0
        finalized_grade_ids: list[uuid.UUID] = []

        for review in pending_reviews:
            final_score = review.ai_suggested_total or 0.0
            review.grading_decision = AIGradeDecision.ACCEPTED
            review.lecturer_final_total = final_score
            review.score_delta = 0.0
            review.lecturer_id = user.id
            review.review_completed_at = now
            self.db.add(review)

            if review.submission_grade_id:
                grade = await self.db.get(SubmissionGrade, review.submission_grade_id)
                values: dict = {
                    "is_final": True,
                    "score": final_score,
                    "graded_by_id": user.id,
                    "graded_at": now,
                }
                # Accepting under a verified sample check accepts the AI feedback too
                if grade and not grade.feedback and grade.ai_feedback_draft:
                    values["feedback"] = grade.ai_feedback_draft
                    values["feedback_author_basis"] = "AI"
                await self.db.execute(
                    update(SubmissionGrade)
                    .where(SubmissionGrade.id == review.submission_grade_id)
                    .values(**values)
                )
                finalized_grade_ids.append(review.submission_grade_id)
            accepted_count += 1

        await self._complete_finalized_grades(finalized_grade_ids)

        # 3. Log audit event [AUDIT]
        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=user.id,
            actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
            action="ai_grades_bulk_accepted",
            entity_type="assessment",
            entity_id=assessment_id,
            after_json={
                "accepted_count": accepted_count,
                "sample_check_id": str(latest_check.id),
                "agreement_rate": latest_check.agreement_rate,
                "override_low_agreement": override_low_agreement,
                "override_reason": override_reason,
            },
            reason=override_reason or "Lecturer verified sample and bulk-accepted AI grades",
            created_at=now,
        )
        self.db.add(audit_log)
        await self.db.commit()

        return {
            "assessment_id": assessment_id,
            "accepted_count": accepted_count,
            "sample_check_id": latest_check.id,
            "agreement_rate": latest_check.agreement_rate,
            "status": "COMPLETED",
        }

    # ── Grading Delegations ──────────────────────────────────────────────────

    async def create_grading_delegation(
        self,
        assessment_id: uuid.UUID,
        user: User,
        data: GradingDelegationCreate,
    ) -> GradingDelegation:
        assessment = await self._verify_assessment_access(assessment_id, user)

        # Delegate must be a lecturer of the same course (R-11, Section 9.7)
        if assessment.course_id:
            delegate_stmt = select(User).where(User.id == data.delegate_id)
            delegate = (await self.db.execute(delegate_stmt)).scalar_one_or_none()
            if not delegate:
                raise NotFoundError("Delegate user not found", code="DELEGATE_NOT_FOUND")

            # Check delegate teaches course
            is_assigned = False
            t_stmt = select(TeachingAssignment.id).where(
                TeachingAssignment.course_id == assessment.course_id,
                TeachingAssignment.lecturer_id == data.delegate_id,
                TeachingAssignment.is_active == True,
            )
            if (await self.db.execute(t_stmt)).scalars().first():
                is_assigned = True

            if not is_assigned:
                lc_stmt = select(LecturerCourseAssignment.course_id).where(
                    LecturerCourseAssignment.course_id == assessment.course_id,
                    LecturerCourseAssignment.lecturer_id == data.delegate_id,
                    LecturerCourseAssignment.is_active == True,
                )
                if (await self.db.execute(lc_stmt)).scalars().first():
                    is_assigned = True

            if not is_assigned:
                raise ValidationError(
                    "Delegate must be a lecturer assigned to teach the same course",
                    code="DELEGATE_NOT_COURSE_LECTURER",
                )

        if data.valid_from >= data.valid_to:
            raise ValidationError(
                "valid_from must precede valid_to",
                code="INVALID_DELEGATION_DATES",
            )

        delegation = await self.repo.create_delegation(
            assessment_id=assessment_id,
            delegator_id=user.id,
            delegate_id=data.delegate_id,
            scope=data.scope.value if hasattr(data.scope, "value") else str(data.scope),
            reason=data.reason,
            valid_from=data.valid_from,
            valid_to=data.valid_to,
            target_section_id=data.target_section_id,
            target_student_ids=data.target_student_ids,
        )

        # Audit log [AUDIT]
        now = datetime.now(UTC)
        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=user.id,
            actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
            action="grading_delegation_created",
            entity_type="grading_delegation",
            entity_id=delegation.id,
            after_json={
                "assessment_id": str(assessment_id),
                "delegate_id": str(data.delegate_id),
                "scope": str(data.scope),
                "valid_from": data.valid_from.isoformat(),
                "valid_to": data.valid_to.isoformat(),
            },
            reason=data.reason,
            created_at=now,
        )
        self.db.add(audit_log)
        await self.db.commit()
        return delegation

    async def revoke_grading_delegation(
        self,
        assessment_id: uuid.UUID,
        delegation_id: uuid.UUID,
        user: User,
    ) -> GradingDelegation:
        await self._verify_assessment_access(assessment_id, user)
        delegation = await self.repo.revoke_delegation(delegation_id)
        if not delegation:
            raise NotFoundError("Delegation not found", code="DELEGATION_NOT_FOUND")

        now = datetime.now(UTC)
        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=user.id,
            actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
            action="grading_delegation_revoked",
            entity_type="grading_delegation",
            entity_id=delegation.id,
            reason="Delegation revoked by user",
            created_at=now,
        )
        self.db.add(audit_log)
        await self.db.commit()
        return delegation

    async def list_grading_delegations(
        self, assessment_id: uuid.UUID, user: User
    ) -> List[GradingDelegation]:
        await self._verify_assessment_access(assessment_id, user)
        return await self.repo.list_delegations_for_assessment(assessment_id)
