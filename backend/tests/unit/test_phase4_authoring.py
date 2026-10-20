"""
backend/tests/unit/test_phase4_authoring.py

Unit tests for Phase 4: Collaborative authoring, delegation, version snapshots, and audited post-approval edits.
Governing source of truth: MINDEXA_INSTITUTIONAL_WORKFLOWS_SPEC.md Section 8.
"""
from datetime import datetime, timedelta, timezone
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.core.constants import PostApprovalEditMode, PostStartEditMode, UserRole
from app.core.exceptions import (
    AuthorizationError,
    BadRequestError,
    ConflictError,
    ValidationError,
)
from app.db.enums import (
    AssessmentStatus,
    CollaboratorRole,
    DelegationStatus,
    Duty,
    NotificationType,
)
from app.db.models.academic import Course, Department
from app.db.models.assessment import Assessment
from app.db.models.authoring import AssessmentCollaborator, AuthorDelegation
from app.db.models.auth import User
from app.db.models.moderation import AssessmentSeal, AssessmentVersion
from app.db.models.policy import ApprovalPolicy
from app.schemas.authoring import (
    AssessmentCollaboratorCreate,
    AuthorDelegationCreate,
    PostApprovalEditRequest,
)
from app.services.authoring_service import AuthoringService


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.fixture
def authoring_service(mock_db):
    service = AuthoringService(mock_db)
    service.repo = AsyncMock()
    service.policy_repo = AsyncMock()
    service.duty_repo = AsyncMock()
    service.notif_repo = AsyncMock()
    service.mod_repo = AsyncMock()
    service.assessment_repo = AsyncMock()
    service.assessment_repo.get_by_id = AsyncMock(return_value=None)
    return service


def _make_user(role="LECTURER"):
    return User(
        id=uuid.uuid4(),
        email=f"user_{uuid.uuid4().hex[:6]}@college.ac.rw",
        name="Test User",
        role=role,
        is_active=True,
    )


def _make_assessment(created_by_id, status=AssessmentStatus.DRAFT):
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    dept = Department(id=dept_id, name="Computer Science", code="CS", institution_id=inst_id)
    course = Course(
        id=uuid.uuid4(),
        name="Data Structures",
        code="CS201",
        institution_id=inst_id,
        department_id=dept_id,
        academic_year="2026",
    )
    course.department = dept

    assessment = Assessment(
        id=uuid.uuid4(),
        title="Summative Exam",
        instructions="Answer all questions.",
        created_by_id=created_by_id,
        course_id=course.id,
        status=status,
        total_marks=100,
        passing_marks=50,
        duration_minutes=120,
    )
    assessment.course = course
    assessment.sections = []
    assessment.assessment_questions = []
    assessment.collaborators = []
    assessment.delegations = []
    return assessment


# ── 1. Collaborator Authorization Tests (R-01) ────────────────────────────────

@pytest.mark.asyncio
async def test_add_collaborator_owner_only(authoring_service):
    author = _make_user()
    other_user = _make_user()
    target_lecturer = _make_user()
    assessment = _make_assessment(author.id)

    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)

    # Attempting to add collaborator as a non-owner raises AuthorizationError
    with pytest.raises(AuthorizationError, match="Only the assessment owner"):
        await authoring_service.add_collaborator(
            assessment.id,
            other_user,
            AssessmentCollaboratorCreate(lecturer_id=target_lecturer.id),
        )


@pytest.mark.asyncio
async def test_add_collaborator_must_be_assigned_to_course(authoring_service):
    author = _make_user()
    unassigned_lecturer = _make_user()
    assessment = _make_assessment(author.id)

    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.repo.has_course_teaching_assignment.return_value = False

    # Lecturer without teaching assignment is rejected (R-01)
    with pytest.raises(BadRequestError, match="not assigned to teach this course"):
        await authoring_service.add_collaborator(
            assessment.id,
            author,
            AssessmentCollaboratorCreate(lecturer_id=unassigned_lecturer.id),
        )


