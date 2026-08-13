"""
Unit tests for student extra time accommodations during assessment attempts.
"""

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock
import pytest

from app.db.models.assessment import Assessment
from app.db.models.auth import User, UserProfile
from app.db.enums import AssessmentStatus, UserRole, UserStatus
from app.services.attempt_service import AttemptService


def test_compute_expires_at_standard_duration():
    """Standard student with 0 extra time gets standard duration."""
    now = datetime(2026, 8, 12, 10, 0, 0, tzinfo=timezone.utc)
    service = AttemptService(MagicMock())

    assessment = MagicMock()
    assessment.duration_minutes = 60
    assessment.window_end = datetime(2026, 8, 12, 12, 0, 0, tzinfo=timezone.utc)

    expires_at = service._compute_expires_at(assessment, now, extra_time_percent=0)
    assert expires_at == datetime(2026, 8, 12, 11, 0, 0, tzinfo=timezone.utc)


def test_compute_expires_at_with_extra_time_50_percent():
    """Student with +50% extra time gets 90 minutes on a 60-minute exam."""
    now = datetime(2026, 8, 12, 10, 0, 0, tzinfo=timezone.utc)
    service = AttemptService(MagicMock())

    assessment = MagicMock()
    assessment.duration_minutes = 60
    assessment.window_end = datetime(2026, 8, 12, 13, 0, 0, tzinfo=timezone.utc)

    expires_at = service._compute_expires_at(assessment, now, extra_time_percent=50)
    assert expires_at == datetime(2026, 8, 12, 11, 30, 0, tzinfo=timezone.utc)


def test_compute_expires_at_respects_window_end_by_default():
    """If extra time extends beyond window_end and allow_accommodation_past_window_end is False, window_end caps it."""
    now = datetime(2026, 8, 12, 10, 0, 0, tzinfo=timezone.utc)
    service = AttemptService(MagicMock())

    assessment = MagicMock()
    assessment.duration_minutes = 60
    assessment.window_end = datetime(2026, 8, 12, 11, 15, 0, tzinfo=timezone.utc)
    assessment.allow_accommodation_past_window_end = False

    expires_at = service._compute_expires_at(assessment, now, extra_time_percent=50)
    # 60m + 50% = 11:30, but window_end is 11:15
    assert expires_at == datetime(2026, 8, 12, 11, 15, 0, tzinfo=timezone.utc)


def test_compute_expires_at_allows_past_window_end_when_flag_enabled():
    """If allow_accommodation_past_window_end is True, student gets full accommodated duration past window_end."""
    now = datetime(2026, 8, 12, 10, 0, 0, tzinfo=timezone.utc)
    service = AttemptService(MagicMock())

    assessment = MagicMock()
    assessment.duration_minutes = 60
    assessment.window_end = datetime(2026, 8, 12, 11, 15, 0, tzinfo=timezone.utc)
    assessment.allow_accommodation_past_window_end = True

    expires_at = service._compute_expires_at(assessment, now, extra_time_percent=50)
    # With flag, gets full 90m (11:30)
    assert expires_at == datetime(2026, 8, 12, 11, 30, 0, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_start_attempt_loads_student_profile_extra_time():
    """Verify start_attempt loads user profile and applies extra_time_percent."""
    student_id = uuid.uuid4()
    assessment_id = uuid.uuid4()
    now = datetime(2026, 8, 12, 10, 0, 0, tzinfo=timezone.utc)

    mock_db = AsyncMock()
    service = AttemptService(mock_db)

    current_now = datetime.now(timezone.utc)
    mock_assessment = MagicMock()
    mock_assessment.id = assessment_id
    mock_assessment.is_deleted = False
    mock_assessment.status = AssessmentStatus.ACTIVE
    mock_assessment.audience_type = "all"
    mock_assessment.window_start = current_now - timedelta(hours=1)
    mock_assessment.window_end = current_now + timedelta(hours=5)
    mock_assessment.duration_minutes = 100
    mock_assessment.max_attempts = 1
    mock_assessment.is_password_protected = False
    mock_assessment.is_group_assessment = False
    mock_assessment.grading_mode = "AUTO"

    service.assessment_repo.get_by_id = AsyncMock(return_value=mock_assessment)
    service.assessment_repo.get_by_id_simple = AsyncMock(return_value=mock_assessment)
    service.attempt_repo.get_active_attempt = AsyncMock(return_value=None)
    service.attempt_repo.count_attempts_by_student = AsyncMock(return_value=0)

    # Setup student user with +25% extra time
    profile = UserProfile(
        id=uuid.uuid4(),
        user_id=student_id,
        extra_time_percent=25,
    )
    user = User(
        id=student_id,
        email="accommodated.student@uni.ac.za",
        role=UserRole.STUDENT,
        status=UserStatus.ACTIVE,
        profile=profile,
    )
    service.user_repo.get_by_id = AsyncMock(return_value=user)

    captured_create_kwargs = {}
    async def fake_create(**kwargs):
        captured_create_kwargs.update(kwargs)
        mock_attempt = MagicMock()
        mock_attempt.expires_at = kwargs.get("expires_at")
        return mock_attempt

    service.attempt_repo.create = AsyncMock(side_effect=fake_create)

    await service.start_attempt(
        student_id=student_id,
        assessment_id=assessment_id,
    )

    # 100 minutes + 25% = 125 minutes
    expected_expiry = captured_create_kwargs["expires_at"]
    assert expected_expiry is not None
    # Verify the difference between now and expires_at is roughly 125 minutes
    duration_secs = (expected_expiry - datetime.now(timezone.utc)).total_seconds()
    assert 124 * 60 <= duration_secs <= 126 * 60
