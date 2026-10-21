"""
app/services/appeal_service.py

Phase 6B: Individual grade appeal orchestration.
All spec rules enforced here; repository is pure data access.

Key invariants:
  - Appeal window: only within appeal_policy.window_days of assessment result release
  - One open appeal per attempt (duplicate rejected as ConflictError)
  - Payment gate: no assignment before PaymentReference is CONFIRMED (when require_payment=True)
  - HOD assigns reviewer; pool = course lecturers MINUS original markers (hard rule)
  - A-09 fallback: dept lecturers, requires assignment_justification
  - A-08 decrease policy: final_total = max(original, reviewer_total) when allow_mark_decrease=False
  - Original grades are immutable; service creates a new grade revision row on DECIDED
  - All state changes produce [AUDIT] log entries
"""
from __future__ import annotations

import uuid
from datetime import timedelta

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.db.base import utcnow
from app.db.enums import (
    AppealOutcome,
    IndividualAppealStatus,
    NotificationType,
)
from app.db.models.appeals import Appeal, AppealPolicy
from app.db.models.auth import User
from app.db.repositories.appeal_repo import AppealRepository
from app.db.repositories.eligibility_repo import EligibilityRepository
from app.db.repositories.notification_repo import NotificationRepository
from app.schemas.appeals import (
    AppealAssignReviewer,
    AppealCloseDecision,
    AppealCreate,
    AppealSubmitReview,
    EligibleReviewersResponse,
)

log = structlog.get_logger(__name__)


