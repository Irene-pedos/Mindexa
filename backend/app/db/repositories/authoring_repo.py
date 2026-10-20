"""
backend/app/db/repositories/authoring_repo.py

Repository for Phase 4 authoring collaborations, delegations, and version history.
Follows standard repository pattern: queries and adds/updates records; services commit.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Sequence
import uuid

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.base import utcnow
from app.db.enums import AttemptStatus, CollaboratorRole, DelegationStatus
from app.db.models.academic import Course, LecturerCourseAssignment, TeachingAssignment
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.authoring import AssessmentCollaborator, AuthorDelegation
from app.db.models.moderation import AssessmentSeal, AssessmentVersion


class AuthoringRepository:
    """Data access repository for assessment collaborators, delegations, and versions."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Collaborators ─────────────────────────────────────────────────────────

    async def get_collaborators(self, assessment_id: uuid.UUID) -> Sequence[AssessmentCollaborator]:
        """Fetch all active collaborators for an assessment."""
        stmt = (
            select(AssessmentCollaborator)
            .where(
                AssessmentCollaborator.assessment_id == assessment_id,
                AssessmentCollaborator.is_deleted == False,
                AssessmentCollaborator.is_active == True,
            )
            .options(
                selectinload(AssessmentCollaborator.lecturer),
                selectinload(AssessmentCollaborator.added_by),
            )
            .order_by(AssessmentCollaborator.added_at.asc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_collaborator(
        self,
        assessment_id: uuid.UUID,
        lecturer_id: uuid.UUID,
    ) -> Optional[AssessmentCollaborator]:
        """Fetch a specific collaborator record."""
        stmt = select(AssessmentCollaborator).where(
            AssessmentCollaborator.assessment_id == assessment_id,
            AssessmentCollaborator.lecturer_id == lecturer_id,
            AssessmentCollaborator.is_deleted == False,
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_collaborator_by_id(
        self,
        collaborator_id: uuid.UUID,
    ) -> Optional[AssessmentCollaborator]:
        """Fetch collaborator by PK."""
        stmt = (
            select(AssessmentCollaborator)
            .where(
                AssessmentCollaborator.id == collaborator_id,
                AssessmentCollaborator.is_deleted == False,
            )
            .options(
                selectinload(AssessmentCollaborator.lecturer),
                selectinload(AssessmentCollaborator.added_by),
                selectinload(AssessmentCollaborator.assessment),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def add_collaborator(
        self,
        assessment_id: uuid.UUID,
        lecturer_id: uuid.UUID,
        added_by_id: uuid.UUID,
        role: CollaboratorRole = CollaboratorRole.CO_AUTHOR,
    ) -> AssessmentCollaborator:
        """Add or reactivate an assessment collaborator."""
        existing = await self.get_collaborator(assessment_id, lecturer_id)
        if existing:
            existing.is_active = True
            existing.role = role
            existing.added_by_id = added_by_id
            existing.added_at = utcnow()
            self.db.add(existing)
            return existing

        collab = AssessmentCollaborator(
            assessment_id=assessment_id,
            lecturer_id=lecturer_id,
            added_by_id=added_by_id,
            role=role,
            is_active=True,
        )
        self.db.add(collab)
        return collab

    async def remove_collaborator(self, collaborator_id: uuid.UUID) -> Optional[AssessmentCollaborator]:
        """Soft-deactivate a collaborator."""
        collab = await self.get_collaborator_by_id(collaborator_id)
        if collab:
            collab.is_active = False
            self.db.add(collab)
        return collab

    # ── Course & Department Scope ─────────────────────────────────────────────

    async def has_course_teaching_assignment(
        self,
        course_id: uuid.UUID,
        lecturer_id: uuid.UUID,
    ) -> bool:
        """
        Verify lecturer has an official active teaching assignment for the course (R-01).
        Checks TeachingAssignment and LecturerCourseAssignment.
        """
        stmt_ta = select(TeachingAssignment.id).where(
            TeachingAssignment.course_id == course_id,
            TeachingAssignment.lecturer_id == lecturer_id,
            TeachingAssignment.is_active == True,
            TeachingAssignment.is_deleted == False,
        )
        res_ta = (await self.db.execute(stmt_ta)).first()
        if res_ta:
            return True

        stmt_lca = select(LecturerCourseAssignment.course_id).where(
            LecturerCourseAssignment.course_id == course_id,
            LecturerCourseAssignment.lecturer_id == lecturer_id,
            LecturerCourseAssignment.is_active == True,
        )
        res_lca = (await self.db.execute(stmt_lca)).first()
        return res_lca is not None

    async def is_lecturer_in_department(
        self,
        lecturer_id: uuid.UUID,
        department_id: uuid.UUID,
    ) -> bool:
        """
        Verify that a lecturer belongs to the specified department (for delegations, R-09).
        Checks TeachingAssignment with department_id.
        """
        stmt = select(TeachingAssignment.id).where(
            TeachingAssignment.lecturer_id == lecturer_id,
            TeachingAssignment.department_id == department_id,
            TeachingAssignment.is_active == True,
            TeachingAssignment.is_deleted == False,
        )
        res = (await self.db.execute(stmt)).first()
        if res:
            return True

        # Check course-level department assignment if course has department_id
        stmt_dept = (
            select(TeachingAssignment.id)
            .join(Course, Course.id == TeachingAssignment.course_id)
            .where(
                TeachingAssignment.lecturer_id == lecturer_id,
                Course.department_id == department_id,
                TeachingAssignment.is_active == True,
                TeachingAssignment.is_deleted == False,
            )
        )
        res_dept = (await self.db.execute(stmt_dept)).first()
        return res_dept is not None

    # ── Delegations ───────────────────────────────────────────────────────────

    async def get_delegations(self, assessment_id: uuid.UUID) -> Sequence[AuthorDelegation]:
        """Fetch all delegations for an assessment."""
        stmt = (
            select(AuthorDelegation)
            .where(
                AuthorDelegation.assessment_id == assessment_id,
                AuthorDelegation.is_deleted == False,
            )
            .options(
                selectinload(AuthorDelegation.delegate),
                selectinload(AuthorDelegation.delegator),
                selectinload(AuthorDelegation.created_by),
            )
            .order_by(AuthorDelegation.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_delegation_by_id(self, delegation_id: uuid.UUID) -> Optional[AuthorDelegation]:
        """Fetch delegation by PK."""
        stmt = (
            select(AuthorDelegation)
            .where(
                AuthorDelegation.id == delegation_id,
                AuthorDelegation.is_deleted == False,
            )
            .options(
                selectinload(AuthorDelegation.delegate),
                selectinload(AuthorDelegation.delegator),
                selectinload(AuthorDelegation.created_by),
                selectinload(AuthorDelegation.assessment),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create_delegation(
        self,
        assessment_id: uuid.UUID,
        delegator_id: uuid.UUID,
        delegate_id: uuid.UUID,
        created_by_id: uuid.UUID,
        reason: str,
        valid_from: datetime,
        valid_to: datetime,
    ) -> AuthorDelegation:
        """Create a new author delegation."""
        delegation = AuthorDelegation(
            assessment_id=assessment_id,
            delegator_id=delegator_id,
            delegate_id=delegate_id,
            created_by_id=created_by_id,
            reason=reason,
            valid_from=valid_from,
            valid_to=valid_to,
            status=DelegationStatus.ACTIVE,
        )
        self.db.add(delegation)
        return delegation

    async def revoke_delegation(
        self,
        delegation_id: uuid.UUID,
        revoked_by_id: uuid.UUID,
    ) -> Optional[AuthorDelegation]:
        """Revoke an active delegation."""
        delegation = await self.get_delegation_by_id(delegation_id)
        if delegation:
            delegation.status = DelegationStatus.REVOKED
            delegation.revoked_at = utcnow()
            delegation.revoked_by_id = revoked_by_id
            self.db.add(delegation)
        return delegation

    async def get_active_delegation(
        self,
        assessment_id: uuid.UUID,
        user_id: uuid.UUID,
        at_time: Optional[datetime] = None,
    ) -> Optional[AuthorDelegation]:
        """
        Check if user has an active author delegation for this assessment at the specified time.
        """
        now = at_time or utcnow()
        stmt = (
            select(AuthorDelegation)
            .where(
                AuthorDelegation.assessment_id == assessment_id,
                AuthorDelegation.delegate_id == user_id,
                AuthorDelegation.status == DelegationStatus.ACTIVE,
                AuthorDelegation.is_deleted == False,
                AuthorDelegation.valid_from <= now,
                AuthorDelegation.valid_to >= now,
            )
            .order_by(AuthorDelegation.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    # ── Attempts & Edits State ────────────────────────────────────────────────

    async def has_attempts_started(self, assessment_id: uuid.UUID) -> bool:
        """
        Check if any attempt on this assessment has started (status != NOT_STARTED, A-10).
        """
        stmt = select(AssessmentAttempt.id).where(
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.status != AttemptStatus.NOT_STARTED,
            AssessmentAttempt.is_deleted == False,
        )
        res = (await self.db.execute(stmt)).first()
        return res is not None

    async def get_attempt_student_ids(self, assessment_id: uuid.UUID) -> Sequence[uuid.UUID]:
        """Fetch distinct student IDs with started attempts for this assessment."""
        stmt = (
            select(AssessmentAttempt.student_id)
            .where(
                AssessmentAttempt.assessment_id == assessment_id,
                AssessmentAttempt.status != AttemptStatus.NOT_STARTED,
                AssessmentAttempt.is_deleted == False,
            )
            .distinct()
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    # ── Versions ─────────────────────────────────────────────────────────────

    async def get_versions(self, assessment_id: uuid.UUID) -> Sequence[AssessmentVersion]:
        """Fetch all version snapshots for an assessment, ordered by version_no."""
        stmt = (
            select(AssessmentVersion)
            .where(AssessmentVersion.assessment_id == assessment_id)
            .order_by(AssessmentVersion.version_no.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_version_by_number(
        self,
        assessment_id: uuid.UUID,
        version_no: int,
    ) -> Optional[AssessmentVersion]:
        """Fetch a specific version snapshot."""
        stmt = select(AssessmentVersion).where(
            AssessmentVersion.assessment_id == assessment_id,
            AssessmentVersion.version_no == version_no,
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_active_seal(self, assessment_id: uuid.UUID) -> Optional[AssessmentSeal]:
        """Fetch the active seal for an assessment if one exists."""
        stmt = (
            select(AssessmentSeal)
            .where(
                AssessmentSeal.assessment_id == assessment_id,
                AssessmentSeal.revoked_at.is_(None),
                AssessmentSeal.is_superseded == False,
            )
            .order_by(AssessmentSeal.sealed_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()
