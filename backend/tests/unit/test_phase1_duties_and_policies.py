"""
tests/unit/test_phase1_duties_and_policies.py

Unit and integration tests for Phase 1:
- Scoped Duties (MODERATOR, EXAM_OFFICER, DEPARTMENT_HEAD)
- UserDutyAssignment model & active uniqueness
- Permission helpers (has_duty, is_hod_of, is_moderator_for, require_duty)
- ApprovalPolicy model & seeded defaults
- Admin endpoints (POST /admin/duties, GET /admin/duties, DELETE /admin/duties/{id},
  GET /admin/approval-policies, PUT /admin/approval-policies/{id})
- Authenticated user endpoint (GET /me/duties)
- AuditLog persistence for assignment, deactivation, and policy changes
"""
# ruff: noqa: ANN001, ANN201, ANN202, E501, S106
from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    AssessmentType,
    Duty,
    PostApprovalEditMode,
    PostStartEditMode,
    UserRole,
    UserStatus,
)
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
)
from app.core.permissions import has_duty, is_hod_of, is_moderator_for
from app.db.base import utcnow
from app.db.models.academic import Campus, Department, Institution
from app.db.models.audit import AuditLog
from app.db.models.auth import User
from app.schemas.duty import DutyAssignmentCreate
from app.schemas.policy import ApprovalPolicyUpdate
from app.services.approval_policy_service import ApprovalPolicyService
from app.services.duty_service import DutyService


async def _create_test_hierarchy(db: AsyncSession):
    """Helper to create institution, campus, department, and users."""
    inst = Institution(
        id=uuid.uuid4(),
        name="University of Science",
        code=f"US_{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db.add(inst)

    campus1 = Campus(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="Main Campus",
        code=f"MC_{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    campus2 = Campus(
        id=uuid.uuid4(),
        institution_id=inst.id,
        name="South Campus",
        code=f"SC_{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    db.add_all([campus1, campus2])

    dept1 = Department(
        id=uuid.uuid4(),
        institution_id=inst.id,
        campus_id=campus1.id,
        name="Computer Science",
        code=f"CS_{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    dept2 = Department(
        id=uuid.uuid4(),
        institution_id=inst.id,
        campus_id=campus1.id,
        name="Mathematics",
        code=f"MA_{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    db.add_all([dept1, dept2])

    admin_user = User(
        id=uuid.uuid4(),
        email=f"admin_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.ADMIN.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    lecturer1 = User(
        id=uuid.uuid4(),
        email=f"lecturer1_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    lecturer2 = User(
        id=uuid.uuid4(),
        email=f"lecturer2_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.LECTURER.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    student = User(
        id=uuid.uuid4(),
        email=f"student_{uuid.uuid4().hex[:6]}@test.ac",
        hashed_password="hash",
        role=UserRole.STUDENT.value,
        status=UserStatus.ACTIVE.value,
        email_verified=True,
    )
    db.add_all([admin_user, lecturer1, lecturer2, student])
    await db.flush()

    return {
        "institution": inst,
        "campus1": campus1,
        "campus2": campus2,
        "dept1": dept1,
        "dept2": dept2,
        "admin": admin_user,
        "lecturer1": lecturer1,
        "lecturer2": lecturer2,
        "student": student,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 1. BASE ROLE ENFORCEMENT TESTS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_duty_assignment_rejects_student_for_all_duties(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    # Student cannot be MODERATOR
    with pytest.raises(BadRequestError, match="requires base role LECTURER"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["student"].id,
                duty=Duty.MODERATOR,
                institution_id=h["institution"].id,
                department_id=h["dept1"].id,
            ),
        )

    # Student cannot be DEPARTMENT_HEAD
    with pytest.raises(BadRequestError, match="requires base role LECTURER"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["student"].id,
                duty=Duty.DEPARTMENT_HEAD,
                institution_id=h["institution"].id,
                department_id=h["dept1"].id,
            ),
        )

    # Student cannot be EXAM_OFFICER
    with pytest.raises(BadRequestError, match="requires base role LECTURER or ADMIN"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["student"].id,
                duty=Duty.EXAM_OFFICER,
                institution_id=h["institution"].id,
            ),
        )


@pytest.mark.asyncio
async def test_duty_assignment_rejects_admin_for_moderator_and_hod(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    with pytest.raises(BadRequestError, match="requires base role LECTURER"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["admin"].id,
                duty=Duty.MODERATOR,
                institution_id=h["institution"].id,
                department_id=h["dept1"].id,
            ),
        )

    with pytest.raises(BadRequestError, match="requires base role LECTURER"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["admin"].id,
                duty=Duty.DEPARTMENT_HEAD,
                institution_id=h["institution"].id,
                department_id=h["dept1"].id,
            ),
        )


@pytest.mark.asyncio
async def test_duty_assignment_accepts_admin_for_exam_officer(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    assignment = await service.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["admin"].id,
            duty=Duty.EXAM_OFFICER,
            institution_id=h["institution"].id,
        ),
    )
    assert assignment.id is not None
    assert assignment.duty == Duty.EXAM_OFFICER
    assert assignment.is_active is True


