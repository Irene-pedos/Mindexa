"""
app/api/v1/routes/study_reader.py

API router for the Study Reader revision workspace:
- GET /{kind}/{id} -> Metadata
- GET/PUT /{kind}/{id}/progress -> Resume & progress persistence
- GET/POST /{kind}/{id}/annotations -> Highlight & note management
- PATCH/DELETE /annotations/{annotation_id} -> Edit/delete annotation
- GET/POST /{kind}/{id}/key-points -> Conceptual points management
- PATCH/DELETE /key-points/{key_point_id} -> Edit/delete key points
- GET /{kind}/{id}/export -> Markdown / JSON revision sheet export
- POST /{kind}/{id}/skim -> Quick document summary & page-linked skim
"""

import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_student
from app.schemas.study_reader import (
    AnnotationCreate,
    AnnotationResponse,
    AnnotationUpdate,
    KeyPointCreate,
    KeyPointResponse,
    KeyPointUpdate,
    ReaderMetadataResponse,
    ReadingProgressResponse,
    ReadingProgressUpdate,
    RevisionSheetExportResponse,
    SkimResponse,
    SourceKind,
)
from app.services.study_reader_service import StudyReaderService

router = APIRouter(prefix="/student/reader", tags=["Student Reader"])


# ── Metadata ─────────────────────────────────────────────────────────────────

