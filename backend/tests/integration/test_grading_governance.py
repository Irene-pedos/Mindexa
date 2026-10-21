"""
tests/integration/test_grading_governance.py

Phase 2 of the journey audit — wrong grades & AI governance:
- a draft save never locks a grade
- final grades stay editable until release, then require grade moderation
- explicitly accepting an AI suggestion accepts its feedback draft
- release refuses AI grades accepted without human review (unless a verified
  sample check covers the assessment, spec §9.6)
- a released result can be withdrawn (audited)
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.constants import UserRole
from app.db.enums import GradingMode, SampleCheckStatus
from app.db.models.attempt import SubmissionGrade
from app.db.models.marking import AIGradeSampleCheck
from app.db.models.result import AssessmentResult
# Aliased so pytest does not collect (and re-run) that class's tests here
from tests.integration.test_moderation_and_calculation_guards import (
    TestModerationAndCalculationGuards as _GuardsSetup,
)

AI_DRAFT = "Good analysis; mention the heap-based priority queue explicitly."


async def _env(db) -> dict:
    data = await _GuardsSetup()._setup_data(db)
    for key in ("r1", "r2"):
        resp = data[key]
        db.add(SubmissionGrade(
            attempt_id=data["attempt"].id, response_id=resp.id, question_id=resp.question_id,
            student_id=data["student"].id, assessment_id=data["assessment"].id,
            max_score=10.0, grading_mode=GradingMode.SEMI, is_final=False, is_current=True,
            ai_suggested_score=8.0, ai_feedback_draft=AI_DRAFT,
            created_by_id=data["lecturer"].id,
        ))
    await db.commit()
    return data


def _h(make_auth_headers, user) -> dict[str, str]:
    return make_auth_headers(user_id=str(user.id), role=UserRole.LECTURER, email=user.email)


async def _grade(db, response_id) -> SubmissionGrade:
    # populate_existing reloads the row without expiring the setup objects
    return (
        await db.execute(
            select(SubmissionGrade)
            .where(SubmissionGrade.response_id == response_id, SubmissionGrade.is_current.is_(True))
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _manual(client, hdrs, response_id, score, is_final=True, duration=30):
    return await client.post("/api/v1/grading/manual", headers=hdrs, json={
        "response_id": str(response_id), "score": score, "is_final": is_final,
        "review_duration_seconds": duration,
    })


@pytest.mark.asyncio
async def test_draft_save_never_locks_grade(client: AsyncClient, db, make_auth_headers):
    env = await _env(db)
    resp = await _manual(client, _h(make_auth_headers, env["lecturer"]), env["r1"].id, 5, is_final=False)
    assert resp.status_code == 200, resp.text
    grade = await _grade(db, env["r1"].id)
    assert grade.is_final is False
    assert grade.score == 5


@pytest.mark.asyncio
async def test_final_grade_editable_until_release_then_409(client: AsyncClient, db, make_auth_headers):
    env = await _env(db)
    hdrs = _h(make_auth_headers, env["lecturer"])

    assert (await _manual(client, hdrs, env["r1"].id, 5)).status_code == 200
    # Correction before release is applied (was silently ignored before)
    assert (await _manual(client, hdrs, env["r1"].id, 7)).status_code == 200
    # A later draft save (e.g. autosave) keeps the grade final
    assert (await _manual(client, hdrs, env["r1"].id, 7, is_final=False)).status_code == 200
    grade = await _grade(db, env["r1"].id)
    assert grade.score == 7 and grade.is_final is True

    # Finish grading, release, then try to edit
    assert (await _manual(client, hdrs, env["r2"].id, 9)).status_code == 200
    release = await client.post("/api/v1/results/release", headers=hdrs, json={
        "assessment_id": str(env["assessment"].id),
    })
    assert release.status_code == 200, release.text
    assert release.json()["released_count"] == 1

    resp = await _manual(client, hdrs, env["r1"].id, 4)
    assert resp.status_code == 409, resp.text


@pytest.mark.asyncio
async def test_accepting_ai_suggestion_accepts_its_feedback_draft(
    client: AsyncClient, db, make_auth_headers
):
    env = await _env(db)
    resp = await client.post("/api/v1/grading/confirm-ai", headers=_h(make_auth_headers, env["lecturer"]), json={
        "response_id": str(env["r1"].id), "accept_ai_suggestion": True, "review_duration_seconds": 40,
    })
    assert resp.status_code == 200, resp.text
    grade = await _grade(db, env["r1"].id)
    assert grade.is_final is True
    assert grade.score == 8.0
    assert grade.feedback == AI_DRAFT


@pytest.mark.asyncio
async def test_release_blocks_unreviewed_ai_acceptance_until_sample_check(
    client: AsyncClient, db, make_auth_headers
):
    env = await _env(db)
    hdrs = _h(make_auth_headers, env["lecturer"])

    # r1 accepted from AI with no review evidence; r2 graded by hand
    resp = await client.post("/api/v1/grading/confirm-ai", headers=hdrs, json={
        "response_id": str(env["r1"].id), "accept_ai_suggestion": True,
    })
    assert resp.status_code == 200, resp.text
    assert (await _manual(client, hdrs, env["r2"].id, 9)).status_code == 200

    release = await client.post("/api/v1/results/release", headers=hdrs, json={
        "assessment_id": str(env["assessment"].id),
    })
    assert release.status_code == 200, release.text
    body = release.json()
    assert body["released_count"] == 0
    assert body["unreviewed_count"] == 1

    verify = await client.get(f"/api/v1/grading/attempt/{env['attempt'].id}/verify", headers=hdrs)
    assert verify.status_code == 200 and verify.json()["unreviewed_bulk_count"] == 1

    # A verified sample check legitimises bulk-style acceptance (spec §9.6)
    db.add(AIGradeSampleCheck(
        assessment_id=env["assessment"].id, lecturer_id=env["lecturer"].id, sample_size=1,
        sampled_review_ids=[], checked_count=1, agreement_rate=1.0,
        status=SampleCheckStatus.VERIFIED,
    ))
    await db.commit()
    release = await client.post("/api/v1/results/release", headers=hdrs, json={
        "assessment_id": str(env["assessment"].id),
    })
    assert release.json()["released_count"] == 1, release.text


@pytest.mark.asyncio
async def test_released_result_can_be_withdrawn(client: AsyncClient, db, make_auth_headers):
    env = await _env(db)
    hdrs = _h(make_auth_headers, env["lecturer"])
    assert (await _manual(client, hdrs, env["r1"].id, 6)).status_code == 200
    assert (await _manual(client, hdrs, env["r2"].id, 6)).status_code == 200
    await client.post("/api/v1/results/release", headers=hdrs, json={
        "assessment_id": str(env["assessment"].id),
    })

    result = (
        await db.execute(
            select(AssessmentResult)
            .where(AssessmentResult.attempt_id == env["attempt"].id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert result.is_released is True

    short = await client.post(f"/api/v1/results/{result.id}/unrelease", headers=hdrs, json={"reason": "oops"})
    assert short.status_code == 422

    resp = await client.post(f"/api/v1/results/{result.id}/unrelease", headers=hdrs, json={
        "reason": "Released before the second marker finished checking.",
    })
    assert resp.status_code == 200, resp.text
    await db.refresh(result)
    assert result.is_released is False
