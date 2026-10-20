"""
app/db/repositories/marking_repo.py

Repository layer for Phase 5: marking schemes, question mark steps,
material key points, question key points, sample checks, and grading delegations.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import List, Optional, Sequence

import sqlalchemy as sa
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.enums import (
    AIGradeDecision,
    DelegationStatus,
    KeyPointImportance,
    SampleCheckStatus,
    StepKind,
)
from app.db.models.ai import AIGradeReview
from app.db.models.attempt import SubmissionGrade
from app.db.models.marking import (
    AIGradeSampleCheck,
    GradingDelegation,
    MarkingScheme,
    MaterialKeyPoint,
    QuestionKeyPoint,
    QuestionMarkStep,
)
from app.db.models.question import Question


class MarkingRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Marking Schemes ──────────────────────────────────────────────────────

    async def get_marking_scheme_by_question(
        self, question_id: uuid.UUID
    ) -> Optional[MarkingScheme]:
        stmt = (
            select(MarkingScheme)
            .where(
                MarkingScheme.question_id == question_id,
                MarkingScheme.is_deleted == False,
            )
            .options(selectinload(MarkingScheme.rubric))
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def create_or_update_marking_scheme(
        self,
        *,
        question_id: uuid.UUID,
        model_answer: str,
        created_by_id: uuid.UUID,
        allow_partial_credit: bool = True,
        notes: Optional[str] = None,
        rubric_id: Optional[uuid.UUID] = None,
    ) -> MarkingScheme:
        existing = await self.get_marking_scheme_by_question(question_id)
        now = datetime.now(UTC)
        if existing:
            existing.model_answer = model_answer
            existing.allow_partial_credit = allow_partial_credit
            existing.notes = notes
            existing.rubric_id = rubric_id
            existing.updated_at = now
            self.db.add(existing)
            await self.db.flush()
            return existing

        scheme = MarkingScheme(
            id=uuid.uuid4(),
            question_id=question_id,
            model_answer=model_answer,
            allow_partial_credit=allow_partial_credit,
            notes=notes,
            rubric_id=rubric_id,
            created_by_id=created_by_id,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        self.db.add(scheme)
        await self.db.flush()
        return scheme

    async def delete_marking_scheme(self, question_id: uuid.UUID) -> bool:
        stmt = (
            update(MarkingScheme)
            .where(MarkingScheme.question_id == question_id)
            .values(is_deleted=True, updated_at=datetime.now(UTC))
        )
        res = await self.db.execute(stmt)
        await self.db.flush()
        return res.rowcount > 0

    # ── Question Mark Steps (Method Marks) ───────────────────────────────────

    async def list_steps_by_question(
        self, question_id: uuid.UUID
    ) -> List[QuestionMarkStep]:
        stmt = (
            select(QuestionMarkStep)
            .where(
                QuestionMarkStep.question_id == question_id,
                QuestionMarkStep.is_deleted == False,
            )
            .order_by(QuestionMarkStep.step_no.asc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def get_step(self, step_id: uuid.UUID) -> Optional[QuestionMarkStep]:
        stmt = select(QuestionMarkStep).where(
            QuestionMarkStep.id == step_id,
            QuestionMarkStep.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def create_step(
        self,
        *,
        question_id: uuid.UUID,
        step_no: int,
        description: str,
        marks: float,
        kind: StepKind = StepKind.METHOD,
    ) -> QuestionMarkStep:
        now = datetime.now(UTC)
        step = QuestionMarkStep(
            id=uuid.uuid4(),
            question_id=question_id,
            step_no=step_no,
            description=description,
            marks=marks,
            kind=kind,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        self.db.add(step)
        await self.db.flush()
        return step

    async def batch_replace_steps(
        self,
        question_id: uuid.UUID,
        steps_data: List[dict],
    ) -> List[QuestionMarkStep]:
        # Delete existing steps
        await self.db.execute(
            delete(QuestionMarkStep).where(QuestionMarkStep.question_id == question_id)
        )
        now = datetime.now(UTC)
        created_steps = []
        for d in steps_data:
            step = QuestionMarkStep(
                id=uuid.uuid4(),
                question_id=question_id,
                step_no=d["step_no"],
                description=d["description"],
                marks=d["marks"],
                kind=d.get("kind", StepKind.METHOD),
                is_deleted=False,
                created_at=now,
                updated_at=now,
            )
            self.db.add(step)
            created_steps.append(step)
        await self.db.flush()
        return created_steps

    async def delete_step(self, step_id: uuid.UUID) -> bool:
        stmt = delete(QuestionMarkStep).where(QuestionMarkStep.id == step_id)
        res = await self.db.execute(stmt)
        await self.db.flush()
        return res.rowcount > 0

    # ── Material Key Points & Question Key Points ────────────────────────────

    async def list_key_points_by_material(
        self, material_id: uuid.UUID
    ) -> List[MaterialKeyPoint]:
        stmt = (
            select(MaterialKeyPoint)
            .where(
                MaterialKeyPoint.lecturer_material_id == material_id,
                MaterialKeyPoint.is_deleted == False,
            )
            .order_by(MaterialKeyPoint.created_at.asc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def get_key_point(
        self, key_point_id: uuid.UUID
    ) -> Optional[MaterialKeyPoint]:
        stmt = select(MaterialKeyPoint).where(
            MaterialKeyPoint.id == key_point_id,
            MaterialKeyPoint.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def create_key_point(
        self,
        *,
        material_id: uuid.UUID,
        text: str,
        created_by_id: uuid.UUID,
        importance: KeyPointImportance = KeyPointImportance.CORE,
        chunk_id: Optional[uuid.UUID] = None,
        page_number: Optional[int] = None,
    ) -> MaterialKeyPoint:
        now = datetime.now(UTC)
        kp = MaterialKeyPoint(
            id=uuid.uuid4(),
            lecturer_material_id=material_id,
            chunk_id=chunk_id,
            page_number=page_number,
            text=text,
            importance=importance,
            created_by_id=created_by_id,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        self.db.add(kp)
        await self.db.flush()
        return kp

    async def delete_key_point(self, key_point_id: uuid.UUID) -> bool:
        stmt = (
            update(MaterialKeyPoint)
            .where(MaterialKeyPoint.id == key_point_id)
            .values(is_deleted=True, updated_at=datetime.now(UTC))
        )
        res = await self.db.execute(stmt)
        await self.db.flush()
        return res.rowcount > 0

    async def list_key_points_for_question(
        self, question_id: uuid.UUID
    ) -> List[MaterialKeyPoint]:
        stmt = (
            select(MaterialKeyPoint)
            .join(QuestionKeyPoint, QuestionKeyPoint.key_point_id == MaterialKeyPoint.id)
            .where(
                QuestionKeyPoint.question_id == question_id,
                MaterialKeyPoint.is_deleted == False,
            )
            .order_by(MaterialKeyPoint.created_at.asc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def attach_key_points_to_question(
        self, question_id: uuid.UUID, key_point_ids: Sequence[uuid.UUID]
    ) -> List[MaterialKeyPoint]:
        now = datetime.now(UTC)
        for kp_id in key_point_ids:
            # Check existing to prevent unique constraint violation
            stmt = select(QuestionKeyPoint).where(
                QuestionKeyPoint.question_id == question_id,
                QuestionKeyPoint.key_point_id == kp_id,
            )
            existing = (await self.db.execute(stmt)).scalar_one_or_none()
            if not existing:
                link = QuestionKeyPoint(
                    id=uuid.uuid4(),
                    question_id=question_id,
                    key_point_id=kp_id,
                    created_at=now,
                )
                self.db.add(link)
        await self.db.flush()
        return await self.list_key_points_for_question(question_id)

    async def detach_key_point_from_question(
        self, question_id: uuid.UUID, key_point_id: uuid.UUID
    ) -> bool:
        stmt = delete(QuestionKeyPoint).where(
            QuestionKeyPoint.question_id == question_id,
            QuestionKeyPoint.key_point_id == key_point_id,
        )
        res = await self.db.execute(stmt)
        await self.db.flush()
        return res.rowcount > 0

    # ── AI Grade Sample Check ────────────────────────────────────────────────

    async def get_sample_check(
        self, sample_check_id: uuid.UUID
    ) -> Optional[AIGradeSampleCheck]:
        stmt = select(AIGradeSampleCheck).where(AIGradeSampleCheck.id == sample_check_id)
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_latest_sample_check_for_assessment(
        self, assessment_id: uuid.UUID
    ) -> Optional[AIGradeSampleCheck]:
        stmt = (
            select(AIGradeSampleCheck)
            .where(AIGradeSampleCheck.assessment_id == assessment_id)
            .order_by(AIGradeSampleCheck.created_at.desc())
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def create_sample_check(
        self,
        *,
        assessment_id: uuid.UUID,
        lecturer_id: uuid.UUID,
        sample_size: int,
        sampled_review_ids: List[str],
    ) -> AIGradeSampleCheck:
        now = datetime.now(UTC)
        check = AIGradeSampleCheck(
            id=uuid.uuid4(),
            assessment_id=assessment_id,
            lecturer_id=lecturer_id,
            sample_size=sample_size,
            sampled_review_ids=sampled_review_ids,
            checked_count=0,
            agreement_rate=0.0,
            status=SampleCheckStatus.PENDING,
            created_at=now,
            updated_at=now,
        )
        self.db.add(check)
        await self.db.flush()
        return check

    async def update_sample_check(
        self,
        sample_check_id: uuid.UUID,
        *,
        checked_count: int,
        agreement_rate: float,
        status: SampleCheckStatus,
    ) -> Optional[AIGradeSampleCheck]:
        check = await self.get_sample_check(sample_check_id)
        if not check:
            return None
        check.checked_count = checked_count
        check.agreement_rate = agreement_rate
        check.status = status
        check.updated_at = datetime.now(UTC)
        self.db.add(check)
        await self.db.flush()
        return check

    async def list_pending_ai_reviews_for_assessment(
        self, assessment_id: uuid.UUID
    ) -> List[AIGradeReview]:
        stmt = (
            select(AIGradeReview)
            .where(
                AIGradeReview.assessment_id == assessment_id,
                AIGradeReview.grading_decision == AIGradeDecision.PENDING,
            )
            .order_by(AIGradeReview.created_at.asc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    # ── Grading Delegations ──────────────────────────────────────────────────

    async def get_delegation(
        self, delegation_id: uuid.UUID
    ) -> Optional[GradingDelegation]:
        stmt = select(GradingDelegation).where(GradingDelegation.id == delegation_id)
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def list_delegations_for_assessment(
        self, assessment_id: uuid.UUID
    ) -> List[GradingDelegation]:
        stmt = (
            select(GradingDelegation)
            .where(GradingDelegation.assessment_id == assessment_id)
            .order_by(GradingDelegation.created_at.desc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def create_delegation(
        self,
        *,
        assessment_id: uuid.UUID,
        delegator_id: uuid.UUID,
        delegate_id: uuid.UUID,
        scope: str,
        reason: str,
        valid_from: datetime,
        valid_to: datetime,
        target_section_id: Optional[uuid.UUID] = None,
        target_student_ids: Optional[List[str]] = None,
    ) -> GradingDelegation:
        now = datetime.now(UTC)
        delegation = GradingDelegation(
            id=uuid.uuid4(),
            assessment_id=assessment_id,
            delegator_id=delegator_id,
            delegate_id=delegate_id,
            scope=scope,
            target_section_id=target_section_id,
            target_student_ids=target_student_ids,
            reason=reason,
            valid_from=valid_from,
            valid_to=valid_to,
            status=DelegationStatus.ACTIVE,
            created_at=now,
            updated_at=now,
        )
        self.db.add(delegation)
        await self.db.flush()
        return delegation

    async def revoke_delegation(self, delegation_id: uuid.UUID) -> Optional[GradingDelegation]:
        delegation = await self.get_delegation(delegation_id)
        if not delegation:
            return None
        delegation.status = DelegationStatus.REVOKED
        delegation.updated_at = datetime.now(UTC)
        self.db.add(delegation)
        await self.db.flush()
        return delegation

    async def find_active_delegation(
        self, assessment_id: uuid.UUID, delegate_id: uuid.UUID, at_time: datetime
    ) -> Optional[GradingDelegation]:
        stmt = (
            select(GradingDelegation)
            .where(
                GradingDelegation.assessment_id == assessment_id,
                GradingDelegation.delegate_id == delegate_id,
                GradingDelegation.status == DelegationStatus.ACTIVE,
                GradingDelegation.valid_from <= at_time,
                GradingDelegation.valid_to >= at_time,
            )
            .order_by(GradingDelegation.created_at.desc())
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()
