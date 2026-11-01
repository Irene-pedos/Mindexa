"""Academic year > semester structure, dated calendar items, and saving a reviewed import."""

from __future__ import annotations

import io
import uuid

import fitz
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import UserRole
from app.db.models.academic import Institution
from app.db.models.auth import User, UserProfile
from app.schemas.academic_calendar import CalendarDraft
from app.services import calendar_import_service as importer

pytestmark = pytest.mark.asyncio

BASE = "/api/v1/admin/academic"


@pytest.fixture
async def admin(db: AsyncSession, make_auth_headers):
    user = User(
        id=uuid.uuid4(),
        email=f"cal{uuid.uuid4().hex[:6]}@t.test",
        hashed_password="x",
        role=UserRole.ADMIN,
        status="ACTIVE",
        email_verified=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserProfile(user_id=user.id, first_name="Ada", last_name="Admin"))
    await db.flush()
    return make_auth_headers(user_id=str(user.id), role=UserRole.ADMIN, email=user.email)


@pytest.fixture
async def inst(db: AsyncSession) -> Institution:
    row = Institution(name="Cal College", code=f"CC{uuid.uuid4().hex[:5].upper()}", timezone="Africa/Kigali")
    db.add(row)
    await db.flush()
    return row


async def _period(client: AsyncClient, admin, inst: Institution, name: str, kind: str, start: str, end: str, parent: str | None = None, expect: int = 200):
    res = await client.post(
        f"{BASE}/academic-periods",
        json={
            "institution_id": str(inst.id),
            "name": name,
            "period_type": kind,
            "start_date": start,
            "end_date": end,
            "parent_id": parent,
        },
        headers=admin,
    )
    assert res.status_code == expect, res.text
    return res.json()


async def test_semesters_live_inside_their_year(client: AsyncClient, admin, inst) -> None:
    year = await _period(client, admin, inst, "2026-2027", "YEAR", "2026-08-17", "2027-07-27")
    sem = await _period(client, admin, inst, "Semester 1 2026-2027", "SEMESTER", "2026-09-01", "2026-12-18", year["id"])
    assert sem["parent_id"] == year["id"]

    outside = await _period(
        client, admin, inst, "Semester X", "SEMESTER", "2027-08-01", "2027-09-01", year["id"], expect=422
    )
    assert "inside 2026-2027" in outside["error"]["message"]

    year_in_year = await _period(client, admin, inst, "Nested", "YEAR", "2026-09-01", "2026-10-01", year["id"], expect=422)
    assert "cannot belong" in year_in_year["error"]["message"]


async def test_a_year_cannot_shrink_past_its_semesters(client: AsyncClient, admin, inst) -> None:
    year = await _period(client, admin, inst, "Year A", "YEAR", "2026-08-17", "2027-07-27")
    await _period(client, admin, inst, "Sem One", "SEMESTER", "2026-09-01", "2026-12-18", year["id"])
    res = await client.patch(
        f"{BASE}/academic-periods/{year['id']}", json={"end_date": "2026-11-01"}, headers=admin
    )
    assert res.status_code == 422
    assert "Sem One" in res.json()["error"]["message"]


async def test_events_are_whole_days_in_the_institution_timezone(client: AsyncClient, admin, inst) -> None:
    year = await _period(client, admin, inst, "Year B", "YEAR", "2026-08-17", "2027-07-27")
    res = await client.post(
        f"{BASE}/academic-periods/{year['id']}/calendar-events",
        json={"kind": "REGISTRATION", "title": "Online registration", "start_date": "2026-08-17", "end_date": "2026-09-11", "audience": "All"},
        headers=admin,
    )
    assert res.status_code == 201, res.text
    item = res.json()
    # Kigali is UTC+2: stored as local midnight, read back as the same calendar days.
    assert (item["start_date"], item["end_date"], item["audience"]) == ("2026-08-17", "2026-09-11", None)

    listed = (await client.get(f"{BASE}/academic-periods/{year['id']}/calendar-events", headers=admin)).json()
    assert [e["title"] for e in listed] == ["Online registration"]

    outside = await client.post(
        f"{BASE}/academic-periods/{year['id']}/calendar-events",
        json={"kind": "OTHER", "title": "Too late", "start_date": "2027-09-01"},
        headers=admin,
    )
    assert outside.status_code == 422

    patched = await client.patch(
        f"{BASE}/calendar-events/{item['id']}", json={"audience": "Year 3", "end_date": "2026-09-04"}, headers=admin
    )
    assert patched.json()["audience"] == "Year 3" and patched.json()["end_date"] == "2026-09-04"

    assert (await client.delete(f"{BASE}/calendar-events/{item['id']}", headers=admin)).status_code == 204
    assert (await client.get(f"{BASE}/academic-periods/{year['id']}/calendar-events", headers=admin)).json() == []

    periods = (await client.get(f"{BASE}/academic-periods?institution_id={inst.id}", headers=admin)).json()
    assert periods[0]["event_count"] == 0


