"""Regressions from the access-control audit: ownership checks, public file exposure, metrics key."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.main import app
from app.services.lecturer_service import LecturerService
from app.services.resource_service import ResourceService


def _workspace(owner_id, course_id=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        course_id=course_id or uuid.uuid4(),
        teaching_assignment=SimpleNamespace(lecturer_id=owner_id),
    )


class TestLecturerWorkspaceOwnership:
    @pytest.mark.asyncio
    async def test_other_lecturers_workspace_looks_like_it_does_not_exist(self):
        service = LecturerService(AsyncMock())
        service.workspace_repo = MagicMock(get_by_id=AsyncMock(return_value=_workspace(uuid.uuid4())))

        with pytest.raises(NotFoundError):
            await service._get_owned_workspace(uuid.uuid4(), uuid.uuid4())

    @pytest.mark.asyncio
    async def test_owner_gets_the_workspace(self):
        owner = uuid.uuid4()
        ws = _workspace(owner)
        service = LecturerService(AsyncMock())
        service.workspace_repo = MagicMock(get_by_id=AsyncMock(return_value=ws))

        assert await service._get_owned_workspace(owner, ws.id) is ws


class TestMaterialUploadOwnership:
    def _metadata(self, workspace_id, course_id=None, assessment_id=None):
        return SimpleNamespace(
            teaching_workspace_id=workspace_id, course_id=course_id, assessment_id=assessment_id
        )

    @pytest.mark.asyncio
    async def test_lecturer_cannot_upload_into_someone_elses_workspace(self):
        ws = _workspace(uuid.uuid4())
        service = ResourceService(AsyncMock())
        with patch("app.services.resource_service.WorkspaceRepository") as repo:
            repo.return_value.get_by_id = AsyncMock(return_value=ws)
            with pytest.raises(AuthorizationError):
                await service.assert_can_manage_workspace_material(uuid.uuid4(), self._metadata(ws.id))

    @pytest.mark.asyncio
    async def test_course_must_match_the_workspace(self):
        owner = uuid.uuid4()
        ws = _workspace(owner)
        service = ResourceService(AsyncMock())
        with patch("app.services.resource_service.WorkspaceRepository") as repo:
            repo.return_value.get_by_id = AsyncMock(return_value=ws)
            with pytest.raises(ValidationError):
                await service.assert_can_manage_workspace_material(
                    owner, self._metadata(ws.id, course_id=uuid.uuid4())
                )

    @pytest.mark.asyncio
    async def test_owner_with_matching_course_is_allowed(self):
        owner = uuid.uuid4()
        ws = _workspace(owner)
        service = ResourceService(AsyncMock())
        with patch("app.services.resource_service.WorkspaceRepository") as repo:
            repo.return_value.get_by_id = AsyncMock(return_value=ws)
            await service.assert_can_manage_workspace_material(
                owner, self._metadata(ws.id, course_id=ws.course_id)
            )


class TestHttpSurface:
    client = TestClient(app, raise_server_exceptions=False)

    def test_private_upload_folders_are_not_served_statically(self):
        for path in (
            "/uploads/lecturers/00000000-0000-0000-0000-000000000000/materials/x.pdf",
            "/uploads/students/00000000-0000-0000-0000-000000000000/resources/x.pdf",
            "/uploads/submissions/a/b/x.pdf",
        ):
            assert self.client.get(path).status_code == 404

    def test_unprefixed_duplicate_routes_are_gone(self):
        assert self.client.get("/admin/eligibility-policy").status_code == 404
        assert self.client.get("/moderation/queue").status_code == 404

    def test_catalog_and_profile_lookups_require_login(self):
        for path in (
            "/api/v1/academic-hierarchy/institutions",
            "/api/v1/lecturers/institutions",
            "/api/v1/integrity/profiles",
        ):
            assert self.client.get(path).status_code in (401, 403), path

    def test_metrics_need_the_key_when_one_is_configured(self, monkeypatch):
        monkeypatch.setattr(settings, "METRICS_API_KEY", "s3cret")
        assert self.client.get("/api/v1/metrics").status_code == 403
        assert self.client.get("/api/v1/metrics", headers={"X-Metrics-Key": "wrong"}).status_code == 403
