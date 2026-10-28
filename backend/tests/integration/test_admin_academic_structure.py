"""
Admin academic structure, institutions, courses and teaching assignments.

Covers what the admin screens rely on: the one-call structure view (inactive records included),
validated updates, readable duplicate errors, institution timezone / settings rules, course search
and status, and the checks that keep a teaching assignment consistent.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import UserRole
from app.db.models.auth import User, UserProfile

pytestmark = pytest.mark.asyncio


# ── helpers ─────────────────────────────────────────────────────────────────────────────────


async def _user(
    db: AsyncSession, role: UserRole, email: str, first: str = "Test", last: str = "User"
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="x",
        role=role,
        status="ACTIVE",
        email_verified=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserProfile(user_id=user.id, first_name=first, last_name=last))
    await db.flush()
    return user


@pytest.fixture
async def admin(db: AsyncSession, make_auth_headers):
    user = await _user(db, UserRole.ADMIN, f"admin-{uuid.uuid4().hex[:6]}@t.test", "Ada", "Admin")
    return make_auth_headers(user_id=str(user.id), role=UserRole.ADMIN, email=user.email)


async def _post(client: AsyncClient, headers, path: str, body: dict, expect: int = 200):
    res = await client.post(f"/api/v1{path}", json=body, headers=headers)
    assert res.status_code == expect, f"{path} -> {res.status_code} {res.text}"
    return res.json()


async def _institution(client, headers, code: str | None = None) -> dict:
    code = code or f"I{uuid.uuid4().hex[:6].upper()}"
    return await _post(
        client,
        headers,
        "/admin/institutions",
        {"name": f"Inst {code}", "code": code, "timezone": "Africa/Kigali"},
        201,
    )


async def _department(client, headers, inst_id: str, code: str = "ICT", **extra) -> dict:
    return await _post(
        client,
        headers,
        "/admin/academic/departments",
        {"institution_id": inst_id, "name": f"Dept {code}", "code": code, **extra},
    )


# ── institutions ────────────────────────────────────────────────────────────────────────────


async def test_institution_timezone_must_be_a_real_name(client, admin):
    bad = await client.post(
        "/api/v1/admin/institutions",
        json={"name": "Bad Tz", "code": "BTZ", "timezone": "UTC+2"},
        headers=admin,
    )
    assert bad.status_code == 422
    good = await client.post(
        "/api/v1/admin/institutions",
        json={"name": "Good Tz", "code": "GTZ", "timezone": "Africa/Kigali"},
        headers=admin,
    )
    assert good.status_code == 201


async def test_duplicate_institution_code_is_a_readable_conflict(client, admin):
    inst = await _institution(client, admin, "DUPX")
    res = await client.post(
        "/api/v1/admin/institutions", json={"name": "Other", "code": "dupx"}, headers=admin
    )
    assert res.status_code == 409
    assert "DUPX" in res.json()["error"]["message"]
    assert inst["code"] == "DUPX"


async def test_saving_settings_merges_instead_of_replacing(client, admin):
    inst = await _institution(client, admin)
    url = f"/api/v1/admin/institutions/{inst['id']}"
    await client.patch(url, json={"settings": {"other_block": {"keep": True}}}, headers=admin)
    res = await client.patch(
        url, json={"settings": {"structure_profile": {"preset": "school"}}}, headers=admin
    )
    settings = res.json()["settings"]
    assert settings["structure_profile"]["preset"] == "school"
    assert settings["other_block"] == {"keep": True}


# ── structure ───────────────────────────────────────────────────────────────────────────────


async def test_structure_requires_an_admin(client, admin, db, make_auth_headers):
    inst = await _institution(client, admin)
    url = f"/api/v1/admin/academic/structure?institution_id={inst['id']}"
    lecturer = await _user(db, UserRole.LECTURER, f"l-{uuid.uuid4().hex[:6]}@t.test")
    lecturer_headers = make_auth_headers(
        user_id=str(lecturer.id), role=UserRole.LECTURER, email=lecturer.email
    )
    assert (await client.get(url)).status_code == 401
    assert (await client.get(url, headers=lecturer_headers)).status_code == 403
    assert (await client.get(url, headers=admin)).status_code == 200


async def test_structure_returns_every_level_and_keeps_inactive_records(client, admin):
    inst = await _institution(client, admin)
    campus = await _post(
        client,
        admin,
        "/admin/academic/campuses",
        {"institution_id": inst["id"], "name": "Main", "code": "MAIN"},
    )
    college = await _post(
        client,
        admin,
        "/admin/academic/colleges",
        {
            "institution_id": inst["id"],
            "campus_id": campus["id"],
            "name": "Engineering",
            "code": "ENG",
        },
    )
    dept = await _department(client, admin, inst["id"], "ICT", college_id=college["id"])
    option = await _post(
        client,
        admin,
        "/admin/academic/options",
        {"department_id": dept["id"], "name": "IT", "code": "IT"},
    )
    group = await _post(
        client,
        admin,
        "/admin/academic/class-groups",
        {"option_id": option["id"], "name": "Level 6", "code": "L6", "level": 6},
    )
    await _post(
        client,
        admin,
        "/admin/academic/sections",
        {"name": "Year 1", "class_group_id": group["id"], "capacity": 40},
    )
    await _post(
        client, admin, "/admin/academic/sections", {"name": "Evening", "department_id": dept["id"]}
    )

    # suspend the department: it must still be visible to the structure screen
    res = await client.patch(
        f"/api/v1/admin/academic/departments/{dept['id']}", json={"is_active": False}, headers=admin
    )
    assert res.status_code == 200

    body = (
        await client.get(
            f"/api/v1/admin/academic/structure?institution_id={inst['id']}", headers=admin
        )
    ).json()
    assert [c["name"] for c in body["campuses"]] == ["Main"]
    assert body["colleges"][0]["campus_id"] == campus["id"]
    assert body["departments"][0]["is_active"] is False
    assert body["departments"][0]["campus_id"] == campus["id"]  # filled in from the college
    assert [p["name"] for p in body["programs"]] == ["IT"]
    assert body["levels"][0]["level"] == 6
    assert {c["name"] for c in body["classes"]} == {"Year 1", "Evening"}
    year1 = next(c for c in body["classes"] if c["name"] == "Year 1")
    assert year1["department_id"] == dept["id"]  # a class under a year level knows its department


async def test_structure_of_a_missing_institution_is_404(client, admin):
    res = await client.get(
        f"/api/v1/admin/academic/structure?institution_id={uuid.uuid4()}", headers=admin
    )
    assert res.status_code == 404


async def test_overview_counts_per_institution(client, admin):
    inst = await _institution(client, admin)
    dept = await _department(client, admin, inst["id"])
    await _post(
        client, admin, "/admin/academic/sections", {"name": "A", "department_id": dept["id"]}
    )
    rows = (await client.get("/api/v1/admin/academic/overview", headers=admin)).json()
    mine = next(r for r in rows if r["institution_id"] == inst["id"])
    assert (mine["departments"], mine["classes"], mine["students"]) == (1, 1, 0)


# ── validation ──────────────────────────────────────────────────────────────────────────────


async def test_duplicate_code_is_a_readable_conflict_not_a_server_error(client, admin):
    inst = await _institution(client, admin)
    await _department(client, admin, inst["id"], "ICT")
    res = await client.post(
        "/api/v1/admin/academic/departments",
        json={"institution_id": inst["id"], "name": "Another", "code": "ict"},
        headers=admin,
    )
    assert res.status_code == 409
    assert "ICT" in res.json()["error"]["message"]


async def test_codes_are_stored_upper_case(client, admin):
    inst = await _institution(client, admin)
    dept = await _department(client, admin, inst["id"], "lower")
    assert dept["code"] == "LOWER"


async def test_a_class_needs_a_year_level_or_a_department(client, admin):
    res = await client.post(
        "/api/v1/admin/academic/sections", json={"name": "Orphan"}, headers=admin
    )
    assert res.status_code == 422


async def test_duplicate_class_name_under_a_department_is_refused(client, admin):
    inst = await _institution(client, admin)
    dept = await _department(client, admin, inst["id"])
    await _post(
        client, admin, "/admin/academic/sections", {"name": "Grade 8A", "department_id": dept["id"]}
    )
    res = await client.post(
        "/api/v1/admin/academic/sections",
        json={"name": "grade 8a", "department_id": dept["id"]},
        headers=admin,
    )
    assert res.status_code == 409


async def test_a_college_cannot_use_another_institutions_campus(client, admin):
    one = await _institution(client, admin)
    two = await _institution(client, admin)
    campus = await _post(
        client,
        admin,
        "/admin/academic/campuses",
        {"institution_id": one["id"], "name": "Main", "code": "MAIN"},
    )
    res = await client.post(
        "/api/v1/admin/academic/colleges",
        json={"institution_id": two["id"], "campus_id": campus["id"], "name": "Law", "code": "LAW"},
        headers=admin,
    )
    assert res.status_code == 422


async def test_year_level_and_department_must_agree_for_a_class(client, admin):
    inst = await _institution(client, admin)
    d1 = await _department(client, admin, inst["id"], "D1")
    d2 = await _department(client, admin, inst["id"], "D2")
    option = await _post(
        client,
        admin,
        "/admin/academic/options",
        {"department_id": d1["id"], "name": "Prog", "code": "PRG"},
    )
    group = await _post(
        client,
        admin,
        "/admin/academic/class-groups",
        {"option_id": option["id"], "name": "Level 1", "code": "L1"},
    )
    res = await client.post(
        "/api/v1/admin/academic/sections",
        json={"name": "X", "class_group_id": group["id"], "department_id": d2["id"]},
        headers=admin,
    )
    assert res.status_code == 422


async def test_updates_cannot_move_or_delete_records(client, admin):
    inst = await _institution(client, admin)
    other = await _institution(client, admin)
    dept = await _department(client, admin, inst["id"])
    res = await client.patch(
        f"/api/v1/admin/academic/departments/{dept['id']}",
        json={"name": "Renamed", "institution_id": other["id"], "is_deleted": True, "code": "HACK"},
        headers=admin,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Renamed"
    assert body["institution_id"] == inst["id"]
    assert body["code"] == dept["code"]
    structure = (
        await client.get(
            f"/api/v1/admin/academic/structure?institution_id={inst['id']}", headers=admin
        )
    ).json()
    assert [d["name"] for d in structure["departments"]] == ["Renamed"]  # still there, not deleted


async def test_a_blank_name_cannot_be_saved(client, admin):
    inst = await _institution(client, admin)
    dept = await _department(client, admin, inst["id"])
    res = await client.patch(
        f"/api/v1/admin/academic/departments/{dept['id']}", json={"name": " "}, headers=admin
    )
    assert res.status_code == 422


# ── courses ─────────────────────────────────────────────────────────────────────────────────


async def _period(client, admin, inst_id: str) -> dict:
    return await _post(
        client,
        admin,
        "/admin/academic/academic-periods",
        {
            "institution_id": inst_id,
            "name": "2026 - 2027",
            "period_type": "YEAR",
            "start_date": "2026-08-01",
            "end_date": "2027-08-01",
        },
    )


async def _course(
    client, admin, inst_id, period_id, dept_id, code, title="A course", language="EN"
) -> dict:
    return await _post(
        client,
        admin,
        "/admin/courses",
        {
            "institution_id": inst_id,
            "academic_period_id": period_id,
            "academic_year": "2026 - 2027",
            "code": code,
            "title": title,
            "credit_hours": 3,
            "language": language,
            "department_ids": [dept_id],
        },
        201,
    )


async def test_course_list_filters_and_summary_cover_the_whole_catalog(client, admin):
    inst = await _institution(client, admin)
    dept = await _department(client, admin, inst["id"])
    period = await _period(client, admin, inst["id"])
    await _course(client, admin, inst["id"], period["id"], dept["id"], "ALG101", "Algebra")
    await _course(
        client, admin, inst["id"], period["id"], dept["id"], "KIN101", "Ikinyarwanda", language="RW"
    )
    base = f"/api/v1/admin/courses?institution_id={inst['id']}"

    both = (await client.get(base, headers=admin)).json()
    assert both["total"] == 2
    assert both["summary"]["ai_restricted"] >= 1

    found = (await client.get(f"{base}&search=algeb", headers=admin)).json()
    assert [c["code"] for c in found["items"]] == ["ALG101"]
    assert found["items"][0]["department_names"] == [dept["name"]]
    assert found["items"][0]["department_ids"] == [dept["id"]]

    rw = (await client.get(f"{base}&language=RW", headers=admin)).json()
    assert [c["code"] for c in rw["items"]] == ["KIN101"]

    assert (await client.get(f"{base}&status=bogus", headers=admin)).status_code == 422


async def test_a_suspended_course_is_listed_as_suspended(client, admin):
    inst = await _institution(client, admin)
    dept = await _department(client, admin, inst["id"])
    period = await _period(client, admin, inst["id"])
    course = await _course(client, admin, inst["id"], period["id"], dept["id"], "SUS101")
    await client.patch(
        f"/api/v1/admin/courses/{course['id']}", json={"is_active": False}, headers=admin
    )

    listed = (
        await client.get(f"/api/v1/admin/courses?institution_id={inst['id']}", headers=admin)
    ).json()
    assert listed["items"][0]["status"] == "Suspended"
    only_active = (
        await client.get(
            f"/api/v1/admin/courses?institution_id={inst['id']}&status=active", headers=admin
        )
    ).json()
    assert only_active["items"] == []


async def test_one_course_can_be_loaded_for_editing_and_its_departments_changed(client, admin):
    inst = await _institution(client, admin)
    d1 = await _department(client, admin, inst["id"], "D1")
    d2 = await _department(client, admin, inst["id"], "D2")
    period = await _period(client, admin, inst["id"])
    course = await _course(client, admin, inst["id"], period["id"], d1["id"], "EDT101")

    one = await client.get(f"/api/v1/admin/courses/{course['id']}", headers=admin)
    assert one.status_code == 200
    assert one.json()["department_ids"] == [d1["id"]]

    await client.patch(
        f"/api/v1/admin/courses/{course['id']}", json={"department_ids": [d2["id"]]}, headers=admin
    )
    assert (await client.get(f"/api/v1/admin/courses/{course['id']}", headers=admin)).json()[
        "department_ids"
    ] == [d2["id"]]


async def test_duplicate_course_code_is_a_readable_conflict(client, admin):
    inst = await _institution(client, admin)
    dept = await _department(client, admin, inst["id"])
    period = await _period(client, admin, inst["id"])
    await _course(client, admin, inst["id"], period["id"], dept["id"], "DUP101")
    res = await client.post(
        "/api/v1/admin/courses",
        json={
            "institution_id": inst["id"],
            "academic_period_id": period["id"],
            "academic_year": "2026 - 2027",
            "code": "DUP101",
            "title": "Again",
            "credit_hours": 3,
            "department_ids": [dept["id"]],
        },
        headers=admin,
    )
    assert res.status_code == 409
    assert "DUP101" in res.json()["error"]["message"]


# ── teaching assignments ────────────────────────────────────────────────────────────────────


async def _assignment_setup(client, admin, db):
    inst = await _institution(client, admin)
    dept = await _department(client, admin, inst["id"], "ICT")
    period = await _period(client, admin, inst["id"])
    course = await _course(client, admin, inst["id"], period["id"], dept["id"], "ASG101")
    lecturer = await _user(
        db, UserRole.LECTURER, f"lect-{uuid.uuid4().hex[:6]}@t.test", "Lee", "Lecturer"
    )
    base = {
        "lecturer_id": str(lecturer.id),
        "institution_id": inst["id"],
        "department_id": dept["id"],
        "course_id": course["id"],
        "academic_period_id": period["id"],
        "academic_year": "2026/2027",
    }
    return inst, dept, period, course, lecturer, base


async def test_a_valid_assignment_is_created(client, admin, db):
    *_, base = await _assignment_setup(client, admin, db)
    res = await client.post("/api/v1/admin/academic/assignments/bulk", json=[base], headers=admin)
    assert res.status_code == 201
    assert len(res.json()) == 1


async def test_the_same_lecturer_cannot_be_given_the_same_course_twice(client, admin, db):
    *_, lecturer, base = await _assignment_setup(client, admin, db)
    await _post(client, admin, "/admin/academic/assignments/bulk", [base], 201)
    res = await client.post("/api/v1/admin/academic/assignments/bulk", json=[base], headers=admin)
    assert res.status_code == 409
    assert "Lee Lecturer" in res.json()["error"]["message"]


async def test_a_bulk_request_is_all_or_nothing(client, admin, db):
    inst, dept, period, course, lecturer, base = await _assignment_setup(client, admin, db)
    good = {**base}
    bad = {**base, "lecturer_id": str(uuid.uuid4())}  # unknown lecturer
    res = await client.post(
        "/api/v1/admin/academic/assignments/bulk", json=[good, bad], headers=admin
    )
    assert res.status_code == 404
    listed = (
        await client.get(
            f"/api/v1/admin/academic/assignments?lecturer_id={lecturer.id}", headers=admin
        )
    ).json()
    assert listed == []  # the valid one was not saved either


async def test_only_lecturer_accounts_can_be_assigned(client, admin, db):
    *_, base = await _assignment_setup(client, admin, db)
    student = await _user(
        db, UserRole.STUDENT, f"stu-{uuid.uuid4().hex[:6]}@t.test", "Sam", "Student"
    )
    res = await client.post(
        "/api/v1/admin/academic/assignments/bulk",
        json=[{**base, "lecturer_id": str(student.id)}],
        headers=admin,
    )
    assert res.status_code == 422
    assert "not a lecturer" in res.json()["error"]["message"]


async def test_assignment_parts_must_belong_together(client, admin, db):
    inst, dept, period, course, lecturer, base = await _assignment_setup(client, admin, db)
    other_inst = await _institution(client, admin)
    other_dept = await _department(client, admin, inst["id"], "LAW")

    wrong_institution = await client.post(
        "/api/v1/admin/academic/assignments/bulk",
        json=[{**base, "institution_id": other_inst["id"]}],
        headers=admin,
    )
    assert wrong_institution.status_code == 422

    not_offered = await client.post(
        "/api/v1/admin/academic/assignments/bulk",
        json=[{**base, "department_id": other_dept["id"]}],
        headers=admin,
    )
    assert not_offered.status_code == 422
    assert "not offered" in not_offered.json()["error"]["message"]


async def test_an_assignment_to_a_class_fills_in_the_programme(client, admin, db):
    inst, dept, period, course, lecturer, base = await _assignment_setup(client, admin, db)
    option = await _post(
        client,
        admin,
        "/admin/academic/options",
        {"department_id": dept["id"], "name": "IT", "code": "IT"},
    )
    group = await _post(
        client,
        admin,
        "/admin/academic/class-groups",
        {"option_id": option["id"], "name": "L6", "code": "L6"},
    )
    section = await _post(
        client, admin, "/admin/academic/sections", {"name": "Year 1", "class_group_id": group["id"]}
    )
    created = await _post(
        client,
        admin,
        "/admin/academic/assignments/bulk",
        [{**base, "class_section_id": section["id"]}],
        201,
    )
    assert created[0]["option_id"] == option["id"]
