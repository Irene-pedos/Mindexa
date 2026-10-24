"""
tests/unit/test_compliance_rules.py

Pre-moderation compliance is configurable per institution, and a moderator can approve a paper
whose required checks failed by waiving them with a recorded reason.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import AssessmentType, SectionKind, UserRole
from app.core.exceptions import BadRequestError, ConflictError
from app.db.enums import AssessmentStatus, ModerationReviewStatus, NotificationType
from app.db.models.audit import AuditLog
from app.db.models.notification import Notification
from app.db.repositories.approval_policy_repo import ApprovalPolicyRepository
from app.schemas.policy import ApprovalPolicyUpdate
from app.services.approval_policy_service import ApprovalPolicyService
from app.services.compliance_rules import (
    DEFAULT_RULES,
    ComplianceConfig,
    config_from_policy,
    merge_rules,
    validate_rules,
)
from app.services.moderation_checklist_service import ModerationChecklistService
from app.services.moderation_service import ModerationService
from tests.unit.test_phase3_moderation import (
    _build_valid_summative_paper,
    _setup_institutional_env,
    _submitted_cs_review,
)


async def _policy(db: AsyncSession, env: dict):
    return await ApprovalPolicyRepository(db).get_by_institution_and_type(
        institution_id=env["inst"].id, assessment_type=AssessmentType.SUMMATIVE
    )


async def _update(db: AsyncSession, env: dict, **fields):
    policy = await _policy(db, env)
    return await ApprovalPolicyService(db).update_policy(
        actor=env["admin"], policy_id=policy.id, data=ApprovalPolicyUpdate(**fields)
    )


def _item(result, code: str):
    return next(it for it in result.items if it.code == code)


# ── rules ────────────────────────────────────────────────────────────────────


def test_no_stored_rules_means_the_original_behaviour():
    assert merge_rules(None) == DEFAULT_RULES
    cfg = ComplianceConfig()
    assert cfg.policy_total == 100
    assert cfg.mode("MARKS_TOTAL") == "BLOCKING" and cfg.mode("STRUCTURE") == "WARNING"


def test_bad_admin_input_is_rejected_with_a_clear_message():
    for bad, needle in [
        ({"MADE_UP": {"mode": "OFF"}}, "Unknown"),
        ({"MARKS_TOTAL": {"mode": "SOMETIMES"}}, "mode must be one of"),
        ({"STRUCTURE": {"expected_sections": 0}}, "expected_sections"),
        ({"STRUCTURE": {"choice_pools": "yes"}}, "true or false"),
        ({"MARKS_TOTAL": {"mode": "OFF", "extra": 1}}, "only supports a mode"),
    ]:
        with pytest.raises(ValueError, match=needle):
            validate_rules(bad)


def test_valid_rules_are_laid_over_the_defaults():
    rules = validate_rules({"MARKS_TOTAL": {"mode": "WARNING"}, "STRUCTURE": {"expected_sections": None}})
    assert rules["MARKS_TOTAL"]["mode"] == "WARNING"
    assert rules["STRUCTURE"]["expected_sections"] is None
    assert rules["STRUCTURE"]["section_a_closed"] is True  # untouched keys keep their default
    assert rules["QUESTIONS_COMPLETE"]["mode"] == "BLOCKING"


# ── the checklist honours them ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mode_decides_whether_a_failed_check_blocks(db: AsyncSession):
    env = await _setup_institutional_env(db)
    asmt, _, _ = _build_valid_summative_paper(env["course_cs"], env["author"])

    strict = await ModerationChecklistService.run(asmt, config=ComplianceConfig(policy_total=120))
    relaxed = await ModerationChecklistService.run(
        asmt, config=ComplianceConfig(policy_total=120, rules=merge_rules({"MARKS_TOTAL": {"mode": "WARNING"}}))
    )
    off = await ModerationChecklistService.run(
        asmt, config=ComplianceConfig(policy_total=120, rules=merge_rules({"MARKS_TOTAL": {"mode": "OFF"}}))
    )

    assert strict.has_blocking_failures and not _item(strict, "MARKS_TOTAL").passed
    assert not relaxed.has_blocking_failures and not _item(relaxed, "MARKS_TOTAL").passed
    assert _item(relaxed, "MARKS_TOTAL").severity.value == "WARNING"
    assert not off.has_blocking_failures and _item(off, "MARKS_TOTAL").passed


@pytest.mark.asyncio
async def test_an_institution_with_no_fixed_total_is_not_held_to_one(db: AsyncSession):
    env = await _setup_institutional_env(db)
    asmt, _, _ = _build_valid_summative_paper(env["course_cs"], env["author"])

    result = await ModerationChecklistService.run(asmt, config=ComplianceConfig(policy_total=None))

    assert _item(result, "MARKS_TOTAL").passed
    assert "no fixed total" in _item(result, "MARKS_TOTAL").message.lower()


@pytest.mark.asyncio
async def test_structure_rules_follow_the_institution(db: AsyncSession):
    env = await _setup_institutional_env(db)
    asmt, secs, _ = _build_valid_summative_paper(env["course_cs"], env["author"])
    secs[0].section_kind = SectionKind.OPEN  # this institution's first section is not closed-ended
    del secs[2]
    asmt.sections = secs  # ... and the paper has two sections, not three

    default = await ModerationChecklistService.run(asmt, config=ComplianceConfig())
    tailored = await ModerationChecklistService.run(
        asmt,
        config=ComplianceConfig(
            rules=merge_rules(
                {"STRUCTURE": {"expected_sections": None, "section_a_closed": False, "choice_pools": False}}
            )
        ),
    )

    assert not _item(default, "STRUCTURE").passed
    assert _item(tailored, "STRUCTURE").passed


@pytest.mark.asyncio
async def test_config_comes_from_the_policy_row_and_old_switch_still_works(db: AsyncSession):
    env = await _setup_institutional_env(db)
    policy = await _update(db, env, compliance_rules={"QUESTIONS_COMPLETE": {"mode": "WARNING"}})
    cfg = config_from_policy(policy)
    assert cfg.mode("QUESTIONS_COMPLETE") == "WARNING" and cfg.policy_total == 100

    policy = await _update(db, env, enforce_structure_template=False)
    assert config_from_policy(policy).mode("STRUCTURE") == "OFF"


@pytest.mark.asyncio
async def test_the_fixed_total_can_be_cleared_but_is_left_alone_when_omitted(db: AsyncSession):
    env = await _setup_institutional_env(db)

    kept = await _update(db, env, requires_moderation=True)  # field omitted
    assert kept.summative_total_marks == 100

    cleared = await _update(db, env, summative_total_marks=None)  # explicit null
    assert cleared.summative_total_marks is None


# ── moderator approval and waivers ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_warning_level_failure_never_stops_approval(db: AsyncSession):
    env = await _setup_institutional_env(db)
    await _update(db, env, summative_total_marks=120, compliance_rules={"MARKS_TOTAL": {"mode": "WARNING"}})
    asmt, review = await _submitted_cs_review(db, env)
    svc = ModerationService(db)
    await svc.claim_review(review.id, env["mod_cs"])

    decided = await svc.approve_review(review.id, env["mod_cs"])

    assert decided.status == ModerationReviewStatus.APPROVED
    assert decided.compliance_override is None
    await db.refresh(asmt)
    assert asmt.status == AssessmentStatus.APPROVED


@pytest.mark.asyncio
async def test_moderator_can_waive_required_checks_with_a_recorded_reason(db: AsyncSession):
    env = await _setup_institutional_env(db)
    await _update(db, env, summative_total_marks=120, compliance_rules={"MARKS_TOTAL": {"mode": "WARNING"}})
    asmt, review = await _submitted_cs_review(db, env)
    svc = ModerationService(db)
    await svc.claim_review(review.id, env["mod_cs"])
    # The institution tightens the rule after the paper was submitted.
    await _update(db, env, compliance_rules={"MARKS_TOTAL": {"mode": "BLOCKING"}})

    with pytest.raises(ConflictError) as blocked:
        await svc.approve_review(review.id, env["mod_cs"])
    assert blocked.value.code == "COMPLIANCE_CHECKS_FAILED"
    assert "MARKS_TOTAL" in str(blocked.value)

    with pytest.raises(BadRequestError) as no_reason:
        await svc.approve_review(
            review.id, env["mod_cs"], override_failed_checks=True, override_reason="ok"
        )
    assert no_reason.value.code == "OVERRIDE_REASON_REQUIRED"

    decided = await svc.approve_review(
        review.id,
        env["mod_cs"],
        override_failed_checks=True,
        override_reason="The department sets this paper out of 100 by agreement with the exam board.",
    )

    assert decided.status == ModerationReviewStatus.APPROVED
    assert decided.compliance_override["codes"] == ["MARKS_TOTAL"]
    assert "agreement with the exam board" in decided.compliance_override["reason"]
    assert decided.compliance_override["by_id"] == str(env["mod_cs"].id)

    audit = (
        await db.execute(select(AuditLog).where(AuditLog.action == "moderation_approved_with_override"))
    ).scalars().all()
    assert len(audit) == 1

    notice = (
        await db.execute(
            select(Notification).where(
                Notification.recipient_id == env["author"].id,
                Notification.notification_type == NotificationType.MODERATION_APPROVED,
            )
        )
    ).scalar_one()
    assert "MARKS_TOTAL" in notice.body  # the author is told which checks were waived


@pytest.mark.asyncio
async def test_overview_shows_todays_rules_for_an_open_round(db: AsyncSession):
    env = await _setup_institutional_env(db)
    await _update(db, env, summative_total_marks=120, compliance_rules={"MARKS_TOTAL": {"mode": "WARNING"}})
    asmt, review = await _submitted_cs_review(db, env)
    svc = ModerationService(db)
    await _update(db, env, compliance_rules={"MARKS_TOTAL": {"mode": "OFF"}})

    overview = await svc.get_moderation_overview(asmt.id, env["author"])

    live = {it["code"]: it for it in overview["current_checklist"]["items"]}
    assert live["MARKS_TOTAL"]["passed"] is True  # off now
    snapshot = {it["code"]: it for it in overview["rounds"][-1]["checklist_result"]["items"]}
    assert snapshot["MARKS_TOTAL"]["passed"] is False  # what it looked like at submission


# ── admin API ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_can_edit_rules_over_http_and_bad_rules_are_refused(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    env = await _setup_institutional_env(db)
    policy = await _policy(db, env)
    headers = make_auth_headers(user_id=str(env["admin"].id), role=UserRole.ADMIN, email=env["admin"].email)

    ok = await client.put(
        f"/api/v1/admin/approval-policies/{policy.id}",
        headers=headers,
        json={"summative_total_marks": None, "compliance_rules": {"STRUCTURE": {"mode": "OFF"}}},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["summative_total_marks"] is None
    assert body["compliance_rules"]["STRUCTURE"]["mode"] == "OFF"
    assert body["compliance_rules"]["MARKS_TOTAL"]["mode"] == "BLOCKING"  # full effective rules returned

    bad = await client.put(
        f"/api/v1/admin/approval-policies/{policy.id}",
        headers=headers,
        json={"compliance_rules": {"MARKS_TOTAL": {"mode": "SOMETIMES"}}},
    )
    assert bad.status_code == 400
    assert "mode must be one of" in bad.text


@pytest.mark.asyncio
async def test_approve_route_requires_a_reason_to_waive_and_records_it(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    env = await _setup_institutional_env(db)
    await _update(db, env, summative_total_marks=120, compliance_rules={"MARKS_TOTAL": {"mode": "WARNING"}})
    asmt, review = await _submitted_cs_review(db, env)
    await ModerationService(db).claim_review(review.id, env["mod_cs"])
    await _update(db, env, compliance_rules={"MARKS_TOTAL": {"mode": "BLOCKING"}})
    headers = make_auth_headers(user_id=str(env["mod_cs"].id), role=UserRole.LECTURER, email=env["mod_cs"].email)
    url = f"/api/v1/moderator/reviews/{review.id}/approve"

    refused = await client.post(url, headers=headers, json={})
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "COMPLIANCE_CHECKS_FAILED"

    too_short = await client.post(url, headers=headers, json={"override_failed_checks": True, "override_reason": "ok"})
    assert too_short.status_code == 400

    approved = await client.post(
        url,
        headers=headers,
        json={"override_failed_checks": True, "override_reason": "Agreed with the exam board for this module."},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"
    assert approved.json()["compliance_override"]["codes"] == ["MARKS_TOTAL"]


@pytest.mark.asyncio
async def test_marks_summary_reports_the_institutions_total_and_strictness(
    client: AsyncClient, db: AsyncSession, make_auth_headers
):
    env = await _setup_institutional_env(db)
    await _update(db, env, summative_total_marks=80, compliance_rules={"MARKS_TOTAL": {"mode": "WARNING"}})
    asmt, _ = await _submitted_cs_review(db, env)
    headers = make_auth_headers(user_id=str(env["author"].id), role=UserRole.LECTURER, email=env["author"].email)

    resp = await client.get(f"/api/v1/assessments/{asmt.id}/marks-summary", headers=headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["policy_total"] == 80 and body["policy_total_mode"] == "WARNING"