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


async def _review_row_count(db, response_id) -> int:
    from sqlalchemy import func

    from app.db.models.ai import AIGradeReview

    return (
        await db.execute(
            select(func.count(AIGradeReview.id)).where(AIGradeReview.response_id == response_id)
        )
    ).scalar_one()


@pytest.mark.asyncio
async def test_reviewed_ai_grade_stays_releasable_after_autosave_style_resaves(
    client: AsyncClient, db, make_auth_headers
):
    """
    Regression: every save used to add an audit row, and autosave records no review
    duration, so a grade the lecturer DID review was flagged "accepted without review".
    """
    env = await _env(db)
    hdrs = _h(make_auth_headers, env["lecturer"])

    # Reviewed acceptance (duration recorded), then re-saves that carry no duration.
    resp = await client.post("/api/v1/grading/confirm-ai", headers=hdrs, json={
        "response_id": str(env["r1"].id), "accept_ai_suggestion": True, "review_duration_seconds": 40,
    })
    assert resp.status_code == 200, resp.text
    for _ in range(3):
        resp = await client.post("/api/v1/grading/manual", headers=hdrs, json={
            "response_id": str(env["r1"].id), "score": 8, "is_final": False,
        })
        assert resp.status_code == 200, resp.text
    assert (await _manual(client, hdrs, env["r2"].id, 9)).status_code == 200

    # One audit row, with its review duration intact.
    assert await _review_row_count(db, env["r1"].id) == 1

    verify = await client.get(f"/api/v1/grading/attempt/{env['attempt'].id}/verify", headers=hdrs)
    assert verify.status_code == 200
    assert verify.json()["unreviewed_bulk_count"] == 0
    assert verify.json()["unreviewed_question_ids"] == []

    release = await client.post("/api/v1/results/release", headers=hdrs, json={
        "assessment_id": str(env["assessment"].id),
    })
    assert release.status_code == 200, release.text
    assert release.json()["unreviewed_count"] == 0
    assert release.json()["released_count"] == 1


@pytest.mark.asyncio
async def test_unreviewed_ai_grade_is_identified_by_question_and_cleared_by_confirming(
    client: AsyncClient, db, make_auth_headers
):
    env = await _env(db)
    hdrs = _h(make_auth_headers, env["lecturer"])

    # Accepted with no review evidence at all
    resp = await client.post("/api/v1/grading/confirm-ai", headers=hdrs, json={
        "response_id": str(env["r1"].id), "accept_ai_suggestion": True,
    })
    assert resp.status_code == 200, resp.text
    assert (await _manual(client, hdrs, env["r2"].id, 9)).status_code == 200

    # The lecturer is told exactly which question blocks release
    verify = await client.get(f"/api/v1/grading/attempt/{env['attempt'].id}/verify", headers=hdrs)
    assert verify.json()["unreviewed_question_ids"] == [str(env["r1"].question_id)]

    # ...and the release queue says so instead of offering a Publish that would be refused
    from app.db.models.assessment import AssessmentTargetSection

    db.add(AssessmentTargetSection(
        assessment_id=env["assessment"].id, class_section_id=env["section"].id,
    ))
    await db.commit()
    queue = await client.get(
        f"/api/v1/results/assessment/{env['assessment'].id}/release-queue",
        params={"class_section_id": str(env["section"].id)}, headers=hdrs,
    )
    assert queue.status_code == 200, queue.text
    row = next(i for i in queue.json()["items"] if i["attempt_id"] == str(env["attempt"].id))
    assert row["status"] == "NEEDS_REVIEW"
    assert row["can_release"] is False
    assert row["unreviewed_question_ids"] == [str(env["r1"].question_id)]

    # Confirming it after actually reviewing it (a recorded duration) clears the block
    resp = await client.post("/api/v1/grading/confirm-ai", headers=hdrs, json={
        "response_id": str(env["r1"].id), "accept_ai_suggestion": True, "review_duration_seconds": 25,
    })
    assert resp.status_code == 200, resp.text
    assert await _review_row_count(db, env["r1"].id) == 1  # updated, not stacked

    verify = await client.get(f"/api/v1/grading/attempt/{env['attempt'].id}/verify", headers=hdrs)
    assert verify.json()["unreviewed_question_ids"] == []
    release = await client.post("/api/v1/results/release", headers=hdrs, json={
        "assessment_id": str(env["assessment"].id),
    })
    assert release.json()["released_count"] == 1, release.text


@pytest.mark.asyncio
async def test_grading_pass_queues_open_ended_answers_without_lazy_loading_sections(
    db, make_auth_headers
):
    """
    Regression: grade_attempt read `assessment.sections` from a lightweight load, which
    triggers an async lazy load (MissingGreenlet), aborted the task and rolled back every
    queued item, so submissions never reached the lecturer's grading queue.
    """
    from sqlalchemy import func

    from app.db.models.attempt import GradingQueueItem
    from app.services.grading_service import GradingService

    env = await _GuardsSetup()._setup_data(db)
    attempt_id, assessment_id, student_id = env["attempt"].id, env["assessment"].id, env["student"].id
    db.expunge_all()  # fresh identity map, like the Celery worker's new session

    counts = await GradingService(db).grade_attempt(
        attempt_id=attempt_id, assessment_id=assessment_id, student_id=student_id
    )
    await db.commit()

    queued = (
        await db.execute(
            select(func.count(GradingQueueItem.id)).where(GradingQueueItem.attempt_id == attempt_id)
        )
    ).scalar_one()
    assert counts["queued"] >= 1
    assert queued == counts["queued"]


