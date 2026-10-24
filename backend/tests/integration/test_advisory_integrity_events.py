"""
tests/integration/test_advisory_integrity_events.py

AI-extension / DevTools detections are client heuristics with false positives.
They must be recorded for supervisors but can never warn, flag or end an attempt —
even when the assessment's integrity policy would auto-submit an unknown event type.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.enums import AttemptStatus
from app.db.models.integrity import IntegrityEvent
from app.services.attempt_service import AttemptService
from tests.integration.test_security_leaks import _env, _h


@pytest.mark.asyncio
@pytest.mark.parametrize("event_type", ["AI_TOOL_SUSPECTED", "DEVTOOLS_SUSPECTED"])
async def test_advisory_events_are_recorded_but_never_penalised(
    client: AsyncClient, db, make_auth_headers, event_type: str
):
    env = await _env(db)
    # A hostile policy: if these events were evaluated like others, they would auto-submit.
    env["published"].integrity_monitoring_enabled = True
    env["published"].integrity_policy_json = {
        event_type.lower(): {"action": "AUTO_SUBMIT", "category": "Non-Tolerated"}
    }
    await db.commit()

    attempt = await AttemptService(db).start_attempt(
        student_id=env["student"].id, assessment_id=env["published"].id
    )
    await db.commit()
    hdrs = _h(make_auth_headers, env["student"])

    for _ in range(4):
        resp = await client.post(
            "/api/v1/integrity/event",
            headers=hdrs,
            json={
                "attempt_id": str(attempt.id),
                "access_token": str(attempt.access_token),
                "event_type": event_type,
                "metadata_json": {"source": "heuristic"},
            },
        )
        assert resp.status_code in (200, 201), resp.text
        body = resp.json()
        assert body["action_required"] == "LOG_ONLY", body
        assert not body.get("warning_issued"), body

    await db.refresh(attempt)
    assert attempt.status == AttemptStatus.IN_PROGRESS

    recorded = (
        await db.execute(
            select(func.count(IntegrityEvent.id)).where(
                IntegrityEvent.attempt_id == attempt.id,
                IntegrityEvent.event_type == event_type,
            )
        )
    ).scalar_one()
    assert recorded == 4
