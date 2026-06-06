"""
app/services/rag_service.py

Retrieval-Augmented Generation (RAG) service for Mindexa.
Handles document parsing, chunking, embedding, and filtered retrieval.
"""

import uuid
import os
from typing import List, Optional, Tuple
from datetime import datetime, UTC

from sqlalchemy import select, and_, or_, text, exists, not_, func
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AIEmbeddingRequest
from app.core.config import settings
from app.core.logger import get_logger
from app.db.models.resource import StudentResource, ResourceChunk, LecturerMaterial, LecturerMaterialChunk
from app.db.models.academic import StudentEnrollment, ClassSection, Course
from app.db.enums import ResourceProcessingStatus, AttemptStatus
from app.db.models.attempt import AssessmentAttempt

logger = get_logger("mindexa.rag_service")


class RAGService:
    def __init__(self, db: AsyncSession, gateway: AIGateway) -> None:
        self.db = db
        self.gateway = gateway
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, 
            chunk_overlap=100,
            separators=["\n\n", "\n", ".", " ", ""],
        )

    # ── Retrieval ────────────────────────────────────────────────────────────

    async def retrieve_context_for_student(
        self,
        student_id: uuid.UUID,
        institution_id: uuid.UUID,
        query_text: str,
        top_k: int = 5,
    ) -> List[dict]:
        """
        Retrieve relevant chunks from student's personal resources and
        visible lecturer learning resources.

        ENFORCES:
            1. Assessment Protection Layer: Block if student has an active exam.
            2. Visibility Rules: Only materials from student's enrolled courses.
            3. Data Minimization: Only top-K relevant snippets.
        """
        # 1. Assessment Protection Layer
        if await self._has_active_assessment(student_id):
            logger.warning("RAG retrieval blocked: student %s has an active assessment", student_id)
            return []

        # 2. Generate query embedding
        try:
            embed_resp = await self.gateway.embed(
                AIEmbeddingRequest(input=query_text),
                actor_id=student_id,
                actor_role="student",
                prompt_summary=f"RAG query: {query_text[:50]}...",
            )
            query_vector = embed_resp.embeddings[0]
        except Exception as exc:
            logger.error("RAG embedding failed: %s", str(exc))
            return []

        # 3. Retrieve from personal StudentResource chunks
        student_chunks = await self._search_student_chunks(student_id, query_vector, top_k)

        # 4. Retrieve from visible LecturerMaterial chunks (Filtered by Course Enrollment)
        lecturer_chunks = await self._search_lecturer_chunks(student_id, institution_id, query_vector, top_k)

        # 5. Combine and sort
        combined = student_chunks + lecturer_chunks
        combined.sort(key=lambda x: x["score"], reverse=True)

        return combined[:top_k]

    async def _has_active_assessment(self, student_id: uuid.UUID) -> bool:
        """Check if the student has any IN_PROGRESS attempt for a summative assessment."""
        stmt = select(AssessmentAttempt).where(
            and_(
                AssessmentAttempt.student_id == student_id,
                AssessmentAttempt.status == AttemptStatus.IN_PROGRESS,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _search_student_chunks(
        self, student_id: uuid.UUID, vector: List[float], top_k: int
    ) -> List[dict]:
        """Vector similarity search on student_resource_chunks."""
        stmt = text(
            """
            SELECT rc.content, rc.source_page, sr.original_filename,
                   (1 - (rc.embedding <=> :vector)) as score
            FROM resource_chunk rc
            JOIN student_resource sr ON rc.student_resource_id = sr.id
            WHERE sr.student_id = :student_id
              AND sr.is_deleted = false
              AND rc.embedding IS NOT NULL
            ORDER BY rc.embedding <=> :vector
            LIMIT :top_k
            """
        )
        result = await self.db.execute(
            stmt, {"vector": str(vector), "student_id": student_id, "top_k": top_k}
        )
        
        return [
            {
                "content": row[0],
                "source": f"{row[2]} (Page {row[1]})" if row[1] else row[2],
                "score": row[3],
                "type": "student_resource"
            }
            for row in result.fetchall()
        ]

    async def _search_lecturer_chunks(
        self, student_id: uuid.UUID, institution_id: uuid.UUID, vector: List[float], top_k: int
    ) -> List[dict]:
        """Vector similarity search on lecturer_material_chunks, filtered by course enrollment."""
        
        # We need to ensure the student is enrolled in the course that the material belongs to
        stmt = text(
            """
            SELECT lmc.content, lmc.source_page, lm.original_filename, lm.display_name,
                   (1 - (lmc.embedding <=> :vector)) as score
            FROM lecturer_material_chunk lmc
            JOIN lecturer_material lm ON lmc.lecturer_material_id = lm.id
            JOIN teaching_assignment ta ON ta.course_id = lm.course_id
            JOIN student_enrollment se ON se.class_section_id = ta.class_section_id
            WHERE se.student_id = :student_id
              AND lm.institution_id = :institution_id
              AND lm.is_student_visible = true
              AND lm.is_current = true
              AND lmc.embedding IS NOT NULL
            ORDER BY lmc.embedding <=> :vector
            LIMIT :top_k
            """
        )
        
        result = await self.db.execute(
            stmt, {
                "vector": str(vector), 
                "student_id": student_id,
                "institution_id": institution_id, 
                "top_k": top_k
            }
        )

        return [
            {
                "content": row[0],
                "source": f"{row[3] or row[2]} (Page {row[1]})" if row[1] else (row[3] or row[2]),
                "score": row[4],
                "type": "lecturer_material"
            }
            for row in result.fetchall()
        ]

    # ── Processing ───────────────────────────────────────────────────────────

    async def process_student_resource(self, resource_id: uuid.UUID) -> None:
        """Parse, chunk, and embed a StudentResource."""
        resource = await self.db.get(StudentResource, resource_id)
        if not resource:
            return

        resource.processing_status = ResourceProcessingStatus.PROCESSING
        resource.processing_started_at = datetime.now(UTC)
        await self.db.commit()

        try:
            text_content = await self._extract_text(resource.file_path)
            chunks = self.splitter.split_text(text_content)
            
            for i, chunk_text in enumerate(chunks):
                embed_resp = await self.gateway.embed(
                    AIEmbeddingRequest(input=chunk_text),
                    subject_entity_type="student_resource",
                    subject_entity_id=resource.id,
                )
                
                chunk_record = ResourceChunk(
                    student_resource_id=resource.id,
                    student_id=resource.student_id,
                    chunk_index=i,
                    content=chunk_text,
                    token_count=embed_resp.total_tokens,
                    embedding=embed_resp.embeddings[0],
                    embedding_model=embed_resp.model,
                )
                self.db.add(chunk_record)

            resource.processing_status = ResourceProcessingStatus.COMPLETED
            resource.processing_completed_at = datetime.now(UTC)
            resource.chunk_count = len(chunks)
            await self.db.commit()

        except Exception as exc:
            logger.error("Failed to process student resource %s: %s", resource_id, str(exc))
            resource.processing_status = ResourceProcessingStatus.FAILED
            resource.processing_error = str(exc)[:1000]
            await self.db.commit()

    async def process_lecturer_material(self, material_id: uuid.UUID) -> None:
        """Parse, chunk, and embed a LecturerMaterial (Learning Resource)."""
        material = await self.db.get(LecturerMaterial, material_id)
        if not material:
            return

        material.processing_status = ResourceProcessingStatus.PROCESSING
        material.processing_started_at = datetime.now(UTC)
        await self.db.commit()

        try:
            text_content = await self._extract_text(material.file_path)
            chunks = self.splitter.split_text(text_content)
            
            for i, chunk_text in enumerate(chunks):
                embed_resp = await self.gateway.embed(
                    AIEmbeddingRequest(input=chunk_text),
                    subject_entity_type="lecturer_material",
                    subject_entity_id=material.id,
                )
                
                chunk_record = LecturerMaterialChunk(
                    lecturer_material_id=material.id,
                    institution_id=material.institution_id,
                    course_id=material.course_id,
                    chunk_index=i,
                    content=chunk_text,
                    token_count=embed_resp.total_tokens,
                    embedding=embed_resp.embeddings[0],
                    embedding_model=embed_resp.model,
                )
                self.db.add(chunk_record)

            material.processing_status = ResourceProcessingStatus.COMPLETED
            material.processing_completed_at = datetime.now(UTC)
            material.chunk_count = len(chunks)
            await self.db.commit()

        except Exception as exc:
            logger.error("Failed to process lecturer learning resource %s: %s", material_id, str(exc))
            material.processing_status = ResourceProcessingStatus.FAILED
            material.processing_error = str(exc)[:1000]
            await self.db.commit()

    async def _extract_text(self, file_path: str) -> str:
        """Extract raw text from a learning resource file."""
        absolute_path = os.path.join(settings.UPLOAD_DIR, file_path)
        # Dummy extractor for now
        return f"Content extracted from {file_path}. This is a placeholder for learning resource content."
