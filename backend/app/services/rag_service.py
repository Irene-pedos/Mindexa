from __future__ import annotations
import uuid
import httpx
from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, and_, or_, bindparam
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PG_UUID
from app.db.enums import ResourceCategory, EnrollmentStatus
from app.db.models.resource_chunk import ResourceChunk
from app.db.models.academic_resource import AcademicResource
from app.db.models.resource import LecturerMaterial, LecturerMaterialChunk, StudentResource
from app.db.models.academic import StudentEnrollment, TeachingWorkspace
from app.db.schemas.rag import RAGRetrievalResult, SourceCitation
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

class RAGService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.jina_api_key = settings.JINA_API_KEY
        self.jina_base_url = settings.JINA_BASE_URL
        self.embedding_model = settings.JINA_DEFAULT_MODEL

    # ── Lecturer-side RAG ─────────────────────────────────────────────────────

    async def retrieve_context_for_lecturer(
        self,
        topic: str,
        teaching_workspace_id: uuid.UUID,
        top_k: int = 8,
    ) -> str:
        """
        Retrieve relevant text chunks from lecturer-uploaded materials for a given topic.

        Used to ground AI question generation in actual course content.

        Args:
            topic: The question topic / subject the AI is generating for.
            teaching_workspace_id: The teaching workspace whose materials to search.
            top_k: Max number of chunks to retrieve.

        Returns:
            A formatted context string to inject into the AI prompt.
            Returns empty string if no processed materials found (graceful fallback).
        """
        logger.info(
            "Lecturer RAG retrieval started",
            workspace_id=str(teaching_workspace_id),
            topic_preview=topic[:80],
        )

        try:
            query_embedding = await self._embed_question(topic)
        except Exception as exc:
            logger.warning("Lecturer RAG: embedding failed, skipping context", error=str(exc))
            return ""

        embedding_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"

        # Query LecturerMaterialChunk directly — scoped to this workspace's materials.
        # Join back to LecturerMaterial to get display_name for citations.
        stmt = (
            text("""
                SELECT
                    lmc.content,
                    lmc.chunk_index,
                    lmc.source_page,
                    lm.display_name,
                    lm.original_filename,
                    (1 - (lmc.embedding <=> CAST(:query_embedding AS vector))) as similarity
                FROM lecturer_material_chunk lmc
                JOIN lecturer_material lm ON lmc.lecturer_material_id = lm.id
                WHERE lm.teaching_workspace_id = CAST(:workspace_id AS uuid)
                  AND lm.is_deleted = FALSE
                  AND lm.is_current = TRUE
                  AND lm.processing_status = 'PROCESSED'
                  AND lmc.embedding IS NOT NULL
                ORDER BY lmc.embedding <=> CAST(:query_embedding AS vector)
                LIMIT :top_k
            """)
        )

        try:
            result = await self.db.execute(stmt, {
                "query_embedding": embedding_literal,
                "workspace_id": str(teaching_workspace_id),
                "top_k": top_k,
            })
            rows = result.fetchall()
        except Exception as exc:
            logger.warning("Lecturer RAG: vector search failed, skipping context", error=str(exc))
            return ""

        logger.info(
            "Lecturer RAG vector search complete",
            rows_returned=len(rows),
            workspace_id=str(teaching_workspace_id),
        )

        if not rows:
            logger.warning(
                "Lecturer RAG: no chunks found for workspace — AI will generate without material context",
                workspace_id=str(teaching_workspace_id),
            )
            return ""

        # Build formatted context string
        parts = []
        for row in rows:
            content, chunk_index, source_page, display_name, original_filename, similarity = row
            source_label = display_name or original_filename or "Course Material"
            page_ref = f", Page {source_page}" if source_page else ""
            parts.append(f"[Source: {source_label}{page_ref}]\n{content}\n")
            logger.debug(
                "Lecturer chunk retrieved",
                source=source_label,
                chunk_index=chunk_index,
                similarity=round(float(similarity), 4),
            )

        return "\n".join(parts)

    async def retrieve_context(
        self,
        question: str,
        student_id: uuid.UUID,
        top_k: int = None,
    ) -> RAGRetrievalResult:
        """
        Full RAG retrieval pipeline.
        """
        top_k = top_k or settings.RAG_TOP_K
        logger.info("RAG retrieval started", student_id=str(student_id), question_preview=question[:80])

        # 1. Generate embedding for the student's question
        query_embedding = await self._embed_question(question)
        logger.info("Query embedding generated", dim=len(query_embedding))

        # 2. Get allowed academic_resource_ids
        allowed_resource_ids = await self._get_allowed_resource_ids(student_id)
        logger.info("Allowed resource IDs found", count=len(allowed_resource_ids), ids=[str(r) for r in allowed_resource_ids])

        if not allowed_resource_ids:
            logger.warning("No allowed resources found for student — falling back", student_id=str(student_id))
            return RAGRetrievalResult(
                context_string="",
                citations=[],
                chunk_ids_used=[],
                retrieval_score=0.0,
                fallback_used=True
            )

        # 3. Query pgvector for top_k nearest chunks
        # Format the query embedding as a pgvector literal string: '[0.1,0.2,...]'
        embedding_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"

        # asyncpg needs explicit type information for the UUID array parameter.
        # We use bindparam with ARRAY(PG_UUID()) so SQLAlchemy/asyncpg encodes
        # the Python list of UUIDs correctly — DO NOT pass a PG array literal string.
        stmt = (
            text("""
                SELECT rc.id, rc.content, rc.chunk_index, rc.metadata_json, rc.resource_id,
                       ar.title as resource_name,
                       (1 - (rc.embedding <=> CAST(:query_embedding AS vector))) as similarity
                FROM resource_chunks rc
                JOIN academic_resources ar ON rc.resource_id = ar.id
                WHERE rc.resource_id = ANY(:allowed_ids)
                  AND rc.embedding IS NOT NULL
                ORDER BY rc.embedding <=> CAST(:query_embedding AS vector)
                LIMIT :top_k
            """)
            .bindparams(
                bindparam("allowed_ids", type_=ARRAY(PG_UUID()))
            )
        )

        result = await self.db.execute(stmt, {
            "query_embedding": embedding_literal,
            "allowed_ids": [rid if isinstance(rid, uuid.UUID) else uuid.UUID(str(rid))
                            for rid in allowed_resource_ids],
            "top_k": top_k,
        })
        
        rows = result.fetchall()
        logger.info("Vector search complete", rows_returned=len(rows), top_k=top_k)
        
        chunks = []
        citations = []
        chunk_ids = []
        total_similarity = 0.0
        
        for row in rows:
            chunk_id, content, chunk_index, metadata, res_id, res_name, similarity = row
            logger.debug("Chunk retrieved", resource=res_name, chunk_index=chunk_index, similarity=round(float(similarity), 4))
            chunks.append({
                "content": content,
                "resource_name": res_name,
                "metadata": metadata
            })
            chunk_ids.append(chunk_id)
            total_similarity += similarity
            
            citations.append(SourceCitation(
                resource_name=res_name,
                resource_id=res_id,
                page_number=metadata.get("page") if metadata else None,
                chunk_index=chunk_index,
                excerpt=content[:120]
            ))

        avg_similarity = total_similarity / len(rows) if rows else 0.0
        fallback_used = avg_similarity < settings.RAG_SIMILARITY_THRESHOLD or not rows

        logger.info(
            "RAG decision",
            avg_similarity=round(avg_similarity, 4),
            threshold=settings.RAG_SIMILARITY_THRESHOLD,
            fallback_used=fallback_used,
            chunks_used=len(chunks),
        )

        context_string = self._build_context_string(chunks) if not fallback_used else ""
        
        return RAGRetrievalResult(
            context_string=context_string,
            citations=citations if not fallback_used else [],
            chunk_ids_used=chunk_ids if not fallback_used else [],
            retrieval_score=avg_similarity,
            fallback_used=fallback_used
        )

    async def _embed_question(self, question: str) -> List[float]:
        """Generate embedding for query text using Jina API."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.jina_api_key}"
        }
        url = f"{self.jina_base_url}/embeddings"
        payload = {
            "model": self.embedding_model,
            "task": "retrieval.query",
            "dimensions": 768,
            "input": [question]
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                logger.error("Jina embedding failed", status=response.status_code, text=response.text)
                raise Exception("Failed to generate embedding")
            
            data = response.json()
            return data["data"][0]["embedding"]

    async def _get_allowed_resource_ids(self, student_id: uuid.UUID) -> List[uuid.UUID]:
        """
        Get academic_resource_ids allowed for this student.
        Rules:
        1. Student's own personal study resources.
        2. Lecturer materials for enrolled courses IF student-visible.
        3. STRICTLY EXCLUDE: Lecturer-private, Question Banks, Unreleased Assessments,
           Answer keys, Materials from other courses.
        """
        # 1. Own resources — select the academic_resource_id FK
        stmt_own = select(StudentResource.academic_resource_id).where(
            and_(
                StudentResource.student_id == student_id,
                StudentResource.is_deleted == False,
                StudentResource.academic_resource_id.is_not(None),  # must have been linked to RAG pipeline
            )
        )
        res_own = await self.db.execute(stmt_own)
        own_ids = [r for r in res_own.scalars().all() if r]
        logger.info("Own resource IDs", student_id=str(student_id), count=len(own_ids), ids=[str(i) for i in own_ids])

        # 2. Lecturer materials for enrolled courses
        # Access path: Student → Enrollment (ACTIVE) → ClassSection → Workspace → Material → AcademicResource
        # NOTE: TeachingWorkspace.class_section_id is nullable.
        # We join via class_section_id when available, and also check via course_id
        # on the TeachingAssignment as a fallback.
        stmt_lecturer = (
            select(LecturerMaterial.academic_resource_id)
            .join(TeachingWorkspace, LecturerMaterial.teaching_workspace_id == TeachingWorkspace.id)
            .join(
                StudentEnrollment,
                and_(
                    StudentEnrollment.class_section_id == TeachingWorkspace.class_section_id,
                    TeachingWorkspace.class_section_id.is_not(None),
                ),
            )
            .join(AcademicResource, LecturerMaterial.academic_resource_id == AcademicResource.id)
            .where(
                and_(
                    StudentEnrollment.student_id == student_id,
                    StudentEnrollment.enrollment_status == EnrollmentStatus.ACTIVE,
                    LecturerMaterial.is_student_visible == True,
                    LecturerMaterial.is_deleted == False,
                    LecturerMaterial.is_current == True,
                    LecturerMaterial.assessment_id.is_(None),
                    AcademicResource.resource_category != ResourceCategory.QUESTION_BANK,
                    AcademicResource.resource_category != ResourceCategory.ANSWER_KEY,
                )
            )
        )

        res_lecturer = await self.db.execute(stmt_lecturer)
        lecturer_ids = [r for r in res_lecturer.scalars().all() if r]
        logger.info("Lecturer material IDs", student_id=str(student_id), count=len(lecturer_ids))

        all_ids = list(set(own_ids + lecturer_ids))
        logger.info("Total allowed resource IDs", student_id=str(student_id), total=len(all_ids))
        return all_ids

    def _build_context_string(self, chunks: List[Dict[str, Any]]) -> str:
        """Format retrieved chunks into a clean context string."""
        parts = []
        for chunk in chunks:
            source_label = f"[Source: {chunk['resource_name']}"
            if chunk['metadata'] and chunk['metadata'].get('page'):
                source_label += f", Page {chunk['metadata']['page']}"
            source_label += "]"
            
            parts.append(f"{source_label}\n{chunk['content']}\n")
        
        return "\n".join(parts)
