"""
Integration tests for the marks export (CSV) and the marked-paper archive:

1. CSV: UTF-8 BOM, student number from the profile, formula injection escaped,
   released rows only unless asked, unreleased rows labelled
2. Snapshots: first release = v1, unchanged = no new row, changed mark = v2 with v1 kept
3. Tamper evidence: an edited snapshot no longer matches its stored hash
4. Access: student own paper after release only; unassigned lecturer refused
5. A real snapshot builds from a bare result (no mocking of the paper assembler)
"""
from __future__ import annotations

import copy
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, NotFoundError
from app.db.base import utcnow
from app.db.enums import (
    AssessmentStatus,
    AttemptStatus,
    GradingMode,
    SubmissionStatus,
    UserRole,
)
from app.db.models.academic import TeachingAssignment, TeachingWorkspace
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.export import ExportTemplate
from app.db.models.result import AssessmentResult
from app.services.export_service import ExportService
from app.services.marked_script_service import MarkedScriptService
from tests.integration.test_phase6c_export_flow import _setup_export_env, _user


async def _paper(db: AsyncSession, *, released: bool = True):
    """A lecturer-owned assessment with one student's (released) result."""
    inst, dept, course, period = await _setup_export_env(db)
    lecturer = _user(UserRole.LECTURER, db)
    outsider = _user(UserRole.LECTURER, db)
    student = _user(UserRole.STUDENT, db)
    other_student = _user(UserRole.STUDENT, db)
    await db.flush()
    student.profile.student_id = f"REG-{uuid.uuid4().hex[:6]}"

    ta = TeachingAssignment(
        lecturer_id=lecturer.id,
        institution_id=inst.id,
        department_id=dept.id,
        course_id=course.id,
        academic_year="2026",
    )
    db.add(ta)
    await db.flush()
    workspace = TeachingWorkspace(
        teaching_assignment_id=ta.id,
        course_id=course.id,
        academic_period_id=period.id,
        title="WS",
        created_by_id=lecturer.id,
    )
    db.add(workspace)
    await db.flush()
    assessment = Assessment(
        teaching_workspace_id=workspace.id,
        course_id=course.id,
        academic_period_id=period.id,
        institution_id=inst.id,
        academic_year="2026",
        title="Archive CAT",
        assessment_type="CAT",
        status=AssessmentStatus.PUBLISHED,
        total_marks=50,
        required_marks=50,
        created_by_id=lecturer.id,
    )
    db.add(assessment)
    await db.flush()

    attempt = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=student.id,
        status=AttemptStatus.SUBMITTED,
        submission_status=SubmissionStatus.GRADED,
        grading_mode=GradingMode.MANUAL,
        started_at=utcnow(),
        submitted_at=utcnow(),
    )
    db.add(attempt)
    await db.flush()
    result = AssessmentResult(
        attempt_id=attempt.id,
        student_id=student.id,
        assessment_id=assessment.id,
        total_score=38.0,
        max_score=50.0,
        percentage=76.0,
        is_passing=True,
        is_released=released,
        released_at=utcnow() if released else None,
        graded_question_count=1,
        total_question_count=1,
    )
    db.add(result)
    db.add(ExportTemplate(code="default_marksheet", name="Default", config_json={}, is_default=True))
    await db.flush()
    return lecturer, outsider, student, other_student, assessment, attempt, result