# ─────────────────────────────────────────────────────────────────────────────
# 2. SCOPE VALIDATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_moderator_and_hod_require_department(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    with pytest.raises(BadRequestError, match="requires a department_id"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["lecturer1"].id,
                duty=Duty.MODERATOR,
                institution_id=h["institution"].id,
                department_id=None,
            ),
        )

    with pytest.raises(BadRequestError, match="requires a department_id"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["lecturer1"].id,
                duty=Duty.DEPARTMENT_HEAD,
                institution_id=h["institution"].id,
                department_id=None,
            ),
        )


@pytest.mark.asyncio
async def test_exam_officer_rejects_department_scope(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    with pytest.raises(
        BadRequestError,
        match="cannot be assigned to a department; scope must be institution-wide or campus-scoped",
    ):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["lecturer1"].id,
                duty=Duty.EXAM_OFFICER,
                institution_id=h["institution"].id,
                department_id=h["dept1"].id,
            ),
        )


@pytest.mark.asyncio
async def test_duty_assignment_scope_foreign_key_cross_validation(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    # Foreign institution
    other_inst = Institution(
        id=uuid.uuid4(),
        name="Other College",
        code=f"OC_{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db.add(other_inst)
    await db.flush()

    # Department belongs to institution 1, but passed institution 2
    with pytest.raises(BadRequestError, match="does not belong to institution"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["lecturer1"].id,
                duty=Duty.MODERATOR,
                institution_id=other_inst.id,
                department_id=h["dept1"].id,
            ),
        )

    # Department belongs to campus 1, but passed campus 2
    with pytest.raises(BadRequestError, match="belongs to campus"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["lecturer1"].id,
                duty=Duty.MODERATOR,
                institution_id=h["institution"].id,
                campus_id=h["campus2"].id,
                department_id=h["dept1"].id,
            ),
        )


# ─────────────────────────────────────────────────────────────────────────────
# 3. DUPLICATE ACTIVE ASSIGNMENT PREVENTION TESTS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_duplicate_active_assignment_prevention(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    # 1. Assign moderator to lecturer1
    assign1 = await service.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["lecturer1"].id,
            duty=Duty.MODERATOR,
            institution_id=h["institution"].id,
            department_id=h["dept1"].id,
        ),
    )
    assert assign1.is_active is True

    # 2. Duplicate assignment while active is rejected
    with pytest.raises(ConflictError, match="already exists"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["lecturer1"].id,
                duty=Duty.MODERATOR,
                institution_id=h["institution"].id,
                department_id=h["dept1"].id,
            ),
        )

    # 3. Deactivate assign1
    await service.deactivate_duty(actor=h["admin"], duty_id=assign1.id)

    # 4. Re-assigning after deactivation succeeds
    assign2 = await service.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["lecturer1"].id,
            duty=Duty.MODERATOR,
            institution_id=h["institution"].id,
            department_id=h["dept1"].id,
        ),
    )
    assert assign2.id != assign1.id
    assert assign2.is_active is True


