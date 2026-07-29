"""
tests/unit/test_integrity_service.py

Unit tests for IntegrityService profile-driven rule evaluations.
"""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.integrity_service import IntegrityService
from app.db.enums import IntegrityEventType


@pytest.mark.asyncio
async def test_evaluate_risk_tab_switch_warning():
    db = AsyncMock()
    service = IntegrityService(db)

    # Mock assessment and profile
    mock_assessment = MagicMock()
    mock_assessment.integrity_profile_id = None
    mock_assessment.integrity_policy_json = None
    mock_assessment.assessment_type = "CAT"
    db.get = AsyncMock(return_value=mock_assessment)

    mock_profile = MagicMock()
    mock_profile.rules_json = {
        "tab_switching": {"category": "Non-Tolerated", "action": "WARNING_AUTO_SUBMIT"}
    }
    service.integrity_repo.get_profile_by_code = AsyncMock(return_value=mock_profile)
    service.integrity_repo.list_warnings_for_attempt = AsyncMock(return_value=[])
    service.issue_warning = AsyncMock(return_value=MagicMock())

    warning, action_req, details = await service.evaluate_risk(
        attempt_id=uuid.uuid4(),
        assessment_id=uuid.uuid4(),
        student_id=uuid.uuid4(),
        event_type=IntegrityEventType.TAB_SWITCH,
        trigger_event_id=uuid.uuid4(),
    )
    assert action_req == "WARNING"
    assert warning is not None


@pytest.mark.asyncio
async def test_evaluate_risk_refresh_auto_submits_immediately():
    db = AsyncMock()
    service = IntegrityService(db)

    mock_assessment = MagicMock()
    mock_assessment.integrity_profile_id = None
    mock_assessment.integrity_policy_json = None
    mock_assessment.assessment_type = "CAT"
    db.get = AsyncMock(return_value=mock_assessment)

    mock_profile = MagicMock()
    mock_profile.rules_json = {
        "browser_refresh": {"category": "Non-Tolerated", "action": "AUTO_SUBMIT"}
    }
    service.integrity_repo.get_profile_by_code = AsyncMock(return_value=mock_profile)
    service.raise_flag = AsyncMock()
    service.attempt_repo.set_status = AsyncMock()

    warning, action_req, details = await service.evaluate_risk(
        attempt_id=uuid.uuid4(),
        assessment_id=uuid.uuid4(),
        student_id=uuid.uuid4(),
        event_type=IntegrityEventType.BROWSER_REFRESH,
        trigger_event_id=uuid.uuid4(),
    )
    assert action_req == "AUTO_SUBMIT"
    assert details["rule_key"] == "browser_refresh"
