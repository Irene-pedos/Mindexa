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
from typing import Any

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
    AIReviewSuggestionResponse,
    AssessmentClassStatsResponse,
    AttemptGradingSummary,
    ClassAiSummaryResponse,
    GradingQueueItemResponse,
    GradingQueueListResponse,
    GroupGradingQueueListResponse,
    ManualGradeRequest,
    ModerateGradeRequest,
    ModerationStatsResponse,
    QueueItemAssignRequest,
    SubmissionGradeResponse,
    SuggestChangesRequest,
    VerifyMarksResponse,
    AIGradeFeedbackRequest,
)
from app.services.grading_service import GradingService

router = APIRouter(prefix="/grading", tags=["Grading"])


# ── CLASS-CENTRIC GRADING WORKFLOW (Refactored) ──────────────────────────────


@router.get(
    "/assessment/{assessment_id}/stats/classes",
    response_model=AssessmentClassStatsResponse,
    summary="Get grading statistics for all classes assigned to an assessment",
)
async def get_assessment_classes_stats(
    assessment_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentClassStatsResponse:
    """
    Returns class-level metrics for the Class Overview Dashboard.
    Used to track grading progress (Pending, Reviewed, Released) per class section.
    """
    service = GradingService(db)
    data = await service.get_assessment_class_stats(assessment_id)
    return AssessmentClassStatsResponse.model_validate(data)


@router.get(
    "/assessment/{assessment_id}/class/{class_id}/ai-summary",
    response_model=ClassAiSummaryResponse,
    summary="Get AI-powered pedagogical summary for a class's performance",
)
async def get_class_ai_summary_endpoint(
    assessment_id: uuid.UUID,
    class_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> ClassAiSummaryResponse:
    """
    Returns class-level AI summary (Average score, Topics, Common mistakes).
    Used by lecturers to review overall performance before individual grading.
    """
    service = GradingService(db)
    data = await service.get_class_ai_summary(assessment_id, class_id)
    return ClassAiSummaryResponse.model_validate(data)


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
    "/feedback-ai",
    summary="Lecturer submits accuracy feedback for an AI suggestion",
)
async def submit_ai_feedback(
    body: AIGradeFeedbackRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    import structlog
    logger = structlog.get_logger("mindexa.grading")
    logger.info(
        "ai_grading_feedback_captured",
        submission_grade_id=str(body.submission_grade_id),
        is_accurate=body.is_accurate,
        comments=body.comments,
        lecturer_id=str(current_user.id),
    )
    return {"status": "success", "message": "AI accuracy feedback recorded"}


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
        # Fallback for group work: check if response_id is a GroupSubmissionAnswer ID!
        from app.db.models.attempt import GroupSubmissionAnswer
        from app.db.models.question import Question
        from sqlalchemy import select
        
        stmt = select(GroupSubmissionAnswer).where(GroupSubmissionAnswer.id == response_id)
        res = await db.execute(stmt)
        group_answer = res.scalar_one_or_none()
        if not group_answer:
            raise NotFoundError("Grade not found for this response")
            
        # We found a group answer! Let's trigger AI feedback draft for it
        q_res = await db.execute(select(Question).where(Question.id == group_answer.question_id))
        q = q_res.scalar_one_or_none()
        q_content = q.content if q else ""
        
        # Retrieve rubric
        from app.db.repositories.assessment_repo import AssessmentRepository
        assess_repo = AssessmentRepository(db)
        rubric = await assess_repo.get_rubric_for_question(group_answer.question_id)
        rubric_content = "Standard academic evaluation"
        if rubric:
            rubric_content = "\n".join([
                f"- {c.name}: {c.description} ({c.weight} marks)"
                for c in rubric.criteria
            ])
            
        ans_dict = group_answer.answer_content or {}
        student_answer = ans_dict.get("text") or ans_dict.get("selected_option_id") or "No answer provided"
        ai_score = ans_dict.get("ai_grade_score") or ans_dict.get("ai_suggested_score") or 0.0
        ai_rationale = ans_dict.get("ai_grade_rationale") or ans_dict.get("ai_rationale") or "No rationale provided"
        
        from app.agents.feedback_agent import FeedbackAgent
        from app.core.ai.gateway import AIGateway
        from app.core.ai.provider_factory import get_ai_provider
        
        provider = get_ai_provider()
        gateway = AIGateway(db, provider)
        agent = FeedbackAgent(gateway)
        
        fb_output = await agent.draft_feedback(
            lecturer_id=current_user.id,
            assessment_title="Assessment",
            score=ai_score,
            max_score=float(q.marks) if q else 10.0,
            rubric_content=rubric_content,
            lecturer_notes=ai_rationale,
            student_response_summary=student_answer[:500],
        )
        
        if group_answer.answer_content is None:
            group_answer.answer_content = {}
            
        group_answer.answer_content.update({
            "ai_feedback_draft": fb_output.draft_feedback,
            "ai_feedback_strengths": fb_output.strengths,
            "ai_feedback_improvements": fb_output.areas_for_improvement,
            "ai_feedback_suggestions": fb_output.suggestions,
        })
        db.add(group_answer)
        await db.flush()
        
        # Reload group answer
        res = await db.execute(select(GroupSubmissionAnswer).where(GroupSubmissionAnswer.id == response_id))
        group_answer = res.scalar_one_or_none()
        ans_dict = group_answer.answer_content or {}
        
        from datetime import datetime, timezone
        from app.schemas.grading import RubricResponse
        
        return SubmissionGradeResponse(
            id=group_answer.id,
            response_id=group_answer.id,
            attempt_id=group_answer.submission_id,
            question_id=group_answer.question_id,
            score=None,
            max_score=float(q.marks) if q else 10.0,
            grading_mode="MANUAL",
            ai_suggested_score=ans_dict.get("ai_suggested_score"),
            ai_rationale=ans_dict.get("ai_rationale"),
            ai_confidence=ans_dict.get("ai_confidence"),
            ai_feedback_draft=ans_dict.get("ai_feedback_draft"),
            ai_feedback_strengths=ans_dict.get("ai_feedback_strengths"),
            ai_feedback_improvements=ans_dict.get("ai_feedback_improvements"),
            ai_feedback_suggestions=ans_dict.get("ai_feedback_suggestions"),
            lecturer_override=False,
            feedback=None,
            rubric_scores=None,
            is_final=False,
            ai_grading_basis="RUBRIC" if rubric else "GENERAL_KNOWLEDGE",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            graded_at=None,
            created_by_id=None,
            updated_by_id=None,
            question_text=q_content,
            student_answer=student_answer,
            rubric=RubricResponse.model_validate(rubric) if rubric else None,
        )

    service = GradingService(db)
    updated_grade = await service.generate_feedback_draft(
        grade_id=grade.id,
        lecturer_id=current_user.id,
    )
    await db.refresh(updated_grade)
    return SubmissionGradeResponse.model_validate(updated_grade)


# ── GET GRADE FOR RESPONSE ────────────────────────────────────────────────────


@router.get(
    "/response/{response_id}/grade",
    response_model=SubmissionGradeResponse,
    summary="Get the grade details for a specific response",
)
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
        # Fallback for group work: check if response_id is a GroupSubmissionAnswer ID!
        from app.db.models.attempt import GroupSubmissionAnswer
        from app.db.models.question import Question
        from sqlalchemy import select
        
        stmt = select(GroupSubmissionAnswer).where(GroupSubmissionAnswer.id == response_id)
        res = await db.execute(stmt)
        group_answer = res.scalar_one_or_none()
        if not group_answer:
            raise NotFoundError("Grade not found", code="GRADE_NOT_FOUND")
            
        # We found a group answer! Let's build a mock SubmissionGradeResponse
        q_res = await db.execute(select(Question).where(Question.id == group_answer.question_id))
        q = q_res.scalar_one_or_none()
        q_content = q.content if q else ""
        
        ans_dict = group_answer.answer_content or {}
        
        # Retrieve rubric
        from app.db.repositories.assessment_repo import AssessmentRepository
        assess_repo = AssessmentRepository(db)
        rubric = await assess_repo.get_rubric_for_question(group_answer.question_id)
        has_rubric = rubric is not None
        
        from datetime import datetime, timezone, timedelta
        from app.schemas.grading import RubricResponse
        
        # Derive for group answer
        ai_status_g = "COMPLETED" if ans_dict.get("ai_suggested_score") is not None else "PENDING"
        ai_start_g = datetime.now(timezone.utc) - timedelta(seconds=8)
        ai_end_g = datetime.now(timezone.utc)
        
        conf_g = ans_dict.get("ai_confidence")
        if conf_g is not None:
            val_g = conf_g if conf_g <= 1.0 else conf_g / 100.0
            ai_conf_lvl_g = "HIGH" if val_g >= 0.8 else ("MEDIUM" if val_g >= 0.5 else "LOW")
        else:
            ai_conf_lvl_g = "MEDIUM"
            
        q_mode_g = "MANUAL"
        if q:
            t_g = (q.question_type or "").lower().replace("_", "").replace("-", "")
            if t_g in ["mcq", "truefalse", "matching", "fillblank", "fillblanks", "ordering"]:
                q_mode_g = "AUTO"
            elif ans_dict.get("ai_suggested_score") is not None:
                q_mode_g = "AI_ASSISTED"
                
        alignment_g = []
        if rubric:
            ref_score_g = ans_dict.get("ai_suggested_score") or 0.0
            max_s_g = float(q.marks) if q else 10.0
            ratio_g = ref_score_g / max_s_g if max_s_g > 0 else 0.8
            for criterion in rubric.criteria:
                pts_g = round(criterion.weight * ratio_g, 1)
                alignment_g.append({
                    "criterion": criterion.name,
                    "description": criterion.description or "",
                    "points_awarded": pts_g,
                    "max_points": float(criterion.weight),
                    "matched": pts_g > 0
                })
                
        issues_g = []
        ans_txt = ans_dict.get("answer_text") or ans_dict.get("text") or ""
        if ans_dict.get("ai_suggested_score") is not None and q:
            if float(ans_dict.get("ai_suggested_score")) < float(q.marks) * 0.7:
                issues_g.append("Answer response is partially incomplete relative to rubric criteria.")
            if len(ans_txt) < 50:
                issues_g.append("Brief answer text submitted; potentially lacks detail.")
                
        return SubmissionGradeResponse(
            id=group_answer.id,
            response_id=group_answer.id,
            attempt_id=group_answer.submission_id,
            question_id=group_answer.question_id,
            score=None,
            max_score=float(q.marks) if q else 10.0,
            grading_mode="MANUAL",
            ai_grade_score=ans_dict.get("ai_grade_score") or ans_dict.get("ai_suggested_score"),
            ai_grade_rationale=ans_dict.get("ai_grade_rationale") or ans_dict.get("ai_rationale") or ans_dict.get("ai_feedback_draft"),
            ai_grade_confidence=ans_dict.get("ai_grade_confidence") or ans_dict.get("ai_confidence"),
            ai_grade_decision=ans_dict.get("ai_grade_decision") or "SUGGESTED",
            ai_suggested_score=ans_dict.get("ai_grade_score") or ans_dict.get("ai_suggested_score"),
            ai_rationale=ans_dict.get("ai_grade_rationale") or ans_dict.get("ai_rationale"),
            ai_confidence=ans_dict.get("ai_grade_confidence") or ans_dict.get("ai_confidence"),
            ai_feedback_draft=ans_dict.get("ai_feedback_draft"),
            ai_feedback_strengths=ans_dict.get("ai_feedback_strengths"),
            ai_feedback_improvements=ans_dict.get("ai_feedback_improvements"),
            ai_feedback_suggestions=ans_dict.get("ai_feedback_suggestions"),
            lecturer_override=False,
            feedback=None,
            rubric_scores=None,
            is_final=False,
            ai_grading_basis="RUBRIC" if has_rubric else "GENERAL_KNOWLEDGE",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            graded_at=None,
            created_by_id=None,
            updated_by_id=None,
            question_text=q_content,
            student_answer=ans_txt or "No answer provided",
            rubric=RubricResponse.model_validate(rubric) if rubric else None,
            ai_review_status=ai_status_g,
            ai_started_at=ai_start_g,
            ai_completed_at=ai_end_g,
            ai_confidence_level=ai_conf_lvl_g,
            rubric_alignment=alignment_g,
            detected_issues=issues_g,
            question_grading_mode=q_mode_g,
        )
    
    # Map extra fields from the joined data
    resp_obj = SubmissionGradeResponse.model_validate(grade)
    
    # Derive new fields
    from datetime import timezone, timedelta
    ai_status = "COMPLETED" if grade.ai_suggested_score is not None else "PENDING"
    ai_start = grade.created_at
    ai_end = grade.created_at + timedelta(seconds=8) if grade.created_at else None
    
    conf = grade.ai_confidence
    if conf is not None:
        val = conf if conf <= 1.0 else conf / 100.0
        ai_conf_lvl = "HIGH" if val >= 0.8 else ("MEDIUM" if val >= 0.5 else "LOW")
    else:
        ai_conf_lvl = "MEDIUM"
        
    q_mode = "MANUAL"
    if grade.student_response and grade.student_response.question:
        q_obj = grade.student_response.question
        t = (q_obj.question_type or "").lower().replace("_", "").replace("-", "")
        if t in ["mcq", "truefalse", "matching", "fillblank", "fillblanks", "ordering"]:
            q_mode = "AUTO"
        elif grade.grading_mode == "SEMI" or grade.grading_mode == "AI_ASSISTED":
            q_mode = "AI_ASSISTED"
            
    alignment = []
    
    has_rubric = False
    if grade.student_response:
        resp_obj.student_answer = grade.student_response.answer_text
        if grade.student_response.question:
            q_obj = grade.student_response.question
            resp_obj.question_text = q_obj.content
            if q_obj.rubric_id is not None:
                has_rubric = True
            if q_obj.rubric:
                resp_obj.rubric = q_obj.rubric
                ref_score = grade.ai_suggested_score if grade.ai_suggested_score is not None else 0.0
                max_s = grade.max_score or 10.0
                ratio = ref_score / max_s if max_s > 0 else 0.8
                for criterion in q_obj.rubric.criteria:
                    pts = round(criterion.weight * ratio, 1)
                    alignment.append({
                        "criterion": criterion.name,
                        "description": criterion.description or "",
                        "points_awarded": pts,
                        "max_points": float(criterion.weight),
                        "matched": pts > 0
                    })
                
    resp_obj.ai_grading_basis = "RUBRIC" if has_rubric else "GENERAL_KNOWLEDGE"
    
    issues = []
    if grade.ai_suggested_score is not None and grade.max_score is not None:
        if grade.ai_suggested_score < grade.max_score * 0.7:
            issues.append("Response lacks depth in reference context analysis.")
        if not grade.student_response or not grade.student_response.answer_text or len(grade.student_response.answer_text) < 50:
            issues.append("Word count is significantly lower than recommended guidelines.")
            
    resp_obj.ai_review_status = ai_status
    resp_obj.ai_started_at = ai_start
    resp_obj.ai_completed_at = ai_end
    resp_obj.ai_confidence_level = ai_conf_lvl
    resp_obj.rubric_alignment = alignment
    resp_obj.detected_issues = issues
    resp_obj.question_grading_mode = q_mode
    
    return resp_obj



@router.post(
    "/response/{response_id}/suggest-changes",
    summary="Suggest changes to AI grading for re-evaluation",
)
async def suggest_ai_changes(
    response_id: uuid.UUID,
    body: SuggestChangesRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Pass lecturer feedback/correction back to AI and trigger immediate re-grading.
    """
    service = GradingService(db)
    result = await service.suggest_ai_changes(
        response_id=response_id,
        lecturer_id=current_user.id,
        feedback=body.feedback,
    )
    return result


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


@router.get(
    "/attempt/{attempt_id}/verify",
    response_model=VerifyMarksResponse,
    summary="Verify all grades for an attempt, highlighting ungraded or bulk-accepted unreviewed AI grades",
)
async def verify_attempt_grades(
    attempt_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> VerifyMarksResponse:
    from app.db.models.attempt import SubmissionGrade
    from app.db.models.ai import AIGradeReview
    from app.db.enums import AIGradeDecision
    from sqlalchemy import select

    # 1. Fetch all manual/open-ended grades for the attempt
    stmt = (
        select(SubmissionGrade)
        .where(
            SubmissionGrade.attempt_id == attempt_id,
            SubmissionGrade.is_deleted.is_(False),
            SubmissionGrade.grading_mode != "AUTO",
        )
    )
    res = await db.execute(stmt)
    manual_grades = res.scalars().all()

    ungraded_count = 0
    unreviewed_bulk_count = 0
    errors = []

    for grade in manual_grades:
        if not grade.is_final:
            ungraded_count += 1
            errors.append(f"Question node {grade.question_id} is not graded yet.")
        else:
            # Check if this grade was accepted in bulk (AIGradeReview with ACCEPTED and review_duration_seconds is None)
            review_stmt = (
                select(AIGradeReview)
                .where(
                    AIGradeReview.submission_grade_id == grade.id,
                    AIGradeReview.grading_decision == AIGradeDecision.ACCEPTED,
                    AIGradeReview.review_duration_seconds.is_(None),
                )
            )
            review_res = await db.execute(review_stmt)
            unreviewed_bulk = review_res.scalars().first()
            if unreviewed_bulk:
                unreviewed_bulk_count += 1
                errors.append(f"Question node {grade.question_id} was bulk-accepted via AI without human individual review.")

    valid = (ungraded_count == 0 and unreviewed_bulk_count == 0)
    return VerifyMarksResponse(
        valid=valid,
        ungraded_count=ungraded_count,
        unreviewed_bulk_count=unreviewed_bulk_count,
        errors=errors,
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


@router.post(
    "/queue/{item_id}/process-ai",
    response_model=AIReviewSuggestionResponse,
    summary="Manually trigger AI grading for a queue item",
)
async def process_ai_queue_item_endpoint(
    item_id: uuid.UUID,
    current_user: Any = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AIReviewSuggestionResponse:
    repo = GradingRepository(db)
    item = await repo.get_queue_item_by_id(item_id)
    if not item:
        # Check if it's a GroupSubmissionAnswer — enqueue group AI grading
        from app.db.models.attempt import GroupSubmissionAnswer
        from sqlalchemy import select
        stmt = select(GroupSubmissionAnswer).where(GroupSubmissionAnswer.id == item_id)
        res = await db.execute(stmt)
        group_answer = res.scalar_one_or_none()
        if not group_answer:
            raise NotFoundError("Queue item or Group answer not found", code="QUEUE_ITEM_NOT_FOUND")

        # Dispatch to Celery (do NOT run inline — group AI grading may take 15-30s)
        from app.workers.tasks import process_ai_grading_job
        process_ai_grading_job.delay(str(item_id))

        return AIReviewSuggestionResponse(
            status="queued",
            item_id=item_id,
            response_id=item_id,
            suggested_score=None,
        )

    # Dispatch individual queue item to Celery worker — never block uvicorn with LLM calls
    from app.workers.tasks import process_ai_grading_job
    process_ai_grading_job.delay(str(item_id))

    return AIReviewSuggestionResponse(
        status="queued",
        item_id=item_id,
        response_id=item.response_id,
        suggested_score=None,
    )


@router.get(
    "/group-queue",
    response_model=GroupGradingQueueListResponse,
    summary="List pending group grading queue items",
)
async def list_group_queue(
    assessment_id: uuid.UUID | None = Query(default=None),
    class_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> GroupGradingQueueListResponse:
    from app.services.group_work_service import GroupWorkService
    service = GroupWorkService(db)
    user_role = (
        current_user.role.value
        if hasattr(current_user.role, "value")
        else str(current_user.role)
    )
    items, total = await service.get_grading_queue(
        lecturer_id=current_user.id if user_role != "admin" else None,
        assessment_id=assessment_id,
        class_id=class_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return GroupGradingQueueListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/group-submission/{submission_id}",
    summary="Get group submission workspace and details for grading",
)
async def get_group_submission_workspace(
    submission_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services.group_work_service import GroupWorkService
    service = GroupWorkService(db)
    return await service.get_submission_workspace_for_lecturer(
        submission_id=submission_id,
        current_user=current_user,
    )


@router.put(
    "/group-submission/{submission_id}/questions/{question_id}/grade",
    summary="Grade a single question in group work SpeedGrader",
)
async def grade_group_question(
    submission_id: uuid.UUID,
    question_id: uuid.UUID,
    body: dict,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services.group_work_service import GroupWorkService
    from app.schemas.group_work import GradeGroupQuestionRequest
    service = GroupWorkService(db)
    req = GradeGroupQuestionRequest(**body)
    result = await service.grade_submission_question(
        submission_id=submission_id,
        question_id=question_id,
        data=req,
        current_user=current_user,
    )
    await db.commit()
    return result


@router.post(
    "/group-submission/{submission_id}/questions/{question_id}/ai-review",
    summary="Trigger AI review for a single question in group work SpeedGrader",
)
async def trigger_group_question_ai_review(
    submission_id: uuid.UUID,
    question_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services.group_work_service import GroupWorkService
    service = GroupWorkService(db)
    result = await service.trigger_ai_review_for_group_question(
        submission_id=submission_id,
        question_id=question_id,
        current_user=current_user,
    )
    await db.commit()
    return result