def _draft(inst_id: str, *, bad_semester: bool = False) -> dict:
    return {
        "institution_id": inst_id,
        "draft": {
            "year_name": "2026-2027",
            "year_start": "2026-08-17",
            "year_end": "2027-07-27",
            "semesters": [
                {"name": "Semester 1 2026-2027", "period_type": "SEMESTER", "start_date": "2026-09-01", "end_date": "2026-12-18"},
                {
                    "name": "Semester 2 2026-2027",
                    "period_type": "SEMESTER",
                    "start_date": "2027-01-04",
                    "end_date": "2028-06-04" if bad_semester else "2027-06-04",
                },
            ],
            "events": [
                {"semester": None, "kind": "REGISTRATION", "title": "Online registration", "start_date": "2026-08-17", "end_date": "2026-09-11"},
                {"semester": "Semester 1 2026-2027", "kind": "HOLIDAY", "title": "Students' holiday", "start_date": "2026-12-21", "end_date": "2027-01-01", "audience": "All"},
                {"semester": "Semester 2 2026-2027", "kind": "PLACEMENT", "title": "Industrial attachment", "start_date": "2027-01-11", "end_date": "2027-03-05", "audience": "Year 3"},
            ],
        },
    }


async def test_applying_a_draft_builds_the_year_semesters_and_dates(client: AsyncClient, admin, inst) -> None:
    res = await client.post(f"{BASE}/calendar/apply", json=_draft(str(inst.id)), headers=admin)
    assert res.status_code == 201, res.text
    assert res.json()["event_count"] == 3 and len(res.json()["semester_ids"]) == 2

    periods = (await client.get(f"{BASE}/academic-periods?institution_id={inst.id}", headers=admin)).json()
    by_name = {p["name"]: p for p in periods}
    year = by_name["2026-2027"]
    # Registration and the holiday (which starts after Semester 1's teaching ends) sit on the year.
    assert year["parent_id"] is None and year["event_count"] == 2
    s1 = by_name["Semester 1 2026-2027"]
    assert s1["parent_id"] == year["id"] and s1["event_count"] == 0
    assert by_name["Semester 2 2026-2027"]["event_count"] == 1


async def test_a_failing_draft_leaves_nothing_behind(client: AsyncClient, admin, inst) -> None:
    res = await client.post(f"{BASE}/calendar/apply", json=_draft(str(inst.id), bad_semester=True), headers=admin)
    assert res.status_code == 422, res.text
    periods = (await client.get(f"{BASE}/academic-periods?institution_id={inst.id}", headers=admin)).json()
    assert periods == []


async def test_applying_twice_is_a_readable_conflict(client: AsyncClient, admin, inst) -> None:
    assert (await client.post(f"{BASE}/calendar/apply", json=_draft(str(inst.id)), headers=admin)).status_code == 201
    again = await client.post(f"{BASE}/calendar/apply", json=_draft(str(inst.id)), headers=admin)
    assert again.status_code == 409
    assert "2026-2027" in again.json()["error"]["message"]


def _pdf_with_text() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    for line in range(30):
        page.insert_text((40, 40 + line * 20), "ACADEMIC CALENDAR 2026/2027 Teaching and assessment")
    return doc.tobytes()


