"""
app/api/v1/routes/grading.py

Grading workflow routes.

Endpoints:
    POST  /grading/grade-attempt/{attempt_id} → Grade all responses (trigger after submission)
    POST  /grading/manual                     → Lecturer submits a manual grade
    POST  /grading/confirm-ai                 → Lecturer confirms/overrides AI suggestion
    GET   /grading/queue                      → List pending grading queue items
    PATCH /grading/queue/{item_id}/assign     → Assign queue item to a lecturer
    GET   /grading/{response_id}              → Get grade for a response
    GET   /grading/attempt/{attempt_id}       → Get all grades for an attempt
"""

from __future__ import annotations

import uuid
from typing import Optional

from app.core.exceptions import NotFoundError
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.grading_repo import GradingRepository
from app.db.repositories.submission_repo import SubmissionRepository
from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin
from app.schemas.grading import (AIGradeConfirmRequest, AttemptGradingSummary,
                                 GradingQueueItemResponse,
                                 GradingQueueListResponse, ManualGradeRequest,
                                 QueueItemAssignRequest,
                                 SubmissionGradeResponse)
from app.services.grading_service import GradingService
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/grading", tags=["Grading"])


# ── GRADE ATTEMPT (post-submission trigger) ────────────────────────────────────


@router.post(
    "/grade-attempt/{attempt_id}",
    response_model=dict,
    summary="Trigger auto-grading for all responses in a submitted attempt",
)
async def grade_attempt(
    attempt_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Run the grading pipeline for a submitted attempt.

    For each response:
        - Auto-gradable questions → graded immediately
        - Open-ended questions → added to manual grading queue

    Typically called automatically after submission.
    Lecturers can also trigger manually for re-grading.
    """
    attempt_repo = AttemptRepository(db)
    attempt = await attempt_repo.get_by_id_simple(attempt_id)
    if not attempt:
        raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

    service = GradingService(db)
    counts = await service.grade_attempt(
        attempt_id=attempt_id,
        assessment_id=attempt.assessment_id,
        student_id=attempt.student_id,
    )
    await db.commit()
    return {
        "attempt_id": str(attempt_id),
        "auto_graded": counts["auto"],
        "queued_for_manual": counts["queued"],
        "skipped": counts["skipped"],
        "message": (
            f"Grading complete: {counts['auto']} auto-graded, "
            f"{counts['queued']} queued for review, {counts['skipped']} skipped."
        ),
    }


# ── MANUAL GRADE ──────────────────────────────────────────────────────────────


@router.post(
    "/manual",
    response_model=SubmissionGradeResponse,
    summary="Submit a manual grade for a response",
)
async def manual_grade(
    body: ManualGradeRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> SubmissionGradeResponse:
    """
    Lecturer submits a grade for an open-ended response.

    If is_final=True, locks the grade and marks the queue item COMPLETED.
    If is_final=False, saves as a draft grade for later finalisation.
    """
    service = GradingService(db)
    grade = await service.finalize_grade(
        response_id=body.response_id,
        lecturer_id=current_user.id,
        score=body.score,
        feedback=body.feedback,
        internal_notes=body.internal_notes,
        rubric_scores=body.rubric_scores,
        accept_ai_suggestion=False,
    )
    await db.commit()
    return SubmissionGradeResponse.model_validate(grade)


# ── CONFIRM / OVERRIDE AI SUGGESTION ─────────────────────────────────────────


@router.post(
    "/confirm-ai",
    response_model=SubmissionGradeResponse,
    summary="Confirm or override an AI grading suggestion",
)
async def confirm_ai_grade(
    body: AIGradeConfirmRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> SubmissionGradeResponse:
    """
    Lecturer reviews an AI-suggested grade and either:
        - Accepts it (accept_ai_suggestion=True)
        - Overrides it with a different score (accept_ai_suggestion=False, override_score=X)

    In both cases, is_final is set to True.
    """
    service = GradingService(db)
    grade = await service.finalize_grade(
        response_id=body.response_id,
        lecturer_id=current_user.id,
        score=body.override_score or 0.0,
        feedback=body.feedback,
        internal_notes=body.internal_notes,
        rubric_scores=body.rubric_scores,
        accept_ai_suggestion=body.accept_ai_suggestion,
    )
    await db.commit()
    return SubmissionGradeResponse.model_validate(grade)


# ── GET GRADE FOR RESPONSE ────────────────────────────────────────────────────


@router.get(
    "/response/{response_id}",
    response_model=SubmissionGradeResponse,
    summary="Get the grade for a specific response",
)
async def get_grade_for_response(
    response_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> SubmissionGradeResponse:
    repo = GradingRepository(db)
    grade = await repo.get_grade_by_response(response_id)
    if not grade:
        raise NotFoundError("Grade not found", code="GRADE_NOT_FOUND")
    return SubmissionGradeResponse.model_validate(grade)


# ── GET ALL GRADES FOR ATTEMPT ────────────────────────────────────────────────


@router.get(
    "/attempt/{attempt_id}",
    response_model=AttemptGradingSummary,
    summary="Get grading progress summary for an attempt",
)
async def get_attempt_grading_summary(
    attempt_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AttemptGradingSummary:
    """
    Return the grading progress summary for an attempt.
    Shows how many questions are graded, pending, etc.
    """
    grading_repo = GradingRepository(db)
    submission_repo = SubmissionRepository(db)

    all_grades = await grading_repo.list_grades_for_attempt(attempt_id)
    total_responses = await submission_repo.count_responses(attempt_id)
    final_grades = [g for g in all_grades if g.is_final]
    pending_grades = [g for g in all_grades if not g.is_final]

    from app.db.enums import GradingMode
    auto_count = sum(1 for g in final_grades if g.grading_mode == GradingMode.AUTO)
    ai_count = sum(1 for g in all_grades if g.ai_suggested_score is not None and not g.is_final)
    manual_count = sum(1 for g in final_grades if g.grading_mode == GradingMode.MANUAL)

    return AttemptGradingSummary(
        attempt_id=attempt_id,
        total_questions=total_responses,
        graded_count=len(final_grades),
        pending_count=total_responses - len(final_grades),
        auto_graded_count=auto_count,
        ai_suggested_count=ai_count,
        manual_count=manual_count,
        is_fully_graded=len(final_grades) == total_responses,
    )


# ── GRADING QUEUE ─────────────────────────────────────────────────────────────


@router.get(
    "/queue",
    response_model=GradingQueueListResponse,
    summary="List pending grading queue items",
)
async def list_queue(
    assessment_id: Optional[uuid.UUID] = Query(default=None),
    status: Optional[str] = Query(default=None),
    assigned_to_id: Optional[uuid.UUID] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GradingQueueListResponse:
    repo = GradingRepository(db)
    items, total = await repo.list_queue(
        assessment_id=assessment_id,
        status=status,
        assigned_to_id=assigned_to_id,
        priority=priority,
        page=page,
        page_size=page_size,
    )
    return GradingQueueListResponse(
        items=[GradingQueueItemResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch(
    "/queue/{item_id}/assign",
    response_model=dict,
    summary="Assign a queue item to a lecturer",
)
async def assign_queue_item(
    item_id: uuid.UUID,
    body: QueueItemAssignRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    repo = GradingRepository(db)
    item = await repo.get_queue_item_by_id(item_id)
    if not item:
        raise NotFoundError("Queue item not found", code="QUEUE_ITEM_NOT_FOUND")

    await repo.assign_queue_item(
        item_id=item_id,
        assigned_to_id=body.assigned_to_id,
        priority=body.priority,
    )
    await db.commit()
    return {"message": "Queue item assigned successfully", "item_id": str(item_id)}
