"""
app/api/v1/routes/seal.py

Phase 3: Exam Office and Seal verification API endpoints.
Transport only — all business rules are delegated to SealService.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import Response as RawResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import Duty
from app.core.permissions import require_duty
from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import require_active_user
from app.schemas.moderation import (
    ExamOfficeQueueItemResponse,
    PrintJobResponse,
    PrintJobUpdateRequest,
    PublicSealVerificationResponse,
    RevokeSealRequest,
    RevokeSealResponse,
    SealAssessmentRequest,
    SealAssessmentResponse,
)
from app.services.seal_service import SealService

router = APIRouter(tags=["Exam Office & Seals"])


# ─────────────────────────────────────────────────────────────────────────────
# EXAM OFFICE WORKFLOW
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/exam-office/queue",
    response_model=List[ExamOfficeQueueItemResponse],
    summary="List approved and sealed assessments in the exam office queue",
)
async def get_exam_office_queue(
    status: Optional[str] = Query(None, description="Filter by status (APPROVED, SEALED)"),
    current_user: User = Depends(require_duty(Duty.EXAM_OFFICER)),
    db: AsyncSession = Depends(get_db),
) -> List[ExamOfficeQueueItemResponse]:
    svc = SealService(db)
    items = await svc.list_exam_office_queue(current_user=current_user, status=status)
    return [ExamOfficeQueueItemResponse.model_validate(it) for it in items]


@router.post(
    "/exam-office/assessments/{id}/seal",
    response_model=SealAssessmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Seal an approved assessment and create print job",
)
@router.post(
    "/assessments/{id}/seal",
    response_model=SealAssessmentResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)

async def seal_assessment(
    id: uuid.UUID,
    body: Optional[SealAssessmentRequest] = None,
    current_user: User = Depends(require_duty(Duty.EXAM_OFFICER)),
    db: AsyncSession = Depends(get_db),
) -> SealAssessmentResponse:
    svc = SealService(db)
    spare_pct = body.spare_percent if body else 5
    notes = body.notes if body else None
    seal, job = await svc.seal_assessment(
        assessment_id=id,
        current_user=current_user,
        spare_percent=spare_pct,
        notes=notes,
    )
    return SealAssessmentResponse(
        assessment_id=id,
        seal_id=seal.id,
        verification_code=seal.verification_code,
        status="SEALED",
        copies_total=job.copies_total,
        print_job_id=job.id,
    )


@router.post(
    "/exam-office/assessments/{id}/seal/revoke",
    response_model=RevokeSealResponse,
    summary="Revoke an active assessment seal",
)
@router.post(
    "/assessments/{id}/seal/revoke",
    response_model=RevokeSealResponse,
    include_in_schema=False,
)
async def revoke_seal(
    id: uuid.UUID,
    body: RevokeSealRequest,
    current_user: User = Depends(require_duty(Duty.EXAM_OFFICER)),
    db: AsyncSession = Depends(get_db),
) -> RevokeSealResponse:
    svc = SealService(db)
    revoked = await svc.revoke_seal(
        assessment_id=id,
        current_user=current_user,
        reason=body.reason,
    )
    return RevokeSealResponse(
        assessment_id=id,
        seal_id=revoked.id,
        revoked_at=revoked.revoked_at,
        revoke_reason=revoked.revoke_reason or "",
        status="APPROVED",
    )


@router.patch(
    "/exam-office/print-jobs/{id}",
    response_model=PrintJobResponse,
    summary="Update print job lifecycle status",
)
async def update_print_job(
    id: uuid.UUID,
    body: PrintJobUpdateRequest,
    current_user: User = Depends(require_duty(Duty.EXAM_OFFICER)),
    db: AsyncSession = Depends(get_db),
) -> PrintJobResponse:
    svc = SealService(db)
    job = await svc.update_print_job(
        job_id=id,
        current_user=current_user,
        status=body.status,
        notes=body.notes,
    )
    return PrintJobResponse.model_validate(job)


# ─────────────────────────────────────────────────────────────────────────────
# DOCUMENTS DOWNLOAD
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/assessments/{id}/documents/{document_type}",
    summary="Download generated institutional DOCX document (moderation-form, paper, marking-scheme)",
)
async def get_assessment_document(
    id: uuid.UUID,
    document_type: str,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> RawResponse:
    svc = SealService(db)
    content, filename = await svc.get_document(
        assessment_id=id,
        doc_type=document_type,
        current_user=current_user,
    )
    return RawResponse(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC VERIFY SEAL
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/public/verify-seal/{code}",
    response_model=PublicSealVerificationResponse,
    summary="Public seal verification endpoint (rate-limited, minimal payload)",
)
@router.get(
    "/assessments/verify/{code}",
    response_model=PublicSealVerificationResponse,
    include_in_schema=False,
)
async def verify_seal_public(
    code: str,
    db: AsyncSession = Depends(get_db),
) -> PublicSealVerificationResponse:
    svc = SealService(db)
    res = await svc.verify_seal(code)
    return PublicSealVerificationResponse.model_validate(res)

