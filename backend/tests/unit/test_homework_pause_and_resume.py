"""
Unit tests for pausing and resuming homework assessment attempts, deadline guards,
audit logs, and in-assessment AI assistance.
"""

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock
import pytest

from app.db.enums import AssessmentType, AttemptStatus, AIActionType
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.services.attempt_service import AttemptService
from app.services.assessment_service import AssessmentService
from app.agents.student_support_agent import StudySupportAgent
from app.core.exceptions import AuthorizationError, ConflictError, ValidationError


@pytest.mark.asyncio
async def test_pause_attempt_success():
    """A student can pause an IN_PROGRESS homework attempt and write an audit log."""
    db = MagicMock()
    service = AttemptService(db)

    student_id = uuid.uuid4()
    attempt_id = uuid.uuid4()
    access_token = uuid.uuid4()

    mock_assessment = MagicMock()
    mock_assessment.assessment_type = AssessmentType.HOMEWORK
    mock_assessment.allow_resume = True
    mock_assessment.window_end = datetime.now(timezone.utc) + timedelta(hours=4)
    mock_assessment.grace_period_minutes = 0
    mock_assessment.late_submission_allowed = False

    mock_attempt = MagicMock()
    mock_attempt.id = attempt_id
    mock_attempt.student_id = student_id
    mock_attempt.access_token = access_token
    mock_attempt.status = AttemptStatus.IN_PROGRESS
    mock_attempt.assessment = mock_assessment
    mock_attempt.expires_at = datetime.now(timezone.utc) + timedelta(hours=2)

    service.attempt_repo.get_by_access_token = AsyncMock(return_value=mock_attempt)
    service.attempt_repo.update_fields = AsyncMock()
    service.submission_repo.list_responses_for_attempt = AsyncMock(return_value=[])

    result = await service.pause_attempt(
        attempt_id=attempt_id,
        student_id=student_id,
        access_token=access_token,
    )

    assert result.status == AttemptStatus.PAUSED
    assert service.attempt_repo.update_fields.called


@pytest.mark.asyncio
async def test_pause_attempt_auto_submits_if_window_expired():
    """Attempting to pause after deadline forces auto-submit and raises ValidationError."""
    db = MagicMock()
    service = AttemptService(db)

    student_id = uuid.uuid4()
    attempt_id = uuid.uuid4()
    access_token = uuid.uuid4()

    mock_assessment = MagicMock()
    mock_assessment.assessment_type = AssessmentType.HOMEWORK
    mock_assessment.allow_resume = True
    mock_assessment.window_end = datetime.now(timezone.utc) - timedelta(minutes=5)
    mock_assessment.grace_period_minutes = 0
    mock_assessment.late_submission_allowed = False

    mock_attempt = MagicMock()
    mock_attempt.id = attempt_id
    mock_attempt.student_id = student_id
    mock_attempt.access_token = access_token
    mock_attempt.status = AttemptStatus.IN_PROGRESS
    mock_attempt.assessment = mock_assessment
    mock_attempt.expires_at = datetime.now(timezone.utc) + timedelta(hours=2)

    service.attempt_repo.get_by_access_token = AsyncMock(return_value=mock_attempt)
    service.attempt_repo.set_status = AsyncMock()
    service.submission_repo.finalize_all = AsyncMock()
    service.submission_repo.list_responses_for_attempt = AsyncMock(return_value=[])

    with pytest.raises(ValidationError) as exc:
        await service.pause_attempt(
            attempt_id=attempt_id,
            student_id=student_id,
            access_token=access_token,
        )

    assert "deadline" in str(exc.value).lower()
    assert service.attempt_repo.set_status.called


@pytest.mark.asyncio
async def test_resume_attempt_success():
    """A student can resume a PAUSED homework attempt."""
    db = MagicMock()
    service = AttemptService(db)

    student_id = uuid.uuid4()
    attempt_id = uuid.uuid4()
    access_token = uuid.uuid4()

    mock_assessment = MagicMock()
    mock_assessment.assessment_type = AssessmentType.HOMEWORK
    mock_assessment.allow_resume = True
    mock_assessment.window_end = datetime.now(timezone.utc) + timedelta(hours=4)
    mock_assessment.grace_period_minutes = 0
    mock_assessment.late_submission_allowed = False

    mock_attempt = MagicMock()
    mock_attempt.id = attempt_id
    mock_attempt.student_id = student_id
    mock_attempt.access_token = access_token
    mock_attempt.status = AttemptStatus.PAUSED
    mock_attempt.assessment = mock_assessment
    mock_attempt.expires_at = datetime.now(timezone.utc) + timedelta(hours=2)

    service.attempt_repo.get_by_access_token = AsyncMock(return_value=mock_attempt)
    service.attempt_repo.update_fields = AsyncMock()
    service.submission_repo.list_responses_for_attempt = AsyncMock(return_value=[])

    result = await service.resume_attempt(
        attempt_id=attempt_id,
        student_id=student_id,
        access_token=access_token,
    )

    assert result.status == AttemptStatus.IN_PROGRESS
    assert service.attempt_repo.update_fields.called


@pytest.mark.asyncio
async def test_in_assessment_ai_uses_assessment_ai_support_action():
    """StudySupportAgent uses ASSESSMENT_AI_SUPPORT action type when is_in_assessment is True."""
    gateway = MagicMock()
    mock_response = MagicMock()
    mock_response.content = "Explanation of concept"
    gateway.complete = AsyncMock(return_value=mock_response)

    agent = StudySupportAgent(gateway)
    agent.rag_service = MagicMock()

    mock_rag_result = MagicMock()
    mock_rag_result.fallback_used = False
    mock_rag_result.context_string = "Chapter 4 context"
    mock_rag_result.citations = []

    db = MagicMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.rag_service.RAGService.retrieve_context", AsyncMock(return_value=mock_rag_result))
        student_id = uuid.uuid4()
        attempt_id = uuid.uuid4()

        response = await agent.answer(
            question="Can you explain Ohm's law?",
            student_id=student_id,
            conversation_history=[],
            db=db,
            is_in_assessment=True,
            attempt_id=attempt_id,
        )

        assert response.answer == "Explanation of concept"
        assert gateway.complete.called
        call_kwargs = gateway.complete.call_args.kwargs
        assert call_kwargs.get("action_type") == AIActionType.ASSESSMENT_AI_SUPPORT
        assert call_kwargs.get("subject_entity_id") == attempt_id
        assert call_kwargs.get("subject_entity_type") == "assessment_attempt"
