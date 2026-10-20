"""
backend/app/api/v1/routes/authoring.py

API routes for Phase 4 authoring collaborations, delegations, version history, and diffs.
Governing source of truth: MINDEXA_INSTITUTIONAL_WORKFLOWS_SPEC.md Section 8.3.
"""
from __future__ import annotations

from typing import List
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin
from app.schemas.assessment import AssessmentDetailResponse
from app.schemas.authoring import (
    AssessmentCollaboratorCreate,
    AssessmentCollaboratorResponse,
    AssessmentVersionDiffResponse,
    AssessmentVersionSummaryResponse,
    AuthorDelegationCreate,
    AuthorDelegationResponse,
    PostApprovalEditRequest,
)
from app.services.authoring_service import AuthoringService

router = APIRouter(prefix="/lecturer/assessments", tags=["assessment-authoring-and-delegation"])


def _service(db: AsyncSession) -> AuthoringService:
    return AuthoringService(db)


# ── Collaborator Endpoints ────────────────────────────────────────────────────

@router.post(
    "/{assessment_id}/collaborators",
    response_model=AssessmentCollaboratorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a co-author to an assessment",
    description="Only the owner (author) can add collaborators. Target lecturer must have an active teaching assignment for the course (R-01).",
)
async def add_collaborator(
    assessment_id: uuid.UUID,
    body: AssessmentCollaboratorCreate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentCollaboratorResponse:
    svc = _service(db)
    collab = await svc.add_collaborator(assessment_id, current_user, body)
    return AssessmentCollaboratorResponse.model_validate(collab)


@router.delete(
    "/{assessment_id}/collaborators/{collaborator_id}",
    status_code=status.HTTP_200_OK,
    summary="Remove a collaborator from an assessment",
    description="Only the owner (author) or admin can remove collaborators. Owner cannot be removed.",
)
async def remove_collaborator(
    assessment_id: uuid.UUID,
    collaborator_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = _service(db)
    await svc.remove_collaborator(assessment_id, collaborator_id, current_user)
    return {"status": "success", "message": "Collaborator removed successfully."}


@router.get(
    "/{assessment_id}/collaborators",
    response_model=List[AssessmentCollaboratorResponse],
    summary="List collaborators for an assessment",
)
async def list_collaborators(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> List[AssessmentCollaboratorResponse]:
    svc = _service(db)
    collabs = await svc.list_collaborators(assessment_id, current_user)
    return [AssessmentCollaboratorResponse.model_validate(c) for c in collabs]


# ── Delegation Endpoints ──────────────────────────────────────────────────────

@router.post(
    "/{assessment_id}/delegations",
    response_model=AuthorDelegationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an author delegation for this assessment",
    description="Allowed by author or department HOD (R-09). Delegate must be a lecturer in the same department as the assessment course.",
)
async def create_delegation(
    assessment_id: uuid.UUID,
    body: AuthorDelegationCreate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AuthorDelegationResponse:
    svc = _service(db)
    delegation = await svc.create_delegation(assessment_id, current_user, body)
    return AuthorDelegationResponse.model_validate(delegation)


@router.delete(
    "/{assessment_id}/delegations/{delegation_id}",
    response_model=AuthorDelegationResponse,
    summary="Revoke an author delegation",
    description="Allowed by author, original delegator, department HOD, or admin.",
)
async def revoke_delegation(
    assessment_id: uuid.UUID,
    delegation_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AuthorDelegationResponse:
    svc = _service(db)
    revoked = await svc.revoke_delegation(assessment_id, delegation_id, current_user)
    return AuthorDelegationResponse.model_validate(revoked)


@router.get(
    "/{assessment_id}/delegations",
    response_model=List[AuthorDelegationResponse],
    summary="List delegations for an assessment",
)
async def list_delegations(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> List[AuthorDelegationResponse]:
    svc = _service(db)
    delegations = await svc.list_delegations(assessment_id, current_user)
    return [AuthorDelegationResponse.model_validate(d) for d in delegations]


# ── Version History & Diff Endpoints ──────────────────────────────────────────

@router.get(
    "/{assessment_id}/versions",
    response_model=List[AssessmentVersionSummaryResponse],
    summary="List version snapshots for an assessment",
    description="Accessible by author, co-authors, delegates, moderators, and HOD.",
)
async def list_versions(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> List[AssessmentVersionSummaryResponse]:
    svc = _service(db)
    versions = await svc.list_versions(assessment_id, current_user)
    return [AssessmentVersionSummaryResponse.model_validate(v) for v in versions]


@router.get(
    "/{assessment_id}/versions/{version_no_a}/diff/{version_no_b}",
    response_model=AssessmentVersionDiffResponse,
    summary="Get structured diff between two version snapshots",
    description="Generates field-level diff between version A and version B.",
)
async def get_version_diff(
    assessment_id: uuid.UUID,
    version_no_a: int,
    version_no_b: int,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentVersionDiffResponse:
    svc = _service(db)
    return await svc.get_version_diff(assessment_id, version_no_a, version_no_b, current_user)


# ── Post-Approval Edit Endpoint ───────────────────────────────────────────────

@router.post(
    "/{assessment_id}/post-approval-edit",
    response_model=AssessmentDetailResponse,
    summary="Execute an audited post-approval edit on an assessment",
    description="Requires mandatory justification reason (min 10 chars). Supersedes seal and notifies exam office if sealed. Returns to moderation if policy is REQUIRE_REAPPROVAL.",
)
async def post_approval_edit(
    assessment_id: uuid.UUID,
    body: PostApprovalEditRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentDetailResponse:
    svc = _service(db)
    assessment = await svc.apply_post_approval_edit(assessment_id, current_user, body)
    return AssessmentDetailResponse.model_validate(assessment)