@router.get(
    "/{kind}/{resource_id}",
    response_model=ReaderMetadataResponse,
    summary="Get study reader resource metadata and authz check",
)
async def get_reader_metadata(
    kind: SourceKind,
    resource_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> ReaderMetadataResponse:
    service = StudyReaderService(db)
    return await service.get_metadata(current_user.id, kind, resource_id)


# ── Progress ─────────────────────────────────────────────────────────────────

@router.get(
    "/{kind}/{resource_id}/progress",
    response_model=ReadingProgressResponse | None,
    summary="Get saved reading progress for student",
)
async def get_reading_progress(
    kind: SourceKind,
    resource_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> ReadingProgressResponse | None:
    service = StudyReaderService(db)
    return await service.get_progress(current_user.id, kind, resource_id)


@router.put(
    "/{kind}/{resource_id}/progress",
    response_model=ReadingProgressResponse,
    summary="Save or update reading progress for student",
)
async def save_reading_progress(
    kind: SourceKind,
    resource_id: uuid.UUID,
    body: ReadingProgressUpdate,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> ReadingProgressResponse:
    service = StudyReaderService(db)
    return await service.save_progress(current_user.id, kind, resource_id, body)


# ── Annotations ──────────────────────────────────────────────────────────────

@router.get(
    "/{kind}/{resource_id}/annotations",
    response_model=List[AnnotationResponse],
    summary="List all highlights and annotations for this document",
)
async def list_annotations(
    kind: SourceKind,
    resource_id: uuid.UUID,
    page_number: Optional[int] = Query(None, ge=1, description="Filter annotations by page number"),
    limit: int = Query(500, ge=1, le=1000, description="Max annotations to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> List[AnnotationResponse]:
    service = StudyReaderService(db)
    return await service.list_annotations(
        current_user.id, kind, resource_id, page_number=page_number, limit=limit, offset=offset
    )


@router.post(
    "/{kind}/{resource_id}/annotations",
    response_model=AnnotationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new highlight and optional note",
)
async def create_annotation(
    kind: SourceKind,
    resource_id: uuid.UUID,
    body: AnnotationCreate,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AnnotationResponse:
    service = StudyReaderService(db)
    return await service.create_annotation(current_user.id, kind, resource_id, body)


@router.patch(
    "/annotations/{annotation_id}",
    response_model=AnnotationResponse,
    summary="Update color or note on an existing annotation",
)
async def update_annotation(
    annotation_id: uuid.UUID,
    body: AnnotationUpdate,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> AnnotationResponse:
    service = StudyReaderService(db)
    return await service.update_annotation(annotation_id, current_user.id, body)


@router.delete(
    "/annotations/{annotation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an annotation",
)
async def delete_annotation(
    annotation_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> None:
    service = StudyReaderService(db)
    await service.delete_annotation(annotation_id, current_user.id)


# ── Key Points ───────────────────────────────────────────────────────────────

@router.get(
    "/{kind}/{resource_id}/key-points",
    response_model=List[KeyPointResponse],
    summary="List key points recorded for this document",
)
async def list_key_points(
    kind: SourceKind,
    resource_id: uuid.UUID,
    page_number: Optional[int] = Query(None, ge=1, description="Filter key points by page number"),
    tag: Optional[str] = Query(None, description="Filter key points by tag"),
    limit: int = Query(500, ge=1, le=1000, description="Max key points to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> List[KeyPointResponse]:
    service = StudyReaderService(db)
    return await service.list_key_points(
        current_user.id, kind, resource_id, page_number=page_number, tag=tag, limit=limit, offset=offset
    )


@router.post(
    "/{kind}/{resource_id}/key-points",
    response_model=KeyPointResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new key conceptual point",
)
async def create_key_point(
    kind: SourceKind,
    resource_id: uuid.UUID,
    body: KeyPointCreate,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> KeyPointResponse:
    service = StudyReaderService(db)
    return await service.create_key_point(current_user.id, kind, resource_id, body)


@router.patch(
    "/key-points/{key_point_id}",
    response_model=KeyPointResponse,
    summary="Update an existing key point",
)
async def update_key_point(
    key_point_id: uuid.UUID,
    body: KeyPointUpdate,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> KeyPointResponse:
    service = StudyReaderService(db)
    return await service.update_key_point(key_point_id, current_user.id, body)


@router.delete(
    "/key-points/{key_point_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a key point",
)
async def delete_key_point(
    key_point_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> None:
    service = StudyReaderService(db)
    await service.delete_key_point(key_point_id, current_user.id)


# ── Revision Export & Skim ───────────────────────────────────────────────────

@router.get(
    "/{kind}/{resource_id}/export",
    response_model=RevisionSheetExportResponse,
    summary="Export combined revision sheet with key points and notes",
)
async def export_revision_sheet(
    kind: SourceKind,
    resource_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> RevisionSheetExportResponse:
    service = StudyReaderService(db)
    return await service.export_revision_sheet(current_user.id, kind, resource_id)


@router.post(
    "/{kind}/{resource_id}/skim",
    response_model=SkimResponse,
    summary="Generate 8-12 bullet quick skim for document with page links",
)
async def skim_document(
    kind: SourceKind,
    resource_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> SkimResponse:
    service = StudyReaderService(db)
    return await service.skim_document(current_user.id, kind, resource_id)


# ── Phase 3: Focus & Weakness Engine ─────────────────────────────────────────

from app.schemas.study_reader import (
    ExamLensResponse,
    FocusResponse,
    PageCheckRequest,
    PageCheckResponse,
    PageCheckSubmitRequest,
    PageCheckSubmitResponse,
)


@router.get(
    "/{kind}/{resource_id}/focus",
    response_model=FocusResponse,
    summary="Get aggregated page heat map, focus next queue, and spaced reviews",
)
async def get_document_focus(
    kind: SourceKind,
    resource_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> FocusResponse:
    service = StudyReaderService(db)
    return await service.get_focus(current_user.id, kind, resource_id)


@router.post(
    "/{kind}/{resource_id}/page-check",
    response_model=PageCheckResponse,
    summary="Generate 2-3 active recall questions grounded in current page chunks",
)
async def generate_page_check(
    kind: SourceKind,
    resource_id: uuid.UUID,
    body: PageCheckRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> PageCheckResponse:
    service = StudyReaderService(db)
    return await service.generate_page_check(
        current_user.id, kind, resource_id, body.page_number, body.selected_text
    )


@router.post(
    "/{kind}/{resource_id}/page-check/submit",
    response_model=PageCheckSubmitResponse,
    summary="Submit answers for page recall check and record weak flags if needed",
)
async def submit_page_check(
    kind: SourceKind,
    resource_id: uuid.UUID,
    body: PageCheckSubmitRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> PageCheckSubmitResponse:
    service = StudyReaderService(db)
    return await service.submit_page_check(current_user.id, kind, resource_id, body)


@router.get(
    "/{kind}/{resource_id}/exam-lens",
    response_model=ExamLensResponse,
    summary="Filter material pages related to a specific past or upcoming assessment",
)
async def get_exam_lens(
    kind: SourceKind,
    resource_id: uuid.UUID,
    assessment_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> ExamLensResponse:
    service = StudyReaderService(db)
    return await service.get_exam_lens(current_user.id, kind, resource_id, assessment_id)
