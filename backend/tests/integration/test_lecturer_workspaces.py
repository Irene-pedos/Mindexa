"""
Lecturer assignments -> workspace flow: the assignments list exposes the linked workspace,
initializing validates the course, and the roster shows real progress.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import UserRole
from app.db.models.academic import Course, Department, Institution, TeachingAssignment
from app.db.models.auth import User, UserProfile


async def _lecturer(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"lw{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="pw",
        role=UserRole.LECTURER,
        status="ACTIVE",
        email_verified=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserProfile(user_id=user.id, first_name="Ada", last_name="Lecturer"))
    await db.flush()
    return user


async def _setup(db: AsyncSession, *, with_course: bool = True, course_active: bool = True):
    inst = Institution(name="LW College", code=f"LW{uuid.uuid4().hex[:6]}")
    db.add(inst)
    await db.flush()
    dept = Department(institution_id=inst.id, name="Computing", code="CMP")
    db.add(dept)
    await db.flush()
    course = None
    if with_course:
        course = Course(
            institution_id=inst.id,
            department_id=dept.id,
            name="Algorithms",
            code="ALG101",
            academic_year="2026",
            is_active=course_active,
        )
        db.add(course)
        await db.flush()
    lecturer = await _lecturer(db)
    assignment = TeachingAssignment(
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id if course else None,
        academic_year="2026",
    )
    db.add(assignment)
    await db.flush()
    return lecturer, assignment


def _hdrs(make_auth_headers, user: User) -> dict[str, str]:
    return make_auth_headers(user_id=str(user.id), role=user.role, email=user.email)


@pytest.mark.asyncio
async def test_assignments_list_exposes_workspace_once_initialized(
    client: AsyncClient, db: AsyncSession, make_auth_headers
) -> None:
    lecturer, assignment = await _setup(db)
    headers = _hdrs(make_auth_headers, lecturer)

    rows = (await client.get("/api/v1/lecturers/me/assignments", headers=headers)).json()
    assert len(rows) == 1
    assert rows[0]["workspace_id"] is None

    created = await client.post(
        "/api/v1/lecturers/me/workspaces/initialize",
        headers=headers,
        json={
            "teaching_assignment_id": str(assignment.id),
            "banner_image_url": "https://example.com/b.png",
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["banner_image_url"] == "https://example.com/b.png"
    assert body["department_name"] == "Computing"
    assert body["teaching_assignment_id"] == str(assignment.id)

    rows = (await client.get("/api/v1/lecturers/me/assignments", headers=headers)).json()
    assert rows[0]["workspace_id"] == body["id"]

    again = await client.post(
        "/api/v1/lecturers/me/workspaces/initialize",
        headers=headers,
        json={"teaching_assignment_id": str(assignment.id)},
    )
    assert again.status_code == 422


@pytest.mark.asyncio
async def test_initialize_rejects_assignment_without_course(
    client: AsyncClient, db: AsyncSession, make_auth_headers
) -> None:
    lecturer, assignment = await _setup(db, with_course=False)
    resp = await client.post(
        "/api/v1/lecturers/me/workspaces/initialize",
        headers=_hdrs(make_auth_headers, lecturer),
        json={"teaching_assignment_id": str(assignment.id)},
    )
    assert resp.status_code == 422
    assert "course" in resp.text.lower()


@pytest.mark.asyncio
async def test_initialize_rejects_suspended_course(
    client: AsyncClient, db: AsyncSession, make_auth_headers
) -> None:
    lecturer, assignment = await _setup(db, course_active=False)
    resp = await client.post(
        "/api/v1/lecturers/me/workspaces/initialize",
        headers=_hdrs(make_auth_headers, lecturer),
        json={"teaching_assignment_id": str(assignment.id)},
    )
    assert resp.status_code == 422
    assert "suspended" in resp.text.lower()