@pytest.mark.asyncio
async def test_csv_export_is_excel_safe_and_scoped(db: AsyncSession):
    lecturer, _o, student, other, assessment, _a, _r = await _paper(db)
    student.profile.first_name = "=EVIL"
    student.profile.last_name = "Ngabo"

    # A second student whose result is not released yet
    attempt2 = AssessmentAttempt(
        assessment_id=assessment.id,
        student_id=other.id,
        status=AttemptStatus.SUBMITTED,
        submission_status=SubmissionStatus.GRADED,
        grading_mode=GradingMode.MANUAL,
        started_at=utcnow(),
        submitted_at=utcnow(),
    )
    db.add(attempt2)
    await db.flush()
    db.add(
        AssessmentResult(
            attempt_id=attempt2.id,
            student_id=other.id,
            assessment_id=assessment.id,
            total_score=10.0,
            max_score=50.0,
            percentage=20.0,
            is_passing=False,
            is_released=False,
            graded_question_count=1,
            total_question_count=1,
        )
    )
    await db.flush()

    service = ExportService(db)
    released_only = await service.export_assessment_marksheet(
        assessment.id, lecturer, fmt="csv"
    )
    assert released_only.startswith(b"\xef\xbb\xbf"), "needs a UTF-8 BOM for Excel"
    text = released_only.decode("utf-8-sig")
    lines = text.strip().splitlines()
    assert lines[0].startswith("No.,Reg No,Full Name,Raw Total")
    assert len(lines) == 2, "unreleased result must not be listed by default"
    assert student.profile.student_id in lines[1], "student number comes from the profile"
    assert "'=EVIL" in lines[1], "formula-looking names are escaped"
    assert ",=EVIL" not in lines[1]
    assert "Released" in lines[1]

    with_unreleased = (
        await service.export_assessment_marksheet(
            assessment.id, lecturer, fmt="csv", include_unreleased=True
        )
    ).decode("utf-8-sig")
    rows = with_unreleased.strip().splitlines()
    assert len(rows) == 3
    assert any("Awaiting release" in r for r in rows), "unreleased rows are labelled"


