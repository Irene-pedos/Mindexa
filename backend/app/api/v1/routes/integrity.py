"""
app/api/v1/routes/integrity.py

Academic integrity monitoring routes.

Endpoints:
    POST  /integrity/event                           → Record browser event (student)
    POST  /integrity/acknowledge-warning             → Acknowledge warning overlay (student)
    POST  /integrity/flag                            → Supervisor manually raises a flag
    PATCH /integrity/flag/{flag_id}/resolve          → Resolve a flag (lecturer/admin)
    GET   /integrity/{attempt_id}                    → Full integrity report (supervisor)
    GET   /integrity/events/assessment/{id}          → Live event feed (supervisor)
    GET   /integrity/flags/assessment/{id}           → All flags for an assessment
    POST  /integrity/supervision/start               → Start a supervision session
    POST  /integrity/supervision/end                 → End a supervision session
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.repositories.integrity_repo import IntegrityRepository
from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin, require_student
from app.schemas.integrity import (
    AcknowledgeWarningRequest,
    AttemptIntegrityReport,
    IntegrityEventResponse,
    IntegrityFlagResponse,
    IntegrityWarningResponse,
    RaiseFlagRequest,
    RecordEventRequest,
    ResolveFlagRequest,
)
from app.services.integrity_service import IntegrityService

router = APIRouter(prefix="/integrity", tags=["Integrity"])


# ── RECORD EVENT (Student) ────────────────────────────────────────────────────


@router.post(
    "/event",
    response_model=dict,
    status_code=201,
    summary="Record a browser integrity event (student)",
)
async def record_event(
    body: RecordEventRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Called by the frontend whenever a monitored browser event occurs:
        - fullscreen_exit, tab_switch, window_blur, copy_attempt, etc.

    The access_token validates the request belongs to an active attempt.
    The system evaluates whether a warning or flag should be issued.

    Returns the event ID and any warning issued.
    """
    service = IntegrityService(db)
    event, warning = await service.record_event(
        attempt_id=body.attempt_id,
        student_id=current_user.id,
        access_token=body.access_token,
        event_type=body.event_type,
        metadata_json=body.metadata_json,
    )

    response: dict = {
        "event_id": str(event.id),
        "event_type": body.event_type,
        "warning_issued": warning is not None,
    }
    if warning:
        response["warning"] = {
            "id": str(warning.id),
            "warning_level": warning.warning_level,
            "message": warning.message,
        }
    return response


# ── ACKNOWLEDGE WARNING (Student) ─────────────────────────────────────────────


