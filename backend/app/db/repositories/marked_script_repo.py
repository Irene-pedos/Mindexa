"""
app/db/repositories/marked_script_repo.py

Data access for the marked-paper archive. Rows are append-only: a changed mark
adds a new version, it never edits an earlier one.
"""
from __future__ import annotations

import uuid

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.academic import Course, Institution
from app.db.models.assessment import Assessment
from app.db.models.attempt import SubmissionGrade
from app.db.models.export import MarkedScript
from app.db.models.result import AssessmentResult


class MarkedScriptRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def latest_for_result(self, result_id: uuid.UUID) -> MarkedScript | None:
        res = await self.db.execute(
            select(MarkedScript)
            .where(MarkedScript.result_id == result_id, MarkedScript.is_deleted.is_(False))
            .order_by(MarkedScript.version.desc())
            .limit(1)
        )
        return res.scalars().first()

    async def list_versions(self, result_id: uuid.UUID) -> list[MarkedScript]:
        res = await self.db.execute(
            select(MarkedScript)
            .where(MarkedScript.result_id == result_id, MarkedScript.is_deleted.is_(False))
            .order_by(MarkedScript.version.asc())
        )
        return list(res.scalars().all())

    async def get_version(self, result_id: uuid.UUID, version: int) -> MarkedScript | None:
        res = await self.db.execute(
            select(MarkedScript).where(
                MarkedScript.result_id == result_id,
                MarkedScript.version == version,
                MarkedScript.is_deleted.is_(False),
            )
        )
        return res.scalars().first()

    async def get_by_code(self, code: str) -> MarkedScript | None:
        res = await self.db.execute(
            select(MarkedScript).where(
                MarkedScript.verification_code == code,
                MarkedScript.is_deleted.is_(False),
            )
        )
        return res.scalars().first()

    async def list_latest_for_assessment(self, assessment_id: uuid.UUID) -> list[MarkedScript]:
        """The newest version of every student's paper for one assessment."""
        newest = (
            select(MarkedScript.result_id, func.max(MarkedScript.version).label("v"))
            .where(
                MarkedScript.assessment_id == assessment_id,
                MarkedScript.is_deleted.is_(False),
            )
            .group_by(MarkedScript.result_id)
            .subquery()
        )
        res = await self.db.execute(
            select(MarkedScript)
            .join(
                newest,
                and_(
                    MarkedScript.result_id == newest.c.result_id,
                    MarkedScript.version == newest.c.v,
                ),
            )
            .order_by(MarkedScript.created_at.asc())
        )
        return list(res.scalars().all())

    async def add(self, script: MarkedScript) -> MarkedScript:
        self.db.add(script)
        await self.db.flush()
        return script

    async def list_final_grades(self, attempt_id: uuid.UUID) -> list[SubmissionGrade]:
        res = await self.db.execute(
            select(SubmissionGrade).where(
                SubmissionGrade.attempt_id == attempt_id,
                SubmissionGrade.is_current.is_(True),
                SubmissionGrade.is_final.is_(True),
                SubmissionGrade.is_deleted.is_(False),
            )
        )
        return list(res.scalars().all())

    async def institution_logo(
        self, assessment_id: uuid.UUID, institution_name: str | None = None
    ) -> str | None:
        """
        The institution's logo (a data URI), kept out of the snapshots. Found through the
        assessment's course; if that has no institution, by the name printed on the paper.
        """
        res = await self.db.execute(
            select(Institution.logo_url)
            .join(Course, Course.institution_id == Institution.id)
            .join(Assessment, Assessment.course_id == Course.id)
            .where(Assessment.id == assessment_id)
        )
        logo = res.scalars().first()
        if logo or not institution_name:
            return logo
        by_name = await self.db.execute(
            select(Institution.logo_url).where(Institution.name == institution_name).limit(1)
        )
        return by_name.scalars().first()

    async def list_released_results(
        self, assessment_id: uuid.UUID
    ) -> list[AssessmentResult]:
        res = await self.db.execute(
            select(AssessmentResult)
            .where(
                AssessmentResult.assessment_id == assessment_id,
                AssessmentResult.is_released.is_(True),
                AssessmentResult.is_deleted.is_(False),
            )
            .order_by(AssessmentResult.created_at.asc())
        )
        return list(res.scalars().all())