@pytest.mark.asyncio
async def test_duplicate_exam_officer_with_null_department_prevented(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    # Assign institution-wide EXAM_OFFICER (department_id=None, campus_id=None)
    await service.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["lecturer1"].id,
            duty=Duty.EXAM_OFFICER,
            institution_id=h["institution"].id,
            campus_id=None,
            department_id=None,
        ),
    )

    # Attempt second active institution-wide assignment
    with pytest.raises(ConflictError, match="already exists"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["lecturer1"].id,
                duty=Duty.EXAM_OFFICER,
                institution_id=h["institution"].id,
                campus_id=None,
                department_id=None,
            ),
        )


# ─────────────────────────────────────────────────────────────────────────────
# 4. DATE VALIDITY & PERMISSION HELPERS TESTS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_date_validity_and_immediate_access_loss(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    now = utcnow()

    # Reject invalid date window: valid_to <= valid_from
    with pytest.raises(BadRequestError, match="valid_to must be strictly later"):
        await service.assign_duty(
            actor=h["admin"],
            data=DutyAssignmentCreate(
                user_id=h["lecturer1"].id,
                duty=Duty.DEPARTMENT_HEAD,
                institution_id=h["institution"].id,
                department_id=h["dept1"].id,
                valid_from=now,
                valid_to=now - timedelta(days=1),
            ),
        )

    # Create active assignment with valid dates
    assign = await service.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["lecturer1"].id,
            duty=Duty.DEPARTMENT_HEAD,
            institution_id=h["institution"].id,
            department_id=h["dept1"].id,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=1),
        ),
    )

    # Current access check is True
    assert await has_duty(db, h["lecturer1"], Duty.DEPARTMENT_HEAD, department_id=h["dept1"].id) is True
    assert await is_hod_of(db, h["lecturer1"], h["dept1"].id) is True

    # Out of validity window check:
    # Future check (after valid_to): access is False
    assert await has_duty(
        db,
        h["lecturer1"],
        Duty.DEPARTMENT_HEAD,
        department_id=h["dept1"].id,
        as_of=now + timedelta(days=5),
    ) is False

    # Past check (before valid_from): access is False
    assert await has_duty(
        db,
        h["lecturer1"],
        Duty.DEPARTMENT_HEAD,
        department_id=h["dept1"].id,
        as_of=now - timedelta(days=5),
    ) is False

    # Deactivating immediately revokes access
    await service.deactivate_duty(actor=h["admin"], duty_id=assign.id)
    assert await has_duty(db, h["lecturer1"], Duty.DEPARTMENT_HEAD, department_id=h["dept1"].id) is False
    assert await is_hod_of(db, h["lecturer1"], h["dept1"].id) is False


@pytest.mark.asyncio
async def test_scope_separation_in_permission_helpers(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    # Assign moderator for dept1
    await service.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["lecturer1"].id,
            duty=Duty.MODERATOR,
            institution_id=h["institution"].id,
            department_id=h["dept1"].id,
        ),
    )

    # Lecturer 1 is moderator for dept1, but NOT dept2 (testing all argument conventions - C-01)
    assert await is_moderator_for(db, h["lecturer1"], h["dept1"].id) is True
    assert await is_moderator_for(db, h["lecturer1"], department_id=h["dept1"].id) is True
    assert await is_moderator_for(h["lecturer1"], h["dept1"].id, db=db) is True
    assert await is_moderator_for(h["lecturer1"], department_id=h["dept1"].id, db=db) is True
    assert await is_moderator_for(db, h["lecturer1"], h["dept2"].id) is False
    assert await is_moderator_for(h["lecturer1"], department_id=h["dept2"].id, db=db) is False

    # Lecturer 2 has no duty
    assert await is_moderator_for(db, h["lecturer2"], h["dept1"].id) is False
    assert await is_moderator_for(h["lecturer2"], department_id=h["dept1"].id, db=db) is False


