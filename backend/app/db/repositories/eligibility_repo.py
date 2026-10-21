"""
backend/app/db/repositories/eligibility_repo.py

Repository for Phase 6A: Eligibility, Reassessment, and Retakes.
Strictly follows the repository pattern: executes database queries on AsyncSession.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.base import utcnow
from app.db.enums import (
    EligibilityDecisionType,
    EligibilityResult,
    FormativeScope,
    NoCourseworkBehavior,
    OverrideSource,
    PaymentPurpose,
    PaymentStatus,
    PendingMarksBehavior,
    ReassessmentBlockScope,
    ReassessmentRequirementStatus,
    RetakeStatus,
    RetakeTrigger,
)
from app.db.models.eligibility import (
    AttemptEligibilityOverride,
    EligibilityDecision,
    EligibilityPolicy,
    PaymentReference,
    ReassessmentRequirement,
    RetakeRecord,
)


class EligibilityRepository:
    """Data access repository for eligibility policies, reassessments, overrides, payments, and retakes."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Policy Resolution ────────────────────────────────────────────────────

    async def get_policy(
        self,
        institution_id: uuid.UUID,
        department_id: Optional[uuid.UUID] = None,
    ) -> EligibilityPolicy:
        """
        Fetch institutional policy, falling back from department override to institution default,
        and finally returning a default transient policy instance if none is persisted.
        """
        if department_id:
            dept_stmt = select(EligibilityPolicy).where(
                EligibilityPolicy.institution_id == institution_id,
                EligibilityPolicy.department_id == department_id,
                EligibilityPolicy.is_deleted == False,
            )
            dept_res = await self.db.execute(dept_stmt)
            dept_policy = dept_res.scalars().first()
            if dept_policy:
                return dept_policy

        inst_stmt = select(EligibilityPolicy).where(
            EligibilityPolicy.institution_id == institution_id,
            EligibilityPolicy.department_id.is_(None),
            EligibilityPolicy.is_deleted == False,
        )
        inst_res = await self.db.execute(inst_stmt)
        inst_policy = inst_res.scalars().first()
        if inst_policy:
            return inst_policy

        # Return default policy instance
        return EligibilityPolicy(
            institution_id=institution_id,
            department_id=department_id,
            formative_exempt_pct=70.0,
            summative_entry_pct=50.0,
            summative_pass_pct=50.0,
            formative_scope=FormativeScope.PER_FORMATIVE,
            reassessment_block_scope=ReassessmentBlockScope.COURSE,
            pending_marks_behavior=PendingMarksBehavior.BLOCK,
            no_coursework_behavior=NoCourseworkBehavior.MANUAL_REVIEW,
            allow_hod_override=True,
        )

    async def upsert_policy(
        self,
        institution_id: uuid.UUID,
        department_id: Optional[uuid.UUID] = None,
        **fields: Any,
    ) -> EligibilityPolicy:
        """Create or update an eligibility policy for an institution / department."""
        stmt = select(EligibilityPolicy).where(
            EligibilityPolicy.institution_id == institution_id,
            EligibilityPolicy.department_id == department_id if department_id else EligibilityPolicy.department_id.is_(None),
            EligibilityPolicy.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        policy = res.scalars().first()

        if not policy:
            policy = EligibilityPolicy(
                institution_id=institution_id,
                department_id=department_id,
                **fields,
            )
            self.db.add(policy)
        else:
            for k, v in fields.items():
                if v is not None and hasattr(policy, k):
                    setattr(policy, k, v)
            policy.updated_at = utcnow()

        await self.db.flush()
        return policy

    # ── Reassessment Requirement ─────────────────────────────────────────────

    async def get_requirement_by_id(
        self, requirement_id: uuid.UUID
    ) -> Optional[ReassessmentRequirement]:
        """Fetch requirement with relationships loaded."""
        stmt = (
            select(ReassessmentRequirement)
            .where(
                ReassessmentRequirement.id == requirement_id,
                ReassessmentRequirement.is_deleted == False,
            )
            .options(
                selectinload(ReassessmentRequirement.student),
                selectinload(ReassessmentRequirement.course),
                selectinload(ReassessmentRequirement.source_assessment),
                selectinload(ReassessmentRequirement.reassessment_assessment),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def get_requirement_for_student_and_source(
        self, student_id: uuid.UUID, source_assessment_id: uuid.UUID
    ) -> Optional[ReassessmentRequirement]:
        stmt = select(ReassessmentRequirement).where(
            ReassessmentRequirement.student_id == student_id,
            ReassessmentRequirement.source_assessment_id == source_assessment_id,
            ReassessmentRequirement.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def list_requirements_for_student(
        self,
        student_id: uuid.UUID,
        course_id: Optional[uuid.UUID] = None,
        statuses: Optional[List[ReassessmentRequirementStatus]] = None,
    ) -> Sequence[ReassessmentRequirement]:
        stmt = (
            select(ReassessmentRequirement)
            .where(
                ReassessmentRequirement.student_id == student_id,
                ReassessmentRequirement.is_deleted == False,
            )
            .options(
                selectinload(ReassessmentRequirement.source_assessment),
                selectinload(ReassessmentRequirement.course),
            )
            .order_by(ReassessmentRequirement.created_at.desc())
        )
        if course_id:
            stmt = stmt.where(ReassessmentRequirement.course_id == course_id)
        if statuses:
            stmt = stmt.where(ReassessmentRequirement.status.in_(statuses))

        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def list_pending_reassessments(
        self,
        student_id: uuid.UUID,
        course_id: Optional[uuid.UUID] = None,
    ) -> Sequence[ReassessmentRequirement]:
        """Pending reassessments: REQUIRED or ASSIGNED."""
        return await self.list_requirements_for_student(
            student_id=student_id,
            course_id=course_id,
            statuses=[
                ReassessmentRequirementStatus.REQUIRED,
                ReassessmentRequirementStatus.ASSIGNED,
            ],
        )

    async def upsert_requirement(
        self,
        student_id: uuid.UUID,
        course_id: uuid.UUID,
        academic_period_id: uuid.UUID,
        source_assessment_id: uuid.UUID,
        original_percentage: float,
        status: ReassessmentRequirementStatus = ReassessmentRequirementStatus.REQUIRED,
    ) -> ReassessmentRequirement:
        """Idempotently insert or retrieve requirement for student and source formative."""
        existing = await self.get_requirement_for_student_and_source(
            student_id=student_id,
            source_assessment_id=source_assessment_id,
        )
        if existing:
            return existing

        req = ReassessmentRequirement(
            student_id=student_id,
            course_id=course_id,
            academic_period_id=academic_period_id,
            source_assessment_id=source_assessment_id,
            original_percentage=original_percentage,
            status=status,
        )
        self.db.add(req)
        await self.db.flush()
        return req

    async def link_reassessment_assessment(
        self,
        source_assessment_id: uuid.UUID,
        reassessment_assessment_id: uuid.UUID,
        student_ids: List[uuid.UUID],
    ) -> int:
        """
        Move matching requirements to ASSIGNED and link the reassessment assessment.
        Returns the number of requirements updated.
        """
        stmt = select(ReassessmentRequirement).where(
            ReassessmentRequirement.source_assessment_id == source_assessment_id,
            ReassessmentRequirement.student_id.in_(student_ids),
            ReassessmentRequirement.status == ReassessmentRequirementStatus.REQUIRED,
            ReassessmentRequirement.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        reqs = list(res.scalars().all())
        for req in reqs:
            req.reassessment_assessment_id = reassessment_assessment_id
            req.status = ReassessmentRequirementStatus.ASSIGNED
            req.updated_at = utcnow()
        await self.db.flush()
        return len(reqs)

    async def mark_requirement_submitted(
        self,
        reassessment_attempt_id: uuid.UUID,
        reassessment_assessment_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> Optional[ReassessmentRequirement]:
        """Update requirement to SUBMITTED when student submits attempt on reassessment."""
        stmt = select(ReassessmentRequirement).where(
            ReassessmentRequirement.student_id == student_id,
            ReassessmentRequirement.reassessment_assessment_id == reassessment_assessment_id,
            ReassessmentRequirement.status.in_([
                ReassessmentRequirementStatus.REQUIRED,
                ReassessmentRequirementStatus.ASSIGNED,
            ]),
            ReassessmentRequirement.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        req = res.scalars().first()
        if req:
            req.status = ReassessmentRequirementStatus.SUBMITTED
            req.reassessment_attempt_id = reassessment_attempt_id
            req.updated_at = utcnow()
            await self.db.flush()
        return req

    async def mark_requirement_graded(
        self,
        reassessment_attempt_id: uuid.UUID,
    ) -> Optional[ReassessmentRequirement]:
        """Update requirement to GRADED when reassessment attempt grade is released."""
        stmt = select(ReassessmentRequirement).where(
            ReassessmentRequirement.reassessment_attempt_id == reassessment_attempt_id,
            ReassessmentRequirement.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        req = res.scalars().first()
        if req:
            req.status = ReassessmentRequirementStatus.GRADED
            req.closed_at = utcnow()
            req.updated_at = utcnow()
            await self.db.flush()
        return req

    # ── Eligibility Decision (Audit) ─────────────────────────────────────────

    async def create_decision(
        self,
        student_id: uuid.UUID,
        course_id: uuid.UUID,
        decision_type: EligibilityDecisionType,
        result: EligibilityResult,
        reason_code: str,
        inputs_json: Dict[str, Any],
        policy_snapshot_json: Dict[str, Any],
        assessment_id: Optional[uuid.UUID] = None,
        computed_by: str = "system",
    ) -> EligibilityDecision:
        """Append-only audit record of an eligibility decision."""
        decision = EligibilityDecision(
            student_id=student_id,
            course_id=course_id,
            assessment_id=assessment_id,
            decision_type=decision_type,
            result=result,
            reason_code=reason_code,
            inputs_json=inputs_json,
            policy_snapshot_json=policy_snapshot_json,
            computed_at=utcnow(),
            computed_by=computed_by,
        )
        self.db.add(decision)
        await self.db.flush()
        return decision

    async def list_decisions_for_student(
        self,
        student_id: uuid.UUID,
        course_id: Optional[uuid.UUID] = None,
    ) -> Sequence[EligibilityDecision]:
        stmt = (
            select(EligibilityDecision)
            .where(
                EligibilityDecision.student_id == student_id,
                EligibilityDecision.is_deleted == False,
            )
            .order_by(EligibilityDecision.computed_at.desc())
        )
        if course_id:
            stmt = stmt.where(EligibilityDecision.course_id == course_id)
        res = await self.db.execute(stmt)
        return res.scalars().all()

    # ── Attempt Eligibility Override ─────────────────────────────────────────

    async def create_override(
        self,
        student_id: uuid.UUID,
        assessment_id: uuid.UUID,
        source: OverrideSource,
        reason: str,
        granted_by_id: uuid.UUID,
        allowed_window_start: Optional[datetime] = None,
        allowed_window_end: Optional[datetime] = None,
        excuse_id: Optional[uuid.UUID] = None,
    ) -> AttemptEligibilityOverride:
        override = AttemptEligibilityOverride(
            student_id=student_id,
            assessment_id=assessment_id,
            source=source,
            reason=reason,
            granted_by_id=granted_by_id,
            allowed_window_start=allowed_window_start or utcnow(),
            allowed_window_end=allowed_window_end,
            excuse_id=excuse_id,
        )
        self.db.add(override)
        await self.db.flush()
        return override

    async def get_active_override(
        self,
        student_id: uuid.UUID,
        assessment_id: uuid.UUID,
        at_time: Optional[datetime] = None,
    ) -> Optional[AttemptEligibilityOverride]:
        now = at_time or utcnow()
        stmt = select(AttemptEligibilityOverride).where(
            AttemptEligibilityOverride.student_id == student_id,
            AttemptEligibilityOverride.assessment_id == assessment_id,
            AttemptEligibilityOverride.revoked_at.is_(None),
            AttemptEligibilityOverride.is_deleted == False,
            AttemptEligibilityOverride.allowed_window_start <= now,
            or_(
                AttemptEligibilityOverride.allowed_window_end.is_(None),
                AttemptEligibilityOverride.allowed_window_end >= now,
            ),
        ).order_by(AttemptEligibilityOverride.created_at.desc())
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def revoke_override(
        self,
        override_id: uuid.UUID,
    ) -> Optional[AttemptEligibilityOverride]:
        stmt = select(AttemptEligibilityOverride).where(
            AttemptEligibilityOverride.id == override_id,
            AttemptEligibilityOverride.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        override = res.scalars().first()
        if override:
            override.revoked_at = utcnow()
            override.updated_at = utcnow()
            await self.db.flush()
        return override

    # ── Payment Reference ────────────────────────────────────────────────────

    async def create_payment_reference(
        self,
        purpose: PaymentPurpose,
        student_id: uuid.UUID,
        external_reference: Optional[str] = None,
        amount_text: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> PaymentReference:
        payment = PaymentReference(
            purpose=purpose,
            student_id=student_id,
            external_reference=external_reference,
            amount_text=amount_text,
            status=PaymentStatus.PENDING,
            notes=notes,
        )
        self.db.add(payment)
        await self.db.flush()
        return payment

    async def get_payment_reference(
        self, payment_id: uuid.UUID
    ) -> Optional[PaymentReference]:
        stmt = (
            select(PaymentReference)
            .where(
                PaymentReference.id == payment_id,
                PaymentReference.is_deleted == False,
            )
            .options(
                selectinload(PaymentReference.student),
                selectinload(PaymentReference.confirmed_by),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def confirm_payment(
        self,
        payment_id: uuid.UUID,
        status: PaymentStatus,
        confirmed_by_id: uuid.UUID,
        notes: Optional[str] = None,
    ) -> Optional[PaymentReference]:
        payment = await self.get_payment_reference(payment_id)
        if not payment:
            return None
        payment.status = status
        payment.confirmed_by_id = confirmed_by_id
        payment.confirmed_at = utcnow()
        if notes:
            payment.notes = f"{payment.notes}\n{notes}".strip() if payment.notes else notes
        payment.updated_at = utcnow()
        await self.db.flush()
        return payment

    # ── Retake Record ────────────────────────────────────────────────────────

    async def create_retake_record(
        self,
        student_id: uuid.UUID,
        course_id: uuid.UUID,
        from_period_id: uuid.UUID,
        trigger: RetakeTrigger,
        decided_decision_id: Optional[uuid.UUID] = None,
    ) -> RetakeRecord:
        """Idempotently create or retrieve retake record."""
        stmt = select(RetakeRecord).where(
            RetakeRecord.student_id == student_id,
            RetakeRecord.course_id == course_id,
            RetakeRecord.from_period_id == from_period_id,
            RetakeRecord.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        existing = res.scalars().first()
        if existing:
            return existing

        retake = RetakeRecord(
            student_id=student_id,
            course_id=course_id,
            from_period_id=from_period_id,
            trigger=trigger,
            status=RetakeStatus.FLAGGED,
            decided_decision_id=decided_decision_id,
        )
        self.db.add(retake)
        await self.db.flush()
        return retake

    async def get_retake_record(
        self, retake_id: uuid.UUID
    ) -> Optional[RetakeRecord]:
        stmt = (
            select(RetakeRecord)
            .where(
                RetakeRecord.id == retake_id,
                RetakeRecord.is_deleted == False,
            )
            .options(
                selectinload(RetakeRecord.student),
                selectinload(RetakeRecord.course),
                selectinload(RetakeRecord.from_period),
                selectinload(RetakeRecord.target_period),
                selectinload(RetakeRecord.payment_reference),
                selectinload(RetakeRecord.decided_decision),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def list_retakes_for_student(
        self, student_id: uuid.UUID
    ) -> Sequence[RetakeRecord]:
        stmt = (
            select(RetakeRecord)
            .where(
                RetakeRecord.student_id == student_id,
                RetakeRecord.is_deleted == False,
            )
            .options(
                selectinload(RetakeRecord.course),
                selectinload(RetakeRecord.from_period),
                selectinload(RetakeRecord.target_period),
                selectinload(RetakeRecord.payment_reference),
            )
            .order_by(RetakeRecord.created_at.desc())
        )
        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def attach_payment_to_retake(
        self,
        retake_id: uuid.UUID,
        payment_reference_id: uuid.UUID,
    ) -> Optional[RetakeRecord]:
        retake = await self.get_retake_record(retake_id)
        if not retake:
            return None
        retake.payment_reference_id = payment_reference_id
        retake.status = RetakeStatus.PAYMENT_PENDING
        retake.updated_at = utcnow()
        await self.db.flush()
        return retake

    async def update_retake_status(
        self,
        retake_id: uuid.UUID,
        status: RetakeStatus,
    ) -> Optional[RetakeRecord]:
        retake = await self.get_retake_record(retake_id)
        if not retake:
            return None
        retake.status = status
        retake.updated_at = utcnow()
        await self.db.flush()
        return retake

    async def finalize_retake_enrollment(
        self,
        retake_id: uuid.UUID,
        target_period_id: Optional[uuid.UUID] = None,
        target_course_id: Optional[uuid.UUID] = None,
    ) -> Optional[RetakeRecord]:
        retake = await self.get_retake_record(retake_id)
        if not retake:
            return None
        retake.status = RetakeStatus.ENROLLED
        if target_period_id:
            retake.target_period_id = target_period_id
        if target_course_id:
            retake.target_course_id = target_course_id
        retake.enrolled_at = utcnow()
        retake.updated_at = utcnow()
        await self.db.flush()
        return retake
