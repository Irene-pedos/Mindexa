from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pptx_exporter import build_slide_deck_pptx
from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin
from app.schemas.lecturer_ai import (
    LearningUnitItemResponse,
    LecturerSupportRequest,
    LecturerSupportResponse,
    RubricDraftRequest,
    RubricDraftResponse,
    RubricSaveRequest,
    RubricSaveResponse,
    SlideDeckExportRequest,
    SlideDeckGenerateRequest,
    SlideDeckGenerateResponse,
)
from app.services.lecturer_ai_service import LecturerAIService

router = APIRouter(prefix="/lecturers/ai", tags=["Lecturer AI"])


@router.post(
    "/support",
    status_code=status.HTTP_200_OK,
    response_model=LecturerSupportResponse,
    summary="Ask the Lecturer AI Assistant",
)
async def lecturer_support(
    body: LecturerSupportRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> LecturerSupportResponse:
    service = LecturerAIService(db)
    return await service.support(body, current_user)


# ─── Learning Units & Slide Decks ─────────────────────────────────────────────

@router.get(
    "/workspaces/{workspace_id}/learning-units",
    status_code=status.HTTP_200_OK,
    response_model=List[LearningUnitItemResponse],
    summary="Get segmented Learning Units for a teaching workspace (with auto-segmentation fallback)",
)
async def get_workspace_learning_units(
    workspace_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> List[LearningUnitItemResponse]:
    service = LecturerAIService(db)
    return await service.get_workspace_learning_units(workspace_id, current_user)


@router.post(
    "/slides/{learning_unit_id}/generate",
    status_code=status.HTTP_200_OK,
    response_model=SlideDeckGenerateResponse,
    summary="Generate a structured slide deck outline from a Learning Unit",
)
async def generate_slide_deck(
    learning_unit_id: uuid.UUID,
    body: SlideDeckGenerateRequest = SlideDeckGenerateRequest(),
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> SlideDeckGenerateResponse:
    service = LecturerAIService(db)
    return await service.generate_slide_deck(
        learning_unit_id=learning_unit_id,
        current_user=current_user,
        estimated_minutes=body.estimated_minutes,
        selected_outcomes=body.selected_outcomes,
    )


@router.post(
    "/slides/export",
    status_code=status.HTTP_200_OK,
    summary="Export slide deck JSON as a .pptx presentation file",
)
async def export_slide_deck(
    body: SlideDeckExportRequest,
    current_user: User = Depends(require_lecturer_or_admin),
) -> Response:
    pptx_bytes = build_slide_deck_pptx(body.deck)
    filename = f"slide-deck-{uuid.uuid4().hex[:8]}.pptx"
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ─── Rubric Assistant ─────────────────────────────────────────────────────────

@router.post(
    "/rubrics/draft",
    status_code=status.HTTP_200_OK,
    response_model=RubricDraftResponse,
    summary="Draft or enhance rubric criteria grounded to a Question",
)
async def draft_rubric(
    body: RubricDraftRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> RubricDraftResponse:
    service = LecturerAIService(db)
    return await service.draft_rubric(body, current_user)


@router.post(
    "/rubrics/save",
    status_code=status.HTTP_200_OK,
    response_model=RubricSaveResponse,
    summary="Save rubric criteria directly to the database and attach to target Question",
)
async def save_rubric(
    body: RubricSaveRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> RubricSaveResponse:
    service = LecturerAIService(db)
    return await service.save_rubric_to_question(body, current_user)
