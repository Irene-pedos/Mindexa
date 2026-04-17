"""
app/api/v1/routes/assessment.py

Assessment management API endpoints for Mindexa Platform.

Endpoints:
    POST   /assessments                              — Create draft (wizard step 1)
    GET    /assessments                              — List assessments (role-aware)
    GET    /assessments/{id}                         — Get assessment detail
    PUT    /assessments/{id}                         — General update (any field)
    PUT    /assessments/{id}/security                — Step 2: security settings
    DELETE /assessments/{id}                         — Soft delete
    POST   /assessments/{id}/finalize               — Publish to students

    POST   /assessments/{id}/sections               — Add section
    PUT    /assessments/{id}/sections/{section_id}  — Update section
    DELETE /assessments/{id}/sections/{section_id}  — Delete section

    POST   /assessments/{id}/questions              — Add question from bank
    DELETE /assessments/{id}/questions/{q_id}       — Remove question
    PUT    /assessments/{id}/questions/reorder       — Reorder questions

    POST   /assessments/{id}/wizard/{step}          — Save wizard step
"""

import uuid
from typing import Optional

from app.db.models.auth import User
from app.db.session import get_db
from app.dependencies.auth import (require_active_user,
                                   require_lecturer_or_admin)
from app.schemas.assessment import (AddQuestionToAssessmentRequest,
                                    AssessmentCreateRequest,
                                    AssessmentDetailResponse,
                                    AssessmentGeneralUpdate,
                                    AssessmentListResponse,
                                    AssessmentSectionCreate,
                                    AssessmentSectionResponse,
                                    AssessmentSectionUpdate,
                                    AssessmentSecuritySettingsUpdate,
                                    AssessmentSummaryResponse,
                                    FinalizeAssessmentResponse,
                                    ReorderQuestionsRequest)
from app.services.assessment_service import AssessmentService
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/assessments", tags=["Assessments"])


def _service(db: AsyncSession) -> AssessmentService:
    return AssessmentService(db)