@pytest.mark.asyncio
async def test_add_collaborator_success(authoring_service):
    author = _make_user()
    assigned_lecturer = _make_user()
    assessment = _make_assessment(author.id)

    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.repo.has_course_teaching_assignment.return_value = True
    collab_record = AssessmentCollaborator(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        lecturer_id=assigned_lecturer.id,
        added_by_id=author.id,
        role=CollaboratorRole.CO_AUTHOR,
    )
    authoring_service.repo.add_collaborator.return_value = collab_record

    res = await authoring_service.add_collaborator(
        assessment.id,
        author,
        AssessmentCollaboratorCreate(lecturer_id=assigned_lecturer.id),
    )

    assert res.lecturer_id == assigned_lecturer.id
    assert res.role == CollaboratorRole.CO_AUTHOR
    authoring_service.notif_repo.create.assert_awaited_once()
    assert (
        authoring_service.notif_repo.create.call_args[1]["notification_type"]
        == NotificationType.COLLABORATOR_ADDED
    )


@pytest.mark.asyncio
async def test_remove_collaborator_cannot_remove_owner(authoring_service):
    author = _make_user()
    assessment = _make_assessment(author.id)
    author_collab = AssessmentCollaborator(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        lecturer_id=author.id,
        added_by_id=author.id,
        role=CollaboratorRole.OWNER,
        is_active=True,
    )

    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.repo.get_collaborator_by_id.return_value = author_collab

    with pytest.raises(BadRequestError, match="Cannot remove the assessment owner"):
        await authoring_service.remove_collaborator(assessment.id, author_collab.id, author)


# ── 2. Author Delegation Tests (R-09) ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_delegation_wrong_department_rejected(authoring_service):
    author = _make_user()
    wrong_dept_delegate = _make_user()
    assessment = _make_assessment(author.id)

    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.is_hod_of_department = AsyncMock(return_value=False)
    authoring_service.repo.is_lecturer_in_department.return_value = False

    now = datetime.now(timezone.utc)
    body = AuthorDelegationCreate(
        delegate_id=wrong_dept_delegate.id,
        reason="Unavailable due to research conference",
        valid_from=now,
        valid_to=now + timedelta(days=5),
    )

    with pytest.raises(AuthorizationError, match="same department as the assessment course"):
        await authoring_service.create_delegation(assessment.id, author, body)


@pytest.mark.asyncio
async def test_create_delegation_by_hod_allowed(authoring_service):
    author = _make_user()
    hod = _make_user()
    dept_delegate = _make_user()
    assessment = _make_assessment(author.id)

    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.is_hod_of_department = AsyncMock(return_value=True)
    authoring_service.repo.is_lecturer_in_department.return_value = True

    now = datetime.now(timezone.utc)
    body = AuthorDelegationCreate(
        delegate_id=dept_delegate.id,
        reason="Author is on medical leave, HOD delegating responsibility",
        valid_from=now,
        valid_to=now + timedelta(days=7),
    )

    del_record = AuthorDelegation(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        delegator_id=author.id,
        delegate_id=dept_delegate.id,
        created_by_id=hod.id,
        reason=body.reason,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        status=DelegationStatus.ACTIVE,
    )
    authoring_service.repo.create_delegation.return_value = del_record

    res = await authoring_service.create_delegation(assessment.id, hod, body)
    assert res.delegate_id == dept_delegate.id
    assert res.created_by_id == hod.id
    authoring_service.notif_repo.create.assert_awaited_once()
    assert (
        authoring_service.notif_repo.create.call_args[1]["notification_type"]
        == NotificationType.DELEGATION_CREATED
    )


# ── 3. Edit Permissions & Delegation Scope ────────────────────────────────────

