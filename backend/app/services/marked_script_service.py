"""
app/services/marked_script_service.py

Marked-paper archive. When a result is released (or its mark changes later) the
paper is frozen as an immutable JSON snapshot: the questions as the student saw
them, their answers, the correct answers, the mark and feedback per question,
and who marked each one. A SHA-256 hash of the snapshot gives tamper evidence
and a short verification code that is printed on the PDF.

Archiving is best effort from the caller's point of view: failing to archive a
paper must never block releasing results (see ``snapshot_result_safely``).
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import timedelta
from typing import Any

import structlog
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.constants import UserRole
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.db.base import utcnow
from app.db.models.auth import User
from app.db.models.export import MarkedScript
from app.db.models.result import AssessmentResult
from app.db.repositories.marked_script_repo import MarkedScriptRepository

log = structlog.get_logger(__name__)

SNAPSHOT_SCHEMA_VERSION = 1
DEFAULT_RETENTION_YEARS = 5
MAX_BUNDLE_SCRIPTS = 300
TRIGGERS = ("RELEASE", "CORRECTION", "APPEAL", "BACKFILL")


def canonical_hash(snapshot: dict[str, Any]) -> str:
    """SHA-256 over a canonical (sorted, compact) JSON form of the snapshot."""
    payload = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def make_verification_code(snapshot_hash: str, version: int) -> str:
    return f"MX-{snapshot_hash[:12].upper()}-V{version}"


def _role(user: User) -> str:
    return str(getattr(user.role, "value", user.role)).upper()


def _full_name(profile: Any, fallback: str) -> str:
    first = (getattr(profile, "first_name", None) or "").strip()
    last = (getattr(profile, "last_name", None) or "").strip()
    return f"{first} {last}".strip() or (getattr(profile, "display_name", None) or "") or fallback


class MarkedScriptService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = MarkedScriptRepository(db)

    # ── Building ─────────────────────────────────────────────────────────────

    async def build_snapshot(self, result: AssessmentResult) -> dict[str, Any]:
        from app.services.result_service import ResultService

        # Callers hand in results fresh from an update, with the per-question
        # breakdown not loaded (or stale), so always reload it here.
        await self.db.refresh(result, attribute_names=["breakdowns"])
        paper = await ResultService(self.db)._enrich_result_response(result)
        paper = jsonable_encoder(paper)
        # The logo is an inline image (tens of KB): resolve it when rendering instead of
        # copying it into every student's snapshot.
        paper.pop("institution_logo_url", None)

        student = await self._student_block(result.student_id)

        marking: list[dict[str, Any]] = []
        if result.attempt_id and not result.is_group_result:
            grades = await self.repo.list_final_grades(result.attempt_id)
            names = await self._user_names({g.graded_by_id for g in grades if g.graded_by_id})
            for g in grades:
                marking.append(
                    {
                        "question_id": str(g.question_id) if g.question_id else None,
                        "score": g.final_marks if g.final_marks is not None else g.score,
                        "max_score": g.max_score,
                        "grading_mode": g.grading_mode,
                        "marked_by": names.get(g.graded_by_id) if g.graded_by_id else None,
                        "marked_at": g.graded_at.isoformat() if g.graded_at else None,
                        "ai_suggested_score": g.ai_suggested_score,
                        "ai_rationale": g.ai_rationale,
                        "lecturer_override": bool(g.lecturer_override),
                        "rubric_scores": jsonable_encoder(g.rubric_scores or []),
                    }
                )
            marking.sort(key=lambda m: m["question_id"] or "")

        return {
            "schema_version": SNAPSHOT_SCHEMA_VERSION,
            "student": student,
            "paper": paper,
            "marking": marking,
        }

    async def _student_block(self, student_id: uuid.UUID) -> dict[str, Any]:
        res = await self.db.execute(
            select(User).where(User.id == student_id).options(selectinload(User.profile))
        )
        user = res.scalars().first()
        profile = getattr(user, "profile", None) if user else None
        fallback = user.email if user else str(student_id)
        return {
            "id": str(student_id),
            "name": _full_name(profile, fallback),
            "student_number": getattr(profile, "student_id", None),
        }

    async def _user_names(self, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        res = await self.db.execute(
            select(User).where(User.id.in_(ids)).options(selectinload(User.profile))
        )
        return {u.id: _full_name(getattr(u, "profile", None), u.email) for u in res.scalars().all()}

    # ── Writing ──────────────────────────────────────────────────────────────

    async def snapshot_result(
        self,
        result: AssessmentResult,
        *,
        trigger: str,
        created_by_id: uuid.UUID | None = None,
    ) -> MarkedScript:
        """Freeze the paper. Adds a new version only when the content changed."""
        if trigger not in TRIGGERS:
            raise ValueError(f"unknown snapshot trigger {trigger!r}")

        snapshot = await self.build_snapshot(result)
        digest = canonical_hash(snapshot)

        latest = await self.repo.latest_for_result(result.id)
        if latest is not None and latest.snapshot_hash == digest:
            return latest

        version = (latest.version + 1) if latest else 1
        script = MarkedScript(
            result_id=result.id,
            attempt_id=result.attempt_id,
            assessment_id=result.assessment_id,
            student_id=result.student_id,
            version=version,
            trigger=trigger,
            snapshot=snapshot,
            snapshot_hash=digest,
            verification_code=make_verification_code(digest, version),
            total_score=float(result.total_score or 0.0),
            max_score=float(result.max_score or 0.0),
            created_by_id=created_by_id,
            retain_until=utcnow() + timedelta(days=365 * DEFAULT_RETENTION_YEARS),
        )
        await self.repo.add(script)
        log.info(
            "[AUDIT] marked_script.created",
            result_id=str(result.id),
            version=version,
            trigger=trigger,
            snapshot_hash=digest,
        )
        return script

    async def snapshot_result_safely(
        self,
        result: AssessmentResult,
        *,
        trigger: str,
        created_by_id: uuid.UUID | None = None,
    ) -> None:
        """Archive without ever raising; a failure is logged and the caller carries on."""
        try:
            async with self.db.begin_nested():
                await self.snapshot_result(result, trigger=trigger, created_by_id=created_by_id)
        except Exception as exc:  # noqa: BLE001 - archiving must not block releasing
            log.error(
                "marked_script.snapshot_failed",
                result_id=str(getattr(result, "id", "")),
                trigger=trigger,
                error=str(exc),
            )

    # ── Reading / access ─────────────────────────────────────────────────────

    async def find_result(self, ref_id: uuid.UUID) -> AssessmentResult:
        from app.db.repositories.result_repo import ResultRepository

        result = await ResultRepository(self.db).get_by_attempt_or_id_with_breakdowns(ref_id)
        if result is None:
            raise NotFoundError("Result not found", code="RESULT_NOT_FOUND")
        return result

    async def resolve_for_user(
        self, ref_id: uuid.UUID, user: User
    ) -> tuple[AssessmentResult, str]:
        """
        Find the result for an attempt (or result) id and check the caller may see its
        paper. Returns (result, audience): "staff", "student", or "reviewer" (an
        appeal reviewer, who sees the paper without the student's identity).
        """
        result = await self.find_result(ref_id)
        role = _role(user)

        if role == UserRole.STUDENT.value:
            if result.student_id != user.id:
                raise AuthorizationError(
                    "You can only view your own paper", code="SCRIPT_ACCESS_DENIED"
                )
            if not result.is_released:
                raise AuthorizationError(
                    "Your marked paper is available once results are released",
                    code="RESULT_NOT_RELEASED",
                )
            return result, "student"

        from app.services.result_service import ResultService

        try:
            await ResultService(self.db).assert_lecturer_assessment_access(
                result.assessment_id, user=user
            )
            return result, "staff"
        except AuthorizationError:
            if await self._is_appeal_reviewer(result, user):
                return result, "reviewer"
            raise

    async def _is_appeal_reviewer(self, result: AssessmentResult, user: User) -> bool:
        if not result.attempt_id:
            return False
        from app.db.models.appeals import Appeal

        res = await self.db.execute(
            select(Appeal.id).where(
                Appeal.attempt_id == result.attempt_id,
                Appeal.reviewer_id == user.id,
                Appeal.is_deleted.is_(False),
            )
        )
        return res.scalars().first() is not None

    async def get_script(
        self,
        result: AssessmentResult,
        *,
        version: int | None = None,
        requested_by: User | None = None,
    ) -> MarkedScript:
        """
        Return a stored version (latest by default). Results released before the
        archive existed are archived on first request (trigger BACKFILL).
        """
        if not result.is_released:
            raise ValidationError(
                message="The marked paper is archived when results are released.",
                field="result",
            )
        if version is not None:
            script = await self.repo.get_version(result.id, version)
        else:
            script = await self.repo.latest_for_result(result.id)
            if script is None:
                script = await self.snapshot_result(
                    result,
                    trigger="BACKFILL",
                    created_by_id=requested_by.id if requested_by else None,
                )
        if script is None:
            raise NotFoundError("Marked paper version not found", code="SCRIPT_NOT_FOUND")
        return script

    # ── Verification ─────────────────────────────────────────────────────────

    async def verify_code(self, code: str) -> dict[str, Any]:
        script = await self.repo.get_by_code(code.strip().upper())
        if script is None:
            return {"found": False, "code": code}
        intact = canonical_hash(script.snapshot) == script.snapshot_hash
        latest = await self.repo.latest_for_result(script.result_id)
        paper = (script.snapshot or {}).get("paper", {})
        return {
            "found": True,
            "code": script.verification_code,
            "intact": intact,
            "version": script.version,
            "is_latest_version": bool(latest and latest.id == script.id),
            "trigger": script.trigger,
            "created_at": script.created_at,
            "assessment_title": paper.get("assessment_title"),
            "course_code": paper.get("course_code"),
            "total_score": script.total_score,
            "max_score": script.max_score,
            "snapshot_hash": script.snapshot_hash,
        }

    @staticmethod
    def check_bundle_size(count: int) -> None:
        if count > MAX_BUNDLE_SCRIPTS:
            raise ValidationError(
                message=(
                    f"{count} papers is more than one download can hold "
                    f"({MAX_BUNDLE_SCRIPTS}). Download them one class at a time."
                ),
                field="assessment_id",
            )
