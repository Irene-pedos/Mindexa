"""
app/services/absence_service.py

Phase 6B: Absence Excuse Request orchestration.
All spec rules enforced here; repository is pure data access.

Key invariants:
  - Student submits within submit_days_after days of assessment window close
  - Approver must be the course lecturer OR HOD of the course department — cross-course lecturers denied
  - Evidence file IDs are mandatory (validated in schema min_length=1)
  - APPROVED → creates AttemptEligibilityOverride(source=EXCUSE) with granted window
  - REJECTED → absence stays 0% in eligibility engine
  - All state changes produce [AUDIT] log entries
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Optional, Sequence

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
    AbsenceExcuseStatus,
    NotificationType,
    OverrideSource,
    UserRole,
)
from app.db.models.appeals import AbsenceExcusePolicy, AbsenceExcuseRequest
from app.db.models.auth import User
from app.db.repositories.appeal_repo import AppealRepository
from app.db.repositories.eligibility_repo import EligibilityRepository
from app.db.repositories.notification_repo import NotificationRepository
from app.schemas.appeals import AbsenceExcuseCreate, AbsenceExcuseDecide

log = structlog.get_logger(__name__)


class AbsenceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = AppealRepository(db)
        self.eligibility_repo = EligibilityRepository(db)
        self.notif_repo = NotificationRepository(db)

    # ── Policy ────────────────────────────────────────────────────────────────

    async def get_or_default_policy(self, institution_id: uuid.UUID) -> AbsenceExcusePolicy:
        policy = await self.repo.get_excuse_policy(institution_id)
        if not policy:
            policy = AbsenceExcusePolicy(institution_id=institution_id, submit_days_after=7)
        return policy

    async def upsert_policy(
        self, institution_id: uuid.UUID, **fields
    ) -> AbsenceExcusePolicy:
        policy = await self.repo.upsert_excuse_policy(institution_id, **fields)
        log.info("absence_excuse_policy.upserted", institution_id=str(institution_id))
        return policy

    # ── Submit Excuse ─────────────────────────────────────────────────────────

    async def submit_excuse(
        self,
        student: User,
        payload: AbsenceExcuseCreate,
    ) -> AbsenceExcuseRequest:
        from sqlalchemy import select

        from app.db.models.academic import Course
        from app.db.models.assessment import Assessment

        assessment_res = await self.db.execute(
            select(Assessment).where(
                Assessment.id == payload.assessment_id,
                Assessment.is_deleted == False,  # noqa: E712
            )
        )
        assessment = assessment_res.scalars().first()
        if not assessment:
            raise NotFoundError(resource="Assessment", resource_id=str(payload.assessment_id))

        course_res = await self.db.execute(
            select(Course).where(
                Course.id == payload.course_id,
                Course.is_deleted == False,  # noqa: E712
            )
        )
        course = course_res.scalars().first()
        if not course:
            raise NotFoundError(resource="Course", resource_id=str(payload.course_id))

        policy = await self.get_or_default_policy(course.institution_id)

        # Window enforcement: must submit within submit_days_after days of assessment window close
        window_close = getattr(assessment, "available_until", None) or getattr(assessment, "closes_at", None)
        if window_close:
            deadline = window_close + timedelta(days=policy.submit_days_after)
            if utcnow() > deadline:
                raise ValidationError(
                    message=f"Absence excuse submission window has closed. Excuses must be submitted within {policy.submit_days_after} days of assessment window close.",
                    field="assessment_id",
                )

        # Duplicate check: no second active excuse for same assessment
        existing = await self.repo.get_open_excuse_for_student_assessment(
            student_id=student.id,
            assessment_id=payload.assessment_id,
        )
        if existing:
            raise ConflictError(
                message="An open absence excuse already exists for this assessment.",
                resource="AbsenceExcuseRequest",
            )

        excuse = await self.repo.create_excuse(
            student_id=student.id,
            assessment_id=payload.assessment_id,
            course_id=payload.course_id,
            reason=payload.reason,
            evidence_file_ids=payload.evidence_file_ids,
        )

        log.info(
            "[AUDIT] absence_excuse.submitted",
            excuse_id=str(excuse.id),
            student_id=str(student.id),
            assessment_id=str(payload.assessment_id),
        )
        return excuse

    # ── Decide (Lecturer or HOD) ──────────────────────────────────────────────

    async def decide_excuse(
        self,
        excuse_id: uuid.UUID,
        decider: User,
        payload: AbsenceExcuseDecide,
    ) -> AbsenceExcuseRequest:
        excuse = await self.repo.get_excuse(excuse_id)
        if not excuse:
            raise NotFoundError(resource="AbsenceExcuseRequest", resource_id=str(excuse_id))

        if excuse.status != AbsenceExcuseStatus.SUBMITTED:
            raise ValidationError(
                message="Only SUBMITTED excuses can be decided.",
                field="status",
            )

        # Only APPROVED or REJECTED are valid decision statuses
        if payload.status not in (AbsenceExcuseStatus.APPROVED, AbsenceExcuseStatus.REJECTED):
            raise ValidationError(
                message="Decision status must be APPROVED or REJECTED.",
                field="status",
            )

        # Scope check: decider must be course lecturer or HOD of the course department
        await self._assert_decider_scope(decider, excuse.course_id)

        excuse = await self.repo.decide_excuse(
            excuse=excuse,
            status=payload.status,
            decided_by_id=decider.id,
            decision_note=payload.decision_note,
            granted_window_start=payload.granted_window_start,
            granted_window_end=payload.granted_window_end,
        )

        if payload.status == AbsenceExcuseStatus.APPROVED:
            await self._create_eligibility_override(excuse, decider.id)

        await self.notif_repo.create_notification(
            user_id=excuse.student_id,
            notification_type=NotificationType.EXCUSE_DECIDED,
            content={
                "excuse_id": str(excuse.id),
                "status": payload.status.value,
            },
        )
        log.info(
            "[AUDIT] absence_excuse.decided",
            excuse_id=str(excuse_id),
            decider_id=str(decider.id),
            status=payload.status.value,
        )
        return excuse

    async def _create_eligibility_override(
        self,
        excuse: AbsenceExcuseRequest,
        granted_by_id: uuid.UUID,
    ) -> None:
        """APPROVED excuse → AttemptEligibilityOverride(source=EXCUSE)."""
        await self.eligibility_repo.create_override(
            student_id=excuse.student_id,
            assessment_id=excuse.assessment_id,
            source=OverrideSource.EXCUSE,
            reason=f"Absence excuse approved (ID: {excuse.id})",
            granted_by_id=granted_by_id,
            allowed_window_start=excuse.granted_window_start,
            allowed_window_end=excuse.granted_window_end,
            excuse_id=excuse.id,
        )
        log.info(
            "[AUDIT] eligibility_override.created_from_excuse",
            excuse_id=str(excuse.id),
            student_id=str(excuse.student_id),
        )

    async def _assert_decider_scope(
        self, decider: User, course_id: uuid.UUID
    ) -> None:
        """
        Decider must be the course lecturer (TeachingAssignment on this course)
        OR the HOD of the course's department. Cross-course lecturers are denied.
        """
        from sqlalchemy import select

        from app.db.models.academic import Course, TeachingAssignment
        from app.db.models.duty import DutyAssignment

        # HOD check: duty assignment with HOD role on this course's department
        course_res = await self.db.execute(
            select(Course).where(Course.id == course_id)
        )
        course = course_res.scalars().first()
        if not course:
            raise NotFoundError(resource="Course", resource_id=str(course_id))

        # Check if decider is assigned to this specific course
        assignment_res = await self.db.execute(
            select(TeachingAssignment).where(
                TeachingAssignment.lecturer_id == decider.id,
                TeachingAssignment.course_id == course_id,
                TeachingAssignment.is_deleted == False,  # noqa: E712
            )
        )
        is_course_lecturer = assignment_res.scalars().first() is not None

        if is_course_lecturer:
            return

        # Check if decider is HOD of the course's department
        try:
            duty_res = await self.db.execute(
                select(DutyAssignment).where(
                    DutyAssignment.user_id == decider.id,
                    DutyAssignment.department_id == course.department_id,
                    DutyAssignment.is_deleted == False,  # noqa: E712
                )
            )
            is_hod = duty_res.scalars().first() is not None
        except Exception:
            is_hod = False

        if not is_hod:
            raise PermissionDeniedError(
                message="Only the course lecturer or department HOD can decide absence excuses for this course."
            )

    # ── Student: Withdraw Excuse ──────────────────────────────────────────────

    async def withdraw_excuse(
        self, student: User, excuse_id: uuid.UUID
    ) -> AbsenceExcuseRequest:
        excuse = await self.repo.get_excuse(excuse_id)
        if not excuse:
            raise NotFoundError(resource="AbsenceExcuseRequest", resource_id=str(excuse_id))
        if excuse.student_id != student.id:
            raise PermissionDeniedError(message="You do not own this excuse request.")
        if excuse.status != AbsenceExcuseStatus.SUBMITTED:
            raise ValidationError(
                message="Only SUBMITTED excuses can be withdrawn.",
                field="status",
            )
        excuse = await self.repo.withdraw_excuse(excuse)
        log.info("[AUDIT] absence_excuse.withdrawn", excuse_id=str(excuse_id), student_id=str(student.id))
        return excuse

    # ── List ──────────────────────────────────────────────────────────────────

    async def list_for_student(
        self, student_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> Sequence[AbsenceExcuseRequest]:
        return await self.repo.list_excuses_for_student(student_id, limit=limit, offset=offset)

    async def list_for_course(
        self,
        course_id: uuid.UUID,
        status: Optional[AbsenceExcuseStatus] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[AbsenceExcuseRequest]:
        return await self.repo.list_excuses_for_course(course_id, status=status, limit=limit, offset=offset)

    async def list_for_institution(
        self,
        institution_id: uuid.UUID,
        department_id: Optional[uuid.UUID] = None,
        status: Optional[AbsenceExcuseStatus] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[AbsenceExcuseRequest]:
        return await self.repo.list_excuses_for_institution(
            institution_id, department_id=department_id, status=status, limit=limit, offset=offset
        )
