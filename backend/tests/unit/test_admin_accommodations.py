"""
Unit tests for Admin accommodations update and audit log recording.
"""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.db.models.auth import User, UserProfile
from app.db.models.audit import AuditLog
from app.db.enums import UserRole, UserStatus
from app.schemas.admin import AdminUserAccommodationsUpdate
from app.services.admin_service import AdminService


@pytest.mark.asyncio
async def test_admin_update_user_accommodations_writes_audit_log():
    """Verify update_user_accommodations updates profile fields and creates an AuditLog row."""
    user_id = uuid.uuid4()
    profile_id = uuid.uuid4()
    admin_id = uuid.uuid4()

    mock_profile = UserProfile(
        id=profile_id,
        user_id=user_id,
        first_name="Alice",
        last_name="Smith",
        extra_time_percent=0,
        requires_screen_reader_mode=False,
        large_text_default=False,
        simple_mode_enabled=False,
        reduced_motion_default=False,
    )

    mock_user = User(
        id=user_id,
        email="alice@university.ac.za",
        role=UserRole.STUDENT,
        status=UserStatus.ACTIVE,
        email_verified=True,
        profile=mock_profile,
    )

    # Setup mock db session
    mock_db = AsyncMock()
    added_objects = []
    def fake_add(obj):
        added_objects.append(obj)
    mock_db.add = MagicMock(side_effect=fake_add)
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    service = AdminService(mock_db)
    service.user_repo = AsyncMock()
    service.user_repo.get_by_id = AsyncMock(return_value=mock_user)

    update_payload = AdminUserAccommodationsUpdate(
        extra_time_percent=50,
        requires_screen_reader_mode=True,
        large_text_default=True,
        simple_mode_enabled=True,
        reduced_motion_default=False,
        reason="Disability office accommodation approval #MED-942",
    )

    response = await service.update_user_accommodations(
        user_id=user_id,
        body=update_payload,
        actor_id=admin_id,
        actor_role="admin",
    )

    # Check updated profile values
    assert mock_profile.extra_time_percent == 50
    assert mock_profile.requires_screen_reader_mode is True
    assert mock_profile.large_text_default is True
    assert mock_profile.simple_mode_enabled is True
    assert mock_profile.reduced_motion_default is False

    # Check AuditLog was created and added to db
    audit_logs = [obj for obj in added_objects if isinstance(obj, AuditLog)]
    assert len(audit_logs) == 1
    audit = audit_logs[0]
    assert audit.entity_type == "user_profile"
    assert audit.entity_id == profile_id
    assert audit.action == "accommodations_updated"
    assert audit.actor_id == admin_id
    assert audit.actor_role == "admin"
    assert audit.before_state["extra_time_percent"] == 0
    assert audit.before_state["requires_screen_reader_mode"] is False
    assert audit.after_state["extra_time_percent"] == 50
    assert audit.after_state["requires_screen_reader_mode"] is True
    assert "Disability office" in audit.after_state["reason"]
