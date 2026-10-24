"""
tests/integration/test_publish_and_listing_rules.py

Phase 4 of the journey audit — authoring list & publishing rules:
- a SUMMATIVE paper cannot be published without moderation + seal, even when the
  institution has no approval policy configured
- the assessment list can be filtered by grading mode (the lecturer UI relies on it)
- papers inside the moderation pipeline cannot be deleted
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.enums import AssessmentStatus, AssessmentType, GradingMode, QuestionType
from app.db.models.assessment import Assessment, AssessmentSection
from app.db.models.question import AssessmentQuestion, Question
from app.services.assessment_service import AssessmentService
from tests.integration.test_security_leaks import _env, _h


@pytest.mark.asyncio
async def test_summative_without_policy_cannot_be_published_unsealed(db):
    env = await _env(db)
    template = env["published"]
    lecturer = env["lecturer"]

    paper = Assessment(
        title="Final Exam",
        assessment_type=AssessmentType.SUMMATIVE,
        status=AssessmentStatus.DRAFT,
        created_by_id=lecturer.id,
        teaching_workspace_id=template.teaching_workspace_id,
        course_id=template.course_id,
        academic_year="2026",
        audience_type="all",
        total_marks=100,
    )
    db.add(paper)
    await db.flush()
    section = AssessmentSection(
        assessment_id=paper.id, title="Section 1", order_index=0,
        allocated_marks=100, question_count_target=1,
    )
    question = Question(
        content="Explain paging.", question_type=QuestionType.SHORT_ANSWER, created_by_id=lecturer.id
    )
    db.add_all([section, question])
    await db.flush()
    db.add(AssessmentQuestion(
        assessment_id=paper.id, assessment_section_id=section.id, question_id=question.id,
        marks_override=100, order_index=0,
    ))
    await db.commit()

    result = await AssessmentService(db).finalize_assessment(paper.id, lecturer)

    assert result.validation_passed is False
    assert any("moderation approval" in e for e in result.errors), result.errors
    await db.refresh(paper)
    assert paper.status == AssessmentStatus.DRAFT


@pytest.mark.asyncio
async def test_list_filters_by_grading_mode(client: AsyncClient, db, make_auth_headers):
    env = await _env(db)
    env["published"].grading_mode = GradingMode.SEMI
    env["pending"].grading_mode = GradingMode.MANUAL
    await db.commit()
    hdrs = _h(make_auth_headers, env["lecturer"])

    async def ids(mode: str) -> set[str]:
        resp = await client.get("/api/v1/assessments", headers=hdrs, params={"grading_mode": mode})
        assert resp.status_code == 200, resp.text
        return {a["id"] for a in resp.json()["items"]}

    assert await ids("AI_ASSISTED") == {str(env["published"].id)}  # UI name for SEMI
    assert await ids("MANUAL") == {str(env["pending"].id)}

    bad = await client.get("/api/v1/assessments", headers=hdrs, params={"grading_mode": "nonsense"})
    assert bad.status_code == 422, bad.text


@pytest.mark.asyncio
async def test_list_includes_coauthored_and_delegated_papers(client: AsyncClient, db, make_auth_headers):
    from datetime import timedelta

    from app.db.base import utcnow
    from app.db.enums import DelegationStatus
    from app.db.models.authoring import AssessmentCollaborator, AuthorDelegation

    env = await _env(db)
    outsider = env["outsider"]
    hdrs = _h(make_auth_headers, outsider)

    async def ids() -> set[str]:
        resp = await client.get("/api/v1/assessments", headers=hdrs)
        assert resp.status_code == 200, resp.text
        return {a["id"] for a in resp.json()["items"]}

    assert await ids() == set()  # no relationship to either paper

    db.add(AssessmentCollaborator(
        assessment_id=env["published"].id, lecturer_id=outsider.id,
        added_by_id=env["lecturer"].id, is_active=True,
    ))
    now = utcnow()
    db.add(AuthorDelegation(
        assessment_id=env["pending"].id, delegator_id=env["lecturer"].id, delegate_id=outsider.id,
        created_by_id=env["lecturer"].id, reason="Author on leave",
        valid_from=now - timedelta(days=1), valid_to=now + timedelta(days=3),
        status=DelegationStatus.ACTIVE,
    ))
    await db.commit()
    assert await ids() == {str(env["published"].id), str(env["pending"].id)}

    # An expired delegation no longer lists the paper
    delegation = (await db.execute(select(AuthorDelegation))).scalars().one()
    delegation.valid_to = now - timedelta(hours=1)
    await db.commit()
    assert await ids() == {str(env["published"].id)}


@pytest.mark.asyncio
async def test_assessment_in_moderation_cannot_be_deleted(client: AsyncClient, db, make_auth_headers):
    env = await _env(db)
    hdrs = _h(make_auth_headers, env["lecturer"])

    resp = await client.delete(f"/api/v1/assessments/{env['pending'].id}", headers=hdrs)
    assert resp.status_code == 409, resp.text
    assert "CANNOT_DELETE_IN_MODERATION" in resp.text
