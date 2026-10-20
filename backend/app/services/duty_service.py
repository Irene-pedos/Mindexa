"""
app/services/duty_service.py

Service layer for UserDutyAssignment workflows.
Enforces institutional assignment rules, scope integrity, duplicate prevention,
and atomic audit logging.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import Duty, UserRole
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
)
from app.db.base import utcnow
from app.db.models.academic import Campus, Department, Institution
from app.db.models.audit import AuditLog
from app.db.models.auth import User
from app.db.models.duty import UserDutyAssignment
from app.db.repositories.duty_repo import DutyRepository
from app.schemas.duty import DutyAssignmentCreate, DutyAssignmentResponse


class DutyService:
    """Service managing scoped institutional duties (Phase 1)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = DutyRepository(db)

    async def assign_duty(
        self,
        *,
        actor: User,
        data: DutyAssignmentCreate,
    ) -> UserDutyAssignment:
        """
        Assign a duty to a user with strict scope and base-role validation.
        Atomic transaction includes audit log entry.
        """
        # 1. Target user verification and base-role checks
        target_user = await self.db.get(User, data.user_id)
        if not target_user or target_user.is_deleted:
            raise NotFoundError("User", str(data.user_id))

        if data.duty in (Duty.MODERATOR, Duty.DEPARTMENT_HEAD):
            if target_user.role != UserRole.LECTURER.value:
                raise BadRequestError(
                    f"{data.duty.value} requires base role LECTURER, "
                    f"but target user has role {target_user.role}."
                )
        elif data.duty == Duty.EXAM_OFFICER:
            if target_user.role not in (UserRole.LECTURER.value, UserRole.ADMIN.value):
                raise BadRequestError(
                    f"{data.duty.value} requires base role LECTURER or ADMIN, "
                    f"but target user has role {target_user.role}."
                )
        else:
            raise BadRequestError(f"Unsupported duty: {data.duty}")

        # 2. Institution verification
        institution = await self.db.get(Institution, data.institution_id)
        if not institution or institution.is_deleted or not institution.is_active:
            raise NotFoundError("Institution", str(data.institution_id))

        # 3. Department scope verification
        if data.duty in (Duty.MODERATOR, Duty.DEPARTMENT_HEAD) and not data.department_id:
            raise BadRequestError(f"{data.duty.value} requires a department_id.")

        if data.duty == Duty.EXAM_OFFICER and data.department_id is not None:
            raise BadRequestError(
                f"{data.duty.value} cannot be assigned to a department; "
                "scope must be institution-wide or campus-scoped."
            )

        if data.department_id is not None:
            department = await self.db.get(Department, data.department_id)
            if not department or department.is_deleted or not department.is_active:
                raise NotFoundError("Department", str(data.department_id))
            if department.institution_id != data.institution_id:
                raise BadRequestError(
                    f"Department {data.department_id} does not belong "
                    f"to institution {data.institution_id}."
                )
            if (
                data.campus_id is not None
                and department.campus_id is not None
                and department.campus_id != data.campus_id
            ):
                raise BadRequestError(
                    f"Department {data.department_id} belongs to campus "
                    f"{department.campus_id}, not {data.campus_id}."
                )

        # 4. Campus scope verification
        if data.campus_id is not None:
            campus = await self.db.get(Campus, data.campus_id)
            if not campus or campus.is_deleted or not campus.is_active:
                raise NotFoundError("Campus", str(data.campus_id))
            if campus.institution_id != data.institution_id:
                raise BadRequestError(
                    f"Campus {data.campus_id} does not belong to institution {data.institution_id}."
                )

        # 5. Validity dates validation (timezone-aware)
        valid_from = data.valid_from or utcnow()
        if valid_from.tzinfo is None:
            valid_from = valid_from.replace(tzinfo=UTC)

        valid_to = data.valid_to
        if valid_to is not None:
            if valid_to.tzinfo is None:
                valid_to = valid_to.replace(tzinfo=UTC)
            if valid_to <= valid_from:
                raise BadRequestError("valid_to must be strictly later than valid_from.")

        # 6. Duplicate active assignment prevention
        existing_active = await self.repo.get_active_assignment(
            user_id=data.user_id,
            duty=data.duty,
            institution_id=data.institution_id,
            campus_id=data.campus_id,
            department_id=data.department_id,
        )
        if existing_active:
            raise ConflictError(
                f"An active {data.duty.value} assignment already exists "
                f"for user {data.user_id} in this scope."
            )

        # 7. Persist assignment
        assignment = UserDutyAssignment(
            user_id=data.user_id,
            duty=data.duty,
            institution_id=data.institution_id,
            campus_id=data.campus_id,
            department_id=data.department_id,
            is_active=True,
            valid_from=valid_from,
            valid_to=valid_to,
            assigned_by_id=actor.id,
        )
        await self.repo.create(assignment)

        # 8. Record audit log in the same transaction
        audit = AuditLog(
            actor_id=actor.id,
            actor_role=actor.role,
            entity_type="user_duty_assignment",
            entity_id=assignment.id,
            action="duty_assigned",
            description=f"Assigned duty {data.duty.value} to user {data.user_id}",
            before_state=None,
            after_state={
                "id": str(assignment.id),
                "user_id": str(assignment.user_id),
                "duty": assignment.duty.value,
                "institution_id": str(assignment.institution_id),
                "campus_id": str(assignment.campus_id) if assignment.campus_id else None,
                "department_id": (
                    str(assignment.department_id) if assignment.department_id else None
                ),
                "is_active": assignment.is_active,
                "valid_from": assignment.valid_from.isoformat(),
                "valid_to": assignment.valid_to.isoformat() if assignment.valid_to else None,
                "assigned_by_id": str(actor.id),
            },
        )
        self.db.add(audit)

        # 9. Atomic commit
        await self.db.commit()
        loaded = await self.repo.get_by_id(assignment.id)
        return loaded if loaded is not None else assignment

    async def deactivate_duty(
        self,
        *,
        actor: User,
        duty_id: uuid.UUID,
    ) -> UserDutyAssignment:
        """
        Deactivate an existing duty assignment (never physical delete).
        Writes an audit record in the same transaction.
        """
        assignment = await self.repo.get_by_id(duty_id)
        if not assignment:
            raise NotFoundError("UserDutyAssignment", str(duty_id))

        if not assignment.is_active:
            return assignment

        before_state = {
            "id": str(assignment.id),
            "is_active": assignment.is_active,
            "duty": assignment.duty.value,
        }

        assignment.is_active = False

        after_state = {
            "id": str(assignment.id),
            "is_active": assignment.is_active,
            "duty": assignment.duty.value,
        }

        audit = AuditLog(
            actor_id=actor.id,
            actor_role=actor.role,
            entity_type="user_duty_assignment",
            entity_id=assignment.id,
            action="duty_deactivated",
            description=f"Deactivated duty {assignment.duty.value} for user {assignment.user_id}",
            before_state=before_state,
            after_state=after_state,
        )
        self.db.add(audit)

        await self.db.commit()
        loaded = await self.repo.get_by_id(assignment.id)
        return loaded if loaded is not None else assignment

    async def list_duties(
        self,
        *,
        user_id: uuid.UUID | None = None,
        duty: Duty | None = None,
        institution_id: uuid.UUID | None = None,
        campus_id: uuid.UUID | None = None,
        department_id: uuid.UUID | None = None,
        is_active: bool | None = None,
    ) -> list[UserDutyAssignment]:
        """List duty assignments with filters."""
        return await self.repo.list_assignments(
            user_id=user_id,
            duty=duty,
            institution_id=institution_id,
            campus_id=campus_id,
            department_id=department_id,
            is_active=is_active,
        )

    async def get_user_duties(
        self,
        user_id: uuid.UUID,
        *,
        active_only: bool = True,
    ) -> list[UserDutyAssignment]:
        """Retrieve duty assignments for a specific user."""
        return await self.repo.list_assignments(
            user_id=user_id,
            is_active=True if active_only else None,
        )

    async def check_user_duty(
        self,
        *,
        user_id: uuid.UUID,
        duty: Duty,
        department_id: uuid.UUID | None = None,
        campus_id: uuid.UUID | None = None,
        institution_id: uuid.UUID | None = None,
        as_of: datetime | None = None,
    ) -> bool:
        """
        Check if user has an active, valid duty assignment matching the required scope.
        Always queries database; no caching.
        """
        # Load user to verify base role matches requirement
        user = await self.db.get(User, user_id)
        if not user or user.is_deleted or user.status != "ACTIVE":
            return False

        if duty in (Duty.MODERATOR, Duty.DEPARTMENT_HEAD) and user.role != UserRole.LECTURER.value:
            return False
        if duty == Duty.EXAM_OFFICER and user.role not in (
            UserRole.LECTURER.value,
            UserRole.ADMIN.value,
        ):
            return False

        active_duties = await self.repo.get_valid_active_duties(
            user_id=user_id,
            duty=duty,
            as_of=as_of,
        )

        for assign in active_duties:
            # Institution check
            if institution_id is not None and assign.institution_id != institution_id:
                continue

            # Scope matching
            if duty in (Duty.MODERATOR, Duty.DEPARTMENT_HEAD):
                if department_id is not None:
                    if assign.department_id == department_id:
                        return True
                else:
                    return True

            elif duty == Duty.EXAM_OFFICER:
                # Institution-wide exam officer covers all campuses/departments
                if assign.department_id is None and assign.campus_id is None:
                    return True
                # Campus-scoped exam officer
                if campus_id is not None and assign.campus_id == campus_id:
                    return True
                if campus_id is None and department_id is None:
                    return True

        return False

    @staticmethod
    def build_response(assignment: UserDutyAssignment) -> DutyAssignmentResponse:
        """Enrich assignment model with related names if loaded."""
        from sqlalchemy import inspect as sa_inspect

        user_email = None
        user_name = None
        institution_name = None
        campus_name = None
        department_name = None

        state = sa_inspect(assignment)
        unloaded = state.unloaded if state else set()

        if "user" not in unloaded and assignment.user:
            user_email = assignment.user.email
            u_state = sa_inspect(assignment.user)
            u_unloaded = u_state.unloaded if u_state else set()
            if "profile" not in u_unloaded and assignment.user.profile:
                prof = assignment.user.profile
                name_str = f"{prof.first_name or ''} {prof.last_name or ''}".strip()
                user_name = prof.display_name or name_str or None

        if "institution" not in unloaded and assignment.institution:
            institution_name = assignment.institution.name

        if "campus" not in unloaded and assignment.campus:
            campus_name = assignment.campus.name

        if "department" not in unloaded and assignment.department:
            department_name = assignment.department.name

        return DutyAssignmentResponse(
            id=assignment.id,
            user_id=assignment.user_id,
            duty=assignment.duty,
            institution_id=assignment.institution_id,
            campus_id=assignment.campus_id,
            department_id=assignment.department_id,
            is_active=assignment.is_active,
            valid_from=assignment.valid_from,
            valid_to=assignment.valid_to,
            assigned_by_id=assignment.assigned_by_id,
            created_at=assignment.created_at,
            updated_at=assignment.updated_at,
            user_email=user_email,
            user_name=user_name,
            institution_name=institution_name,
            campus_name=campus_name,
            department_name=department_name,
        )
