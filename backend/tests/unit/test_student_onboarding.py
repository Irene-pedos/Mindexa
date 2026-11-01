"""Student onboarding: hierarchy validation, required class, derived year, one-time completion."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.db.enums import EnrollmentStatus
from app.services import auth_service
from app.services.auth_service import AuthService

INST, DEPT, OPT, GROUP, SECTION = (uuid.uuid4() for _ in range(5))


def _service(monkeypatch: pytest.MonkeyPatch, *, completed: bool = False, **repo_overrides):
    profile = SimpleNamespace(simple_mode_enabled=False, avatar_url=None)
    user = SimpleNamespace(id=uuid.uuid4(), profile=profile, onboarding_completed=completed)

    repo = MagicMock()
    repo.get_institution = AsyncMock(return_value=SimpleNamespace(name="Uni"))
    repo.get_department = AsyncMock(
        return_value=SimpleNamespace(institution_id=INST, campus_id=None, college_id=None, name="Dept")
    )
    repo.get_option = AsyncMock(return_value=SimpleNamespace(department_id=DEPT, name="Opt"))
    repo.get_campus = AsyncMock(return_value=None)
    repo.get_college = AsyncMock(return_value=None)
    repo.count_option_groups = AsyncMock(return_value=1)
    repo.get_class_group = AsyncMock(
        return_value=SimpleNamespace(id=GROUP, option_id=OPT, level=2, name="Year 2")
    )
    repo.count_group_sections = AsyncMock(return_value=1)
    repo.get_section = AsyncMock(
        return_value=SimpleNamespace(id=SECTION, class_group_id=GROUP, academic_year="2026 - 2027")
    )
    repo.current_year_name = AsyncMock(return_value="2025 - 2026")
    repo.get_active_enrollment = AsyncMock(return_value=None)
    for name, value in repo_overrides.items():
        setattr(repo, name, value)
    monkeypatch.setattr(auth_service, "OnboardingRepository", lambda _db: repo)

    db = MagicMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    service = AuthService.__new__(AuthService)
    service.db = db
    service._users = MagicMock()
    service._users.get_by_id = AsyncMock(return_value=user)
    return service, user, db


def _call(service: AuthService, user, **overrides):
    kwargs = dict(
        user_id=user.id,
        institution_id=INST,
        department_id=DEPT,
        option_id=OPT,
        class_group_id=GROUP,
        class_section_id=SECTION,
    )
    kwargs.update(overrides)
    return service.complete_student_onboarding(**kwargs)


@pytest.mark.asyncio
async def test_happy_path_derives_level_and_year_and_enrolls(monkeypatch):
    service, user, db = _service(monkeypatch)
    await _call(service, user)

    assert user.onboarding_completed is True
    assert user.profile.simple_mode_enabled is False  # accessibility opt-in, not an onboarding default
    assert user.profile.level == "Level 2"
    assert user.profile.year == "2026 - 2027"  # the class's own year, not a student's pick
    assert user.profile.class_section_id == SECTION
    enrollment = next(c.args[0] for c in db.add.call_args_list if hasattr(c.args[0], "class_section_id"))
    assert enrollment.enrollment_status == EnrollmentStatus.ACTIVE


@pytest.mark.asyncio
async def test_second_onboarding_is_refused(monkeypatch):
    service, user, db = _service(monkeypatch, completed=True)
    with pytest.raises(ConflictError):
        await _call(service, user)
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_department_must_belong_to_institution(monkeypatch):
    other = SimpleNamespace(institution_id=uuid.uuid4(), campus_id=None, college_id=None, name="D")
    service, user, _ = _service(monkeypatch, get_department=AsyncMock(return_value=other))
    with pytest.raises(ValidationError):
        await _call(service, user)


@pytest.mark.asyncio
async def test_option_must_belong_to_department(monkeypatch):
    other = SimpleNamespace(department_id=uuid.uuid4(), name="O")
    service, user, _ = _service(monkeypatch, get_option=AsyncMock(return_value=other))
    with pytest.raises(ValidationError):
        await _call(service, user)


@pytest.mark.asyncio
async def test_section_required_when_group_has_sections(monkeypatch):
    service, user, db = _service(monkeypatch)
    with pytest.raises(ValidationError):
        await _call(service, user, class_section_id=None)
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_section_must_belong_to_group(monkeypatch):
    stray = SimpleNamespace(id=SECTION, class_group_id=uuid.uuid4(), academic_year="x")
    service, user, _ = _service(monkeypatch, get_section=AsyncMock(return_value=stray))
    with pytest.raises(ValidationError):
        await _call(service, user)


@pytest.mark.asyncio
async def test_group_required_when_programme_has_groups(monkeypatch):
    service, user, _ = _service(monkeypatch)
    with pytest.raises(ValidationError):
        await _call(service, user, class_group_id=None, class_section_id=None)


@pytest.mark.asyncio
async def test_group_without_sections_uses_calendar_year(monkeypatch):
    service, user, db = _service(monkeypatch, count_group_sections=AsyncMock(return_value=0))
    await _call(service, user, class_section_id=None)

    assert user.profile.year == "2025 - 2026"  # from the institution calendar
    assert user.profile.class_section_id is None
    assert not any(hasattr(c.args[0], "class_section_id") for c in db.add.call_args_list if c.args[0] is not user.profile)


@pytest.mark.asyncio
async def test_programme_without_groups_needs_a_level(monkeypatch):
    service, user, _ = _service(monkeypatch, count_option_groups=AsyncMock(return_value=0))
    with pytest.raises(ValidationError):
        await _call(service, user, class_group_id=None, class_section_id=None)

    await _call(service, user, class_group_id=None, class_section_id=None, level="Level 3")
    assert user.profile.level == "Level 3"