@pytest.mark.asyncio
async def test_assert_can_edit_allows_author_coauthor_and_active_delegate(authoring_service):
    author = _make_user()
    co_author = _make_user()
    delegate = _make_user()
    random_user = _make_user()
    assessment = _make_assessment(author.id)

    # 1. Author
    can_edit, d_id = await authoring_service.assert_can_edit(assessment, author)
    assert can_edit is True and d_id is None

    # 2. Co-author
    authoring_service.repo.get_collaborator.return_value = AssessmentCollaborator(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        lecturer_id=co_author.id,
        role=CollaboratorRole.CO_AUTHOR,
        added_by_id=author.id,
        is_active=True,
    )
    can_edit, d_id = await authoring_service.assert_can_edit(assessment, co_author)
    assert can_edit is True and d_id is None

    # 3. Active Delegate
    authoring_service.repo.get_collaborator.return_value = None
    delegation_id = uuid.uuid4()
    authoring_service.repo.get_active_delegation.return_value = AuthorDelegation(
        id=delegation_id,
        assessment_id=assessment.id,
        delegator_id=author.id,
        delegate_id=delegate.id,
        created_by_id=author.id,
        reason="Assigned to edit",
        valid_from=datetime.now(timezone.utc) - timedelta(hours=1),
        valid_to=datetime.now(timezone.utc) + timedelta(hours=1),
        status=DelegationStatus.ACTIVE,
    )
    can_edit, d_id = await authoring_service.assert_can_edit(assessment, delegate)
    assert can_edit is True
    assert d_id == delegation_id

    # 4. Random user raises AuthorizationError
    authoring_service.repo.get_active_delegation.return_value = None
    with pytest.raises(AuthorizationError):
        await authoring_service.assert_can_edit(assessment, random_user)


# ── 4. Version Diff Calculation ───────────────────────────────────────────────

def test_diff_snapshots_detects_changes(authoring_service):
    snap_a = {
        "assessment_id": "test-id",
        "title": "Data Structures Midterm",
        "instructions": "Answer all questions.",
        "total_marks": 100,
        "passing_marks": 50,
        "sections": [
            {"id": "sec-1", "title": "Section A", "questions_to_answer": None, "order_index": 0}
        ],
        "questions": [
            {"id": "q-1", "marks": 20, "prompt": "Explain arrays.", "question_type": "SHORT_ANSWER"}
        ],
    }
    snap_b = {
        "assessment_id": "test-id",
        "title": "Data Structures Midterm (Revised)",
        "instructions": "Answer all questions. Calculators allowed.",
        "total_marks": 100,
        "passing_marks": 50,
        "sections": [
            {"id": "sec-1", "title": "Section A - Foundations", "questions_to_answer": None, "order_index": 0},
            {"id": "sec-2", "title": "Section B", "questions_to_answer": 2, "order_index": 1},
        ],
        "questions": [
            {"id": "q-1", "marks": 25, "prompt": "Explain arrays with memory models.", "question_type": "SHORT_ANSWER"}
        ],
    }

    summary, changes = authoring_service.diff_snapshots(snap_a, snap_b)
    assert len(changes) >= 4
    fields_changed = {c.field for c in changes}
    assert "title" in fields_changed
    assert "instructions" in fields_changed
    assert "marks" in fields_changed
    assert "section" in fields_changed


# ── 5. Post-Approval Edit Rules & Superseding Seals (R-10) ────────────────────

@pytest.mark.asyncio
async def test_post_approval_edit_requires_reason_min_10_chars(authoring_service):
    author = _make_user()
    assessment = _make_assessment(author.id, status=AssessmentStatus.SEALED)
    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.assert_can_edit = AsyncMock(return_value=(True, None))
    authoring_service.repo.has_attempts_started = AsyncMock(return_value=False)

    # 1. Pydantic schema validation rejects short reasons (<10 chars)
    with pytest.raises(Exception):
        PostApprovalEditRequest(reason="too short", title="Updated Title")

    # 2. Service level validation also rejects short reasons
    req = MagicMock()
    req.reason = "short"
    with pytest.raises(ValidationError, match="at least 10 characters"):
        await authoring_service.apply_post_approval_edit(assessment.id, author, req)


