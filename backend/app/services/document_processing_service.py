from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

import docx
import fitz  # PyMuPDF
import httpx
import tiktoken
from app.core.config import settings
from app.core.logging import get_logger
from app.db.enums import ResourceProcessingStatus
from app.db.models.academic_resource import AcademicResource
from app.db.models.resource_chunk import ResourceChunk
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

logger = get_logger(__name__)

class DocumentExtractionError(Exception):
    pass

class EmbeddingGenerationError(Exception):
    pass

class DocumentProcessingService:
    def __init__(self):
        self.jina_api_key = settings.JINA_API_KEY
        self.jina_base_url = settings.JINA_BASE_URL
        self.embedding_model = settings.JINA_DEFAULT_MODEL
        try:
            self.tokenizer = tiktoken.get_encoding("cl100k_base")
        except Exception:
            self.tokenizer = None

    async def process_resource(self, resource_id: uuid.UUID, db: AsyncSession) -> None:
        """Full pipeline entry point called by Celery task."""
        resource = await db.get(AcademicResource, resource_id)
        if not resource:
            logger.error("Resource not found", resource_id=resource_id)
            return

        try:
            resource.processing_status = ResourceProcessingStatus.PROCESSING
            await db.commit()

            file_path = os.path.join(settings.UPLOAD_DIR, resource.file_path)
            if not os.path.exists(file_path):
                raise DocumentExtractionError(f"File not found: {file_path}")

            # 4. Extract text
            ext = os.path.splitext(resource.file_name)[1].lower()
            if ext == ".pdf":
                pages = self._extract_text_pdf(file_path)
            elif ext in [".docx", ".doc"]:
                pages = self._extract_text_docx(file_path)
            elif ext == ".txt":
                pages = self._extract_text_txt(file_path)
            else:
                raise DocumentExtractionError(f"Unsupported file type: {ext}")

            # 5. Chunk text
            chunks_data = self._chunk_text(pages)

            # 6. Generate embeddings
            texts = [c["content"] for c in chunks_data]
            embeddings = await self._generate_embeddings(texts, resource_id=resource.id, db=db)

            # 7. Store ResourceChunk records
            await self._store_chunks(resource.id, chunks_data, embeddings, db)

            # 8. Set status to COMPLETED on AcademicResource
            resource.processing_status = ResourceProcessingStatus.PROCESSED
            resource.processed_at = datetime.now(UTC)
            resource.chunk_count = len(chunks_data)
            await db.commit()

            # 9. Also update the owning StudentResource or LecturerMaterial so the
            #    frontend can see the correct processing status.
            await self._sync_parent_resource_status(
                academic_resource_id=resource.id,
                status=ResourceProcessingStatus.PROCESSED,
                chunk_count=len(chunks_data),
                db=db,
            )

            # 10. Automatically segment lecturer materials into Learning Units
            try:
                await self._auto_segment_learning_units(
                    academic_resource_id=resource.id,
                    db=db,
                )
            except Exception as lu_err:
                logger.warning(
                    "Automatic Learning Unit segmentation failed (non-blocking)",
                    resource_id=str(resource.id),
                    error=str(lu_err),
                )

            logger.info("Resource processed successfully", resource_id=resource.id)

        except Exception as e:
            logger.exception("Error processing resource", resource_id=resource_id, error=str(e))
            resource.processing_status = ResourceProcessingStatus.FAILED
            resource.processing_error = str(e)
            await db.commit()
            # Also propagate failure to parent resource
            await self._sync_parent_resource_status(
                academic_resource_id=resource.id,
                status=ResourceProcessingStatus.FAILED,
                chunk_count=0,
                db=db,
                error=str(e),
            )

    def _extract_text_pdf(self, file_path: str) -> List[Dict[str, Any]]:
        """Use PyMuPDF (fitz) to extract text page by page."""
        pages = []
        try:
            doc = fitz.open(file_path)
            for i, page in enumerate(doc):
                text = page.get_text()
                if text.strip():
                    pages.append({"page": i + 1, "text": text})
            doc.close()
            return pages
        except Exception as e:
            raise DocumentExtractionError(f"PDF extraction failed: {str(e)}")

    def _extract_text_docx(self, file_path: str) -> List[Dict[str, Any]]:
        """Use python-docx to extract paragraphs."""
        try:
            doc = docx.Document(file_path)
            text_blocks = []
            current_block = []

            for para in doc.paragraphs:
                if para.text.strip():
                    current_block.append(para.text)
                    if len(current_block) >= 5: # Group 5 paragraphs as a block
                        text_blocks.append({"section": None, "text": "\n".join(current_block)})
                        current_block = []

            if current_block:
                text_blocks.append({"section": None, "text": "\n".join(current_block)})

            return text_blocks
        except Exception as e:
            raise DocumentExtractionError(f"DOCX extraction failed: {str(e)}")

    def _extract_text_txt(self, file_path: str) -> List[Dict[str, Any]]:
        """Plain text extraction."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Split by double newlines as logical blocks
            blocks = content.split("\n\n")
            return [{"page": 1, "text": b} for b in blocks if b.strip()]
        except Exception as e:
            raise DocumentExtractionError(f"TXT extraction failed: {str(e)}")

    def _chunk_text(self, pages: List[Dict[str, Any]], chunk_size: int = None, overlap: int = None) -> List[Dict[str, Any]]:
        """Split extracted text into overlapping chunks."""
        chunk_size = chunk_size or settings.RAG_CHUNK_SIZE
        overlap = overlap or settings.RAG_CHUNK_OVERLAP
        chunks = []
        chunk_index = 0

        for p in pages:
            text = p["text"]
            # Simplified character-based approximation if tiktoken is not available
            # 1 token approx 4 characters
            chars_per_chunk = chunk_size * 4
            chars_overlap = overlap * 4

            start = 0
            while start < len(text):
                end = start + chars_per_chunk
                chunk_text = text[start:end]

                if len(chunk_text.strip()) > 30: # Minimum 30 tokens approx 120 chars
                    token_count = self._count_tokens(chunk_text)
                    chunks.append({
                        "chunk_index": chunk_index,
                        "content": chunk_text,
                        "token_count": token_count,
                        "metadata": {"page": p.get("page"), "section": p.get("section")}
                    })
                    chunk_index += 1

                start += chars_per_chunk - chars_overlap
                if start >= len(text):
                    break

        return chunks

    def _count_tokens(self, text: str) -> int:
        if self.tokenizer:
            return len(self.tokenizer.encode(text))
        return len(text) // 4

    async def _generate_embeddings(
        self,
        texts: List[str],
        resource_id: Optional[uuid.UUID] = None,
        db: Optional[AsyncSession] = None,
    ) -> List[List[float]]:
        """Generate document passage embeddings via audited AIGateway."""
        import asyncio

        batch_size = 16
        if db is not None:
            try:
                from app.core.ai.gateway import AIGateway
                from app.core.ai.provider_factory import (
                    get_ai_providers, get_embedding_providers)
                from app.core.ai.providers import AIEmbeddingRequest

                gateway = AIGateway(db, get_ai_providers(), get_embedding_providers())
                all_gateway_embeddings: List[List[float]] = []

                for batch_start in range(0, len(texts), batch_size):
                    sub_batch = texts[batch_start : batch_start + batch_size]
                    req = AIEmbeddingRequest(input=sub_batch)
                    res = await gateway.embed(
                        req,
                        subject_entity_type="academic_resource",
                        subject_entity_id=resource_id,
                        prompt_summary=f"Document embedding batch for resource {resource_id}",
                    )
                    if len(res.embeddings) != len(sub_batch):
                        raise EmbeddingGenerationError(
                            f"AIGateway returned {len(res.embeddings)} embeddings for {len(sub_batch)} inputs"
                        )
                    all_gateway_embeddings.extend(res.embeddings)
                    if batch_start + batch_size < len(texts):
                        await asyncio.sleep(0.3)

                return all_gateway_embeddings
            except Exception as exc:
                logger.warning(
                    "AIGateway document embedding failed, attempting direct provider fallback",
                    error=str(exc),
                )

        if not self.jina_api_key:
            raise EmbeddingGenerationError("JINA_API_KEY not configured")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.jina_api_key}",
        }
        url = f"{self.jina_base_url}/embeddings"
        jina_dim = min(settings.PGVECTOR_DIMENSION, 1024)
        target_dim = settings.PGVECTOR_DIMENSION

        all_direct_embeddings: List[List[float]] = []

        async with httpx.AsyncClient(timeout=60.0) as client:
            for batch_start in range(0, len(texts), batch_size):
                sub_batch = texts[batch_start : batch_start + batch_size]
                payload = {
                    "model": self.embedding_model,
                    "task": "retrieval.passage",
                    "dimensions": jina_dim,
                    "input": sub_batch,
                }

                response = None
                for attempt in range(3):
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code == 429 or "RATE_TOKEN_LIMIT_EXCEEDED" in response.text:
                        await asyncio.sleep(2.0 * (attempt + 1))
                        continue
                    break

                if response is None or response.status_code != 200:
                    err_text = response.text if response else "No response"
                    raise EmbeddingGenerationError(f"Jina API failed: {err_text}")

                data = response.json()
                raw_embeddings = [item["embedding"] for item in data.get("data", [])]
                if len(raw_embeddings) != len(sub_batch):
                    raise EmbeddingGenerationError(
                        f"Jina direct provider returned {len(raw_embeddings)} embeddings for {len(sub_batch)} inputs"
                    )

                for emb in raw_embeddings:
                    if len(emb) < target_dim:
                        emb = emb + [0.0] * (target_dim - len(emb))
                    elif len(emb) > target_dim:
                        emb = emb[:target_dim]
                    all_direct_embeddings.append(emb)

                if batch_start + batch_size < len(texts):
                    await asyncio.sleep(0.3)

        return all_direct_embeddings

    async def _store_chunks(self, resource_id: uuid.UUID, chunks_data: List[Dict[str, Any]], embeddings: List[List[float]], db: AsyncSession) -> None:
        """Bulk insert ResourceChunk records."""
        for i, chunk_info in enumerate(chunks_data):
            chunk = ResourceChunk(
                resource_id=resource_id,
                chunk_index=chunk_info["chunk_index"],
                content=chunk_info["content"],
                token_count=chunk_info["token_count"],
                embedding=embeddings[i],
                metadata_json=chunk_info["metadata"]
            )
            db.add(chunk)
        await db.flush()

    async def _sync_parent_resource_status(
        self,
        academic_resource_id: uuid.UUID,
        status: ResourceProcessingStatus,
        chunk_count: int,
        db: AsyncSession,
        error: Optional[str] = None,
    ) -> None:
        """
        After AcademicResource processing finishes, propagate the status back
        to the StudentResource or LecturerMaterial that owns it.
        This keeps the frontend status field in sync.
        """
        from app.db.models.resource import LecturerMaterial, StudentResource

        # Try to update StudentResource
        student_update = (
            update(StudentResource)
            .where(StudentResource.academic_resource_id == academic_resource_id)
            .values(
                processing_status=status,
                chunk_count=chunk_count if chunk_count else None,
                processing_error=error,
            )
        )
        student_result = await db.execute(student_update)

        # Try to update LecturerMaterial if it wasn't a student resource
        if student_result.rowcount == 0:
            lecturer_update = (
                update(LecturerMaterial)
                .where(LecturerMaterial.academic_resource_id == academic_resource_id)
                .values(
                    processing_status=status,
                    chunk_count=chunk_count if chunk_count else None,
                    processing_error=error,
                )
            )
            await db.execute(lecturer_update)

        try:
            await db.commit()
        except Exception as e:
            logger.warning(
                "Could not sync parent resource status",
                academic_resource_id=academic_resource_id,
                error=str(e),
            )

    async def _auto_segment_learning_units(
        self,
        academic_resource_id: uuid.UUID,
        db: AsyncSession,
    ) -> None:
        """
        Background single-trigger segmentation: automatically extract Learning Units
        for LecturerMaterial after chunking and embedding finish.
        """
        from app.agents.study_planner_agent import StudyPlannerAgent
        from app.core.ai.gateway import AIGateway
        from app.core.ai.language_policy import assert_ai_allowed
        from app.core.ai.provider_factory import (
            get_ai_providers,
            get_embedding_providers,
        )
        from app.db.models.academic import TeachingWorkspace
        from app.db.models.learning_unit import LearningUnit
        from app.db.models.resource import LecturerMaterial
        from app.db.models.resource_chunk import ResourceChunk

        mat_stmt = select(LecturerMaterial).where(
            LecturerMaterial.academic_resource_id == academic_resource_id,
            LecturerMaterial.is_deleted == False,
        )
        material = (await db.execute(mat_stmt)).scalar_one_or_none()
        if not material or not material.teaching_workspace_id:
            return

        # 1. Check workspace and language policy
        workspace = await db.get(TeachingWorkspace, material.teaching_workspace_id)
        if not workspace:
            return

        try:
            assert_ai_allowed(
                getattr(workspace, "language", None),
                action="segment_learning_units",
                context={"material_id": str(material.id), "workspace_id": str(workspace.id)},
            )
        except Exception as lang_err:
            logger.info("Skipping LU segmentation due to language policy", error=str(lang_err))
            return

        # 2. Check Idempotency: skip if active LUs already exist for this material
        existing_stmt = select(LearningUnit.id).where(
            LearningUnit.source_material_id == material.id,
            LearningUnit.is_active == True,
            LearningUnit.is_deleted == False,
        )
        has_existing = (await db.execute(existing_stmt)).first()
        if has_existing:
            logger.info("Learning Units already exist for material; skipping generation", material_id=str(material.id))
            return

        # 3. Retrieve extracted chunks
        chunks_stmt = select(ResourceChunk).where(
            ResourceChunk.resource_id == academic_resource_id
        ).order_by(ResourceChunk.chunk_index.asc())
        chunks = list((await db.execute(chunks_stmt)).scalars().all())
        if not chunks:
            logger.warning("No resource chunks found for material segmentation", academic_resource_id=str(academic_resource_id))
            return

        # 4. Invoke extraction agent
        gateway = AIGateway(db, get_ai_providers(), get_embedding_providers())
        agent = StudyPlannerAgent(gateway)

        chunk_dicts = [
            {
                "chunk_index": c.chunk_index,
                "content": c.content or "",
                "metadata": c.metadata_json or {},
            }
            for c in chunks
        ]

        title = material.display_name or material.original_filename or "Material"
        try:
            segments = await agent.segment_into_learning_units(
                title, chunk_dicts, actor_id=material.lecturer_id
            )
        except Exception as exc:
            logger.exception("Learning unit segmentation agent failed", error=str(exc))
            return

        # 5. Determine deterministic page ranges and persist
        created_units = []
        for i, seg in enumerate(segments):
            assigned_chunks = [chunks[c_idx] for c_idx in seg.chunk_indices if 0 <= c_idx < len(chunks)]
            pages = [
                c.metadata_json.get("page")
                for c in assigned_chunks
                if c.metadata_json and isinstance(c.metadata_json.get("page"), int)
            ]
            start_page = min(pages) if pages else None
            end_page = max(pages) if pages else None
            chunk_ids = [str(c.id) for c in assigned_chunks]

            lu = LearningUnit(
                teaching_workspace_id=material.teaching_workspace_id,
                source_material_id=material.id,
                order_index=i + 1,
                title=seg.title,
                summary=seg.summary,
                learning_outcomes=seg.learning_outcomes or [],
                start_page=start_page,
                end_page=end_page,
                source_chunk_ids=chunk_ids,
                estimated_study_minutes=seg.estimated_minutes,
                is_active=True,
            )
            db.add(lu)
            created_units.append(lu)

        try:
            await db.commit()
            logger.info(
                "Successfully generated Learning Units for material",
                material_id=str(material.id),
                unit_count=len(created_units),
            )
        except Exception as exc:
            logger.exception("Failed to persist Learning Units for material", error=str(exc))

