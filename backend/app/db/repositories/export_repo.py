"""
app/db/repositories/export_repo.py

Repository for Phase 6C: Excel / Mark-sheet Export Jobs and Templates.
Strictly follows the repository pattern: executes database queries on AsyncSession.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Sequence

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.db.enums import ExportJobStatus, ExportType
from app.db.models.export import ExportJob, ExportTemplate


class ExportRepository:
    """Data access repository for export jobs and export templates."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Export Job ────────────────────────────────────────────────────────────

    async def create_job(
        self,
        requested_by_id: uuid.UUID,
        export_type: ExportType,
        template_id: uuid.UUID,
        assessment_id: Optional[uuid.UUID] = None,
        course_id: Optional[uuid.UUID] = None,
        period_id: Optional[uuid.UUID] = None,
    ) -> ExportJob:
        """Create a new export job with initial status QUEUED."""
        job = ExportJob(
            requested_by_id=requested_by_id,
            export_type=export_type,
            template_id=template_id,
            assessment_id=assessment_id,
            course_id=course_id,
            period_id=period_id,
            status=ExportJobStatus.QUEUED,
        )
        self.db.add(job)
        await self.db.flush()
        await self.db.refresh(job)
        return job

    async def get_job(self, job_id: uuid.UUID) -> Optional[ExportJob]:
        """Fetch a single export job by primary key (excluding soft-deleted rows)."""
        stmt = select(ExportJob).where(
            ExportJob.id == job_id,
            ExportJob.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def update_job_status(
        self,
        job: ExportJob,
        status: ExportJobStatus,
        file_path: Optional[str] = None,
        row_count: Optional[int] = None,
        error: Optional[str] = None,
        expires_at: Optional[datetime] = None,
    ) -> ExportJob:
        """
        Transition an export job to a new status (RUNNING, DONE, or FAILED).
        Populates file_path, row_count, error, and expires_at as appropriate.
        Sets finished_at when transitioning to a terminal state (DONE or FAILED).
        """
        job.status = status
        if file_path is not None:
            job.file_path = file_path
        if row_count is not None:
            job.row_count = row_count
        if error is not None:
            job.error = error
        if expires_at is not None:
            job.expires_at = expires_at
        if status in (ExportJobStatus.DONE, ExportJobStatus.FAILED):
            job.finished_at = utcnow()
        job.updated_at = utcnow()
        await self.db.flush()
        await self.db.refresh(job)
        return job

    # ── Export Template ───────────────────────────────────────────────────────

    async def get_template_by_code(self, code: str) -> Optional[ExportTemplate]:
        """Look up an export template by its unique code."""
        stmt = select(ExportTemplate).where(
            ExportTemplate.code == code,
            ExportTemplate.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def get_template(self, template_id: uuid.UUID) -> Optional[ExportTemplate]:
        """Fetch an export template by primary key (excluding soft-deleted rows)."""
        stmt = select(ExportTemplate).where(
            ExportTemplate.id == template_id,
            ExportTemplate.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def list_templates(
        self, institution_id: Optional[uuid.UUID] = None
    ) -> Sequence[ExportTemplate]:
        """
        List export templates.  When institution_id is provided, returns both
        institution-specific templates and global (institution_id IS NULL) templates.
        When institution_id is None, returns only global templates.
        """
        stmt = select(ExportTemplate).where(ExportTemplate.is_deleted == False)

        if institution_id is not None:
            stmt = stmt.where(
                or_(
                    ExportTemplate.institution_id == institution_id,
                    ExportTemplate.institution_id.is_(None),
                )
            )
        else:
            stmt = stmt.where(ExportTemplate.institution_id.is_(None))

        stmt = stmt.order_by(ExportTemplate.code.asc())
        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def upsert_template(
        self,
        code: str,
        name: str,
        config_json: dict,
        is_default: bool,
        institution_id: Optional[uuid.UUID] = None,
        created_by_id: Optional[uuid.UUID] = None,
    ) -> ExportTemplate:
        """
        Idempotently create or update an export template identified by its unique code.
        If an existing non-deleted template with the same code exists, it is updated in place.
        """
        existing = await self.get_template_by_code(code)

        if existing:
            existing.name = name
            existing.config_json = config_json
            existing.is_default = is_default
            if institution_id is not None:
                existing.institution_id = institution_id
            existing.updated_at = utcnow()
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        template = ExportTemplate(
            code=code,
            name=name,
            config_json=config_json,
            is_default=is_default,
            institution_id=institution_id,
            created_by_id=created_by_id,
        )
        self.db.add(template)
        await self.db.flush()
        await self.db.refresh(template)
        return template