@router.post(
    "/acknowledge-warning",
    response_model=dict,
    summary="Acknowledge a warning overlay (student)",
)
async def acknowledge_warning(
    body: AcknowledgeWarningRequest,
    current_user=Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Student clicks "I Understand" on the warning overlay.
    Stamps acknowledged_at on the warning record.
    """
    service = IntegrityService(db)
    await service.acknowledge_warning(
        warning_id=body.warning_id,
        student_id=current_user.id,
        access_token=body.access_token,
    )
    return {"message": "Warning acknowledged", "warning_id": str(body.warning_id)}


# ── SUPERVISOR: RAISE FLAG MANUALLY ──────────────────────────────────────────


@router.post(
    "/flag",
    response_model=IntegrityFlagResponse,
    status_code=201,
    summary="Supervisor manually raises an integrity flag",
)
async def raise_flag(
    body: RaiseFlagRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> IntegrityFlagResponse:
    """
    Supervisor raises a manual integrity flag on an attempt.
    Requires a description of at least 10 characters.
    """
    from app.db.enums import IntegrityFlagRaisedBy
    from app.db.repositories.attempt_repo import AttemptRepository

    attempt_repo = AttemptRepository(db)
    attempt = await attempt_repo.get_by_id_simple(body.attempt_id)
    if not attempt:
        raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

    service = IntegrityService(db)
    flag = await service.raise_flag(
        attempt_id=body.attempt_id,
        assessment_id=attempt.assessment_id,
        student_id=attempt.student_id,
        raised_by=IntegrityFlagRaisedBy.SUPERVISOR,
        raised_by_id=current_user.id,
        description=body.description,
        risk_level=body.risk_level,
        evidence_event_ids=[str(e) for e in body.evidence_event_ids] if body.evidence_event_ids else None,
    )
    return IntegrityFlagResponse.model_validate(flag)


# ── RESOLVE FLAG ──────────────────────────────────────────────────────────────


@router.patch(
    "/flag/{flag_id}/resolve",
    response_model=dict,
    summary="Resolve an integrity flag (lecturer/admin)",
)
async def resolve_flag(
    flag_id: uuid.UUID,
    body: ResolveFlagRequest,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Move an integrity flag to a terminal status:
        CONFIRMED  → violation confirmed; attempt marked flagged; result held
        DISMISSED  → concern unfounded; attempt/result cleared (if no other flags)
        ESCALATED  → referred to academic office; result remains on hold
    """
    service = IntegrityService(db)
    await service.resolve_flag(
        flag_id=flag_id,
        new_status=body.status,
        resolved_by_id=current_user.id,
        resolution_notes=body.resolution_notes,
    )
    return {
        "message": f"Flag resolved with status: {body.status}",
        "flag_id": str(flag_id),
    }


# ── GET FULL INTEGRITY REPORT (Supervisor) ────────────────────────────────────


@router.get(
    "/{attempt_id}",
    response_model=AttemptIntegrityReport,
    summary="Get full integrity report for an attempt (supervisor)",
)
async def get_integrity_report(
    attempt_id: uuid.UUID,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AttemptIntegrityReport:
    """
    Returns a comprehensive integrity report for one attempt:
        - All integrity events (ordered by time)
        - All flags (with status and resolution)
        - All warnings issued
        - Event type counts
    """
    service = IntegrityService(db)
    report = await service.get_attempt_integrity_report(attempt_id)

    return AttemptIntegrityReport(
        attempt_id=report["attempt_id"],
        student_id=report["student_id"],
        is_flagged=report["is_flagged"],
        total_warnings=report["total_warnings"],
        event_counts=report["event_counts"],
        events=[IntegrityEventResponse.model_validate(e) for e in report["events"]],
        flags=[IntegrityFlagResponse.model_validate(f) for f in report["flags"]],
        warnings=[IntegrityWarningResponse.model_validate(w) for w in report["warnings"]],
    )


# ── LIVE EVENT FEED FOR ASSESSMENT (Supervisor) ───────────────────────────────


@router.get(
    "/events/assessment/{assessment_id}",
    response_model=dict,
    summary="Live integrity event feed for an assessment (supervisor)",
)
async def get_assessment_events(
    assessment_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    repo = IntegrityRepository(db)
    events, total = await repo.list_events_for_assessment(
        assessment_id=assessment_id,
        page=page,
        page_size=page_size,
    )
    return {
        "assessment_id": str(assessment_id),
        "total": total,
        "page": page,
        "events": [IntegrityEventResponse.model_validate(e) for e in events],
    }


# ── FLAGS FOR ASSESSMENT ──────────────────────────────────────────────────────


@router.get(
    "/flags/assessment/{assessment_id}",
    response_model=dict,
    summary="List all integrity flags for an assessment",
)
async def get_assessment_flags(
    assessment_id: uuid.UUID,
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    repo = IntegrityRepository(db)
    flags, total = await repo.list_flags_for_assessment(
        assessment_id=assessment_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return {
        "assessment_id": str(assessment_id),
        "total": total,
        "page": page,
        "flags": [IntegrityFlagResponse.model_validate(f) for f in flags],
    }


# ── SUPERVISION SESSION ───────────────────────────────────────────────────────


@router.post(
    "/supervision/start",
    response_model=dict,
    summary="Start a live supervision session",
)
async def start_supervision(
    body: dict,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Called when a supervisor opens the live monitoring panel.
    Creates a SupervisionSession row stamping when monitoring began.
    """
    assessment_id = uuid.UUID(str(body.get("assessment_id")))
    service = IntegrityService(db)
    await service.start_supervision_session(
        assessment_id=assessment_id,
        supervisor_id=current_user.id,
    )
    return {
        "message": "Supervision session started",
        "assessment_id": str(assessment_id),
        "supervisor_id": str(current_user.id),
    }


@router.post(
    "/supervision/end",
    response_model=dict,
    summary="End a live supervision session",
)
async def end_supervision(
    body: dict,
    current_user=Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Called when a supervisor closes the live monitoring panel.
    Stamps ended_at on the active SupervisionSession.
    """
    assessment_id = uuid.UUID(str(body.get("assessment_id")))
    service = IntegrityService(db)
    await service.end_supervision_session(
        assessment_id=assessment_id,
        supervisor_id=current_user.id,
    )
    return {
        "message": "Supervision session ended",
        "assessment_id": str(assessment_id),
    }