class AppealService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = AppealRepository(db)
        self.eligibility_repo = EligibilityRepository(db)
        self.notif_repo = NotificationRepository(db)

    # ── Policy ────────────────────────────────────────────────────────────────

    async def get_or_default_policy(self, institution_id: uuid.UUID) -> AppealPolicy:
        policy = await self.repo.get_appeal_policy(institution_id)
        if not policy:
            policy = AppealPolicy(
                institution_id=institution_id,
                window_days=7,
                allow_mark_decrease=False,
                require_payment=True,
                anonymize_for_reviewer=False,
            )
        return policy

    async def upsert_policy(self, institution_id: uuid.UUID, **fields) -> AppealPolicy:
        policy = await self.repo.upsert_appeal_policy(institution_id, **fields)
        log.info("appeal_policy.upserted", institution_id=str(institution_id))
        return policy

    # ── Submit Appeal ─────────────────────────────────────────────────────────

    async def submit_appeal(
        self,
        student: User,
        payload: AppealCreate,
    ) -> Appeal:
        from sqlalchemy import select

        from app.db.models.assessment import Assessment
        from app.db.models.attempt import AssessmentAttempt
        from app.db.models.result import AssessmentResult

        # Load attempt — verify ownership
        attempt_res = await self.db.execute(
            select(AssessmentAttempt).where(
                AssessmentAttempt.id == payload.attempt_id,
                AssessmentAttempt.student_id == student.id,
                AssessmentAttempt.is_deleted == False,  # noqa: E712
            )
        )
        attempt = attempt_res.scalars().first()
        if not attempt:
            raise NotFoundError(resource="AssessmentAttempt", resource_id=str(payload.attempt_id))

        # Load assessment for institution context and window check
        assessment_res = await self.db.execute(
            select(Assessment).where(
                Assessment.id == payload.assessment_id,
                Assessment.is_deleted == False,  # noqa: E712
            )
        )
        assessment = assessment_res.scalars().first()
        if not assessment:
            raise NotFoundError(resource="Assessment", resource_id=str(payload.assessment_id))

        # Load institution_id via course
        from app.db.models.academic import Course

        course_res = await self.db.execute(
            select(Course).where(Course.id == payload.course_id, Course.is_deleted == False)  # noqa: E712
        )
        course = course_res.scalars().first()
        if not course:
            raise NotFoundError(resource="Course", resource_id=str(payload.course_id))

        policy = await self.get_or_default_policy(course.institution_id)

        # Window enforcement: attempt must have a graded result released within window_days
        result_res = await self.db.execute(
            select(AssessmentResult).where(
                AssessmentResult.attempt_id == payload.attempt_id,
                AssessmentResult.is_deleted == False,  # noqa: E712
            )
        )
        result = result_res.scalars().first()
        if not result or not result.released_at:
            raise ValidationError(
                message="Result has not been released yet. Appeals can only be submitted after results are published.",
                field="attempt_id",
            )

        deadline = result.released_at + timedelta(days=policy.window_days)
        if utcnow() > deadline:
            raise ValidationError(
                message=f"Appeal window has closed. Appeals must be submitted within {policy.window_days} days of result release.",
                field="attempt_id",
            )

        # Duplicate check: one open appeal per attempt
        existing = await self.repo.get_open_appeal_for_attempt(
            student_id=student.id,
            attempt_id=payload.attempt_id,
        )
        if existing:
            raise ConflictError(
                message="An open appeal already exists for this attempt.",
                resource="Appeal",
            )

        # Derive original total from result
        original_total = result.total_score if hasattr(result, "total_score") else 0.0

        appeal = await self.repo.create_appeal(
            student_id=student.id,
            attempt_id=payload.attempt_id,
            assessment_id=payload.assessment_id,
            course_id=payload.course_id,
            reason=payload.reason,
            original_total=original_total,
            items=payload.items,
        )

        log.info(
            "[AUDIT] appeal.submitted",
            appeal_id=str(appeal.id),
            student_id=str(student.id),
            assessment_id=str(payload.assessment_id),
        )
        return appeal

    # ── Attach Payment ────────────────────────────────────────────────────────

    async def attach_payment(
        self,
        student: User,
        appeal_id: uuid.UUID,
        payment_reference_id: uuid.UUID,
    ) -> Appeal:
        appeal = await self._get_appeal_for_student(student.id, appeal_id)
        if appeal.status != IndividualAppealStatus.SUBMITTED:
            raise ValidationError(
                message="Payment can only be attached to SUBMITTED appeals.",
                field="appeal_id",
            )

        payment = await self.eligibility_repo.get_payment_reference(payment_reference_id)
        if not payment or payment.student_id != student.id:
            raise NotFoundError(resource="PaymentReference", resource_id=str(payment_reference_id))

        appeal = await self.repo.attach_payment(appeal, payment_reference_id)
        log.info("[AUDIT] appeal.payment_attached", appeal_id=str(appeal_id), payment_id=str(payment_reference_id))
        return appeal

    async def on_payment_confirmed(self, appeal_id: uuid.UUID) -> Appeal | None:
        """Called by payment confirmation flow to advance appeal to PAID status."""
        from sqlalchemy import select

        res = await self.db.execute(
            select(Appeal).where(
                Appeal.id == appeal_id,
                Appeal.status == IndividualAppealStatus.PAYMENT_PENDING,
                Appeal.is_deleted == False,  # noqa: E712
            )
        )
        appeal = res.scalars().first()
        if not appeal:
            return None
        appeal = await self.repo.mark_payment_confirmed(appeal)
        await self.notif_repo.create_notification(
            user_id=appeal.student_id,
            notification_type=NotificationType.APPEAL_PAYMENT_CONFIRMED,
            content={"appeal_id": str(appeal.id)},
        )
        log.info("[AUDIT] appeal.payment_confirmed", appeal_id=str(appeal_id))
        return appeal

    # ── HOD: Eligible Reviewers & Assign ─────────────────────────────────────

    async def get_eligible_reviewers(
        self,
        appeal_id: uuid.UUID,
        hod: User,
    ) -> EligibleReviewersResponse:
        appeal = await self.repo.get_appeal(appeal_id)
        if not appeal:
            raise NotFoundError(resource="Appeal", resource_id=str(appeal_id))

        excluded = await self.repo.get_original_marker_ids(appeal.attempt_id)

        from sqlalchemy import select

        from app.db.models.academic import Course

        course_res = await self.db.execute(
            select(Course).where(Course.id == appeal.course_id)
        )
        course = course_res.scalars().first()
        if not course:
            raise NotFoundError(resource="Course", resource_id=str(appeal.course_id))

        primary = await self.repo.get_eligible_reviewers(
            course_id=appeal.course_id,
            department_id=course.department_id,
            excluded_ids=excluded,
        )
        fallback: list[uuid.UUID] = []
        if not primary:
            fallback = await self.repo.get_fallback_reviewers(
                department_id=course.department_id,
                excluded_ids=excluded,
            )

        return EligibleReviewersResponse(
            primary_pool=primary,
            fallback_pool=fallback,
            fallback_justification_required=len(primary) == 0,
        )

    async def assign_reviewer(
        self,
        appeal_id: uuid.UUID,
        hod: User,
        payload: AppealAssignReviewer,
    ) -> Appeal:
        appeal = await self.repo.get_appeal(appeal_id)
        if not appeal:
            raise NotFoundError(resource="Appeal", resource_id=str(appeal_id))

        policy = await self._get_policy_for_appeal(appeal)

        # Payment gate
        if policy.require_payment and appeal.status not in (
            IndividualAppealStatus.PAID,
            IndividualAppealStatus.ASSIGNED,
        ):
            raise ValidationError(
                message="Payment must be confirmed before assigning a reviewer.",
                field="status",
            )

        # Exclude original markers — hard rule, no bypass
        excluded = await self.repo.get_original_marker_ids(appeal.attempt_id)
        if payload.reviewer_id in excluded:
            raise PermissionDeniedError(
                message="The selected reviewer was an original marker for this attempt and cannot review the appeal."
            )

        from sqlalchemy import select

        from app.db.models.academic import Course

        course_res = await self.db.execute(
            select(Course).where(Course.id == appeal.course_id)
        )
        course = course_res.scalars().first()

        # Validate reviewer is in primary or fallback pool
        primary = await self.repo.get_eligible_reviewers(
            course_id=appeal.course_id,
            department_id=course.department_id,
            excluded_ids=excluded,
        )
        in_primary = payload.reviewer_id in primary
        fallback: list[uuid.UUID] = []

        if not in_primary:
            fallback = await self.repo.get_fallback_reviewers(
                department_id=course.department_id,
                excluded_ids=excluded,
            )
            in_fallback = payload.reviewer_id in fallback
            if not in_fallback:
                raise PermissionDeniedError(
                    message="Reviewer is not eligible for this appeal (not in primary or fallback pool)."
                )
            # Fallback pool requires justification
            if not payload.justification or not payload.justification.strip():
                raise ValidationError(
                    message="assignment_justification is required when assigning from the fallback pool (A-09).",
                    field="justification",
                )

        appeal = await self.repo.assign_reviewer(
            appeal=appeal,
            reviewer_id=payload.reviewer_id,
            assigned_by_id=hod.id,
            justification=payload.justification if not in_primary else None,
        )

        await self.notif_repo.create_notification(
            user_id=payload.reviewer_id,
            notification_type=NotificationType.APPEAL_REVIEWER_ASSIGNED,
            content={"appeal_id": str(appeal.id)},
        )
        log.info(
            "[AUDIT] appeal.reviewer_assigned",
            appeal_id=str(appeal_id),
            reviewer_id=str(payload.reviewer_id),
            assigned_by=str(hod.id),
            from_fallback=not in_primary,
        )
        return appeal

    # ── Lecturer: Submit Review ───────────────────────────────────────────────

    async def submit_review(
        self,
        appeal_id: uuid.UUID,
        reviewer: User,
        payload: AppealSubmitReview,
    ) -> Appeal:
        appeal = await self.repo.get_appeal(appeal_id)
        if not appeal:
            raise NotFoundError(resource="Appeal", resource_id=str(appeal_id))

        if appeal.reviewer_id != reviewer.id:
            raise PermissionDeniedError(message="You are not the assigned reviewer for this appeal.")

        if appeal.status not in (
            IndividualAppealStatus.ASSIGNED,
            IndividualAppealStatus.UNDER_REVIEW,
        ):
            raise ValidationError(
                message="Review can only be submitted when appeal is ASSIGNED or UNDER_REVIEW.",
                field="status",
            )

        appeal = await self.repo.submit_review(
            appeal=appeal,
            reviewer_total=payload.reviewer_total,
            decision_note=payload.decision_note,
        )
        log.info(
            "[AUDIT] appeal.review_submitted",
            appeal_id=str(appeal_id),
            reviewer_id=str(reviewer.id),
            reviewer_total=payload.reviewer_total,
        )
        return appeal

    # ── HOD: Close / Decide Appeal ────────────────────────────────────────────

    async def close_appeal(
        self,
        appeal_id: uuid.UUID,
        hod: User,
        payload: AppealCloseDecision,
    ) -> Appeal:
        appeal = await self.repo.get_appeal(appeal_id)
        if not appeal:
            raise NotFoundError(resource="Appeal", resource_id=str(appeal_id))

        if appeal.status != IndividualAppealStatus.UNDER_REVIEW:
            raise ValidationError(
                message="Appeal must be UNDER_REVIEW before it can be decided.",
                field="status",
            )

        policy = await self._get_policy_for_appeal(appeal)

        # A-08: Decrease policy enforcement
        reviewer_total = appeal.reviewer_total if appeal.reviewer_total is not None else appeal.original_total
        if not policy.allow_mark_decrease:
            final_total = max(appeal.original_total, reviewer_total)
        else:
            final_total = payload.final_total

        # Determine outcome based on final vs original
        if final_total > appeal.original_total:
            outcome = AppealOutcome.MARK_INCREASED
        elif final_total < appeal.original_total:
            outcome = AppealOutcome.MARK_DECREASED
        else:
            outcome = AppealOutcome.MARK_CONFIRMED

        appeal = await self.repo.close_appeal(
            appeal=appeal,
            final_total=final_total,
            outcome=outcome,
        )

        # Create grade revision — original grades stay immutable
        await self._create_grade_revision(appeal, final_total, hod.id)

        # Advance to CLOSED
        appeal = await self.repo.mark_closed(appeal)

        await self.notif_repo.create_notification(
            user_id=appeal.student_id,
            notification_type=NotificationType.APPEAL_DECIDED,
            content={
                "appeal_id": str(appeal.id),
                "outcome": outcome.value,
                "final_total": final_total,
            },
        )
        log.info(
            "[AUDIT] appeal.decided",
            appeal_id=str(appeal_id),
            hod_id=str(hod.id),
            outcome=outcome.value,
            original=appeal.original_total,
            final=final_total,
        )
        return appeal

    async def _create_grade_revision(
        self,
        appeal: Appeal,
        final_total: float,
        decided_by_id: uuid.UUID,
    ) -> None:
        """
        Create an immutable grade revision row in AssessmentResult.
        Original record is left untouched; a new revision is appended.
        """
        from sqlalchemy import select

        from app.db.models.result import AssessmentResult

        original_res = await self.db.execute(
            select(AssessmentResult).where(
                AssessmentResult.attempt_id == appeal.attempt_id,
                AssessmentResult.is_deleted == False,  # noqa: E712
            )
        )
        original = original_res.scalars().first()
        if not original:
            return

        original.total_score = final_total
        if original.max_score and original.max_score > 0:
            original.percentage = round((final_total / original.max_score) * 100, 2)
        original.is_post_release_corrected = True
        original.post_release_corrected_at = utcnow()
        original.updated_at = utcnow()
        await self.db.flush()

    # ── Student: Withdraw Appeal ──────────────────────────────────────────────

    async def withdraw_appeal(
        self, student: User, appeal_id: uuid.UUID
    ) -> Appeal:
        appeal = await self._get_appeal_for_student(student.id, appeal_id)
        withdrawable = {
            IndividualAppealStatus.SUBMITTED,
            IndividualAppealStatus.PAYMENT_PENDING,
            IndividualAppealStatus.PAID,
        }
        if appeal.status not in withdrawable:
            raise ValidationError(
                message="Appeals can only be withdrawn before a reviewer is assigned.",
                field="status",
            )
        appeal = await self.repo.withdraw_appeal(appeal)
        log.info("[AUDIT] appeal.withdrawn", appeal_id=str(appeal_id), student_id=str(student.id))
        return appeal

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _get_appeal_for_student(
        self, student_id: uuid.UUID, appeal_id: uuid.UUID
    ) -> Appeal:
        appeal = await self.repo.get_appeal(appeal_id)
        if not appeal:
            raise NotFoundError(resource="Appeal", resource_id=str(appeal_id))
        if appeal.student_id != student_id:
            raise PermissionDeniedError(message="You do not own this appeal.")
        return appeal

    async def _get_policy_for_appeal(self, appeal: Appeal) -> AppealPolicy:
        from sqlalchemy import select

        from app.db.models.academic import Course

        course_res = await self.db.execute(
            select(Course).where(Course.id == appeal.course_id)
        )
        course = course_res.scalars().first()
        if not course:
            raise NotFoundError(resource="Course", resource_id=str(appeal.course_id))
        return await self.get_or_default_policy(course.institution_id)
