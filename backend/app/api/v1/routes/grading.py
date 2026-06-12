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

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.grading_repo import GradingRepository
from app.db.repositories.submission_repo import SubmissionRepository
from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin
from app.schemas.grading import (
    AIGradeConfirmRequest,
    AttemptGradingSummary,
    GradingQueueItemResponse,
    GradingQueueListResponse,
    ManualGradeRequest,
    QueueItemAssignRequest,
    SubmissionGradeResponse,
    GroupGradingQueueListResponse,
    ModerationStatsResponse,
    ModerateGradeRequest,
)
from app.services.grading_service import GradingService

router = APIRouter(prefix="/grading", tags=["Grading"])


# ── INSTITUTIONAL MODERATION (Phase 4) ─────────────────────────────────────────


@router.get(
    "/moderation/{question_id}",
    response_model=ModerationStatsResponse,
    summary="Get grading analytics and outliers for a specific question",
)
async def get_moderation_stats(
    question_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> ModerationStatsResponse:
    """
    Returns score distribution, outliers, and AI deviations for a question.
    Used by senior lecturers and admins to ensure grading consistency.
    """
    service = GradingService(db)
    data = await service.get_moderation_data(question_id, current_user.id)
    return ModerationStatsResponse.model_validate(data)


@router.post(
    "/moderate",
    response_model=SubmissionGradeResponse,
    summary="Moderator revision of an existing grade (Immutable Supersede Pattern)",
)
async def moderate_grade(
    body: ModerateGradeRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> SubmissionGradeResponse:
    """
    Moderator adjusts a finalized grade. 
    The old grade is marked as superseded, and a new record is created.
    """
    service = GradingService(db)
    new_grade = await service.moderate_submission_grade(
        response_id=body.response_id,
        moderator_id=current_user.id,
        new_score=body.new_score,
        revision_reason=body.revision_reason,
        feedback_update=body.feedback_update,
        internal_notes=body.internal_notes,
    )
    await db.refresh(new_grade)
    return SubmissionGradeResponse.model_validate(new_grade)


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
        is_final=body.is_final,
        review_started_at=body.review_started_at,
        review_duration_seconds=body.review_duration_seconds,
    )
    await db.refresh(grade)
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
        is_final=True,
        review_started_at=body.review_started_at,
        review_duration_seconds=body.review_duration_seconds,
    )
    await db.refresh(grade)
    return SubmissionGradeResponse.model_validate(grade)


@router.post(
    "/response/{response_id}/draft-feedback",
    response_model=SubmissionGradeResponse,
    summary="Generate an AI feedback draft for a response",
)
async def draft_feedback(
    response_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> SubmissionGradeResponse:
    """
    Triggers the AI FeedbackAgent to draft professional feedback for this response.
    The draft is stored in the database for the lecturer to review.
    """
    repo = GradingRepository(db)
    grade = await repo.get_grade_by_response(response_id)
    if not grade:
        raise NotFoundError("Grade not found for this response")

    service = GradingService(db)
    updated_grade = await service.generate_feedback_draft(
        grade_id=grade.id,
        lecturer_id=current_user.id,
    )
    await db.refresh(updated_grade)
    return SubmissionGradeResponse.model_validate(updated_grade)


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
    grade = await repo.get_full_grade_detail(response_id)
    if not grade:
        raise NotFoundError("Grade not found", code="GRADE_NOT_FOUND")
    
    # Map extra fields from the joined data
    resp_obj = SubmissionGradeResponse.model_validate(grade)
    
    if grade.student_response:
        resp_obj.student_answer = grade.student_response.answer_text
        if grade.student_response.question:
            q = grade.student_response.question
            resp_obj.question_text = q.content
            if q.rubric:
                resp_obj.rubric = q.rubric
                
    return resp_obj


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
    assessment_id: uuid.UUID | None = Query(default=None),
    class_section_id: uuid.UUID | None = Query(default=None),
    question_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    q: str | None = Query(default=None, description="Search by student name or assessment title"),
    sort_by: str | None = Query(default="date_asc", description="Sorting: date_asc, date_desc, ai_confidence, risk_level"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GradingQueueListResponse:
    service = GradingService(db)
    items, total = await service.get_grading_queue(
        lecturer_id=current_user.id,
        assessment_id=assessment_id,
        class_section_id=class_section_id,
        question_type=question_type,
        status=status,
        priority=priority,
        search_query=q,
        sort_by=sort_by,
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
    return {"message": "Queue item assigned successfully", "item_id": str(item_id)}


@router.get(
    "/group-queue",
    response_model=GroupGradingQueueListResponse,
    summary="List pending group grading queue items",
)
async def list_group_queue(
    assessment_id: uuid.UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GroupGradingQueueListResponse:
    from app.services.group_work_service import GroupWorkService
    service = GroupWorkService(db)
    items, total = await service.get_grading_queue(
        lecturer_id=current_user.id,
        assessment_id=assessment_id,
        page=page,
        page_size=page_size,
    )
    return GroupGradingQueueListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