@pytest.mark.asyncio
async def test_snapshot_versions_keep_history_and_detect_tampering(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    *_, result = await _paper(db)
    service = MarkedScriptService(db)

    content = {"schema_version": 1, "student": {"name": "A"}, "paper": {"total_score": 38}, "marking": []}

    async def fake_build(self, res):  # noqa: ANN001
        return copy.deepcopy(content)

    monkeypatch.setattr(MarkedScriptService, "build_snapshot", fake_build)

    v1 = await service.snapshot_result(result, trigger="RELEASE")
    assert v1.version == 1
    assert v1.verification_code.endswith("-V1")

    again = await service.snapshot_result(result, trigger="CORRECTION")
    assert again.id == v1.id, "unchanged paper must not create a new version"

    content["paper"]["total_score"] = 42  # e.g. an appeal raised the mark
    result.total_score = 42.0
    v2 = await service.snapshot_result(result, trigger="APPEAL")
    assert v2.version == 2
    assert v2.trigger == "APPEAL"

    versions = await service.repo.list_versions(result.id)
    assert [v.version for v in versions] == [1, 2]
    assert versions[0].snapshot["paper"]["total_score"] == 38, "version 1 is kept untouched"
    assert versions[0].total_score == 38.0 and versions[1].total_score == 42.0

    ok = await service.verify_code(v1.verification_code)
    assert ok["found"] and ok["intact"] and not ok["is_latest_version"]
    assert (await service.verify_code(v2.verification_code))["is_latest_version"]
    assert (await service.verify_code("MX-NOPE-V9"))["found"] is False

    # Someone edits version 1 directly in the database
    v1.snapshot = {**v1.snapshot, "paper": {"total_score": 50}}
    await db.flush()
    assert (await service.verify_code(v1.verification_code))["intact"] is False


@pytest.mark.asyncio
async def test_real_snapshot_builds_from_a_bare_result(db: AsyncSession):
    *_, student, _other, assessment, _attempt, result = await _paper(db)
    service = MarkedScriptService(db)

    script = await service.snapshot_result(result, trigger="RELEASE")

    paper = script.snapshot["paper"]
    assert paper["assessment_title"] == "Archive CAT"
    assert paper["total_score"] == 38.0
    assert script.snapshot["student"]["student_number"] == student.profile.student_id
    assert script.total_score == 38.0 and script.max_score == 50.0
    assert script.retain_until is not None


@pytest.mark.asyncio
async def test_who_may_open_a_paper(db: AsyncSession):
    lecturer, outsider, student, other, _assessment, attempt, result = await _paper(db)
    service = MarkedScriptService(db)

    # Student: own paper, after release
    found, audience = await service.resolve_for_user(attempt.id, student)
    assert found.id == result.id and audience == "student"

    with pytest.raises(AuthorizationError):
        await service.resolve_for_user(attempt.id, other)

    # Assigned lecturer sees it; a lecturer with no link to the class does not
    _, audience = await service.resolve_for_user(attempt.id, lecturer)
    assert audience == "staff"
    with pytest.raises(AuthorizationError):
        await service.resolve_for_user(attempt.id, outsider)

    with pytest.raises(NotFoundError):
        await service.resolve_for_user(uuid.uuid4(), lecturer)


@pytest.mark.asyncio
async def test_student_cannot_open_paper_before_release(db: AsyncSession):
    _l, _o, student, _other, _a, attempt, _r = await _paper(db, released=False)
    with pytest.raises(AuthorizationError):
        await MarkedScriptService(db).resolve_for_user(attempt.id, student)


@pytest.mark.asyncio
async def test_appeal_keeps_the_original_paper_and_adds_a_version(db: AsyncSession):
    from types import SimpleNamespace

    from app.services.appeal_service import AppealService

    lecturer, _o, _s, _other, _assessment, attempt, result = await _paper(db)
    service = MarkedScriptService(db)
    assert await service.repo.latest_for_result(result.id) is None  # released before the archive existed

    appeal = SimpleNamespace(attempt_id=attempt.id)
    await AppealService(db)._create_grade_revision(appeal, 45.0, lecturer.id)  # type: ignore[arg-type]

    versions = await service.repo.list_versions(result.id)
    assert [(v.version, v.trigger) for v in versions] == [(1, "BACKFILL"), (2, "APPEAL")]
    assert versions[0].total_score == 38.0, "the mark as first released is preserved"
    assert versions[1].total_score == 45.0
    assert versions[1].created_by_id == lecturer.id


@pytest.mark.asyncio
async def test_routes_enforce_access_and_deliver_files(client, db: AsyncSession, make_auth_headers):
    import io
    import zipfile

    lecturer, outsider, student, other, assessment, attempt, _result = await _paper(db)
    for person in (lecturer, outsider, student, other):
        person.email_verified = True

    def headers(user, role):
        return make_auth_headers(str(user.id), role, user.email)

    mine = headers(lecturer, UserRole.LECTURER)
    theirs = headers(outsider, UserRole.LECTURER)

    # ── marks export: only lecturers on this assessment ─────────────────────
    url = f"/api/v1/lecturer/assessments/{assessment.id}/export/marksheet"
    ok = await client.get(url, params={"format": "csv"}, headers=mine)
    assert ok.status_code == 200, ok.text
    assert ok.headers["content-type"].startswith("text/csv")
    assert ok.content.startswith(b"\xef\xbb\xbf")
    denied = await client.get(url, params={"format": "csv"}, headers=theirs)
    assert denied.status_code == 403
    assert (await client.get(url, params={"format": "xlsx"}, headers=theirs)).status_code == 403
    assert (await client.get(url, params={"format": "pdf"}, headers=mine)).status_code == 422

    # ── marked paper PDF ────────────────────────────────────────────────────
    pdf_url = f"/api/v1/attempts/{attempt.id}/script/pdf"
    for who in (mine, headers(student, UserRole.STUDENT)):
        res = await client.get(pdf_url, headers=who)
        assert res.status_code == 200, res.text
        assert res.headers["content-type"] == "application/pdf"
        assert res.content.startswith(b"%PDF")
    assert (await client.get(pdf_url, headers=theirs)).status_code == 403
    assert (await client.get(pdf_url, headers=headers(other, UserRole.STUDENT))).status_code == 403

    history = await client.get(f"/api/v1/attempts/{attempt.id}/script", headers=mine)
    assert history.status_code == 200
    versions = history.json()["versions"]
    assert [v["version"] for v in versions] == [1]
    code = versions[0]["verification_code"]

    # ── bundle (ZIP) ────────────────────────────────────────────────────────
    bundle_url = f"/api/v1/assessments/{assessment.id}/scripts/bundle"
    zipped = await client.post(bundle_url, headers=mine)
    assert zipped.status_code == 200, zipped.text
    names = zipfile.ZipFile(io.BytesIO(zipped.content)).namelist()
    assert len(names) == 1 and names[0].endswith(".pdf")
    assert (await client.post(bundle_url, headers=theirs)).status_code == 403
    assert (await client.post(bundle_url, headers=headers(student, UserRole.STUDENT))).status_code == 403

    # ── verification ────────────────────────────────────────────────────────
    checked = await client.get(f"/api/v1/scripts/verify/{code}", headers=mine)
    assert checked.status_code == 200
    assert checked.json()["found"] is True and checked.json()["intact"] is True