async def test_preview_and_extract_read_a_file_without_saving(client: AsyncClient, admin, monkeypatch) -> None:
    files = {"file": ("calendar.pdf", io.BytesIO(_pdf_with_text()), "application/pdf")}
    res = await client.post(f"{BASE}/calendar/preview", files=files, data={"rotation": "0"}, headers=admin)
    assert res.status_code == 200, res.text
    assert res.json()["pages"] == 1 and res.json()["has_text_layer"] is True and res.json()["image_base64"]

    async def fake_groq(model, images, text):  # the model call is replaced; everything else is real
        assert text and "Teaching and assessment" in text
        return '{"academic_year_label":"2026/2027","rows":[{"section":"SEMESTER 1","period_text":"Tue 01/09/2026 - Fri 18/12/2026","activity":"Teaching and assessment","audience":"All"},{"section":"SEMESTER 1","period_text":"Mon 21/12/2026 - Fri 01/01/2027","activity":"Students holiday","audience":null}]}'

    monkeypatch.setattr(importer, "_groq", fake_groq)
    monkeypatch.setattr(importer.settings, "GEMINI_API_KEY", "")
    monkeypatch.setattr(importer.settings, "GROQ_API_KEY", "test")
    files = {"file": ("calendar.pdf", io.BytesIO(_pdf_with_text()), "application/pdf")}
    out = await client.post(f"{BASE}/calendar/extract", files=files, data={"rotation": "0"}, headers=admin)
    assert out.status_code == 200, out.text
    draft = CalendarDraft.model_validate(out.json())
    assert draft.semesters[0].name == "Semester 1 2026-2027"
    assert [e.kind.value for e in draft.events] == ["HOLIDAY"]


async def test_student_sees_the_running_semester_its_year_and_next_dates(
    client: AsyncClient, admin, inst, db, make_auth_headers
) -> None:
    from datetime import date, timedelta

    today = date.today()
    year = await _period(
        client, admin, inst, "Year Now", "YEAR", str(today - timedelta(days=60)), str(today + timedelta(days=300))
    )
    await _period(
        client, admin, inst, "Sem Now", "SEMESTER", str(today - timedelta(days=30)), str(today + timedelta(days=90)), year["id"]
    )
    await client.post(
        f"{BASE}/academic-periods/{year['id']}/calendar-events",
        json={"kind": "EXAM_PERIOD", "title": "Special exams", "start_date": str(today + timedelta(days=20))},
        headers=admin,
    )
    await client.post(
        f"{BASE}/academic-periods/{year['id']}/calendar-events",
        json={"kind": "OTHER", "title": "Already over", "start_date": str(today - timedelta(days=10))},
        headers=admin,
    )

    student = User(id=uuid.uuid4(), email=f"st{uuid.uuid4().hex[:6]}@t.test", hashed_password="x", role=UserRole.STUDENT, status="ACTIVE", email_verified=True)
    db.add(student)
    await db.flush()
    db.add(UserProfile(user_id=student.id, first_name="Sam", last_name="Student", institution_id=inst.id))
    await db.flush()
    headers = make_auth_headers(user_id=str(student.id), role=UserRole.STUDENT, email=student.email)

    ctx = (await client.get("/api/v1/students/me/academic-context", headers=headers)).json()
    assert ctx["current_period"]["name"] == "Sem Now"
    assert ctx["current_period"]["year_name"] == "Year Now"
    assert [d["title"] for d in ctx["upcoming_dates"]] == ["Special exams"]


async def test_wrong_file_type_is_refused(client: AsyncClient, admin) -> None:
    files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
    res = await client.post(f"{BASE}/calendar/preview", files=files, data={"rotation": "0"}, headers=admin)
    assert res.status_code == 400


async def test_calendar_endpoints_need_an_admin(client: AsyncClient, db, make_auth_headers) -> None:
    user = User(id=uuid.uuid4(), email=f"s{uuid.uuid4().hex[:6]}@t.test", hashed_password="x", role=UserRole.STUDENT, status="ACTIVE", email_verified=True)
    db.add(user)
    await db.flush()
    headers = make_auth_headers(user_id=str(user.id), role=UserRole.STUDENT, email=user.email)
    files = {"file": ("calendar.pdf", io.BytesIO(_pdf_with_text()), "application/pdf")}
    assert (await client.post(f"{BASE}/calendar/extract", files=files, headers=headers)).status_code == 403
