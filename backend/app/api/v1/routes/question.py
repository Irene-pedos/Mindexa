"""
app/api/v1/routes/question.py

Question Bank API endpoints for Mindexa Platform.

Endpoints:
    POST /questions              — Create a question
    GET  /questions              — Search / list questions
    GET  /questions/{id}         — Get question detail
    PUT  /questions/{id}         — Update question (creates new version by default)
    DELETE /questions/{id}       — Soft delete
    POST /questions/{id}/tags    — Attach tags
    DELETE /questions/{id}/tags  — Detach tags
    GET  /questions/tags         — List all available tags
"""

import uuid
from typing import List, Optional

from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import (require_active_user,
                                   require_lecturer_or_admin)
from app.schemas.question import (AttachTagsRequest, DetachTagsRequest,
                                  QuestionCreateRequest,
                                  QuestionDetailResponse, QuestionListResponse,
                                  QuestionSearchParams, QuestionTagResponse,
                                  QuestionUpdateRequest)
from app.services.question_service import QuestionService
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/questions", tags=["Question Bank"])


def _service(db: AsyncSession) -> QuestionService:
    return QuestionService(db)


# ---------------------------------------------------------------------------
# QUESTION CRUD
# ---------------------------------------------------------------------------


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create a question",
    description=(
        "Create a new question in the question bank. "
        "For MCQ and True/False, at least one option must be marked is_correct. "
        "The question is immediately active and available for use in assessments."
    ),
)
async def create_question(
    body: QuestionCreateRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> QuestionDetailResponse:
    svc = _service(db)
    question = await svc.create_question(body, current_user)
    await db.commit()
    # Reload with relationships
    question = await svc.get_question(question.id)
    return _to_detail_response(question)


@router.get(
    "",
    summary="Search and list questions",
    description=(
        "Paginated question search with filtering. "
        "Supports filtering by type, difficulty, subject, topic, bloom level, "
        "source type, and tag names. Full-text search on question content via 'q'."
    ),
)
async def list_questions(
    q: Optional[str] = Query(default=None, description="Full-text search on content"),
    question_type: Optional[str] = Query(default=None),
    difficulty: Optional[str] = Query(default=None),
    subject: Optional[str] = Query(default=None),
    topic: Optional[str] = Query(default=None),
    bloom_level: Optional[str] = Query(default=None),
    source_type: Optional[str] = Query(default=None),
    tag_names: Optional[List[str]] = Query(default=None),
    is_active: Optional[bool] = Query(default=True),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> QuestionListResponse:
    params = QuestionSearchParams(
        q=q,
        question_type=question_type,
        difficulty=difficulty,
        subject=subject,
        topic=topic,
        bloom_level=bloom_level,
        source_type=source_type,
        tag_names=tag_names,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )
    svc = _service(db)
    return await svc.search_questions(params, current_user)


@router.get(
    "/tags",
    summary="List all available question tags",
)
async def list_tags(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[QuestionTagResponse]:
    from app.db.repositories.question_repo import QuestionRepository
    repo = QuestionRepository(db)
    tags = await repo.list_tags()
    return [QuestionTagResponse.model_validate(t) for t in tags]


@router.get(
    "/{question_id}",
    summary="Get question detail",
    description="Returns full question including options, tags, and metadata.",
)
async def get_question(
    question_id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> QuestionDetailResponse:
    svc = _service(db)
    question = await svc.get_question(question_id)
    return _to_detail_response(question)


@router.put(
    "/{question_id}",
    summary="Update a question",
    description=(
        "Update a question. By default (create_new_version=true) archives the "
        "existing question and creates a new version, preserving audit history. "
        "Set create_new_version=false for minor in-place corrections only."
    ),
)
async def update_question(
    question_id: uuid.UUID,
    body: QuestionUpdateRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> QuestionDetailResponse:
    svc = _service(db)
    question = await svc.version_question(question_id, body, current_user)
    await db.commit()
    question = await svc.get_question(question.id)
    return _to_detail_response(question)


@router.delete(
    "/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete a question",
    description=(
        "Soft-deletes a question. Questions used in published assessments "
        "cannot be deleted — they must be archived (is_active=False) instead."
    ),
)
async def delete_question(
    question_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = _service(db)
    await svc.soft_delete_question(question_id, current_user)
    await db.commit()


# ---------------------------------------------------------------------------
# TAG MANAGEMENT
# ---------------------------------------------------------------------------


@router.post(
    "/{question_id}/tags",
    summary="Attach tags to a question",
    description="Creates tags if they don't exist. Idempotent — attaching an existing tag is a no-op.",
)
async def attach_tags(
    question_id: uuid.UUID,
    body: AttachTagsRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = _service(db)
    await svc.attach_tags(question_id, body.tag_names)
    await db.commit()
    return {"message": f"Attached {len(body.tag_names)} tag(s) to question."}


@router.delete(
    "/{question_id}/tags",
    summary="Detach tags from a question",
)
async def detach_tags(
    question_id: uuid.UUID,
    body: DetachTagsRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = _service(db)
    await svc.detach_tags(question_id, body.tag_names)
    await db.commit()
    return {"message": f"Detached {len(body.tag_names)} tag(s) from question."}


# ---------------------------------------------------------------------------
# INTERNAL HELPERS
# ---------------------------------------------------------------------------


def _to_detail_response(question) -> QuestionDetailResponse:
    """Safely serialise a Question ORM object to QuestionDetailResponse."""
    from app.schemas.question import (QuestionOptionResponse,
                                      QuestionTagResponse)

    options = [
        QuestionOptionResponse.model_validate(opt) for opt in (question.options or [])
    ]
    tags = []
    for link in question.tag_links or []:
        if link.tag:
            tags.append(QuestionTagResponse.model_validate(link.tag))

    return QuestionDetailResponse(
        id=question.id,
        content=question.content,
        explanation=question.explanation,
        hint=getattr(question, "hint", None),
        question_type=question.question_type,
        difficulty=question.difficulty,
        grading_mode=question.grading_mode,
        status=question.status,
        source_type=question.source_type,
        subject=question.subject,
        topic=question.topic,
        bloom_level=question.bloom_level,
        suggested_marks=question.suggested_marks,
        estimated_time_minutes=question.estimated_time_minutes,
        fill_blank_template=getattr(question, "fill_blank_template", None),
        correct_order_json=getattr(question, "correct_order_json", None),
        is_active=question.is_active,
        version_number=question.version_number,
        parent_question_id=question.parent_question_id,
        created_by_id=question.created_by_id,
        created_at=question.created_at,
        updated_at=question.updated_at,
        options=options,
        tags=tags,
    )
