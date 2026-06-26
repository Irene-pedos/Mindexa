from __future__ import annotations
import uuid
import asyncio
from app.workers.celery_app import celery_app
from app.services.document_processing_service import DocumentProcessingService
from app.db.session import get_db_context, engine
from app.core.logging import get_logger

logger = get_logger(__name__)

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="tasks.process_uploaded_document"
)
def process_uploaded_document(self, resource_id: str):
    """
    Celery task that calls DocumentProcessingService.process_resource().
    """
    logger.info("Starting document processing task", resource_id=resource_id, attempt=self.request.retries)
    
    # Run async service in sync Celery task
    async def run_processing():
        # Important: Celery workers run tasks in isolated loops. 
        # The global engine connection pool gets bound to the main thread's loop during import.
        # We must explicitly dispose of the engine's pool in this new loop before connecting.
        await engine.dispose()
        
        async with get_db_context() as db:
            service = DocumentProcessingService()
            await service.process_resource(uuid.UUID(resource_id), db)

    try:
        # In Celery solo pool on Windows, get_event_loop() often returns the main thread's loop 
        # which might be closed or running elsewhere. It's safer to always create a new loop 
        # for sync-to-async transitions in worker threads to prevent "attached to a different loop" errors.
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_processing())
        finally:
            loop.close()
            asyncio.set_event_loop(None)
    except Exception as exc:
        logger.exception("Document processing task failed", resource_id=resource_id)
        raise self.retry(exc=exc)
