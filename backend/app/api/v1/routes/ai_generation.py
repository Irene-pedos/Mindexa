"""
app/api/v1/routes/ai_generation.py

AI Question Generation API endpoints for Mindexa Platform.

Endpoints:
    POST /ai/generate              — Request AI question generation batch
    GET  /ai/batches               — List generation batches (caller's own)
    GET  /ai/batches/{batch_id}    — Get batch detail with all generated questions
    POST /ai/review/{ai_q_id}      — Submit lecturer review for one AI question

IMPORTANT:
    AI-generated questions NEVER enter an assessment or question bank
    without an explicit ACCEPTED or MODIFIED review decision.
    The system enforces this at the service layer — there is no bypass.
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin
from app.schemas.ai_generation import (
    AIGenerationBatchDetailResponse,
    AIGenerationBatchListResponse,
    GenerateQuestionsRequest,
    ReviewAIQuestionRequest,
)
from app.services.ai_generation_service import AIGenerationService

router = APIRouter(prefix="/ai", tags=["AI Question Generation"])


def _service(db: AsyncSession) -> AIGenerationService:
    return AIGenerationService(db)


# ---------------------------------------------------------------------------
# GENERATE
# ---------------------------------------------------------------------------


@router.post(
    "/generate",
    status_code=status.HTTP_201_CREATED,
    summary="Generate a batch of AI questions",
    description=(
        "Submit an AI question generation request. "
        "The AI generates `count` candidate questions for the specified "
        "subject, topic, type, and difficulty. "
        "All generated questions require lecturer review before use. "
        "Returns the batch immediately with all generated candidates."
    ),
)
async def generate_questions(
    body: GenerateQuestionsRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AIGenerationBatchDetailResponse:
    svc = _service(db)
    result = await svc.generate_questions_batch(body, current_user)
    return result


# ---------------------------------------------------------------------------
# BATCH LISTING
# ---------------------------------------------------------------------------


@router.get(
    "/batches",
    summary="List AI generation batches",
    description="Returns paginated list of the caller's generation batches.",
)
async def list_batches(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AIGenerationBatchListResponse:
    svc = _service(db)
    return await svc.list_batches(current_user, page=page, page_size=page_size)


@router.get(
    "/batches/{batch_id}",
    summary="Get batch detail",
    description="Returns a generation batch with all its generated question candidates.",
)
async def get_batch(
    batch_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AIGenerationBatchDetailResponse:
    svc = _service(db)
    return await svc.get_batch(batch_id, current_user)


# ---------------------------------------------------------------------------
# REVIEW
# ---------------------------------------------------------------------------


@router.post(
    "/review/{ai_question_id}",
    summary="Submit review decision for an AI-generated question",
    description=(
        "Apply a review decision to a single AI-generated question candidate. "
        "Decisions:\n"
        "  - `approved`: Use the AI question as-is. Promotes to Question table.\n"
        "  - `edited`: Use with modifications. Provide modified_question_text. "
        "    Promotes edited version to Question table.\n"
        "  - `rejected`: Discard. No Question row created.\n"
        "  - `needs_revision`: Flag for later. No action yet.\n\n"
        "If add_to_assessment_id is provided with an approved/edited decision, "
        "the promoted question is immediately added to that assessment."
    ),
)
async def review_ai_question(
    ai_question_id: uuid.UUID,
    body: ReviewAIQuestionRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = _service(db)
    review, promoted_question = await svc.review_ai_question(
        ai_question_id, body, current_user
    )

    response: dict = {
        "review": {
            "id": str(review.id),
            "ai_question_id": str(review.ai_question_id),
            "decision": review.decision,
            "reviewer_id": str(review.reviewer_id),
            "reviewed_at": review.reviewed_at.isoformat(),
        }
    }

    if promoted_question:
        response["promoted_question"] = promoted_question

    return response
