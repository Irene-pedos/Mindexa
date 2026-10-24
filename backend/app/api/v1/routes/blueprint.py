"""
app/api/v1/routes/blueprint.py

Blueprint Rule Engine API endpoints for Mindexa Platform.

Endpoints:
    POST /blueprint/{assessment_id}          — Set all blueprint rules (replaces existing)
    GET  /blueprint/{assessment_id}          — Get blueprint summary with rules
    GET  /blueprint/{assessment_id}/validate — Run validation against current questions
    GET  /blueprint/{assessment_id}/distribution — Get current question distribution

Blueprint rules govern how an assessment must be composed.
Rules are validated during finalization — blocking rules prevent publishing.
"""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import require_lecturer_or_admin
from app.schemas.blueprint import (
    BlueprintSummaryResponse,
    BlueprintValidationResult,
    SetBlueprintRequest,
)
from app.services.assessment_service import AssessmentService
from app.services.blueprint_service import BlueprintService

router = APIRouter(prefix="/blueprint", tags=["Blueprint Engine"])


def _service(db: AsyncSession) -> BlueprintService:
    return BlueprintService(db)


# A blueprint describes how the paper is built, so it is staff-only and follows the assessment's own
# access rules instead of trusting the id in the URL.
async def _authorize_read(db: AsyncSession, assessment_id: uuid.UUID, user: User) -> None:
    await AssessmentService(db).get_assessment(assessment_id, user)


async def _authorize_write(db: AsyncSession, assessment_id: uuid.UUID, user: User) -> None:
    await AssessmentService(db).assert_can_edit_assessment(assessment_id, user)


# ---------------------------------------------------------------------------
# SET BLUEPRINT
# ---------------------------------------------------------------------------


@router.post(
    "/{assessment_id}",
    status_code=status.HTTP_201_CREATED,
    summary="Set blueprint rules for an assessment",
    description=(
        "Replace all blueprint rules for an assessment. "
        "Existing rules are deleted and replaced with the provided set. "
        "Advances the wizard to step 3. Assessment must not be finalized."
    ),
)
async def set_blueprint(
    assessment_id: uuid.UUID,
    body: SetBlueprintRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> BlueprintSummaryResponse:
    await _authorize_write(db, assessment_id, current_user)
    svc = _service(db)
    result = await svc.set_blueprint(assessment_id, body)
    return result


# ---------------------------------------------------------------------------
# GET BLUEPRINT
# ---------------------------------------------------------------------------


@router.get(
    "/{assessment_id}",
    summary="Get blueprint rules for an assessment",
    description="Returns all blueprint rules defined for this assessment.",
)
async def get_blueprint(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> BlueprintSummaryResponse:
    await _authorize_read(db, assessment_id, current_user)
    svc = _service(db)
    return await svc.get_blueprint(assessment_id)


# ---------------------------------------------------------------------------
# VALIDATE BLUEPRINT
# ---------------------------------------------------------------------------


@router.get(
    "/{assessment_id}/validate",
    summary="Validate blueprint rules against current assessment state",
    description=(
        "Runs all blueprint rules against the current question set. "
        "Returns validation result with violations (blocking) and warnings. "
        "This is the same validation run during finalization — "
        "use this to check blueprint compliance before attempting to publish."
    ),
)
async def validate_blueprint(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> BlueprintValidationResult:
    await _authorize_read(db, assessment_id, current_user)
    svc = _service(db)
    return await svc.validate_blueprint(assessment_id)


# ---------------------------------------------------------------------------
# DISTRIBUTION REPORT
# ---------------------------------------------------------------------------


@router.get(
    "/{assessment_id}/distribution",
    summary="Get current question distribution",
    description=(
        "Compute and return the current distribution of questions: "
        "total count, total marks, difficulty breakdown, type breakdown. "
        "Useful for the assessment builder UI to show live composition stats."
    ),
)
async def get_distribution(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _authorize_read(db, assessment_id, current_user)
    svc = _service(db)
    return await svc.calculate_question_distribution(assessment_id)