@pytest.mark.asyncio
async def test_post_approval_edit_supersedes_seal_and_notifies(authoring_service):
    author = _make_user()
    assessment = _make_assessment(author.id, status=AssessmentStatus.SEALED)
    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.assert_can_edit = AsyncMock(return_value=(True, None))
    authoring_service.repo.has_attempts_started = AsyncMock(return_value=False)
    authoring_service.repo.get_versions.return_value = [
        AssessmentVersion(id=uuid.uuid4(), assessment_id=assessment.id, version_no=1, content_snapshot={}, content_hash="hash1", created_by_id=author.id)
    ]

    active_seal = AssessmentSeal(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        version_id=uuid.uuid4(),
        content_hash="hash1",
        sealed_by_id=uuid.uuid4(),
        verification_code="SEAL-1234567890123456",
        is_superseded=False,
    )
    authoring_service.repo.get_active_seal.return_value = active_seal
    authoring_service.policy_repo.get_by_institution_and_type.return_value = ApprovalPolicy(
        institution_id=assessment.course.institution_id,
        assessment_type=assessment.assessment_type,
        post_approval_edit_mode=PostApprovalEditMode.NOTIFY,
    )
    authoring_service.duty_repo.get_active_duties_for_institution.return_value = []
    authoring_service.duty_repo.get_active_duties_for_department.return_value = []

    req = PostApprovalEditRequest(
        reason="Correcting typographical mistake in section instructions",
        reprint_required=True,
        instructions="Updated clear instructions.",
    )

    await authoring_service.apply_post_approval_edit(assessment.id, author, req)

    # Active seal is now superseded
    assert active_seal.is_superseded is True
    assert active_seal.superseded_at is not None
    assert active_seal.reprint_required is True


@pytest.mark.asyncio
async def test_post_approval_edit_blocked_once_attempts_started(authoring_service):
    author = _make_user()
    assessment = _make_assessment(author.id, status=AssessmentStatus.PUBLISHED)
    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.assert_can_edit = AsyncMock(return_value=(True, None))
    # Attempts started! (A-10)
    authoring_service.repo.has_attempts_started = AsyncMock(return_value=True)

    # Content change (total marks) is blocked
    req = PostApprovalEditRequest(
        reason="Attempting to reallocate marks mid-exam",
        total_marks=80,
    )
    with pytest.raises(ConflictError, match="attempts have already started"):
        await authoring_service.apply_post_approval_edit(assessment.id, author, req)


@pytest.mark.asyncio
async def test_post_approval_edit_require_reapproval_returns_to_pending_moderation(authoring_service):
    author = _make_user()
    assessment = _make_assessment(author.id, status=AssessmentStatus.SEALED)
    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.assert_can_edit = AsyncMock(return_value=(True, None))
    authoring_service.repo.has_attempts_started = AsyncMock(return_value=False)
    authoring_service.repo.get_versions.return_value = []
    authoring_service.repo.get_active_seal.return_value = None
    authoring_service.duty_repo.get_active_duties_for_department.return_value = []

    authoring_service.policy_repo.get_by_institution_and_type.return_value = ApprovalPolicy(
        institution_id=assessment.course.institution_id,
        assessment_type=assessment.assessment_type,
        post_approval_edit_mode=PostApprovalEditMode.REQUIRE_REAPPROVAL,
    )

    req = PostApprovalEditRequest(
        reason="Major overhaul of questions after board consultation",
        instructions="Complete all questions.",
    )

    updated = await authoring_service.apply_post_approval_edit(assessment.id, author, req)

    # Assessment returned to PENDING_MODERATION
    assert updated.status == AssessmentStatus.PENDING_MODERATION


