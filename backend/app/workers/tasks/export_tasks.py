"""
app/workers/tasks/export_tasks.py

Phase 6C: Background export job Celery task.
Triggered for exports with >300 rows.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import timedelta

import structlog

from app.core.celery_app import celery
from app.db.base import utcnow

log = structlog.get_logger(__name__)


async def _run_export_job(job_id: str) -> None:
    import os

    from app.db.enums import ExportJobStatus, ExportType
    from app.db.repositories.export_repo import ExportRepository
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        repo = ExportRepository(db)
        job = await repo.get_job(uuid.UUID(job_id))
        if not job:
            log.error("export_job.not_found", job_id=job_id)
            return

        await repo.update_job_status(job, ExportJobStatus.RUNNING)
        await db.commit()

        try:
            from app.db.models.auth import User
            from app.services.export_service import ExportService
            from sqlalchemy import select

            requester_res = await db.execute(
                select(User).where(User.id == job.requested_by_id)
            )
            requester = requester_res.scalars().first()
            if not requester:
                raise ValueError(f"Requester {job.requested_by_id} not found")

            service = ExportService(db)
            if job.export_type == ExportType.ASSESSMENT_MARKSHEET:
                data = await service.export_assessment_marksheet(
                    assessment_id=job.assessment_id,
                    requester=requester,
                )
            elif job.export_type == ExportType.COURSE_CONSOLIDATED:
                data = await service.export_course_consolidated(
                    course_id=job.course_id,
                    period_id=job.period_id,
                    requester=requester,
                )
            else:
                raise ValueError(f"Unknown export type: {job.export_type}")

            # Persist the file to a temp location or object storage
            export_dir = os.environ.get("EXPORT_STORAGE_PATH", "/tmp/exports")
            os.makedirs(export_dir, exist_ok=True)
            file_name = f"export_{job_id}.xlsx"
            file_path = os.path.join(export_dir, file_name)
            with open(file_path, "wb") as f:
                f.write(data)

            expires_at = utcnow() + timedelta(hours=24)
            await repo.update_job_status(
                job,
                ExportJobStatus.DONE,
                file_path=file_path,
                row_count=len(data),
                expires_at=expires_at,
            )
            await db.commit()
            log.info("export_job.done", job_id=job_id, file_path=file_path)

        except Exception as exc:
            await repo.update_job_status(job, ExportJobStatus.FAILED, error=str(exc))
            await db.commit()
            log.error("export_job.failed", job_id=job_id, error=str(exc))
            raise


@celery.task(
    name="app.workers.tasks.export_tasks.run_export_job",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="exports",
)
def run_export_job(self, job_id: str) -> None:
    try:
        asyncio.run(_run_export_job(job_id))
    except Exception as exc:
        log.error("run_export_job.failed", job_id=job_id, error=str(exc))
        raise self.retry(exc=exc)
