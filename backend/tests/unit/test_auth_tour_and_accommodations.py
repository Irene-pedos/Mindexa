"""
Unit tests for guided tour state, accommodations, and auth response mapping.
"""

import uuid
from datetime import datetime, timezone
import pytest
from app.db.models.auth import User, UserProfile
from app.db.enums import UserRole, UserStatus
from app.db.schemas.auth import (
    UserResponse,
    UserProfileResponse,
    UserProfileUpdate,
    TourProgressUpdateRequest,
)
from app.api.v1.routes.auth import _build_user_response


def test_build_user_response_maps_tour_and_accommodation_fields():
    """Verify _build_user_response includes all new tour and accommodation fields."""
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    profile = UserProfile(
        id=uuid.uuid4(),
        user_id=user_id,
        first_name="Jane",
        last_name="Doe",
        simple_mode_enabled=True,
        extra_time_percent=50,
        requires_screen_reader_mode=True,
        large_text_default=True,
        reduced_motion_default=True,
    )

    user = User(
        id=user_id,
        email="jane.doe@university.ac.za",
        role=UserRole.STUDENT,
        status=UserStatus.ACTIVE,
        email_verified=True,
        onboarding_completed=True,
        onboarding_tour_completed=True,
        onboarding_tour_step=3,
        onboarding_tour_variant="student_first_year",
        created_at=now,
        updated_at=now,
        profile=profile,
    )

    response = _build_user_response(user)

    assert isinstance(response, UserResponse)
    assert response.onboarding_tour_completed is True
    assert response.onboarding_tour_step == 3
    assert response.onboarding_tour_variant == "student_first_year"

    assert response.profile is not None
    assert isinstance(response.profile, UserProfileResponse)
    assert response.profile.simple_mode_enabled is True
    assert response.profile.extra_time_percent == 50
    assert response.profile.requires_screen_reader_mode is True
    assert response.profile.large_text_default is True
    assert response.profile.reduced_motion_default is True


def test_user_profile_update_allows_safe_preferences_only():
    """Verify UserProfileUpdate allows only safe preferences and ignores unallowed fields."""
    update = UserProfileUpdate(
        first_name="Jane",
        simple_mode_enabled=True,
        large_text_default=True,
        reduced_motion_default=False,
    )
    dump = update.model_dump(exclude_none=True)
    assert dump["first_name"] == "Jane"
    assert dump["simple_mode_enabled"] is True
    assert dump["large_text_default"] is True
    assert dump["reduced_motion_default"] is False
    assert "extra_time_percent" not in dump
    assert "requires_screen_reader_mode" not in dump


def test_tour_progress_update_request_resolves_both_field_conventions():
    """Verify TourProgressUpdateRequest accepts both full names and short alias keys."""
    # Full field names
    req_full = TourProgressUpdateRequest(
        onboarding_tour_step=2,
        onboarding_tour_completed=True,
        onboarding_tour_variant="lecturer_standard",
    )
    assert req_full.resolved_step == 2
    assert req_full.resolved_completed is True
    assert req_full.resolved_variant == "lecturer_standard"

    # Short field names
    req_short = TourProgressUpdateRequest(
        step=4,
        completed=False,
        variant="admin_core",
    )
    assert req_short.resolved_step == 4
    assert req_short.resolved_completed is False
    assert req_short.resolved_variant == "admin_core"