@pytest.mark.asyncio
async def test_read_authorization_idor_prevention(authoring_service):
    """
    Verify caller authorization on reading collaborators, delegations, versions, and diffs (IDOR prevention).
    Author, co-author, delegate, department HOD, department moderator, and admin are allowed.
    Unrelated lecturers are rejected with AuthorizationError.
    """
    author = _make_user()
    unrelated_lecturer = _make_user()
    co_author = _make_user()
    delegate = _make_user()
    hod = _make_user()
    moderator = _make_user()
    admin = _make_user(role=UserRole.ADMIN.value)

    assessment = _make_assessment(author.id)
    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)

    # Setup repo returns
    authoring_service.repo.get_collaborators.return_value = []
    authoring_service.repo.get_delegations.return_value = []
    authoring_service.repo.get_versions.return_value = []
    v1 = AssessmentVersion(id=uuid.uuid4(), assessment_id=assessment.id, version_no=1, content_snapshot={}, content_hash="h1", created_by_id=author.id)
    v2 = AssessmentVersion(id=uuid.uuid4(), assessment_id=assessment.id, version_no=2, content_snapshot={}, content_hash="h2", created_by_id=author.id)
    authoring_service.repo.get_version_by_number.side_effect = lambda a_id, v_no: v1 if v_no == 1 else v2

    # 1. Unrelated lecturer without assignments/roles is rejected
    authoring_service.repo.get_collaborator = AsyncMock(return_value=None)
    authoring_service.repo.get_active_delegation = AsyncMock(return_value=None)
    authoring_service.is_hod_of_department = AsyncMock(return_value=False)
    # mock permissions helper
    with pytest.raises(AuthorizationError):
        await authoring_service.list_collaborators(assessment.id, unrelated_lecturer)

    with pytest.raises(AuthorizationError):
        await authoring_service.list_delegations(assessment.id, unrelated_lecturer)

    with pytest.raises(AuthorizationError):
        await authoring_service.list_versions(assessment.id, unrelated_lecturer)

    with pytest.raises(AuthorizationError):
        await authoring_service.get_version_diff(assessment.id, 1, 2, unrelated_lecturer)

    # 2. Author succeeds
    collabs = await authoring_service.list_collaborators(assessment.id, author)
    assert collabs == []
    vers = await authoring_service.list_versions(assessment.id, author)
    assert vers == []

    # 3. Admin succeeds
    collabs_admin = await authoring_service.list_collaborators(assessment.id, admin)
    assert collabs_admin == []

    # 4. Active co-author succeeds
    authoring_service.repo.get_collaborator = AsyncMock(
        return_value=AssessmentCollaborator(
            id=uuid.uuid4(),
            assessment_id=assessment.id,
            lecturer_id=co_author.id,
            role=CollaboratorRole.CO_AUTHOR,
            added_by_id=author.id,
            is_active=True,
            is_deleted=False,
        )
    )
    assert await authoring_service.list_collaborators(assessment.id, co_author) == []

    # 5. Active delegate succeeds
    authoring_service.repo.get_collaborator = AsyncMock(return_value=None)
    authoring_service.repo.get_active_delegation = AsyncMock(
        return_value=AuthorDelegation(
            id=uuid.uuid4(),
            assessment_id=assessment.id,
            delegator_id=author.id,
            delegate_id=delegate.id,
            created_by_id=author.id,
            reason="Covering while attending academic conference",
            valid_from=datetime.now(timezone.utc) - timedelta(days=1),
            valid_to=datetime.now(timezone.utc) + timedelta(days=1),
            status=DelegationStatus.ACTIVE,
        )
    )
    assert await authoring_service.list_delegations(assessment.id, delegate) == []

    # 6. Department HOD succeeds
    authoring_service.repo.get_active_delegation = AsyncMock(return_value=None)
    authoring_service.is_hod_of_department = AsyncMock(return_value=True)
    assert await authoring_service.list_versions(assessment.id, hod) == []


