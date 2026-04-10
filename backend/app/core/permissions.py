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

from app.core.constants import UserRole

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
