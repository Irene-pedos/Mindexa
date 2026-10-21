"""
tests/integration/test_duty_access_and_workspace.py

Regression tests for duty-based access (spec §5.1, §13.1):
- Admins get no implicit moderator / exam-officer access
- Base-role rule enforced when assigning duties
- /auth/me exposes only currently valid duties
- /auth/me flags lecturers without teaching assignments (duty-only staff)
- /admin/users search used by the duty-assignment staff picker
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import Duty, UserRole
from app.db.models.academic import Department, Institution, TeachingAssignment
from app.db.models.auth import User, UserProfile
from app.db.models.duty import UserDutyAssignment


async def _make_user(
    db: AsyncSession, email: str, role: UserRole, name: tuple[str, str] | None = None
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="pw",
        role=role,
        status="ACTIVE",
        email_verified=True,
    )
    db.add(user)
    await db.flush()
    first, last = name or (email.split("@")[0], "Test")
    db.add(UserProfile(user_id=user.id, first_name=first, last_name=last))
    await db.flush()
    return user


async def _make_org(db: AsyncSession) -> tuple[Institution, Department]:
    inst = Institution(name="Duty Test College", code=f"DTC{uuid.uuid4().hex[:6]}")
    db.add(inst)
    await db.flush()
    dept = Department(institution_id=inst.id, name="Quality Office", code="QO")
    db.add(dept)
    await db.flush()
    return inst, dept


def _duty(
    user: User,
    admin: User,
    duty: Duty,
    inst: Institution,
    dept: Department | None = None,
    **kwargs: object,
) -> UserDutyAssignment:
    return UserDutyAssignment(
        user_id=user.id,
        duty=duty,
        institution_id=inst.id,
        department_id=dept.id if dept else None,
        assigned_by_id=admin.id,
        **kwargs,
    )


def _hdrs(make_auth_headers, user: User) -> dict[str, str]:
    return make_auth_headers(user_id=str(user.id), role=user.role, email=user.email)


@pytest.mark.asyncio
async def test_admin_without_duty_is_denied_moderator_and_exam_office_routes(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    admin = await _make_user(db, "plain_admin@dtc.ac", UserRole.ADMIN)
    hdrs = _hdrs(make_auth_headers, admin)

    resp = await client.get("/api/v1/moderator/queue", headers=hdrs)
    assert resp.status_code == 403, resp.text

    resp = await client.get("/api/v1/exam-office/queue", headers=hdrs)
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_moderator_duty_requires_lecturer_base_role(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    admin = await _make_user(db, "assigner_admin@dtc.ac", UserRole.ADMIN)
    other_admin = await _make_user(db, "target_admin@dtc.ac", UserRole.ADMIN)
    inst, dept = await _make_org(db)

    resp = await client.post(
        "/api/v1/admin/duties",
        headers=_hdrs(make_auth_headers, admin),
        json={
            "user_id": str(other_admin.id),
            "duty": "MODERATOR",
            "institution_id": str(inst.id),
            "department_id": str(dept.id),
        },
    )
    assert resp.status_code == 400, resp.text

    # Exam officer may be an admin
    resp = await client.post(
        "/api/v1/admin/duties",
        headers=_hdrs(make_auth_headers, admin),
        json={
            "user_id": str(other_admin.id),
            "duty": "EXAM_OFFICER",
            "institution_id": str(inst.id),
        },
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_admin_user_search_matches_email_and_name(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    admin = await _make_user(db, "search_admin@dtc.ac", UserRole.ADMIN)
    await _make_user(db, "office.staff@dtc.ac", UserRole.LECTURER, name=("Uwase", "Mukamana"))
    await _make_user(db, "unrelated_lecturer@dtc.ac", UserRole.LECTURER)
    hdrs = _hdrs(make_auth_headers, admin)

    async def emails(search: str) -> set[str]:
        resp = await client.get(
            "/api/v1/admin/users",
            headers=hdrs,
            params={"role": "LECTURER", "search": search, "page_size": 50},
        )
        assert resp.status_code == 200, resp.text
        return {u["email"] for u in resp.json()["items"]}

    assert "office.staff@dtc.ac" in await emails("OFFICE.STAFF")  # email, case-insensitive
    assert "office.staff@dtc.ac" in await emails("mukam")  # last name
    assert "office.staff@dtc.ac" in await emails("Uwase Muka")  # full name
    assert await emails("%") == set()  # LIKE wildcard matched literally


@pytest.mark.asyncio
async def test_me_returns_only_valid_duties_and_flags_duty_only_staff(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    admin = await _make_user(db, "duty_admin@dtc.ac", UserRole.ADMIN)
    staff = await _make_user(db, "office_moderator@dtc.ac", UserRole.LECTURER)
    inst, dept = await _make_org(db)
    now = datetime.now(UTC)

    db.add_all(
        [
            _duty(staff, admin, Duty.MODERATOR, inst, dept),
            # Expired — must not be reported
            _duty(
                staff, admin, Duty.EXAM_OFFICER, inst,
                valid_from=now - timedelta(days=30), valid_to=now - timedelta(days=1),
            ),
            # Deactivated — must not be reported
            _duty(staff, admin, Duty.DEPARTMENT_HEAD, inst, dept, is_active=False),
        ]
    )
    await db.flush()

    resp = await client.get("/api/v1/auth/me", headers=_hdrs(make_auth_headers, staff))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["duties"] == ["MODERATOR"]
    assert body["has_teaching_assignments"] is False


@pytest.mark.asyncio
async def test_me_flags_teaching_lecturer_and_skips_flag_for_admin(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    admin = await _make_user(db, "flag_admin@dtc.ac", UserRole.ADMIN)
    lecturer = await _make_user(db, "teaching_lecturer@dtc.ac", UserRole.LECTURER)
    inst, dept = await _make_org(db)

    db.add(
        TeachingAssignment(
            lecturer_id=lecturer.id,
            institution_id=inst.id,
            department_id=dept.id,
            academic_year="2026",
        )
    )
    await db.flush()

    resp = await client.get("/api/v1/auth/me", headers=_hdrs(make_auth_headers, lecturer))
    assert resp.status_code == 200, resp.text
    assert resp.json()["has_teaching_assignments"] is True

    resp = await client.get("/api/v1/auth/me", headers=_hdrs(make_auth_headers, admin))
    assert resp.status_code == 200, resp.text
    assert resp.json()["has_teaching_assignments"] is None