async def _add_review(db, env, grade, decision, duration=None, response=None):
    from app.db.repositories.grading_repo import GradingRepository

    resp = response or env["r1"]
    return await GradingRepository(db).create_ai_grade_review(
        attempt_id=env["attempt"].id, assessment_id=env["assessment"].id,
        student_id=env["student"].id, response_id=resp.id, submission_grade_id=grade.id,
        ai_action_log_id=None, grading_decision=decision, ai_suggested_total=8.0,
        lecturer_final_total=8.0, score_delta=0.0, max_possible_score=10.0,
        lecturer_id=env["lecturer"].id, delegation_id=None, review_started_at=None,
        review_completed_at=None, review_duration_seconds=duration, lecturer_notes=None,
    )


@pytest.mark.asyncio
async def test_dedupe_ai_grade_reviews_keeps_latest_and_carries_review_time(db):
    from app.db.enums import AIGradeDecision
    from app.db.models.ai import AIGradeReview
    from app.db.repositories.grading_repo import GradingRepository

    env = await _env(db)
    g1, g2 = await _grade(db, env["r1"].id), await _grade(db, env["r2"].id)

    # g1: reviewed once (40s) and then re-saved twice by autosave (no duration)
    await _add_review(db, env, g1, AIGradeDecision.ACCEPTED, duration=40)
    await _add_review(db, env, g1, AIGradeDecision.ACCEPTED)
    latest = await _add_review(db, env, g1, AIGradeDecision.ACCEPTED)
    # g2: a live pending review next to a decided one must be left alone
    await _add_review(db, env, g2, AIGradeDecision.PENDING, response=env["r2"])
    await _add_review(db, env, g2, AIGradeDecision.ACCEPTED, response=env["r2"])
    await db.commit()
    latest_id = latest.id

    repo = GradingRepository(db)

    async def live(grade):
        return (
            await db.execute(
                select(AIGradeReview)
                .where(AIGradeReview.submission_grade_id == grade.id, AIGradeReview.is_deleted.is_(False))
                .execution_options(populate_existing=True)
            )
        ).scalars().all()

    # Preview changes nothing
    preview = await repo.dedupe_ai_grade_reviews(apply=False)
    assert preview == {"groups": 1, "removed": 2, "evidence_carried": 1, "skipped_pending": 1}
    assert len(await live(g1)) == 3

    applied = await repo.dedupe_ai_grade_reviews(apply=True)
    await db.commit()
    assert applied == preview

    kept = await live(g1)
    assert [r.id for r in kept] == [latest_id]
    assert kept[0].review_duration_seconds == 40  # evidence of review survived
    assert len(await live(g2)) == 2  # pending group untouched

    # Idempotent
    again = await repo.dedupe_ai_grade_reviews(apply=True)
    assert again["removed"] == 0


@pytest.mark.asyncio
async def test_a_click_through_review_does_not_count_as_a_review(
    client: AsyncClient, db, make_auth_headers
):
    """An AI grade 'reviewed' for 1 second is a click-through; 3+ seconds counts."""
    from app.db.repositories.grading_repo import MIN_REVIEW_SECONDS

    env = await _env(db)
    hdrs = _h(make_auth_headers, env["lecturer"])
    qid = str(env["r1"].question_id)

    async def accept(seconds):
        resp = await client.post("/api/v1/grading/confirm-ai", headers=hdrs, json={
            "response_id": str(env["r1"].id), "accept_ai_suggestion": True,
            "review_duration_seconds": seconds,
        })
        assert resp.status_code == 200, resp.text
        verify = await client.get(f"/api/v1/grading/attempt/{env['attempt'].id}/verify", headers=hdrs)
        return verify.json()["unreviewed_question_ids"]

    assert await accept(MIN_REVIEW_SECONDS - 1) == [qid]
    assert await accept(MIN_REVIEW_SECONDS) == []


@pytest.mark.asyncio
async def test_ai_review_outage_shows_a_friendly_message_without_provider_details(
    client: AsyncClient, db, make_auth_headers, monkeypatch
):
    from app.agents.grade_check_agent import GradeCheckAgent
    from app.core.exceptions import ServiceUnavailableError

    async def boom(self, **kwargs):
        raise ServiceUnavailableError("groq: Rate limit reached for model xyz (429) org_secret_123")

    monkeypatch.setattr(GradeCheckAgent, "check_grade", boom)
    monkeypatch.setattr(GradeCheckAgent, "check_attempt", boom)

    env = await _env(db)
    hdrs = _h(make_auth_headers, env["lecturer"])

    # The attempt review only sends answers that have a saved score
    for key in ("r1", "r2"):
        assert (await _manual(client, hdrs, env[key].id, 5, is_final=False)).status_code == 200

    single = await client.post(
        f"/api/v1/grading/response/{env['r1'].id}/review-grade", headers=hdrs, json={"score": 5}
    )
    whole = await client.post(f"/api/v1/grading/attempt/{env['attempt'].id}/review-attempt", headers=hdrs)

    for resp in (single, whole):
        assert resp.status_code == 503, resp.text
        assert "org_secret_123" not in resp.text and "groq" not in resp.text.lower()
        assert "try again" in resp.text.lower()