# ---------------------------------------------------------------------------
# ASSESSMENT CRUD
# ---------------------------------------------------------------------------


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new assessment (wizard step 1)",
    description=(
        "Creates a draft assessment. This is the first step of the 6-step "
        "assessment wizard. Returns the full assessment with draft progress."
    ),
)
async def create_assessment(
    body: AssessmentCreateRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentDetailResponse:
    svc = _service(db)
    assessment = await svc.create_assessment(body, current_user)
    await db.commit()
    return AssessmentDetailResponse.model_validate(assessment)


@router.get(
    "",
    summary="List assessments",
    description=(
        "Returns a paginated list of assessments. "
        "Lecturers see only their own. Admins see all."
    ),
)
async def list_assessments(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    assessment_type: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> AssessmentListResponse:
    svc = _service(db)
    return await svc.list_assessments(
        current_user=current_user,
        status=status_filter,
        assessment_type=assessment_type,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{assessment_id}",
    summary="Get assessment detail",
    description="Returns full assessment with sections, questions, and draft progress.",
)
async def get_assessment(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> AssessmentDetailResponse:
    svc = _service(db)
    assessment = await svc.get_assessment(assessment_id, current_user)
    return AssessmentDetailResponse.model_validate(assessment)


@router.put(
    "/{assessment_id}",
    summary="Update assessment (general fields)",
    description=(
        "Update any writable field on an unfinalised assessment. "
        "For security settings specifically, use PUT /{id}/security."
    ),
)
async def update_assessment(
    assessment_id: uuid.UUID,
    body: AssessmentGeneralUpdate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentDetailResponse:
    svc = _service(db)
    step = body.wizard_step or 1
    assessment = await svc.update_wizard_step(
        assessment_id=assessment_id,
        current_user=current_user,
        step=step,
        data=body,
    )
    await db.commit()
    return AssessmentDetailResponse.model_validate(assessment)


@router.put(
    "/{assessment_id}/security",
    summary="Update security & integrity settings (wizard step 2)",
    description=(
        "Apply security configuration: timing, access password, integrity flags. "
        "Advances the wizard to step 2."
    ),
)
async def update_security_settings(
    assessment_id: uuid.UUID,
    body: AssessmentSecuritySettingsUpdate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentDetailResponse:
    svc = _service(db)
    assessment = await svc.update_security_settings(
        assessment_id=assessment_id,
        current_user=current_user,
        data=body,
    )
    await db.commit()
    return AssessmentDetailResponse.model_validate(assessment)


@router.delete(
    "/{assessment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete an assessment",
    description=(
        "Soft-deletes a draft assessment. "
        "Finalized assessments cannot be deleted without admin role."
    ),
)
async def delete_assessment(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = _service(db)
    await svc.soft_delete_assessment(assessment_id, current_user)
    await db.commit()


@router.post(
    "/{assessment_id}/finalize",
    summary="Finalize (publish) an assessment",
    description=(
        "Run all finalization checks and publish the assessment to students. "
        "Returns validation result — if errors exist, assessment is NOT published."
    ),
)
async def finalize_assessment(
    assessment_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> FinalizeAssessmentResponse:
    svc = _service(db)
    result = await svc.finalize_assessment(assessment_id, current_user)
    await db.commit()
    return result


# ---------------------------------------------------------------------------
# WIZARD STEP SAVE
# ---------------------------------------------------------------------------


@router.post(
    "/{assessment_id}/wizard/{step}",
    summary="Save wizard step",
    description=(
        "Save progress for a specific wizard step (1-6). "
        "Updates draft_progress and advances wizard_step if moving forward."
    ),
)
async def save_wizard_step(
    assessment_id: uuid.UUID,
    step: int,
    body: AssessmentGeneralUpdate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentDetailResponse:
    if step < 1 or step > 6:
        from app.core.exceptions import ValidationError
        raise ValidationError("step must be between 1 and 6.", code="INVALID_STEP")

    svc = _service(db)
    assessment = await svc.update_wizard_step(
        assessment_id=assessment_id,
        current_user=current_user,
        step=step,
        data=body,
    )
    await db.commit()
    return AssessmentDetailResponse.model_validate(assessment)


# ---------------------------------------------------------------------------
# SECTIONS
# ---------------------------------------------------------------------------


@router.post(
    "/{assessment_id}/sections",
    status_code=status.HTTP_201_CREATED,
    summary="Add a section to an assessment",
)
async def create_section(
    assessment_id: uuid.UUID,
    body: AssessmentSectionCreate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentSectionResponse:
    svc = _service(db)
    section = await svc.create_section(assessment_id, current_user, body)
    await db.commit()
    return AssessmentSectionResponse.model_validate(section)


@router.put(
    "/{assessment_id}/sections/{section_id}",
    summary="Update a section",
)
async def update_section(
    assessment_id: uuid.UUID,
    section_id: uuid.UUID,
    body: AssessmentSectionUpdate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> AssessmentSectionResponse:
    svc = _service(db)
    section = await svc.update_section(assessment_id, section_id, current_user, body)
    await db.commit()
    return AssessmentSectionResponse.model_validate(section)


@router.delete(
    "/{assessment_id}/sections/{section_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a section",
)
async def delete_section(
    assessment_id: uuid.UUID,
    section_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = _service(db)
    await svc.delete_section(assessment_id, section_id, current_user)
    await db.commit()


# ---------------------------------------------------------------------------
# QUESTIONS
# ---------------------------------------------------------------------------


@router.post(
    "/{assessment_id}/questions",
    status_code=status.HTTP_201_CREATED,
    summary="Add a question from the bank to this assessment",
    description=(
        "Links an approved, active question to this assessment. "
        "Question must exist in the bank and not already be in this assessment."
    ),
)
async def add_question(
    assessment_id: uuid.UUID,
    body: AddQuestionToAssessmentRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = _service(db)
    aq = await svc.add_question_to_assessment(assessment_id, current_user, body)
    await db.commit()
    return {
        "id": str(aq.id),
        "assessment_id": str(aq.assessment_id),
        "question_id": str(aq.question_id),
        "marks": getattr(aq, "marks", 0),
        "order_index": aq.order_index,
        "added_via": aq.added_via,
    }


@router.delete(
    "/{assessment_id}/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a question from this assessment",
)
async def remove_question(
    assessment_id: uuid.UUID,
    question_id: uuid.UUID,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    svc = _service(db)
    await svc.remove_question_from_assessment(assessment_id, question_id, current_user)
    await db.commit()


@router.put(
    "/{assessment_id}/questions/reorder",
    summary="Reorder questions in an assessment",
    description=(
        "Update the display order of questions. "
        "Body: {order: [{question_id: str, order_index: int}, ...]}"
    ),
)
async def reorder_questions(
    assessment_id: uuid.UUID,
    body: ReorderQuestionsRequest,
    current_user: User = Depends(require_lecturer_or_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = _service(db)
    await svc.reorder_questions(assessment_id, current_user, body)
    await db.commit()
    return {"message": "Questions reordered successfully."}
