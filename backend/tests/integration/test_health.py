"""
tests/integration/test_health.py

Integration tests for the /health endpoints.
These hit the full HTTP stack via the async test client.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestLiveness:

    async def test_returns_200(self, client: AsyncClient):
        response = await client.get("/health/live")
        assert response.status_code == 200

    async def test_response_shape(self, client: AsyncClient):
        body = (await client.get("/health/live")).json()
        assert body["status"] == "alive"

    async def test_no_auth_required(self, client: AsyncClient):
        response = await client.get("/health/live")
        assert response.status_code not in (401, 403)

    async def test_request_id_header_present(self, client: AsyncClient):
        response = await client.get("/health/live")
        assert "x-request-id" in response.headers

    async def test_security_headers_present(self, client: AsyncClient):
        response = await client.get("/health/live")
        assert response.headers.get("x-content-type-options") == "nosniff"
        assert response.headers.get("x-frame-options") == "DENY"


@pytest.mark.asyncio
class TestReadiness:

    async def test_returns_valid_status_code(self, client: AsyncClient):
        response = await client.get("/health/ready")
        # 200 = fully ready, 503 = degraded — both are valid responses
        assert response.status_code in (200, 503)

    async def test_response_contains_checks(self, client: AsyncClient):
        body = (await client.get("/health/ready")).json()
        assert "status" in body
        assert "database" in body
        assert "redis" in body
        assert "status" in body["database"]
        assert "status" in body["redis"]

    async def test_check_values_are_ok_or_degraded(self, client: AsyncClient):
        body = (await client.get("/health/ready")).json()
        for check_value in (body["database"]["status"], body["redis"]["status"]):
            assert check_value in ("ok", "degraded")

    async def test_no_auth_required(self, client: AsyncClient):
        response = await client.get("/health/ready")
        assert response.status_code not in (401, 403)