@pytest.mark.asyncio
async def test_exam_officer_scope_resolution(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = DutyService(db)

    # Lecturer 1 is campus-scoped to campus1
    await service.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["lecturer1"].id,
            duty=Duty.EXAM_OFFICER,
            institution_id=h["institution"].id,
            campus_id=h["campus1"].id,
        ),
    )

    # Lecturer 2 is institution-wide
    await service.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["lecturer2"].id,
            duty=Duty.EXAM_OFFICER,
            institution_id=h["institution"].id,
        ),
    )

    # Lecturer 1 matches campus1, but not campus2
    assert await has_duty(db, h["lecturer1"], Duty.EXAM_OFFICER, campus_id=h["campus1"].id) is True
    assert await has_duty(db, h["lecturer1"], Duty.EXAM_OFFICER, campus_id=h["campus2"].id) is False

    # Lecturer 2 (institution-wide) matches both campus1 and campus2
    assert await has_duty(db, h["lecturer2"], Duty.EXAM_OFFICER, campus_id=h["campus1"].id) is True
    assert await has_duty(db, h["lecturer2"], Duty.EXAM_OFFICER, campus_id=h["campus2"].id) is True


# ─────────────────────────────────────────────────────────────────────────────
# 5. APPROVAL POLICY TESTS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_approval_policy_seeded_defaults_and_idempotency(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = ApprovalPolicyService(db)

    # 1. Seed defaults
    policies = await service.seed_defaults_for_institution(h["institution"].id)
    assert len(policies) == 6

    policy_by_type = {p.assessment_type: p for p in policies}

    # SUMMATIVE rules check
    summative = policy_by_type[AssessmentType.SUMMATIVE]
    assert summative.requires_moderation is True
    assert summative.enforce_structure_template is True
    assert summative.summative_total_marks == 100
    assert summative.post_approval_edit_mode == PostApprovalEditMode.NOTIFY
    assert summative.post_start_edit_mode == PostStartEditMode.BLOCK

    # Other types check (CAT, FORMATIVE, HOMEWORK, GROUP_WORK, REASSESSMENT)
    for atype in (
        AssessmentType.FORMATIVE,
        AssessmentType.CAT,
        AssessmentType.HOMEWORK,
        AssessmentType.GROUP_WORK,
        AssessmentType.REASSESSMENT,
    ):
        p = policy_by_type[atype]
        assert p.requires_moderation is False
        assert p.enforce_structure_template is False
        assert p.summative_total_marks is None
        assert p.post_approval_edit_mode == PostApprovalEditMode.NOTIFY
        assert p.post_start_edit_mode == PostStartEditMode.BLOCK

    # 2. Reseed idempotently (no duplicates)
    reseeded = await service.seed_defaults_for_institution(h["institution"].id)
    assert len(reseeded) == 6