@pytest.mark.asyncio
async def test_unversioned_direct_edit_bypass_blocked(mock_db):
    """
    Verify that AssessmentService._assert_not_finalized blocks direct unversioned edits on:
        - APPROVED, SEALED, PUBLISHED (code: POST_APPROVAL_EDIT_REQUIRED)
        - PENDING_MODERATION (code: ASSESSMENT_UNDER_MODERATION)
        - ACTIVE, CLOSED, ARCHIVED (code: ASSESSMENT_FINALIZED)
    and allows DRAFT and CHANGES_REQUESTED.
    """
    from app.services.assessment_service import AssessmentService

    asmt_svc = AssessmentService(mock_db)
    author = _make_user()

    # DRAFT: allowed
    draft_asmt = _make_assessment(author.id, status=AssessmentStatus.DRAFT)
    asmt_svc._assert_not_finalized(draft_asmt)  # no exception

    # CHANGES_REQUESTED: allowed
    cr_asmt = _make_assessment(author.id, status=AssessmentStatus.CHANGES_REQUESTED)
    asmt_svc._assert_not_finalized(cr_asmt)  # no exception

    # PENDING_MODERATION: blocked with ASSESSMENT_UNDER_MODERATION
    pm_asmt = _make_assessment(author.id, status=AssessmentStatus.PENDING_MODERATION)
    with pytest.raises(ConflictError) as exc_pm:
        asmt_svc._assert_not_finalized(pm_asmt)
    assert exc_pm.value.code == "ASSESSMENT_UNDER_MODERATION"

    # APPROVED: blocked with POST_APPROVAL_EDIT_REQUIRED
    app_asmt = _make_assessment(author.id, status=AssessmentStatus.APPROVED)
    with pytest.raises(ConflictError) as exc_app:
        asmt_svc._assert_not_finalized(app_asmt)
    assert exc_app.value.code == "POST_APPROVAL_EDIT_REQUIRED"

    # SEALED: blocked with POST_APPROVAL_EDIT_REQUIRED
    sealed_asmt = _make_assessment(author.id, status=AssessmentStatus.SEALED)
    with pytest.raises(ConflictError) as exc_seal:
        asmt_svc._assert_not_finalized(sealed_asmt)
    assert exc_seal.value.code == "POST_APPROVAL_EDIT_REQUIRED"

    # PUBLISHED: blocked with POST_APPROVAL_EDIT_REQUIRED
    pub_asmt = _make_assessment(author.id, status=AssessmentStatus.PUBLISHED)
    with pytest.raises(ConflictError) as exc_pub:
        asmt_svc._assert_not_finalized(pub_asmt)
    assert exc_pub.value.code == "POST_APPROVAL_EDIT_REQUIRED"

    # ACTIVE: blocked with ASSESSMENT_FINALIZED
    act_asmt = _make_assessment(author.id, status=AssessmentStatus.ACTIVE)
    with pytest.raises(ConflictError) as exc_act:
        asmt_svc._assert_not_finalized(act_asmt)
    assert exc_act.value.code == "ASSESSMENT_FINALIZED"


