"""
tests/integration/test_attempt_session.py

Phase 3 of the journey audit — attempt session integrity:
- a submit well after the deadline is recorded as an automatic submission
- the session token can be re-issued to the owning student (reclaim), subject
  to the same resume policy, and the old token stops working
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import AsyncClient

from app.core.exceptions import AuthorizationError
from app.db.base import utcnow
from app.db.enums import AttemptStatus
from app.services.attempt_service import (
    SUBMIT_LATENCY_TOLERANCE_SECONDS,
    AttemptService,
)
from tests.integration.test_security_leaks import _env, _h


async def _started(db, env, *, allow_resume: bool):
    env["published"].allow_resume = allow_resume
    await db.commit()
    attempt = await AttemptService(db).start_attempt(
        student_id=env["student"].id, assessment_id=env["published"].id
    )
    await db.commit()
    return attempt


@pytest.mark.asyncio
async def test_required_flag_reaches_the_student_and_defaults_to_optional(
    client: AsyncClient, db, make_auth_headers
):
    from sqlalchemy import select

    from app.db.models.question import AssessmentQuestion

    env = await _env(db)
    links = (
        await db.execute(
            select(AssessmentQuestion).where(AssessmentQuestion.assessment_id == env["published"].id)
        )
    ).scalars().all()
    assert all(aq.is_required is False for aq in links)  # lecturers opt in
    required_question_id = str(links[0].question_id)
    links[0].is_required = True
    await db.commit()

    attempt = await _started(db, env, allow_resume=False)
    resp = await client.get(f"/api/v1/attempts/{attempt.id}", headers=_h(make_auth_headers, env["student"]))
    assert resp.status_code == 200, resp.text
    flags = {q["id"]: q["is_required"] for q in resp.json()["questions"]}
    assert flags[required_question_id] is True
    assert sum(flags.values()) == 1


@pytest.mark.asyncio
async def test_choice_section_selection_flow(client: AsyncClient, db, make_auth_headers):
    """'Answer 1 of 2' section: payload exposes the limit, the server enforces it."""
    from sqlalchemy import select

    from app.db.models.assessment import AssessmentSection
    from app.db.models.question import AssessmentQuestion

    env = await _env(db)
    section = AssessmentSection(
        assessment_id=env["published"].id, title="Section B", order_index=0,
        allocated_marks=10, questions_to_answer=1,
    )
    db.add(section)
    await db.flush()
    links = (
        await db.execute(
            select(AssessmentQuestion).where(AssessmentQuestion.assessment_id == env["published"].id)
        )
    ).scalars().all()
    for aq in links:
        aq.assessment_section_id = section.id
    first, second = [str(aq.question_id) for aq in links]
    await db.commit()

    attempt = await _started(db, env, allow_resume=False)
    hdrs = _h(make_auth_headers, env["student"])
    base = f"/api/v1/attempts/{attempt.id}"

    detail = (await client.get(base, headers=hdrs)).json()
    assert {q["section_questions_to_answer"] for q in detail["questions"]} == {1}
    assert detail["selected_question_ids"] == []

    ok = await client.post(f"{base}/sections/{section.id}/select", headers=hdrs, json={"question_id": first})
    assert ok.status_code == 201, ok.text

    # N = 1: choosing a second question is refused by the server
    over = await client.post(f"{base}/sections/{section.id}/select", headers=hdrs, json={"question_id": second})
    assert over.status_code == 400, over.text
    assert "CHOICE_LIMIT_EXCEEDED" in over.text

    assert (await client.get(base, headers=hdrs)).json()["selected_question_ids"] == [first]

    removed = await client.delete(f"{base}/questions/{first}/select", headers=hdrs)
    assert removed.status_code == 204, removed.text
    assert (await client.get(base, headers=hdrs)).json()["selected_question_ids"] == []


@pytest.mark.asyncio
async def test_submit_within_latency_tolerance_is_a_normal_submission(db):
    env = await _env(db)
    attempt = await _started(db, env, allow_resume=False)
    attempt.expires_at = utcnow() - timedelta(seconds=SUBMIT_LATENCY_TOLERANCE_SECONDS // 2)
    await db.commit()

    submitted = await AttemptService(db).submit_attempt(
        attempt_id=attempt.id, student_id=env["student"].id, access_token=attempt.access_token
    )
    assert submitted.status == AttemptStatus.SUBMITTED


@pytest.mark.asyncio
async def test_submit_long_after_deadline_is_recorded_as_auto_submitted(db):
    env = await _env(db)
    attempt = await _started(db, env, allow_resume=False)
    attempt.expires_at = utcnow() - timedelta(minutes=10)
    await db.commit()

    submitted = await AttemptService(db).submit_attempt(
        attempt_id=attempt.id, student_id=env["student"].id, access_token=attempt.access_token
    )
    assert submitted.status == AttemptStatus.AUTO_SUBMITTED


@pytest.mark.asyncio
async def test_owner_can_reclaim_token_and_old_token_is_invalidated(
    client: AsyncClient, db, make_auth_headers
):
    env = await _env(db)
    attempt = await _started(db, env, allow_resume=True)
    old_token = attempt.access_token

    resp = await client.post(
        f"/api/v1/attempts/{attempt.id}/reclaim", headers=_h(make_auth_headers, env["student"])
    )
    assert resp.status_code == 200, resp.text
    new_token = resp.json()["access_token"]
    assert new_token != str(old_token)

    # The previous session can no longer act on the attempt
    with pytest.raises(AuthorizationError):
        await AttemptService(db).validate_active_attempt(
            attempt_id=attempt.id, student_id=env["student"].id, access_token=old_token
        )


@pytest.mark.asyncio
async def test_reclaim_is_owner_only_and_respects_resume_policy(
    client: AsyncClient, db, make_auth_headers
):
    env = await _env(db)
    attempt = await _started(db, env, allow_resume=False)

    # Resume disabled (supervised-style assessment): even the owner is refused
    resp = await client.post(
        f"/api/v1/attempts/{attempt.id}/reclaim", headers=_h(make_auth_headers, env["student"])
    )
    assert resp.status_code in (401, 403), resp.text

    env["published"].allow_resume = True
    await db.commit()

    # Another student can never take over the attempt
    resp = await client.post(
        f"/api/v1/attempts/{attempt.id}/reclaim", headers=_h(make_auth_headers, env["stranger"])
    )
    assert resp.status_code in (401, 403), resp.text
