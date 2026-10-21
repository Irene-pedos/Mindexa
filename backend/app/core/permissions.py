"""
app/core/permissions.py

Role constants and reusable permission helpers for Mindexa.

This module defines:
    - Role groupings (frozensets) for multi-role checks
    - Role hierarchy comparison helpers
    - Predicate helpers used by route guards

DESIGN:
    Mindexa has three primary roles: Student, Lecturer, Admin.
    The hierarchy is: Admin > Lecturer > Student.

    Admin can perform every lecturer and student action.
    Lecturer can perform every student action within their own courses.
    Student can only access their own academic data.

    These rules are enforced at two layers:
        1. Route guards (dependencies/auth.py) — the outer gate
        2. Service layer — the inner gate (verifies ownership, enrollment, etc.)

    This module handles only the role-level part (layer 1).
    Resource-level ownership checks are in the service layer.

USAGE:
    from app.core.permissions import LECTURER_AND_ABOVE, has_role_or_above

    if current_user.role not in LECTURER_AND_ABOVE:
        raise RoleRequiredError("lecturer")
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import Duty, UserRole
from app.core.exceptions import PermissionDeniedError
from app.db.base import utcnow

# ─────────────────────────────────────────────────────────────────────────────
# ROLE GROUPINGS
# ─────────────────────────────────────────────────────────────────────────────

# Use frozenset for O(1) `in` checks and immutability

ADMIN_ONLY: frozenset[UserRole] = frozenset({
    UserRole.ADMIN,
})

STUDENT_ONLY: frozenset[UserRole] = frozenset({
    UserRole.STUDENT,
})

LECTURER_AND_ABOVE: frozenset[UserRole] = frozenset({
    UserRole.LECTURER,
    UserRole.ADMIN,
})

ALL_ROLES: frozenset[UserRole] = frozenset({
    UserRole.STUDENT,
    UserRole.LECTURER,
    UserRole.ADMIN,
})


# ─────────────────────────────────────────────────────────────────────────────
# ROLE HIERARCHY
# ─────────────────────────────────────────────────────────────────────────────

_ROLE_LEVEL: dict[UserRole, int] = {
    UserRole.STUDENT:  1,
    UserRole.LECTURER: 2,
    UserRole.ADMIN:    3,
}


def has_role_or_above(user_role: UserRole, minimum_role: UserRole) -> bool:
    """
    Return True if user_role meets or exceeds the minimum_role requirement.

    Examples:
        has_role_or_above(UserRole.ADMIN,    UserRole.LECTURER) → True
        has_role_or_above(UserRole.LECTURER, UserRole.LECTURER) → True
        has_role_or_above(UserRole.STUDENT,  UserRole.LECTURER) → False
    """
    return _ROLE_LEVEL.get(user_role, 0) >= _ROLE_LEVEL.get(minimum_role, 99)


# ─────────────────────────────────────────────────────────────────────────────
# PREDICATE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def is_admin(role: UserRole) -> bool:
    """Return True if the role is ADMIN."""
    return role == UserRole.ADMIN


def is_lecturer(role: UserRole) -> bool:
    """Return True if the role is exactly LECTURER (not admin)."""
    return role == UserRole.LECTURER


def is_student(role: UserRole) -> bool:
    """Return True if the role is STUDENT."""
    return role == UserRole.STUDENT


def is_lecturer_or_admin(role: UserRole) -> bool:
    """Return True if the role is LECTURER or ADMIN."""
    return role in LECTURER_AND_ABOVE


# ─────────────────────────────────────────────────────────────────────────────
# DUTY PERMISSION HELPERS (Phase 1)
# ─────────────────────────────────────────────────────────────────────────────

async def has_duty(
    user_or_db: AsyncSession | object,
    duty_or_user: object,
    duty_or_dept: object = None,
    department_id: uuid.UUID | None = None,
    campus_id: uuid.UUID | None = None,
    institution_id: uuid.UUID | None = None,
    *,
    db: AsyncSession | None = None,
    as_of: datetime | None = None,
) -> bool:
    """
    Check if a user currently holds an active and valid duty assignment.
    Always queries database assignments freshly; no caching is applied.
    Enforces timezone-aware comparison on validity dates.

    Supports both calling conventions:
        has_duty(db, user, Duty.MODERATOR, department_id=...)
        has_duty(user, Duty.MODERATOR, department_id=..., db=db)
    """
    session: AsyncSession | None = None
    target_user: object = None
    duty: Duty | None = None
    target_dept_id: uuid.UUID | None = department_id

    # Resolve arguments
    if isinstance(user_or_db, AsyncSession):
        session = user_or_db
        target_user = duty_or_user
        duty_val = duty_or_dept
    else:
        session = db
        target_user = user_or_db
        duty_val = duty_or_user
        if isinstance(duty_or_dept, uuid.UUID):
            target_dept_id = duty_or_dept

    if isinstance(duty_val, str):
        duty = Duty(duty_val)
    elif isinstance(duty_val, Duty):
        duty = duty_val
    else:
        return False

    check_time = as_of or utcnow()
    if check_time.tzinfo is None:
        check_time = check_time.replace(tzinfo=UTC)

    # 1. DB-backed verification (Primary standard)
    if session is not None:
        from sqlalchemy import and_, or_, select

        from app.db.models.auth import User
        from app.db.models.duty import UserDutyAssignment

        user_id = target_user.id if hasattr(target_user, "id") else target_user
        if not isinstance(user_id, uuid.UUID):
            try:
                user_id = uuid.UUID(str(user_id))
            except Exception:
                return False

        # Load fresh user state from DB
        db_user = await session.get(User, user_id)
        if not db_user or db_user.is_deleted or db_user.status != "ACTIVE":
            return False

        # Enforce base-role requirements
        if (
            duty in (Duty.MODERATOR, Duty.DEPARTMENT_HEAD)
            and db_user.role != UserRole.LECTURER.value
        ):
            return False
        if duty == Duty.EXAM_OFFICER and db_user.role not in (
            UserRole.LECTURER.value,
            UserRole.ADMIN.value,
        ):
            return False

        conditions = [
            UserDutyAssignment.user_id == user_id,
            UserDutyAssignment.duty == duty,
            UserDutyAssignment.is_active == True,  # noqa: E712
            UserDutyAssignment.is_deleted == False,  # noqa: E712
            UserDutyAssignment.valid_from <= check_time,
            or_(
                UserDutyAssignment.valid_to.is_(None),
                UserDutyAssignment.valid_to >= check_time,
            ),
        ]
        if institution_id is not None:
            conditions.append(UserDutyAssignment.institution_id == institution_id)

        stmt = select(UserDutyAssignment).where(and_(*conditions))
        result = await session.execute(stmt)
        assignments = list(result.scalars().all())

        for assign in assignments:
            if duty in (Duty.MODERATOR, Duty.DEPARTMENT_HEAD):
                if target_dept_id is not None:
                    if assign.department_id == target_dept_id:
                        return True
                else:
                    return True
            elif duty == Duty.EXAM_OFFICER:
                if assign.department_id is None and assign.campus_id is None:
                    return True
                if campus_id is not None and assign.campus_id == campus_id:
                    return True
                if campus_id is None and target_dept_id is None:
                    return True

        return False

    # 2. In-memory fallback (for pure unit tests without session)
    user_role = getattr(target_user, "role", None)
    if hasattr(user_role, "value"):
        user_role = user_role.value

    if duty in (Duty.MODERATOR, Duty.DEPARTMENT_HEAD) and user_role != UserRole.LECTURER.value:
        return False
    if duty == Duty.EXAM_OFFICER and user_role not in (
        UserRole.LECTURER.value,
        UserRole.ADMIN.value,
    ):
        return False

    assignments = getattr(target_user, "duty_assignments", [])
    for assign in assignments:
        if getattr(assign, "is_deleted", False):
            continue
        if not getattr(assign, "is_active", True):
            continue
        if getattr(assign, "duty", None) != duty:
            continue

        v_from = getattr(assign, "valid_from", None)
        if v_from and v_from.tzinfo is None:
            v_from = v_from.replace(tzinfo=UTC)
        if v_from and v_from > check_time:
            continue

        v_to = getattr(assign, "valid_to", None)
        if v_to and v_to.tzinfo is None:
            v_to = v_to.replace(tzinfo=UTC)
        if v_to and v_to < check_time:
            continue

        if institution_id is not None and getattr(assign, "institution_id", None) != institution_id:
            continue

        if duty in (Duty.MODERATOR, Duty.DEPARTMENT_HEAD):
            if target_dept_id is not None:
                if getattr(assign, "department_id", None) == target_dept_id:
                    return True
            else:
                return True
        elif duty == Duty.EXAM_OFFICER:
            dept = getattr(assign, "department_id", None)
            camp = getattr(assign, "campus_id", None)
            if dept is None and camp is None:
                return True
            if campus_id is not None and camp == campus_id:
                return True
            if campus_id is None and target_dept_id is None:
                return True

    return False


async def is_hod_of(
    user_or_db: AsyncSession | object,
    department_id_or_user: object = None,
    department_id: uuid.UUID | None = None,
    *,
    db: AsyncSession | None = None,
    as_of: datetime | None = None,
) -> bool:
    """Convenience helper: check if user is Head of Department for the specified department."""
    session: AsyncSession | None = db
    target_user: object = None
    target_dept_id: uuid.UUID | None = department_id

    if isinstance(user_or_db, AsyncSession):
        session = user_or_db
        target_user = department_id_or_user
    else:
        target_user = user_or_db
        if isinstance(department_id_or_user, uuid.UUID):
            target_dept_id = department_id_or_user

    if session is not None:
        return await has_duty(
            session,
            target_user,
            Duty.DEPARTMENT_HEAD,
            department_id=target_dept_id,
            as_of=as_of,
        )
    return await has_duty(
        target_user,
        Duty.DEPARTMENT_HEAD,
        department_id=target_dept_id,
        as_of=as_of,
    )


async def is_moderator_for(
    user_or_db: AsyncSession | object,
    department_id_or_user: object = None,
    department_id: uuid.UUID | None = None,
    *,
    db: AsyncSession | None = None,
    as_of: datetime | None = None,
) -> bool:
    """Convenience helper: check if user is Moderator for the specified department."""
    session: AsyncSession | None = db
    target_user: object = None
    target_dept_id: uuid.UUID | None = department_id

    if isinstance(user_or_db, AsyncSession):
        session = user_or_db
        target_user = department_id_or_user
    else:
        target_user = user_or_db
        if isinstance(department_id_or_user, uuid.UUID):
            target_dept_id = department_id_or_user

    if session is not None:
        return await has_duty(
            session,
            target_user,
            Duty.MODERATOR,
            department_id=target_dept_id,
            as_of=as_of,
        )
    return await has_duty(
        target_user,
        Duty.MODERATOR,
        department_id=target_dept_id,
        as_of=as_of,
    )


def require_duty(duty: Duty | str) -> Callable[..., Any]:
    """
    FastAPI dependency guard enforcing that the current user has the specified duty.
    Always queries database for current valid assignments.
    """
    from app.db.models.auth import User
    from app.db.session import get_db
    from app.dependencies.auth import require_active_user

    duty_enum = Duty(duty) if isinstance(duty, str) else duty

    async def _guard(
        # Plain defaults, not Annotated: with postponed annotations FastAPI cannot
        # resolve the locally imported User inside this closure.
        current_user: User = Depends(require_active_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if not await has_duty(db=db, user_or_db=current_user, duty_or_user=duty_enum):
            raise PermissionDeniedError(f"User lacks required active duty: {duty_enum.value}")
        return current_user

    _guard.__name__ = f"require_duty_{duty_enum.value.lower()}"
    return _guard
