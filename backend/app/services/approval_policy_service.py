"""
app/services/approval_policy_service.py

Service layer for Institutional ApprovalPolicy workflows.
Enforces idempotent policy seeding, update validation, and atomic audit logging.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    AssessmentType,
    PostApprovalEditMode,
    PostStartEditMode,
)
from app.core.exceptions import (
    BadRequestError,
    NotFoundError,
)
from app.db.models.academic import Institution
from app.db.models.audit import AuditLog
from app.db.models.auth import User
from app.db.models.policy import ApprovalPolicy
from app.db.repositories.approval_policy_repo import ApprovalPolicyRepository
from app.schemas.policy import ApprovalPolicyResponse, ApprovalPolicyUpdate
from app.services.compliance_rules import merge_rules, validate_rules

DEFAULT_POLICY_CONFIGS = {
    AssessmentType.SUMMATIVE: {
        "requires_moderation": True,
        "enforce_structure_template": True,
        "summative_total_marks": 100,
        "post_approval_edit_mode": PostApprovalEditMode.NOTIFY,
        "post_start_edit_mode": PostStartEditMode.BLOCK,
        "sealing_warning_days": None,
    },
    AssessmentType.FORMATIVE: {
        "requires_moderation": False,
        "enforce_structure_template": False,
        "summative_total_marks": None,
        "post_approval_edit_mode": PostApprovalEditMode.NOTIFY,
        "post_start_edit_mode": PostStartEditMode.BLOCK,
        "sealing_warning_days": None,
    },
    AssessmentType.CAT: {
        "requires_moderation": False,
        "enforce_structure_template": False,
        "summative_total_marks": None,
        "post_approval_edit_mode": PostApprovalEditMode.NOTIFY,
        "post_start_edit_mode": PostStartEditMode.BLOCK,
        "sealing_warning_days": None,
    },
    AssessmentType.HOMEWORK: {
        "requires_moderation": False,
        "enforce_structure_template": False,
        "summative_total_marks": None,
        "post_approval_edit_mode": PostApprovalEditMode.NOTIFY,
        "post_start_edit_mode": PostStartEditMode.BLOCK,
        "sealing_warning_days": None,
    },
    AssessmentType.GROUP_WORK: {
        "requires_moderation": False,
        "enforce_structure_template": False,
        "summative_total_marks": None,
        "post_approval_edit_mode": PostApprovalEditMode.NOTIFY,
        "post_start_edit_mode": PostStartEditMode.BLOCK,
        "sealing_warning_days": None,
    },
    AssessmentType.REASSESSMENT: {
        "requires_moderation": False,
        "enforce_structure_template": False,
        "summative_total_marks": None,
        "post_approval_edit_mode": PostApprovalEditMode.NOTIFY,
        "post_start_edit_mode": PostStartEditMode.BLOCK,
        "sealing_warning_days": None,
    },
}


class ApprovalPolicyService:
    """Service managing institutional assessment approval policies."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ApprovalPolicyRepository(db)

    async def seed_defaults_for_institution(
        self,
        institution_id: uuid.UUID,
    ) -> list[ApprovalPolicy]:
        """
        Idempotently ensure default approval policies exist for all 6 assessment types.
        Never overwrites existing records or creates duplicates.
        """
        institution = await self.db.get(Institution, institution_id)
        if not institution or institution.is_deleted:
            raise NotFoundError("Institution", str(institution_id))

        created_policies = []
        for assessment_type, defaults in DEFAULT_POLICY_CONFIGS.items():
            existing = await self.repo.get_by_institution_and_type(
                institution_id=institution_id,
                assessment_type=assessment_type,
            )
            if not existing:
                policy = ApprovalPolicy(
                    institution_id=institution_id,
                    assessment_type=assessment_type,
                    requires_moderation=defaults["requires_moderation"],
                    enforce_structure_template=defaults["enforce_structure_template"],
                    summative_total_marks=defaults["summative_total_marks"],
                    post_approval_edit_mode=defaults["post_approval_edit_mode"],
                    post_start_edit_mode=defaults["post_start_edit_mode"],
                    sealing_warning_days=defaults["sealing_warning_days"],
                    is_active=True,
                )
                await self.repo.create(policy)
                created_policies.append(policy)

        if created_policies:
            await self.db.commit()
            for p in created_policies:
                await self.db.refresh(p)

        return await self.repo.list_by_institution(institution_id)

    async def get_policy(self, policy_id: uuid.UUID) -> ApprovalPolicy:
        """Retrieve policy by ID."""
        policy = await self.repo.get_by_id(policy_id)
        if not policy:
            raise NotFoundError("ApprovalPolicy", str(policy_id))
        return policy

    async def get_policy_for_assessment(
        self,
        institution_id: uuid.UUID,
        assessment_type: AssessmentType,
    ) -> ApprovalPolicy:
        """
        Get policy for an institution and assessment type.
        If missing, seeds the default policy on-demand.
        """
        policy = await self.repo.get_by_institution_and_type(
            institution_id=institution_id,
            assessment_type=assessment_type,
        )
        if not policy:
            await self.seed_defaults_for_institution(institution_id)
            policy = await self.repo.get_by_institution_and_type(
                institution_id=institution_id,
                assessment_type=assessment_type,
            )
        return policy

    async def list_policies(
        self,
        *,
        institution_id: uuid.UUID | None = None,
        assessment_type: AssessmentType | None = None,
    ) -> list[ApprovalPolicy]:
        """List policies with optional filters."""
        return await self.repo.list_all(
            institution_id=institution_id,
            assessment_type=assessment_type,
        )

    async def update_policy(
        self,
        *,
        actor: User,
        policy_id: uuid.UUID,
        data: ApprovalPolicyUpdate,
    ) -> ApprovalPolicy:
        """
        Update policy fields with scope validation and audit trail.
        """
        policy = await self.repo.get_by_id(policy_id)
        if not policy:
            raise NotFoundError("ApprovalPolicy", str(policy_id))

        # Validate values
        if data.summative_total_marks is not None and data.summative_total_marks <= 0:
            raise BadRequestError("summative_total_marks must be a positive integer.")

        if data.sealing_warning_days is not None and data.sealing_warning_days < 0:
            raise BadRequestError("sealing_warning_days cannot be negative.")

        new_rules = None
        if data.compliance_rules is not None:
            try:
                new_rules = validate_rules(data.compliance_rules)
            except ValueError as exc:
                raise BadRequestError(str(exc), code="INVALID_COMPLIANCE_RULES") from exc

        before_state = {
            "requires_moderation": policy.requires_moderation,
            "enforce_structure_template": policy.enforce_structure_template,
            "summative_total_marks": policy.summative_total_marks,
            "post_approval_edit_mode": policy.post_approval_edit_mode.value,
            "post_start_edit_mode": policy.post_start_edit_mode.value,
            "sealing_warning_days": policy.sealing_warning_days,
            "compliance_rules": policy.compliance_rules,
        }

        # Apply updates
        if data.requires_moderation is not None:
            policy.requires_moderation = data.requires_moderation
        if data.enforce_structure_template is not None:
            policy.enforce_structure_template = data.enforce_structure_template
        # An explicit null means "this institution sets no fixed total marks"; an omitted field
        # means "leave it alone", so the two are told apart by what the client actually sent.
        if "summative_total_marks" in data.model_fields_set:
            policy.summative_total_marks = data.summative_total_marks
        if new_rules is not None:
            policy.compliance_rules = new_rules
        if data.post_approval_edit_mode is not None:
            policy.post_approval_edit_mode = data.post_approval_edit_mode
        if data.post_start_edit_mode is not None:
            policy.post_start_edit_mode = data.post_start_edit_mode
        if data.sealing_warning_days is not None:
            policy.sealing_warning_days = data.sealing_warning_days

        after_state = {
            "requires_moderation": policy.requires_moderation,
            "enforce_structure_template": policy.enforce_structure_template,
            "summative_total_marks": policy.summative_total_marks,
            "post_approval_edit_mode": policy.post_approval_edit_mode.value,
            "post_start_edit_mode": policy.post_start_edit_mode.value,
            "sealing_warning_days": policy.sealing_warning_days,
            "compliance_rules": policy.compliance_rules,
        }

        audit = AuditLog(
            actor_id=actor.id,
            actor_role=actor.role,
            entity_type="approval_policy",
            entity_id=policy.id,
            action="policy_updated",
            description=(
                f"Updated approval policy for {policy.assessment_type.value} "
                f"at institution {policy.institution_id}"
            ),
            before_state=before_state,
            after_state=after_state,
        )
        self.db.add(audit)

        await self.db.commit()
        loaded = await self.repo.get_by_id(policy.id)
        return loaded if loaded is not None else policy

    @staticmethod
    def build_response(policy: ApprovalPolicy) -> ApprovalPolicyResponse:
        """Enrich policy model with institution name."""
        from sqlalchemy import inspect as sa_inspect

        inst_name = None
        state = sa_inspect(policy)
        if state and "institution" not in state.unloaded and policy.institution:
            inst_name = policy.institution.name

        return ApprovalPolicyResponse(
            id=policy.id,
            institution_id=policy.institution_id,
            assessment_type=policy.assessment_type,
            requires_moderation=policy.requires_moderation,
            enforce_structure_template=policy.enforce_structure_template,
            summative_total_marks=policy.summative_total_marks,
            post_approval_edit_mode=policy.post_approval_edit_mode,
            post_start_edit_mode=policy.post_start_edit_mode,
            sealing_warning_days=policy.sealing_warning_days,
            compliance_rules=merge_rules(policy.compliance_rules),
            is_active=policy.is_active,
            created_at=policy.created_at,
            updated_at=policy.updated_at,
            institution_name=inst_name,
        )
