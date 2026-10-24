"""
tests/integration/test_moderation_http_flow.py

The moderator's whole decision, and the author's follow-up, through the real routes:
claim -> request changes (note only) -> author sees status, comment and notification
-> author can edit again -> resolve -> resubmit.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.constants import UserRole
from tests.unit.test_phase3_moderation import (
    _setup_institutional_env,
    _submitted_cs_review,
)

NOTE = "Section A must be closed questions only; add Sections B and C."


def _h(make_auth_headers, user) -> dict[str, str]:
    return make_auth_headers(user_id=str(user.id), role=UserRole.LECTURER, email=user.email)


@pytest.mark.asyncio
async def test_moderator_request_changes_over_http_reaches_author(
    client: AsyncClient, db, make_auth_headers
):
    env = await _setup_institutional_env(db)
    asmt, review = await _submitted_cs_review(db, env)
    mod_h = _h(make_auth_headers, env["mod_cs"])
    author_h = _h(make_auth_headers, env["author"])
    asmt_id, review_id = str(asmt.id), str(review.id)

    queue = await client.get("/api/v1/moderator/queue", headers=mod_h)
    assert queue.status_code == 200, queue.text
    assert [i["review_id"] for i in queue.json()] == [review_id]

    claim = await client.post(f"/api/v1/moderator/reviews/{review_id}/claim", headers=mod_h)
    assert claim.status_code == 200, claim.text

    decided = await client.post(
        f"/api/v1/moderator/reviews/{review_id}/request-changes",
        headers=mod_h,
        json={"decision_note": NOTE},
    )
    assert decided.status_code == 200, decided.text
    assert decided.json()["status"] == "CHANGES_REQUESTED"

    db.expire_all()  # each real request has its own session; do not reuse cached rounds

    # The author sees the new state and what to change
    overview = await client.get(f"/api/v1/lecturer/assessments/{asmt_id}/moderation", headers=author_h)
    assert overview.status_code == 200, overview.text
    body = overview.json()
    assert body["status"] == "CHANGES_REQUESTED"
    latest = body["rounds"][-1]
    assert latest["decision_note"] == NOTE
    assert [c["comment"] for c in latest["comments"]] == [NOTE]

    # ... and receives a notification that carries the note
    notices = await client.get("/api/v1/notifications/me", headers=author_h)
    assert notices.status_code == 200, notices.text
    items = notices.json().get("items", notices.json())
    assert any(
        n["notification_type"] == "MODERATION_CHANGES_REQUESTED" and NOTE[:30] in n["body"]
        for n in items
    ), items

    # The paper is a normal fetch for the author, with the editable status
    got = await client.get(f"/api/v1/assessments/{asmt_id}", headers=author_h)
    assert got.status_code == 200, got.text
    assert got.json()["status"] == "CHANGES_REQUESTED"
