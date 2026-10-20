"""
app/api/v1/routes/marking.py

Phase 5: Marking schemes, method marks (steps), material key points,
AI grade sample check trust-building flow, and grading delegations.
"""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin
from app.schemas.marking import (
    BulkAcceptRequest,
    BulkAcceptResponse,
    GradingDelegationCreate,
    GradingDelegationResponse,
    MaterialKeyPointCreate,
    MaterialKeyPointResponse,
    MarkingSchemeCreate,
    MarkingSchemeResponse,
    MarkingSchemeUpdate,
    QuestionKeyPointAttachRequest,
    QuestionKeyPointsResponse,
    QuestionMarkStepCreate,
    QuestionMarkStepResponse,
    QuestionMarkStepsBatchRequest,
    SampleCheckCreateRequest,
    SampleCheckResponse,
    SampleCheckVerifyRequest,
)
from app.services.marking_service import MarkingService

router = APIRouter(tags=["Marking & Schemes"])


# ── Marking Schemes ──────────────────────────────────────────────────────────


@router.get(
    "/lecturer/questions/{id}/marking-scheme",
    response_model=MarkingSchemeResponse,
    summary="Get marking scheme for a question",
)
async def get_marking_scheme(
    id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.get_marking_scheme(id, current_user)


@router.post(
    "/lecturer/questions/{id}/marking-scheme",
    response_model=MarkingSchemeResponse,
    summary="Create or update marking scheme for a question",
)
async def create_marking_scheme(
    id: uuid.UUID,
    body: MarkingSchemeCreate,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.create_or_update_marking_scheme(id, current_user, body)


@router.put(
    "/lecturer/questions/{id}/marking-scheme",
    response_model=MarkingSchemeResponse,
    summary="Update marking scheme for a question",
)
async def update_marking_scheme(
    id: uuid.UUID,
    body: MarkingSchemeUpdate,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.create_or_update_marking_scheme(id, current_user, body)


@router.delete(
    "/lecturer/questions/{id}/marking-scheme",
    status_code=status.HTTP_200_OK,
    summary="Delete marking scheme for a question",
)
async def delete_marking_scheme(
    id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    success = await service.delete_marking_scheme(id, current_user)
    return {"status": "success", "deleted": success}


# ── Step Marks (Method Marks, R-12) ──────────────────────────────────────────


@router.get(
    "/lecturer/questions/{id}/steps",
    response_model=List[QuestionMarkStepResponse],
    summary="List step marks / method marks for a question",
)
async def list_question_steps(
    id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.list_steps(id, current_user)


@router.post(
    "/lecturer/questions/{id}/steps",
    response_model=List[QuestionMarkStepResponse],
    summary="Save step marks for a question (validated against total question marks)",
)
async def save_question_steps(
    id: uuid.UUID,
    body: QuestionMarkStepsBatchRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.batch_save_steps(id, current_user, body.steps)


@router.put(
    "/lecturer/questions/{id}/steps",
    response_model=List[QuestionMarkStepResponse],
    summary="Replace step marks for a question",
)
async def update_question_steps(
    id: uuid.UUID,
    body: QuestionMarkStepsBatchRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.batch_save_steps(id, current_user, body.steps)


@router.delete(
    "/lecturer/questions/{id}/steps/{step_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a step mark",
)
async def delete_question_step(
    id: uuid.UUID,
    step_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    success = await service.delete_step(id, step_id, current_user)
    return {"status": "success", "deleted": success}


# ── Material Key Points (R-13c, R-13d) ───────────────────────────────────────


@router.get(
    "/lecturer/materials/{id}/key-points",
    response_model=List[MaterialKeyPointResponse],
    summary="List highlighted key points for a course material",
)
async def list_material_key_points(
    id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.list_material_key_points(id, current_user)


@router.post(
    "/lecturer/materials/{id}/key-points",
    response_model=MaterialKeyPointResponse,
    summary="Create a highlighted key point on a course material",
)
async def create_material_key_point(
    id: uuid.UUID,
    body: MaterialKeyPointCreate,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.create_material_key_point(id, current_user, body)


@router.delete(
    "/lecturer/materials/{id}/key-points/{key_point_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a key point from course material",
)
async def delete_material_key_point(
    id: uuid.UUID,
    key_point_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    success = await service.delete_material_key_point(key_point_id, current_user)
    return {"status": "success", "deleted": success}


@router.get(
    "/lecturer/questions/{id}/key-points",
    response_model=List[MaterialKeyPointResponse],
    summary="List key points linked to a question",
)
async def list_question_key_points(
    id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.list_question_key_points(id, current_user)


@router.post(
    "/lecturer/questions/{id}/key-points",
    response_model=List[MaterialKeyPointResponse],
    summary="Attach key points to a question",
)
async def attach_question_key_points(
    id: uuid.UUID,
    body: QuestionKeyPointAttachRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.attach_key_points_to_question(id, current_user, body.key_point_ids)


@router.delete(
    "/lecturer/questions/{id}/key-points/{key_point_id}",
    status_code=status.HTTP_200_OK,
    summary="Detach a key point from a question",
)
async def detach_question_key_point(
    id: uuid.UUID,
    key_point_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    success = await service.detach_key_point_from_question(id, key_point_id, current_user)
    return {"status": "success", "deleted": success}


# ── AI Grade Sample Check & Bulk Accept (R-13) ───────────────────────────────


@router.post(
    "/lecturer/assessments/{id}/grading/sample-check",
    response_model=SampleCheckResponse,
    summary="Create or retrieve a random sample check of pending AI grade reviews (R-13)",
)
async def create_grading_sample_check(
    id: uuid.UUID,
    body: SampleCheckCreateRequest = SampleCheckCreateRequest(),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.create_sample_check(id, current_user, sample_size=body.sample_size)


@router.get(
    "/lecturer/assessments/{id}/grading/sample-check",
    response_model=SampleCheckResponse,
    summary="Get latest sample check for an assessment",
)
async def get_latest_grading_sample_check(
    id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    check = await service.repo.get_latest_sample_check_for_assessment(id)
    if not check:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("No sample check found for this assessment", code="SAMPLE_CHECK_NOT_FOUND")
    return check


@router.post(
    "/lecturer/assessments/{id}/grading/sample-check/{sid}/verify",
    response_model=SampleCheckResponse,
    summary="Verify items in a sample check and calculate agreement rate",
)
async def verify_grading_sample_check(
    id: uuid.UUID,
    sid: uuid.UUID,
    body: SampleCheckVerifyRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.verify_sample_check(id, sid, current_user, body.verifications)


@router.post(
    "/lecturer/assessments/{id}/grading/bulk-accept",
    response_model=BulkAcceptResponse,
    summary="Bulk-accept all pending AI grade reviews (gated by verified sample check)",
)
async def bulk_accept_ai_grades(
    id: uuid.UUID,
    body: BulkAcceptRequest = BulkAcceptRequest(),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    res = await service.bulk_accept_grades(
        id,
        current_user,
        override_low_agreement=body.override_low_agreement,
        override_reason=body.override_reason,
        agreement_threshold=body.agreement_threshold,
    )
    return BulkAcceptResponse.model_validate(res)


# ── Grading Delegations (R-11, Section 9.7) ──────────────────────────────────


@router.get(
    "/lecturer/assessments/{id}/grading-delegations",
    response_model=List[GradingDelegationResponse],
    summary="List grading delegations for an assessment",
)
async def list_grading_delegations(
    id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.list_grading_delegations(id, current_user)


@router.post(
    "/lecturer/assessments/{id}/grading-delegations",
    response_model=GradingDelegationResponse,
    summary="Create a grading delegation to a fellow course lecturer",
)
async def create_grading_delegation(
    id: uuid.UUID,
    body: GradingDelegationCreate,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.create_grading_delegation(id, current_user, body)


@router.delete(
    "/lecturer/assessments/{id}/grading-delegations/{did}",
    response_model=GradingDelegationResponse,
    summary="Revoke a grading delegation",
)
async def revoke_grading_delegation(
    id: uuid.UUID,
    did: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    service = MarkingService(db)
    return await service.revoke_grading_delegation(id, did, current_user)
