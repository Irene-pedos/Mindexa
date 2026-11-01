"""Retrying the indexing of a lecturer material, and the gateway's patience with slow providers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai import gateway as gateway_module
from app.core.exceptions import ProviderTimeoutError
from app.db.enums import ResourceCategory, ResourceProcessingStatus, UserRole
from app.db.models.academic import Course, Department, Institution, TeachingAssignment
from app.db.models.auth import User, UserProfile
from app.db.models.resource import LecturerMaterial

pytestmark = pytest.mark.asyncio


async def _lecturer(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"mr{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="pw",
        role=UserRole.LECTURER,
        status="ACTIVE",
        email_verified=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserProfile(user_id=user.id, first_name="Lena", last_name="Lecturer"))
    await db.flush()
    return user


async def _material(
    client: AsyncClient, db: AsyncSession, make_auth_headers, *, status: ResourceProcessingStatus
):
    inst = Institution(name="Retry College", code=f"RC{uuid.uuid4().hex[:6]}")
    db.add(inst)
    await db.flush()
    dept = Department(institution_id=inst.id, name="Computing", code="CMP")
    db.add(dept)
    await db.flush()
    course = Course(
        institution_id=inst.id,
        department_id=dept.id,
        name="Algorithms",
        code="ALG101",
        academic_year="2026",
    )
    db.add(course)
    await db.flush()
    lecturer = await _lecturer(db)
    assignment = TeachingAssignment(
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_year="2026",
    )
    db.add(assignment)
    await db.flush()
    headers = make_auth_headers(user_id=str(lecturer.id), role=lecturer.role, email=lecturer.email)
    ws = (
        await client.post(
            "/api/v1/lecturers/me/workspaces/initialize",
            headers=headers,
            json={"teaching_assignment_id": str(assignment.id)},
        )
    ).json()
    material = LecturerMaterial(
        lecturer_id=lecturer.id,
        teaching_workspace_id=uuid.UUID(ws["id"]),
        course_id=course.id,
        original_filename="notes.pdf",
        safe_filename=f"{uuid.uuid4()}.pdf",
        file_path="lecturers/x/materials/notes.pdf",
        file_size_bytes=1234,
        file_extension=".pdf",
        mime_type="application/pdf",
        material_category=ResourceCategory.GENERAL,
        display_name="notes.pdf",
        version=1,
        is_current=True,
        processing_status=status,
        processing_error="The file was read but could not be indexed right now.",
        processing_progress=45,
        processing_stage="EMBEDDING",
    )
    db.add(material)
    await db.flush()
    return headers, material


@pytest.fixture
def queued(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    from app.workers.tasks import document_processing

    calls: list[str] = []
    monkeypatch.setattr(document_processing.process_uploaded_document, "delay", lambda rid: calls.append(rid))
    return calls


async def test_a_failed_material_can_be_retried_without_uploading_again(
    client: AsyncClient, db: AsyncSession, make_auth_headers, queued
) -> None:
    headers, material = await _material(client, db, make_auth_headers, status=ResourceProcessingStatus.FAILED)

    res = await client.post(
        f"/api/v1/resources/lecturer-materials/{material.id}/retry-processing", headers=headers
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["processing_status"] == "PENDING"
    assert body["processing_error"] is None
    assert body["processing_progress"] == 0
    assert body["processing_stage"] == "QUEUED"
    assert len(queued) == 1  # one indexing job, nothing re-uploaded


async def test_an_indexed_or_busy_material_is_not_retried(
    client: AsyncClient, db: AsyncSession, make_auth_headers, queued
) -> None:
    headers, material = await _material(client, db, make_auth_headers, status=ResourceProcessingStatus.PROCESSED)
    res = await client.post(
        f"/api/v1/resources/lecturer-materials/{material.id}/retry-processing", headers=headers
    )
    assert res.status_code == 422
    assert queued == []

    await db.execute(
        update(LecturerMaterial)
        .where(LecturerMaterial.id == material.id)
        .values(processing_status=ResourceProcessingStatus.PROCESSING, updated_at=datetime.now(UTC))
    )
    busy = await client.post(
        f"/api/v1/resources/lecturer-materials/{material.id}/retry-processing", headers=headers
    )
    assert busy.status_code == 422  # still working: leave it alone


async def test_a_material_stuck_for_ten_minutes_can_be_retried(
    client: AsyncClient, db: AsyncSession, make_auth_headers, queued
) -> None:
    headers, material = await _material(client, db, make_auth_headers, status=ResourceProcessingStatus.PROCESSING)
    await db.execute(
        update(LecturerMaterial)
        .where(LecturerMaterial.id == material.id)
        .values(updated_at=datetime.now(UTC) - timedelta(minutes=30))
    )
    await db.refresh(material)
    res = await client.post(
        f"/api/v1/resources/lecturer-materials/{material.id}/retry-processing", headers=headers
    )
    assert res.status_code == 200, res.text
    assert len(queued) == 1


async def test_only_the_owner_can_retry(
    client: AsyncClient, db: AsyncSession, make_auth_headers, queued
) -> None:
    _, material = await _material(client, db, make_auth_headers, status=ResourceProcessingStatus.FAILED)
    other = await _lecturer(db)
    other_headers = make_auth_headers(user_id=str(other.id), role=other.role, email=other.email)
    res = await client.post(
        f"/api/v1/resources/lecturer-materials/{material.id}/retry-processing", headers=other_headers
    )
    assert res.status_code == 404
    assert queued == []


async def test_listing_returns_progress_fields(
    client: AsyncClient, db: AsyncSession, make_auth_headers
) -> None:
    headers, material = await _material(client, db, make_auth_headers, status=ResourceProcessingStatus.PROCESSING)
    rows = (
        await client.get(
            f"/api/v1/resources/workspaces/{material.teaching_workspace_id}/materials", headers=headers
        )
    ).json()
    assert rows[0]["processing_progress"] == 45 and rows[0]["processing_stage"] == "EMBEDDING"


async def test_a_slow_provider_is_retried_before_giving_up(monkeypatch: pytest.MonkeyPatch) -> None:
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(gateway_module, "sleep", fake_sleep)

    class Flaky:
        name = "jina"

        def __init__(self) -> None:
            self.calls = 0

        async def embed(self, request):  # type: ignore[no-untyped-def]
            self.calls += 1
            if self.calls < 3:
                raise ProviderTimeoutError("slow")
            return "ok"

    flaky = Flaky()
    gw = gateway_module.AIGateway.__new__(gateway_module.AIGateway)
    gw.embedding_providers = [flaky]
    assert await gw._embed_with_retries(object()) == "ok"  # type: ignore[arg-type]
    assert flaky.calls == 3 and sleeps == [2.0, 4.0]

    class Dead(Flaky):
        async def embed(self, request):  # type: ignore[no-untyped-def]
            self.calls += 1
            raise ProviderTimeoutError("slow")

    dead = Dead()
    gw.embedding_providers = [dead]
    with pytest.raises(Exception, match="did not respond|slow"):
        await gw._embed_with_retries(object())  # type: ignore[arg-type]
    assert dead.calls == 3