@pytest.mark.asyncio
async def test_approval_policy_update_validation(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    service = ApprovalPolicyService(db)

    policies = await service.seed_defaults_for_institution(h["institution"].id)
    cat_policy = next(p for p in policies if p.assessment_type == AssessmentType.CAT)

    # Invalid marks: <= 0 rejected
    with pytest.raises(BadRequestError, match="must be a positive integer"):
        await service.update_policy(
            actor=h["admin"],
            policy_id=cat_policy.id,
            data=ApprovalPolicyUpdate(summative_total_marks=-5),
        )

    # Invalid warning days: < 0 rejected
    with pytest.raises(BadRequestError, match="cannot be negative"):
        await service.update_policy(
            actor=h["admin"],
            policy_id=cat_policy.id,
            data=ApprovalPolicyUpdate(sealing_warning_days=-1),
        )

    # Valid update
    updated = await service.update_policy(
        actor=h["admin"],
        policy_id=cat_policy.id,
        data=ApprovalPolicyUpdate(
            requires_moderation=True,
            post_approval_edit_mode=PostApprovalEditMode.REQUIRE_REAPPROVAL,
        ),
    )
    assert updated.requires_moderation is True
    assert updated.post_approval_edit_mode == PostApprovalEditMode.REQUIRE_REAPPROVAL


# ─────────────────────────────────────────────────────────────────────────────
# 6. ATOMIC AUDIT LOGGING TESTS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_logs_written_for_all_state_changes(db: AsyncSession):
    h = await _create_test_hierarchy(db)
    duty_svc = DutyService(db)
    policy_svc = ApprovalPolicyService(db)

    # 1. Assign duty -> AuditLog written
    assign = await duty_svc.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["lecturer1"].id,
            duty=Duty.MODERATOR,
            institution_id=h["institution"].id,
            department_id=h["dept1"].id,
        ),
    )

    assign_audit = await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "user_duty_assignment",
            AuditLog.entity_id == assign.id,
            AuditLog.action == "duty_assigned",
        )
    )
    audit_row = assign_audit.scalar_one_or_none()
    assert audit_row is not None
    assert audit_row.actor_id == h["admin"].id
    assert audit_row.after_state["duty"] == Duty.MODERATOR.value

    # 2. Deactivate duty -> AuditLog written
    await duty_svc.deactivate_duty(actor=h["admin"], duty_id=assign.id)
    deact_audit = await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "user_duty_assignment",
            AuditLog.entity_id == assign.id,
            AuditLog.action == "duty_deactivated",
        )
    )
    deact_row = deact_audit.scalar_one_or_none()
    assert deact_row is not None
    assert deact_row.before_state["is_active"] is True
    assert deact_row.after_state["is_active"] is False

    # 3. Policy update -> AuditLog written
    policies = await policy_svc.seed_defaults_for_institution(h["institution"].id)
    p = policies[0]
    await policy_svc.update_policy(
        actor=h["admin"],
        policy_id=p.id,
        data=ApprovalPolicyUpdate(requires_moderation=True),
    )

    pol_audit = await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "approval_policy",
            AuditLog.entity_id == p.id,
            AuditLog.action == "policy_updated",
        )
    )
    pol_row = pol_audit.scalar_one_or_none()
    assert pol_row is not None
    assert pol_row.actor_id == h["admin"].id


# ─────────────────────────────────────────────────────────────────────────────
# 7. ENDPOINT ROUTE TESTS (TRANSPORT / AUTH)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_duty_endpoints_via_http(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    h = await _create_test_hierarchy(db)
    admin_hdr = make_auth_headers(user_id=str(h["admin"].id), role=UserRole.ADMIN, email=h["admin"].email)
    lecturer_hdr = make_auth_headers(user_id=str(h["lecturer1"].id), role=UserRole.LECTURER, email=h["lecturer1"].email)

    # 1. Non-admin forbidden on POST /admin/duties
    res_unauth = await client.post(
        "/api/v1/admin/duties",
        headers=lecturer_hdr,
        json={
            "user_id": str(h["lecturer2"].id),
            "duty": Duty.MODERATOR.value,
            "institution_id": str(h["institution"].id),
            "department_id": str(h["dept1"].id),
        },
    )
    assert res_unauth.status_code == 403

    # Reject EXAM_OFFICER with department_id (HTTP 400)
    res_eo_dept = await client.post(
        "/api/v1/admin/duties",
        headers=admin_hdr,
        json={
            "user_id": str(h["lecturer2"].id),
            "duty": Duty.EXAM_OFFICER.value,
            "institution_id": str(h["institution"].id),
            "department_id": str(h["dept1"].id),
        },
    )
    assert res_eo_dept.status_code == 400
    err_body = res_eo_dept.json()
    err_msg = err_body.get("error", {}).get("message", "") or err_body.get("detail", "")
    assert "cannot be assigned to a department" in err_msg

    # 2. Admin creates duty successfully
    res_post = await client.post(
        "/api/v1/admin/duties",
        headers=admin_hdr,
        json={
            "user_id": str(h["lecturer2"].id),
            "duty": Duty.MODERATOR.value,
            "institution_id": str(h["institution"].id),
            "department_id": str(h["dept1"].id),
        },
    )
    assert res_post.status_code == 201
    duty_data = res_post.json()
    duty_id = duty_data["id"]
    assert duty_data["duty"] == Duty.MODERATOR.value
    assert duty_data["is_active"] is True

    # 3. GET /admin/duties with filters
    res_get = await client.get(
        f"/api/v1/admin/duties?user_id={h['lecturer2'].id}&duty=MODERATOR",
        headers=admin_hdr,
    )
    assert res_get.status_code == 200
    items = res_get.json()
    assert len(items) >= 1
    assert any(item["id"] == duty_id for item in items)

    # 4. DELETE /admin/duties/{id} deactivates
    res_del = await client.delete(f"/api/v1/admin/duties/{duty_id}", headers=admin_hdr)
    assert res_del.status_code == 200
    assert res_del.json()["is_active"] is False

    # Verify not deleted from database, only deactivated
    res_get_after = await client.get(
        f"/api/v1/admin/duties?user_id={h['lecturer2'].id}&is_active=false",
        headers=admin_hdr,
    )
    assert res_get_after.status_code == 200
    assert any(item["id"] == duty_id and item["is_active"] is False for item in res_get_after.json())


