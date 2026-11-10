"""
app/api/v1/routes/marked_scripts.py

Marked-paper archive: view a student's frozen marked paper (PDF), see its version
history, download every paper for an assessment as one ZIP, and verify a paper
against its verification code.
"""
from __future__ import annotations

import io
import re
import uuid
import zipfile
from typing import Any

import structlog
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.auth import User
from app.db.models.export import MarkedScript
from app.db.session import get_db
from app.dependencies.auth import require_active_user, require_lecturer_or_admin
from app.services.marked_script_pdf import render_marked_script_pdf
from app.services.marked_script_service import MarkedScriptService
from app.services.result_service import ResultService

log = structlog.get_logger(__name__)
router = APIRouter(tags=["Marked Scripts"])

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _safe(name: str) -> str:
    return _SAFE_NAME.sub("_", name).strip("._") or "paper"


def _version_row(script: MarkedScript) -> dict[str, Any]:
    return {
        "version": script.version,
        "trigger": script.trigger,
        "created_at": script.created_at,
        "verification_code": script.verification_code,
        "total_score": script.total_score,
        "max_score": script.max_score,
    }


async def _logo_for(service: MarkedScriptService, script: MarkedScript) -> str | None:
    paper = (script.snapshot or {}).get("paper") or {}
    return await service.repo.institution_logo(script.assessment_id, paper.get("institution_name"))


def _pdf_for(script: MarkedScript, audience: str, logo: str | None = None) -> bytes:
    return render_marked_script_pdf(
        snapshot=script.snapshot,
        verification_code=script.verification_code,
        version=script.version,
        created_at=script.created_at,
        audience=audience,
        logo_data_url=logo,
    )


@router.get(
    "/attempts/{attempt_id}/script",
    summary="Version history of a student's frozen marked paper",
)
async def get_script_versions(
    attempt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
) -> dict[str, Any]:
    service = MarkedScriptService(db)
    result, audience = await service.resolve_for_user(attempt_id, current_user)
    await service.get_script(result, requested_by=current_user)  # archives on first request
    versions = await service.repo.list_versions(result.id)
    if audience == "student":
        versions = versions[-1:]  # a student only needs their current paper
    await db.commit()
    return {
        "result_id": result.id,
        "assessment_id": result.assessment_id,
        "audience": audience,
        "versions": [_version_row(v) for v in versions],
    }


@router.get(
    "/attempts/{attempt_id}/script/pdf",
    summary="Download a student's marked paper as PDF",
)
async def download_script_pdf(
    attempt_id: uuid.UUID,
    version: int | None = Query(default=None, ge=1, description="Defaults to the latest version"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
) -> Response:
    service = MarkedScriptService(db)
    result, audience = await service.resolve_for_user(attempt_id, current_user)
    if audience == "student":
        version = None  # students always get their current version
    script = await service.get_script(result, version=version, requested_by=current_user)
    pdf = _pdf_for(script, audience, await _logo_for(service, script))
    await db.commit()

    log.info(
        "[AUDIT] marked_script.downloaded",
        result_id=str(result.id),
        version=script.version,
        audience=audience,
        user_id=str(current_user.id),
        snapshot_hash=script.snapshot_hash,
    )
    name = f"marked-paper_{_safe(script.verification_code)}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post(
    "/assessments/{assessment_id}/scripts/bundle",
    summary="Download every released marked paper of an assessment as a ZIP",
)
async def download_scripts_bundle(
    assessment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> Response:
    await ResultService(db).assert_lecturer_assessment_access(assessment_id, user=current_user)
    service = MarkedScriptService(db)

    results = await service.repo.list_released_results(assessment_id)
    service.check_bundle_size(len(results))

    logo: str | None = None
    archive = io.BytesIO()
    used: set[str] = set()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for result in results:
            script = await service.get_script(result, requested_by=current_user)
            student = (script.snapshot or {}).get("student") or {}
            base = _safe(str(student.get("student_number") or student.get("name") or result.id))
            name = f"{base}_v{script.version}.pdf"
            if name in used:  # two students without a number but with the same name
                name = f"{base}_{script.verification_code}.pdf"
            used.add(name)
            logo = logo or await _logo_for(service, script)  # one lookup per bundle
            zf.writestr(name, _pdf_for(script, "staff", logo))
    await db.commit()

    log.info(
        "[AUDIT] marked_script.bundle_downloaded",
        assessment_id=str(assessment_id),
        user_id=str(current_user.id),
        paper_count=len(results),
    )
    return Response(
        content=archive.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="marked-papers_{assessment_id}.zip"'
        },
    )


@router.get(
    "/scripts/verify/{code}",
    summary="Check a verification code printed on a marked paper",
)
async def verify_script(
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_lecturer_or_admin),
) -> dict[str, Any]:
    outcome = await MarkedScriptService(db).verify_code(code)
    log.info(
        "[AUDIT] marked_script.verified",
        code=code,
        found=outcome.get("found"),
        user_id=str(current_user.id),
    )
    return outcome
