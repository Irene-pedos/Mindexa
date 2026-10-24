"""
app/api/v1/routes/moderation.py

Phase 3: Moderation workflow API endpoints.
Transport only — all business logic is delegated to ModerationService.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import Duty
from app.core.permissions import require_duty
from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import require_active_user, require_lecturer_or_admin
from app.schemas.moderation import (
    ChecklistResultResponse,
    ModerationApproveRequest,
    ModerationCommentCreate,
    ModerationCommentResponse,
    ModerationDecideRequest,
    ModerationOverviewResponse,
    ModerationResubmitRequest,
    ModerationReviewResponse,
    ModerationSubmitRequest,
    ModeratorQueueItemResponse,
)
from app.services.moderation_service import ModerationService

router = APIRouter(tags=["Moderation"])


@router.post(
    "/lecturer/assessments/{id}/moderation/checklist",
    response_model=ChecklistResultResponse,
    summary="Run automated pre-moderation checklist on demand",
)
@router.post(
    "/assessments/{id}/moderation/checklist",
    response_model=ChecklistResultResponse,
    include_in_schema=False,
)
async def run_pre_moderation_checklist(
    id: uuid.UUID,
    body: Optional[ModerationSubmitRequest] = None,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> ChecklistResultResponse:
    svc = ModerationService(db)
    run_ai = body.run_ai_review if body else False
    chk = await svc.run_pre_moderation_checklist(
        assessment_id=id,
        current_user=current_user,
        run_ai_review=run_ai,
    )
    return ChecklistResultResponse.model_validate(chk.to_dict())


@router.post(
    "/lecturer/assessments/{id}/moderation/submit",
    status_code=status.HTTP_201_CREATED,
    summary="Submit assessment for moderation review",
)
@router.post(
    "/assessments/{id}/moderation/submit",
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)

async def submit_for_moderation(
    id: uuid.UUID,
    body: Optional[ModerationSubmitRequest] = None,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = ModerationService(db)
    run_ai = body.run_ai_review if body else False
    review, chk = await svc.submit_for_moderation(
        assessment_id=id,
        current_user=current_user,
        run_ai_review=run_ai,
    )
    return {
        "assessment_id": str(id),
        "status": "PENDING_MODERATION",
        "round_no": review.round_no,
        "review_id": str(review.id),
        "checklist": chk.to_dict(),
    }


@router.get(
    "/lecturer/assessments/{id}/moderation",
    response_model=ModerationOverviewResponse,
    summary="Get moderation overview and round history",
)
async def get_moderation_overview(
    id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> ModerationOverviewResponse:
    svc = ModerationService(db)
    overview = await svc.get_moderation_overview(assessment_id=id, current_user=current_user)
    return ModerationOverviewResponse.model_validate(overview)


@router.post(
    "/lecturer/assessments/{id}/moderation/resubmit",
    status_code=status.HTTP_201_CREATED,
    summary="Resubmit assessment after making requested changes",
)
async def resubmit_for_moderation(
    id: uuid.UUID,
    body: Optional[ModerationResubmitRequest] = None,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = ModerationService(db)
    reason = body.reason if body else None
    run_ai = body.run_ai_review if body else False
    review, chk = await svc.resubmit_for_moderation(
        assessment_id=id,
        current_user=current_user,
        reason=reason,
        run_ai_review=run_ai,
    )
    return {
        "assessment_id": str(id),
        "status": "PENDING_MODERATION",
        "round_no": review.round_no,
        "review_id": str(review.id),
        "checklist": chk.to_dict(),
    }


@router.post(
    "/lecturer/moderation/comments/{id}/resolve",
    response_model=ModerationCommentResponse,
    summary="Mark a moderation comment as resolved",
)
async def resolve_moderation_comment(
    id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> ModerationCommentResponse:
    svc = ModerationService(db)
    comment = await svc.resolve_comment(comment_id=id, current_user=current_user)
    return ModerationCommentResponse.model_validate(comment)


# ─────────────────────────────────────────────────────────────────────────────
# MODERATOR QUEUE & DECISIONS
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/moderator/queue",
    response_model=List[ModeratorQueueItemResponse],
    summary="List assessments awaiting moderation in moderator's department",
)
async def get_moderator_queue(
    status: Optional[str] = Query(None, description="Filter by status (OPEN, CHANGES_REQUESTED)"),
    current_user: User = Depends(require_duty(Duty.MODERATOR)),
    db: AsyncSession = Depends(get_db),
) -> List[ModeratorQueueItemResponse]:
    svc = ModerationService(db)
    items = await svc.list_moderator_queue(current_user=current_user, status=status)
    return [ModeratorQueueItemResponse.model_validate(it) for it in items]


@router.post(
    "/moderator/reviews/{id}/claim",
    summary="Claim an open moderation review round",
)
async def claim_review(
    id: uuid.UUID,
    current_user: User = Depends(require_duty(Duty.MODERATOR)),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = ModerationService(db)
    review = await svc.claim_review(review_id=id, current_user=current_user)
    return {
        "review_id": str(review.id),
        "reviewer_id": str(review.reviewer_id),
        "claimed_at": review.claimed_at.isoformat() if review.claimed_at else None,
        "status": review.status.value,
    }


@router.post(
    "/moderator/reviews/{id}/comments",
    response_model=ModerationCommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment or change request to a review round",
)
async def add_review_comment(
    id: uuid.UUID,
    body: ModerationCommentCreate,
    current_user: User = Depends(require_duty(Duty.MODERATOR)),
    db: AsyncSession = Depends(get_db),
) -> ModerationCommentResponse:
    svc = ModerationService(db)
    comment = await svc.add_comment(
        review_id=id,
        current_user=current_user,
        target_type=body.target_type,
        target_id=body.target_id,
        category=body.category,
        comment=body.comment,
    )
    return ModerationCommentResponse.model_validate(comment)


@router.post(
    "/moderator/reviews/{id}/request-changes",
    summary="Request changes on an assessment under review",
)
async def request_review_changes(
    id: uuid.UUID,
    body: ModerationDecideRequest,
    current_user: User = Depends(require_duty(Duty.MODERATOR)),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = ModerationService(db)
    decided = await svc.request_changes(
        review_id=id,
        current_user=current_user,
        decision_note=body.decision_note,
    )
    return {
        "review_id": str(decided.id),
        "status": decided.status.value,
        "decision_note": decided.decision_note,
        "decided_at": decided.decided_at.isoformat() if decided.decided_at else None,
    }


@router.post(
    "/moderator/reviews/{id}/approve",
    summary="Approve an assessment review round",
)
async def approve_review(
    id: uuid.UUID,
    body: Optional[ModerationApproveRequest] = None,
    current_user: User = Depends(require_duty(Duty.MODERATOR)),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = ModerationService(db)
    decision_note = body.decision_note if body else None
    ack = body.acknowledge_warnings if body else True
    decided = await svc.approve_review(
        review_id=id,
        current_user=current_user,
        decision_note=decision_note,
        acknowledge_warnings=ack,
        override_failed_checks=body.override_failed_checks if body else False,
        override_reason=body.override_reason if body else None,
    )
    return {
        "review_id": str(decided.id),
        "status": decided.status.value,
        "decision_note": decided.decision_note,
        "compliance_override": decided.compliance_override,
        "decided_at": decided.decided_at.isoformat() if decided.decided_at else None,
    }
