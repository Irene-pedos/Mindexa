"""Access-scoping regressions for the study planner / reader (enrollment, plan ownership, leaks)."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.exceptions import AuthorizationError, NotFoundError
from app.db.enums import AssessmentStatus
from app.services.document_processing_service import _public_processing_error
from app.services.study_planner_service import StudyPlannerService
from app.services.study_reader_service import StudyReaderService


def _assessment(*, workspace_id=None, course_id=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        teaching_workspace_id=workspace_id,
        course_id=course_id,
        status=AssessmentStatus.PUBLISHED,
    )


def _service_returning(assessment):
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = assessment
    db.execute.return_value = result
    service = StudyPlannerService(db)
    service.workspace_repo = MagicMock()
    return service


@pytest.mark.asyncio
async def test_workspace_less_assessment_requires_course_enrollment():
    service = _service_returning(_assessment(course_id=uuid.uuid4()))
    service.workspace_repo.is_student_in_course = AsyncMock(return_value=False)

    with pytest.raises(AuthorizationError):
        await service._get_accessible_assessment(uuid.uuid4(), uuid.uuid4())


@pytest.mark.asyncio
async def test_workspace_less_assessment_allowed_for_enrolled_student():
    assessment = _assessment(course_id=uuid.uuid4())
    service = _service_returning(assessment)
    service.workspace_repo.is_student_in_course = AsyncMock(return_value=True)

    assert await service._get_accessible_assessment(uuid.uuid4(), assessment.id) is assessment


@pytest.mark.asyncio
async def test_assessment_tied_to_nothing_is_not_exposed():
    service = _service_returning(_assessment())

    assert await service._get_accessible_assessment(uuid.uuid4(), uuid.uuid4()) is None


@pytest.mark.asyncio
async def test_course_access_check_rejects_unenrolled_student():
    service = StudyPlannerService(AsyncMock())
    service.workspace_repo = MagicMock()
    service.workspace_repo.is_student_in_course = AsyncMock(return_value=False)

    with pytest.raises(AuthorizationError):
        await service._assert_course_access(uuid.uuid4(), uuid.uuid4())


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["complete_session", "reschedule_session"])
async def test_session_under_another_plan_is_not_found(method):
    service = StudyPlannerService(AsyncMock())
    session = SimpleNamespace(study_plan_id=uuid.uuid4())
    service.repo = MagicMock()
    service.repo.get_session_by_id = AsyncMock(return_value=session)

    if method == "complete_session":
        call = service.complete_session(uuid.uuid4(), uuid.uuid4(), "Good", plan_id=uuid.uuid4())
    else:
        call = service.reschedule_session(
            uuid.uuid4(), uuid.uuid4(), MagicMock(), None, plan_id=uuid.uuid4()
        )

    with pytest.raises(ValueError, match="not found"):
        await call


@pytest.mark.asyncio
async def test_exam_lens_hides_assessments_the_student_has_no_released_result_for():
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result
    service = StudyReaderService(db)
    service.get_focus = AsyncMock(return_value=SimpleNamespace(heatmap=[]))

    with pytest.raises(NotFoundError):
        await service.get_exam_lens(uuid.uuid4(), "lecturer_material", uuid.uuid4(), uuid.uuid4())


@pytest.mark.parametrize(
    "raw",
    [
        "C:\\uploads\\secret\\file.pdf: cannot open",
        "Jina API 500: {\"detail\": \"key sk-live-123 invalid\"}",
        "/var/app/uploads/abc.docx not a zip file",
    ],
)
def test_processing_error_never_echoes_raw_exception_text(raw):
    message = _public_processing_error(Exception(raw))

    assert "uploads" not in message
    assert "sk-live" not in message
    assert "Jina" not in message
