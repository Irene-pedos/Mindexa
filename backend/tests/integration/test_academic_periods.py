"""
Admin academic periods: validated create/update, readable duplicate and overlap errors,
usage counts, and the student view of "where do I study" built from the class (not sign-up text).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import UserRole
from app.db.models.academic import (
    AcademicPeriod,
    ClassGroup,
    ClassSection,
    Course,
    Department,
    Institution,
    Option,
)
from app.db.models.auth import User, UserProfile

pytestmark = pytest.mark.asyncio


async def _user(db: AsyncSession, role: UserRole, first: str = "Test") -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"p{uuid.uuid4().hex[:8]}@t.test",
        hashed_password="x",
        role=role,
        status="ACTIVE",
        email_verified=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserProfile(user_id=user.id, first_name=first, last_name="User"))
    await db.flush()
    return user


@pytest.fixture
async def admin(db: AsyncSession, make_auth_headers):
    user = await _user(db, UserRole.ADMIN, "Ada")
    return make_auth_headers(user_id=str(user.id), role=UserRole.ADMIN, email=user.email)


async def _institution(db: AsyncSession, **extra) -> Institution:
    inst = Institution(name="Period College", code=f"PC{uuid.uuid4().hex[:6].upper()}", **extra)
    db.add(inst)
    await db.flush()
    return inst


def _body(inst: Institution, name: str, start: date, end: date, kind: str = "SEMESTER") -> dict:
    return {
        "institution_id": str(inst.id),
        "name": name,
        "period_type": kind,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }


async def test_create_period_and_list_with_usage(client: AsyncClient, db, admin) -> None:
    inst = await _institution(db)
    today = date.today()
    res = await client.post(
        "/api/v1/admin/academic/academic-periods",
        json=_body(inst, "  Semester 1  ", today, today + timedelta(days=100)),
        headers=admin,
    )
    assert res.status_code == 200, res.text
    period = res.json()
    assert period["name"] == "Semester 1"
    assert period["is_active"] is True

    dept = Department(institution_id=inst.id, name="Computing", code="CMP")
    db.add(dept)
    await db.flush()
    db.add(
        Course(
            institution_id=inst.id,
            department_id=dept.id,
            academic_period_id=uuid.UUID(period["id"]),
            name="Algorithms",
            code="ALG101",
            academic_year="2026",
        )
    )
    await db.flush()

    rows = (
        await client.get(
            f"/api/v1/admin/academic/academic-periods?institution_id={inst.id}", headers=admin
        )
    ).json()
    assert [r["name"] for r in rows] == ["Semester 1"]
    assert rows[0]["course_count"] == 1
    assert rows[0]["assignment_count"] == 0


async def test_end_date_must_follow_start_date(client: AsyncClient, db, admin) -> None:
    inst = await _institution(db)
    today = date.today()
    res = await client.post(
        "/api/v1/admin/academic/academic-periods",
        json=_body(inst, "Backwards", today, today - timedelta(days=1)),
        headers=admin,
    )
    assert res.status_code == 422

    ok = await client.post(
        "/api/v1/admin/academic/academic-periods",
        json=_body(inst, "Fine", today, today + timedelta(days=30)),
        headers=admin,
    )
    patched = await client.patch(
        f"/api/v1/admin/academic/academic-periods/{ok.json()['id']}",
        json={"end_date": (today - timedelta(days=5)).isoformat()},
        headers=admin,
    )
    assert patched.status_code == 422, patched.text


async def test_duplicate_name_is_a_readable_conflict(client: AsyncClient, db, admin) -> None:
    inst = await _institution(db)
    today = date.today()
    first = await client.post(
        "/api/v1/admin/academic/academic-periods",
        json=_body(inst, "Semester A", today, today + timedelta(days=60)),
        headers=admin,
    )
    assert first.status_code == 200
    again = await client.post(
        "/api/v1/admin/academic/academic-periods",
        json=_body(inst, "semester a", today + timedelta(days=70), today + timedelta(days=120)),
        headers=admin,
    )
    assert again.status_code == 409
    assert "Semester A".lower() in again.json()["error"]["message"].lower()


async def test_same_type_periods_cannot_overlap_but_a_year_can_hold_a_semester(
    client: AsyncClient, db, admin
) -> None:
    inst = await _institution(db)
    today = date.today()
    base = "/api/v1/admin/academic/academic-periods"
    assert (
        await client.post(
            base, json=_body(inst, "Sem 1", today, today + timedelta(days=90)), headers=admin
        )
    ).status_code == 200

    clash = await client.post(
        base,
        json=_body(inst, "Sem 2", today + timedelta(days=60), today + timedelta(days=150)),
        headers=admin,
    )
    assert clash.status_code == 422
    assert "Sem 1" in clash.json()["error"]["message"]

    year = await client.post(
        base,
        json=_body(inst, "Year", today, today + timedelta(days=300), kind="YEAR"),
        headers=admin,
    )
    assert year.status_code == 200, year.text


async def test_toggling_status_ignores_old_overlaps(client: AsyncClient, db, admin) -> None:
    inst = await _institution(db)
    today = date.today()
    # Two legacy periods that overlap each other (created before the rule existed).
    a = AcademicPeriod(
        institution_id=inst.id, name="Old A", start_date=today, end_date=today + timedelta(days=90)
    )
    b = AcademicPeriod(
        institution_id=inst.id,
        name="Old B",
        start_date=today + timedelta(days=30),
        end_date=today + timedelta(days=120),
    )
    db.add_all([a, b])
    await db.flush()

    res = await client.patch(
        f"/api/v1/admin/academic/academic-periods/{b.id}",
        json={"is_active": False},
        headers=admin,
    )
    assert res.status_code == 200, res.text
    assert res.json()["is_active"] is False


async def test_period_endpoints_need_an_admin(client: AsyncClient, db, make_auth_headers) -> None:
    lecturer = await _user(db, UserRole.LECTURER)
    headers = make_auth_headers(user_id=str(lecturer.id), role=UserRole.LECTURER, email="l@t.test")
    res = await client.get("/api/v1/admin/academic/academic-periods", headers=headers)
    assert res.status_code == 403


async def test_student_context_uses_the_institutions_own_level_names(
    client: AsyncClient, db, make_auth_headers
) -> None:
    inst = await _institution(
        db,
        settings={
            "structure_profile": {
                "preset": "custom",
                "labels": {"department": {"singular": "Division", "plural": "Divisions"}},
            }
        },
    )
    dept = Department(institution_id=inst.id, name="Secondary", code="SEC")
    db.add(dept)
    await db.flush()
    option = Option(department_id=dept.id, name="Sciences", code="SCI")
    db.add(option)
    await db.flush()
    group = ClassGroup(option_id=option.id, name="Grade 8", code="G8", level=8)
    db.add(group)
    await db.flush()
    section = ClassSection(class_group_id=group.id, department_id=dept.id, name="8A")
    db.add(section)
    today = date.today()
    db.add(
        AcademicPeriod(
            institution_id=inst.id,
            name="Term 1",
            start_date=today - timedelta(days=5),
            end_date=today + timedelta(days=60),
        )
    )
    student = await _user(db, UserRole.STUDENT, "Sam")
    profile = (
        await db.execute(UserProfile.__table__.select().where(UserProfile.user_id == student.id))
    ).first()
    assert profile is not None
    await db.execute(
        UserProfile.__table__.update()
        .where(UserProfile.user_id == student.id)
        .values(class_section_id=section.id)
    )
    await db.flush()
    headers = make_auth_headers(user_id=str(student.id), role=UserRole.STUDENT, email="s@t.test")

    res = await client.get("/api/v1/students/me/academic-context", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["institution_name"] == "Period College"
    levels = {lv["key"]: lv for lv in body["levels"]}
    assert levels["department"] == {"key": "department", "label": "Division", "name": "Secondary"}
    assert levels["program"]["label"] == "Programme"  # no custom name saved: standard wording
    assert levels["year"]["name"] == "Grade 8"
    assert levels["class"]["name"] == "8A"
    assert body["current_period"]["name"] == "Term 1"
