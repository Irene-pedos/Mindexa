from __future__ import annotations

import uuid
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_student
from app.schemas.study_planner import (
    CreateStudyPlanRequest,
    GeneratePlanFromAssessmentRequest,
    StudyPlanResponse,
    StudySessionResponse,
    CompleteSessionRequest,
    GenerateQuizRequest,
    RescheduleSessionRequest,
    AdjustPlanRequest,
    StudyPlannerDashboardSummary,
    ScheduleConflictWarning,
    GuidedSessionAskRequest,
    GuidedSessionExerciseRequest,
    SubmitKnowledgeCheckRequest,
    SaveSessionNotesRequest,
)
from app.services.study_planner_service import StudyPlannerService

router = APIRouter(prefix="/students/study-plans", tags=["Study Planner"])


@router.get(
    "/summary",
    response_model=StudyPlannerDashboardSummary,
    summary="Get Study Planner summary & overview metrics",
)
async def get_study_planner_summary(
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudyPlannerDashboardSummary:
    service = StudyPlannerService(db)
    return await service.get_summary(current_user.id)


@router.get(
    "/conflicts",
    response_model=List[ScheduleConflictWarning],
    summary="Detect overlapping schedule conflicts across active study plans",
)
async def get_schedule_conflicts(
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> List[ScheduleConflictWarning]:
    service = StudyPlannerService(db)
    return await service.detect_schedule_conflicts(current_user.id)


@router.get(
    "",
    response_model=List[StudyPlanResponse],
    summary="List all study plans for the current student",
)
async def list_study_plans(
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> List[StudyPlanResponse]:
    service = StudyPlannerService(db)
    return await service.list_plans(current_user.id)


@router.post(
    "",
    response_model=StudyPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new manual study plan",
)
async def create_study_plan(
    body: CreateStudyPlanRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudyPlanResponse:
    service = StudyPlannerService(db)
    return await service.create_manual_plan(current_user.id, body)


@router.post(
    "/generate-from-assessment",
    response_model=StudyPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate an AI study plan based on an upcoming assessment",
)
async def generate_ai_plan(
    body: GeneratePlanFromAssessmentRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudyPlanResponse:
    service = StudyPlannerService(db)
    try:
        return await service.generate_ai_plan_from_assessment(current_user.id, body)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(err)
        )


@router.get(
    "/{plan_id}",
    response_model=StudyPlanResponse,
    summary="Get detailed study plan with sessions",
)
async def get_study_plan(
    plan_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudyPlanResponse:
    service = StudyPlannerService(db)
    try:
        return await service.get_plan_detail(plan_id, current_user.id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(err)
        )


@router.post(
    "/{plan_id}/sessions/{session_id}/complete",
    response_model=StudySessionResponse,
    summary="Mark study session as complete and record understanding level",
)
async def complete_session(
    plan_id: uuid.UUID,
    session_id: uuid.UUID,
    body: CompleteSessionRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudySessionResponse:
    service = StudyPlannerService(db)
    try:
        return await service.complete_session(
            session_id,
            current_user.id,
            body.understanding_level,
            body.difficulty_rating,
            body.confidence_rating,
            body.feedback_notes,
            body.checklist_items,
        )
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(err)
        )



@router.post(
    "/{plan_id}/sessions/{session_id}/reschedule",
    response_model=StudySessionResponse,
    summary="Reschedule a specific study session",
)
async def reschedule_session(
    plan_id: uuid.UUID,
    session_id: uuid.UUID,
    body: RescheduleSessionRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudySessionResponse:
    service = StudyPlannerService(db)
    try:
        return await service.reschedule_session(
            session_id, current_user.id, body.new_start, body.new_duration_minutes, force=body.force
        )
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)
        )


@router.post(
    "/{plan_id}/adjust",
    response_model=StudyPlanResponse,
    summary="AI adaptive workload adjustment for a study plan",
)
async def adjust_plan(
    plan_id: uuid.UUID,
    body: AdjustPlanRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudyPlanResponse:
    service = StudyPlannerService(db)
    try:
        return await service.adjust_plan(plan_id, current_user.id, body.action)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(err)
        )


# ── GUIDED STUDY SESSION ENDPOINTS ─────────────────────────────────────────

@router.post(
    "/sessions/{session_id}/guided/start",
    response_model=StudySessionResponse,
    summary="Start or resume a dedicated guided study session",
)
async def start_guided_session(
    session_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudySessionResponse:
    service = StudyPlannerService(db)
    try:
        return await service.start_guided_session(session_id, current_user.id)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))


@router.get(
    "/sessions/{session_id}/guided",
    response_model=StudySessionResponse,
    summary="Get current state of a guided study session",
)
async def get_guided_session(
    session_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudySessionResponse:
    service = StudyPlannerService(db)
    try:
        return await service.get_guided_session_detail(session_id, current_user.id)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))


@router.patch(
    "/sessions/{session_id}/notes",
    response_model=StudySessionResponse,
    summary="Save student personal notes for a study session",
)
async def save_session_notes(
    session_id: uuid.UUID,
    body: SaveSessionNotesRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudySessionResponse:
    service = StudyPlannerService(db)
    try:
        return await service.save_session_notes(session_id, current_user.id, body.student_notes)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))


@router.post(
    "/sessions/{session_id}/guided/ask",
    response_model=Dict[str, Any],
    summary="Ask AI a context-aware question within the guided lesson",
)
async def ask_guided_session_question(
    session_id: uuid.UUID,
    body: GuidedSessionAskRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    service = StudyPlannerService(db)
    try:
        return await service.ask_guided_session_question(
            session_id, current_user.id, body.question, body.section_context
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))


@router.post(
    "/sessions/{session_id}/guided/exercise",
    response_model=Dict[str, Any],
    summary="Generate an inline practice exercise for current section",
)
async def generate_guided_exercise(
    session_id: uuid.UUID,
    body: GuidedSessionExerciseRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    service = StudyPlannerService(db)
    try:
        return await service.generate_guided_exercise(
            session_id, current_user.id, body.section_index or 0
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))


@router.post(
    "/sessions/{session_id}/guided/knowledge-check/generate",
    response_model=List[Dict[str, Any]],
    summary="Generate non-academic self-evaluation knowledge check questions",
)
async def generate_guided_knowledge_check(
    session_id: uuid.UUID,
    body: GenerateQuizRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    service = StudyPlannerService(db)
    try:
        return await service.generate_session_quiz(
            session_id, current_user.id, body.question_count
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))


@router.post(
    "/sessions/{session_id}/guided/knowledge-check/submit",
    response_model=Dict[str, Any],
    summary="Submit and self-grade knowledge check responses",
)
async def submit_guided_knowledge_check(
    session_id: uuid.UUID,
    body: SubmitKnowledgeCheckRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    service = StudyPlannerService(db)
    try:
        return await service.submit_guided_knowledge_check(
            session_id, current_user.id, body.answers
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))


@router.post(
    "/sessions/{session_id}/guided/complete",
    response_model=StudySessionResponse,
    summary="Finalize guided study session, generate summary, and update progress",
)
async def complete_guided_session(
    session_id: uuid.UUID,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudySessionResponse:
    service = StudyPlannerService(db)
    try:
        return await service.complete_guided_session(session_id, current_user.id)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