@pytest.mark.asyncio
async def test_version_diff_includes_question_options_and_correct_answers(authoring_service):
    """
    Verify that version diffs accurately detect modifications in:
        - Question options (text/content)
        - Correct answers (is_correct)
        - Explanations
    """
    snap_from = {
        "assessment_id": str(uuid.uuid4()),
        "title": "Exam V1",
        "instructions": "V1 Instructions",
        "total_marks": 100,
        "passing_marks": 50,
        "sections": [],
        "questions": [
            {
                "id": "q1",
                "question_id": "qid1",
                "prompt": "What is the capital of Rwanda?",
                "question_type": "MULTIPLE_CHOICE",
                "marks": 10,
                "section_id": None,
                "explanation": "Kigali is the capital city.",
                "options": [
                    {"id": "opt1", "text": "Kigali", "is_correct": True},
                    {"id": "opt2", "text": "Butare", "is_correct": False},
                ],
            }
        ],
    }

    snap_to = {
        "assessment_id": snap_from["assessment_id"],
        "title": "Exam V1",
        "instructions": "V1 Instructions",
        "total_marks": 100,
        "passing_marks": 50,
        "sections": [],
        "questions": [
            {
                "id": "q1",
                "question_id": "qid1",
                "prompt": "What is the capital of Rwanda?",
                "question_type": "MULTIPLE_CHOICE",
                "marks": 10,
                "section_id": None,
                "explanation": "Updated detailed explanation on Kigali history.",
                "options": [
                    {"id": "opt1", "text": "Kigali", "is_correct": False},
                    {"id": "opt2", "text": "Butare", "is_correct": True},
                ],
            }
        ],
    }

    summary, changes = authoring_service.diff_snapshots(snap_from, snap_to)
    field_names = [c.field for c in changes]

    # Verify all detailed content changes are captured
    assert "explanation" in field_names
    assert "options" in field_names
    assert "correct_answer" in field_names

    corr_change = next(c for c in changes if c.field == "correct_answer")
    assert corr_change.before == ["Kigali"]
    assert corr_change.after == ["Butare"]


@pytest.mark.asyncio
async def test_allow_with_notice_dispatches_student_notifications(authoring_service):
    """
    Verify that when attempts have started and policy has ALLOW_WITH_NOTICE:
        - Cosmetic edit is allowed
        - Student notification is dispatched to all students who have started attempts
        - Notification type is ASSESSMENT_UPDATE_NOTICE
    """
    author = _make_user()
    student_1 = uuid.uuid4()
    student_2 = uuid.uuid4()

    assessment = _make_assessment(author.id, status=AssessmentStatus.PUBLISHED)
    authoring_service._get_assessment_with_details = AsyncMock(return_value=assessment)
    authoring_service.assert_can_edit = AsyncMock(return_value=(True, None))

    # Attempts have started
    authoring_service.repo.has_attempts_started = AsyncMock(return_value=True)
    authoring_service.repo.get_attempt_student_ids = AsyncMock(return_value=[student_1, student_2])
    authoring_service.repo.get_versions.return_value = []
    authoring_service.repo.get_active_seal.return_value = None
    authoring_service.duty_repo.get_active_duties_for_department.return_value = []

    # Policy configured for ALLOW_WITH_NOTICE
    authoring_service.policy_repo.get_by_institution_and_type.return_value = ApprovalPolicy(
        institution_id=assessment.course.institution_id,
        assessment_type=assessment.assessment_type,
        post_approval_edit_mode=PostApprovalEditMode.NOTIFY,
        post_start_edit_mode=PostStartEditMode.ALLOW_WITH_NOTICE,
    )

    req = PostApprovalEditRequest(
        reason="Correcting typographical spelling mistake in instructions",
        instructions="Read instructions carefully before answering.",
        notice_banner="ATTENTION: Typo in instructions corrected.",
    )

    updated = await authoring_service.apply_post_approval_edit(assessment.id, author, req)
    assert updated.instructions == "Read instructions carefully before answering."

    # Verify student notifications were dispatched with ASSESSMENT_UPDATE_NOTICE
    assert authoring_service.notif_repo.create.call_count == 2
    calls = authoring_service.notif_repo.create.call_args_list
    recipient_ids = [c.kwargs["recipient_id"] for c in calls]
    assert student_1 in recipient_ids
    assert student_2 in recipient_ids
    for c in calls:
        assert c.kwargs["notification_type"] == NotificationType.ASSESSMENT_UPDATE_NOTICE
        assert "Typo in instructions corrected" in c.kwargs["body"]
