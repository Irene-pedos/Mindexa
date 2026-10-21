"""
app/db/repositories/appeal_repo.py

Repository for Phase 6B: Individual Appeals and Absence Excuses.
All DB queries live here; services import this class and never touch AsyncSession directly.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.base import utcnow
from app.db.enums import AbsenceExcuseStatus, IndividualAppealStatus
from app.db.models.academic import TeachingAssignment
from app.db.models.appeals import (
    AbsenceExcusePolicy,
    AbsenceExcuseRequest,
    Appeal,
    AppealPolicy,
)
from app.db.models.marking import GradingDelegation


class AppealRepository:
    """Data access for Appeal, AppealPolicy, AbsenceExcuseRequest, and AbsenceExcusePolicy."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Appeal Policy ─────────────────────────────────────────────────────────

    async def get_appeal_policy(self, institution_id: uuid.UUID) -> AppealPolicy | None:
        stmt = select(AppealPolicy).where(
            AppealPolicy.institution_id == institution_id,
            AppealPolicy.is_deleted == False,  # noqa: E712
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def upsert_appeal_policy(
        self, institution_id: uuid.UUID, **fields: Any
    ) -> AppealPolicy:
        policy = await self.get_appeal_policy(institution_id)
        if not policy:
            policy = AppealPolicy(institution_id=institution_id, **fields)
            self.db.add(policy)
        else:
            for k, v in fields.items():
                if hasattr(policy, k):
                    setattr(policy, k, v)
            policy.updated_at = utcnow()
        await self.db.flush()
        await self.db.refresh(policy)
        return policy

    # ── Appeal CRUD ───────────────────────────────────────────────────────────

    async def create_appeal(
        self,
        student_id: uuid.UUID,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        course_id: uuid.UUID,
        reason: str,
        original_total: float,
        items: dict | None = None,
    ) -> Appeal:
        appeal = Appeal(
            student_id=student_id,
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            course_id=course_id,
            reason=reason,
            original_total=original_total,
            items=items,
            status=IndividualAppealStatus.SUBMITTED,
            submitted_at=utcnow(),
        )
        self.db.add(appeal)
        await self.db.flush()
        await self.db.refresh(appeal)
        return appeal

    async def get_appeal(self, appeal_id: uuid.UUID) -> Appeal | None:
        stmt = (
            select(Appeal)
            .where(Appeal.id == appeal_id, Appeal.is_deleted == False)  # noqa: E712
            .options(
                selectinload(Appeal.student),
                selectinload(Appeal.reviewer),
                selectinload(Appeal.assigned_by),
                selectinload(Appeal.assessment),
                selectinload(Appeal.course),
                selectinload(Appeal.payment_reference),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def get_open_appeal_for_attempt(
        self, student_id: uuid.UUID, attempt_id: uuid.UUID
    ) -> Appeal | None:
        """Return any open (non-terminal) appeal for this student and attempt."""
        terminal = {
            IndividualAppealStatus.CLOSED,
            IndividualAppealStatus.REJECTED_INVALID,
            IndividualAppealStatus.WITHDRAWN,
        }
        stmt = select(Appeal).where(
            Appeal.student_id == student_id,
            Appeal.attempt_id == attempt_id,
            Appeal.status.not_in(list(terminal)),
            Appeal.is_deleted == False,  # noqa: E712
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def list_appeals_for_student(
        self,
        student_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Appeal]:
        stmt = (
            select(Appeal)
            .where(Appeal.student_id == student_id, Appeal.is_deleted == False)  # noqa: E712
            .options(
                selectinload(Appeal.assessment),
                selectinload(Appeal.course),
            )
            .order_by(Appeal.submitted_at.desc())
            .limit(limit)
            .offset(offset)
        )
        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def list_appeals_for_hod(
        self,
        institution_id: uuid.UUID,
        department_id: uuid.UUID | None = None,
        status: IndividualAppealStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Appeal]:
        from app.db.models.academic import Course

        stmt = (
            select(Appeal)
            .join(Appeal.course)
            .where(
                Course.institution_id == institution_id,
                Appeal.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(Appeal.student),
                selectinload(Appeal.reviewer),
                selectinload(Appeal.assessment),
                selectinload(Appeal.course),
            )
            .order_by(Appeal.submitted_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if department_id:
            stmt = stmt.where(Course.department_id == department_id)
        if status:
            stmt = stmt.where(Appeal.status == status)
        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def list_reviews_for_lecturer(
        self,
        reviewer_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Appeal]:
        stmt = (
            select(Appeal)
            .where(
                Appeal.reviewer_id == reviewer_id,
                Appeal.status.in_([
                    IndividualAppealStatus.ASSIGNED,
                    IndividualAppealStatus.UNDER_REVIEW,
                ]),
                Appeal.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(Appeal.student),
                selectinload(Appeal.assessment),
                selectinload(Appeal.course),
            )
            .order_by(Appeal.assigned_at.asc())
            .limit(limit)
            .offset(offset)
        )
        res = await self.db.execute(stmt)
        return res.scalars().all()

    # ── Appeal State Transitions ──────────────────────────────────────────────

    async def attach_payment(
        self,
        appeal: Appeal,
        payment_reference_id: uuid.UUID,
    ) -> Appeal:
        appeal.payment_reference_id = payment_reference_id
        appeal.status = IndividualAppealStatus.PAYMENT_PENDING
        appeal.updated_at = utcnow()
        await self.db.flush()
        return appeal

    async def mark_payment_confirmed(self, appeal: Appeal) -> Appeal:
        appeal.status = IndividualAppealStatus.PAID
        appeal.updated_at = utcnow()
        await self.db.flush()
        return appeal

    async def assign_reviewer(
        self,
        appeal: Appeal,
        reviewer_id: uuid.UUID,
        assigned_by_id: uuid.UUID,
        justification: str | None = None,
    ) -> Appeal:
        appeal.reviewer_id = reviewer_id
        appeal.assigned_by_id = assigned_by_id
        appeal.assignment_justification = justification
        appeal.status = IndividualAppealStatus.ASSIGNED
        appeal.assigned_at = utcnow()
        appeal.updated_at = utcnow()
        await self.db.flush()
        return appeal

    async def submit_review(
        self,
        appeal: Appeal,
        reviewer_total: float,
        decision_note: str | None = None,
    ) -> Appeal:
        appeal.reviewer_total = reviewer_total
        appeal.decision_note = decision_note
        appeal.status = IndividualAppealStatus.UNDER_REVIEW
        appeal.updated_at = utcnow()
        await self.db.flush()
        return appeal

    async def close_appeal(
        self,
        appeal: Appeal,
        final_total: float,
        outcome: Any,
    ) -> Appeal:

        appeal.final_total = final_total
        appeal.outcome = outcome
        appeal.status = IndividualAppealStatus.DECIDED
        appeal.decided_at = utcnow()
        appeal.updated_at = utcnow()
        await self.db.flush()
        return appeal

    async def mark_closed(self, appeal: Appeal) -> Appeal:
        appeal.status = IndividualAppealStatus.CLOSED
        appeal.closed_at = utcnow()
        appeal.updated_at = utcnow()
        await self.db.flush()
        return appeal

    async def withdraw_appeal(self, appeal: Appeal) -> Appeal:
        appeal.status = IndividualAppealStatus.WITHDRAWN
        appeal.updated_at = utcnow()
        await self.db.flush()
        return appeal

    async def reject_invalid(self, appeal: Appeal) -> Appeal:
        appeal.status = IndividualAppealStatus.REJECTED_INVALID
        appeal.updated_at = utcnow()
        await self.db.flush()
        return appeal

    # ── Eligible Reviewer Pool ────────────────────────────────────────────────

    async def get_original_marker_ids(self, attempt_id: uuid.UUID) -> list[uuid.UUID]:
        """
        Collect all user IDs who touched the grading of this attempt:
        direct grader + any delegation delegates for this assessment.
        """
        from app.db.models.attempt import AssessmentAttempt, SubmissionGrade

        stmt = select(AssessmentAttempt).where(
            AssessmentAttempt.id == attempt_id,
            AssessmentAttempt.is_deleted == False,  # noqa: E712
        )
        res = await self.db.execute(stmt)
        attempt = res.scalars().first()

        marker_ids: list[uuid.UUID] = []
        if attempt:
            # Graders from submission grades
            grade_stmt = select(SubmissionGrade.graded_by_id).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.graded_by_id.isnot(None),
                SubmissionGrade.is_deleted == False,  # noqa: E712
            )
            grade_res = await self.db.execute(grade_stmt)
            for gid in grade_res.scalars().all():
                if gid:
                    marker_ids.append(gid)

            if getattr(attempt, "graded_by_id", None):
                marker_ids.append(attempt.graded_by_id)

            # Also collect any delegation delegates for the same assessment
            del_stmt = select(GradingDelegation.delegate_id).where(
                GradingDelegation.assessment_id == attempt.assessment_id,
                GradingDelegation.is_deleted == False,  # noqa: E712
            )
            del_res = await self.db.execute(del_stmt)
            marker_ids.extend(del_res.scalars().all())

        return list(set(marker_ids))

    async def get_eligible_reviewers(
        self,
        course_id: uuid.UUID,
        department_id: uuid.UUID,
        excluded_ids: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        """
        Phase 1 pool: lecturers with a TeachingAssignment on this course, minus excluded IDs.
        Returns lecturer user IDs.
        """
        stmt = select(TeachingAssignment.lecturer_id).where(
            TeachingAssignment.course_id == course_id,
            TeachingAssignment.is_deleted == False,  # noqa: E712
        )
        if excluded_ids:
            stmt = stmt.where(TeachingAssignment.lecturer_id.not_in(excluded_ids))
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def get_fallback_reviewers(
        self,
        department_id: uuid.UUID,
        excluded_ids: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        """
        Phase 2 (A-09 fallback): any lecturer with a TeachingAssignment in the department.
        Requires mandatory assignment_justification from caller.
        """
        stmt = select(TeachingAssignment.lecturer_id).where(
            TeachingAssignment.department_id == department_id,
            TeachingAssignment.is_deleted == False,  # noqa: E712
        )
        if excluded_ids:
            stmt = stmt.where(TeachingAssignment.lecturer_id.not_in(excluded_ids))
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    # ── Absence Excuse Policy ─────────────────────────────────────────────────

    async def get_excuse_policy(self, institution_id: uuid.UUID) -> AbsenceExcusePolicy | None:
        stmt = select(AbsenceExcusePolicy).where(
            AbsenceExcusePolicy.institution_id == institution_id,
            AbsenceExcusePolicy.is_deleted == False,  # noqa: E712
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def upsert_excuse_policy(
        self, institution_id: uuid.UUID, **fields: Any
    ) -> AbsenceExcusePolicy:
        policy = await self.get_excuse_policy(institution_id)
        if not policy:
            policy = AbsenceExcusePolicy(institution_id=institution_id, **fields)
            self.db.add(policy)
        else:
            for k, v in fields.items():
                if hasattr(policy, k):
                    setattr(policy, k, v)
            policy.updated_at = utcnow()
        await self.db.flush()
        await self.db.refresh(policy)
        return policy

    # ── Absence Excuse Request ────────────────────────────────────────────────

    async def create_excuse(
        self,
        student_id: uuid.UUID,
        assessment_id: uuid.UUID,
        course_id: uuid.UUID,
        reason: str,
        evidence_file_ids: list[str],
    ) -> AbsenceExcuseRequest:
        excuse = AbsenceExcuseRequest(
            student_id=student_id,
            assessment_id=assessment_id,
            course_id=course_id,
            reason=reason,
            evidence_file_ids=evidence_file_ids,
            status=AbsenceExcuseStatus.SUBMITTED,
        )
        self.db.add(excuse)
        await self.db.flush()
        await self.db.refresh(excuse)
        return excuse

    async def get_excuse(self, excuse_id: uuid.UUID) -> AbsenceExcuseRequest | None:
        stmt = (
            select(AbsenceExcuseRequest)
            .where(
                AbsenceExcuseRequest.id == excuse_id,
                AbsenceExcuseRequest.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(AbsenceExcuseRequest.student),
                selectinload(AbsenceExcuseRequest.assessment),
                selectinload(AbsenceExcuseRequest.course),
                selectinload(AbsenceExcuseRequest.decided_by),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def get_open_excuse_for_student_assessment(
        self, student_id: uuid.UUID, assessment_id: uuid.UUID
    ) -> AbsenceExcuseRequest | None:
        stmt = select(AbsenceExcuseRequest).where(
            AbsenceExcuseRequest.student_id == student_id,
            AbsenceExcuseRequest.assessment_id == assessment_id,
            AbsenceExcuseRequest.status.in_([
                AbsenceExcuseStatus.SUBMITTED,
            ]),
            AbsenceExcuseRequest.is_deleted == False,  # noqa: E712
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def decide_excuse(
        self,
        excuse: AbsenceExcuseRequest,
        status: AbsenceExcuseStatus,
        decided_by_id: uuid.UUID,
        decision_note: str | None,
        granted_window_start: Any = None,
        granted_window_end: Any = None,
    ) -> AbsenceExcuseRequest:
        excuse.status = status
        excuse.decided_by_id = decided_by_id
        excuse.decided_at = utcnow()
        excuse.decision_note = decision_note
        if granted_window_start is not None:
            excuse.granted_window_start = granted_window_start
        if granted_window_end is not None:
            excuse.granted_window_end = granted_window_end
        excuse.updated_at = utcnow()
        await self.db.flush()
        return excuse

    async def withdraw_excuse(self, excuse: AbsenceExcuseRequest) -> AbsenceExcuseRequest:
        excuse.status = AbsenceExcuseStatus.WITHDRAWN
        excuse.updated_at = utcnow()
        await self.db.flush()
        return excuse

    async def list_excuses_for_student(
        self,
        student_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[AbsenceExcuseRequest]:
        stmt = (
            select(AbsenceExcuseRequest)
            .where(
                AbsenceExcuseRequest.student_id == student_id,
                AbsenceExcuseRequest.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(AbsenceExcuseRequest.assessment),
                selectinload(AbsenceExcuseRequest.course),
            )
            .order_by(AbsenceExcuseRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def list_excuses_for_course(
        self,
        course_id: uuid.UUID,
        status: AbsenceExcuseStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[AbsenceExcuseRequest]:
        stmt = (
            select(AbsenceExcuseRequest)
            .where(
                AbsenceExcuseRequest.course_id == course_id,
                AbsenceExcuseRequest.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(AbsenceExcuseRequest.student),
                selectinload(AbsenceExcuseRequest.assessment),
            )
            .order_by(AbsenceExcuseRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if status:
            stmt = stmt.where(AbsenceExcuseRequest.status == status)
        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def list_excuses_for_institution(
        self,
        institution_id: uuid.UUID,
        department_id: uuid.UUID | None = None,
        status: AbsenceExcuseStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[AbsenceExcuseRequest]:
        from app.db.models.academic import Course

        stmt = (
            select(AbsenceExcuseRequest)
            .join(AbsenceExcuseRequest.course)
            .where(
                Course.institution_id == institution_id,
                AbsenceExcuseRequest.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(AbsenceExcuseRequest.student),
                selectinload(AbsenceExcuseRequest.assessment),
                selectinload(AbsenceExcuseRequest.course),
            )
            .order_by(AbsenceExcuseRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if department_id:
            stmt = stmt.where(Course.department_id == department_id)
        if status:
            stmt = stmt.where(AbsenceExcuseRequest.status == status)
        res = await self.db.execute(stmt)
        return res.scalars().all()