@pytest.mark.asyncio
async def test_admin_approval_policy_endpoints_via_http(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    h = await _create_test_hierarchy(db)
    admin_hdr = make_auth_headers(user_id=str(h["admin"].id), role=UserRole.ADMIN, email=h["admin"].email)
    policy_svc = ApprovalPolicyService(db)
    policies = await policy_svc.seed_defaults_for_institution(h["institution"].id)
    policy_id = policies[0].id

    # GET /admin/approval-policies
    res_get = await client.get(
        f"/api/v1/admin/approval-policies?institution_id={h['institution'].id}",
        headers=admin_hdr,
    )
    assert res_get.status_code == 200
    assert len(res_get.json()) == 6

    # PUT /admin/approval-policies/{id}
    res_put = await client.put(
        f"/api/v1/admin/approval-policies/{policy_id}",
        headers=admin_hdr,
        json={"requires_moderation": True, "summative_total_marks": 100},
    )
    assert res_put.status_code == 200
    assert res_put.json()["requires_moderation"] is True


@pytest.mark.asyncio
async def test_me_duties_endpoint_returns_user_specific_duties(
    client: AsyncClient,
    make_auth_headers,
    db: AsyncSession,
):
    h = await _create_test_hierarchy(db)
    duty_svc = DutyService(db)

    # Assign duty to lecturer 1
    await duty_svc.assign_duty(
        actor=h["admin"],
        data=DutyAssignmentCreate(
            user_id=h["lecturer1"].id,
            duty=Duty.MODERATOR,
            institution_id=h["institution"].id,
            department_id=h["dept1"].id,
        ),
    )

    # Lecturer 1 queries /me/duties -> receives their duty
    l1_hdr = make_auth_headers(user_id=str(h["lecturer1"].id), role=UserRole.LECTURER, email=h["lecturer1"].email)
    res_l1 = await client.get("/api/v1/me/duties", headers=l1_hdr)
    assert res_l1.status_code == 200
    duties_l1 = res_l1.json()
    assert len(duties_l1) == 1
    assert duties_l1[0]["duty"] == Duty.MODERATOR.value

    # Lecturer 2 queries /me/duties -> receives empty list
    l2_hdr = make_auth_headers(user_id=str(h["lecturer2"].id), role=UserRole.LECTURER, email=h["lecturer2"].email)
    res_l2 = await client.get("/api/v1/me/duties", headers=l2_hdr)
    assert res_l2.status_code == 200
    assert len(res_l2.json()) == 0
