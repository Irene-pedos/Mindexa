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
        material_ids: Optional[List[uuid.UUID]] = None,
        top_k: int = 8,
    ) -> RAGRetrievalResult:
        """
        Retrieve relevant text chunks from lecturer-uploaded materials for a given topic.

        Used to ground AI question generation in actual course content.

        Args:
            topic: The question topic / subject the AI is generating for.
            teaching_workspace_id: The teaching workspace whose materials to search.
            material_ids: Optional list of specific lecturer material IDs to filter search to.
            top_k: Max number of chunks to retrieve.

        Returns:
            A RAGRetrievalResult containing the context string and citations.
        """
        logger.info(
            "Lecturer RAG retrieval started",
            workspace_id=str(teaching_workspace_id),
            topic_preview=topic[:80],
            material_ids_count=len(material_ids) if material_ids else 0,
        )

        try:
            query_embedding = await self._embed_question(topic)
        except Exception as exc:
            logger.warning("Lecturer RAG: embedding failed, skipping context", error=str(exc))
            return RAGRetrievalResult(
                context_string="",
                citations=[],
                chunk_ids_used=[],
                retrieval_score=0.0,
                fallback_used=True,
            )

        embedding_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"

        stmt_text = """
                SELECT
                    rc.id,
                    rc.content,
                    rc.chunk_index,
                    rc.metadata_json,
                    lm.id as material_id,
                    lm.display_name,
                    lm.original_filename,
                    (1 - (rc.embedding <=> CAST(:query_embedding AS vector))) as similarity
                FROM resource_chunks rc
                JOIN academic_resources ar ON rc.resource_id = ar.id
                JOIN lecturer_material lm ON lm.academic_resource_id = ar.id
                WHERE lm.teaching_workspace_id = CAST(:workspace_id AS uuid)
                  AND lm.is_deleted = FALSE
                  AND lm.is_current = TRUE
                  AND lm.processing_status = 'PROCESSED'
                  AND rc.embedding IS NOT NULL
        """
        if material_ids:
            stmt_text += " AND lm.id = ANY(:material_ids)"

        stmt_text += """
                ORDER BY rc.embedding <=> CAST(:query_embedding AS vector)
                LIMIT :top_k
        """

        stmt = text(stmt_text)
        if material_ids:
            stmt = stmt.bindparams(bindparam("material_ids", type_=ARRAY(PG_UUID())))

        try:
            result = await self.db.execute(
                stmt,
                {
                    "query_embedding": embedding_literal,
                    "workspace_id": str(teaching_workspace_id),
                    "material_ids": [uuid.UUID(str(m)) for m in material_ids]
                    if material_ids
                    else [],
                    "top_k": top_k,
                },
            )
            rows = result.fetchall()
        except Exception as exc:
            logger.warning("Lecturer RAG: vector search failed, skipping context", error=str(exc))
            return RAGRetrievalResult(
                context_string="",
                citations=[],
                chunk_ids_used=[],
                retrieval_score=0.0,
                fallback_used=True,
            )

        logger.info(
            "Lecturer RAG vector search complete",
            rows_returned=len(rows),
            workspace_id=str(teaching_workspace_id),
        )

        chunks = []
        citations = []
        chunk_ids = []
        total_similarity = 0.0

        for row in rows:
            (
                chunk_id,
                content,
                chunk_index,
                metadata_json,
                mat_id,
                display_name,
                original_filename,
                similarity,
            ) = row
            if similarity is not None and float(similarity) < 0.22:
                continue

            source_label = display_name or original_filename or "Course Material"

            source_page = None
            if metadata_json:
                if isinstance(metadata_json, dict):
                    source_page = metadata_json.get("page")
                elif isinstance(metadata_json, int):
                    source_page = metadata_json
                elif isinstance(metadata_json, str):
                    try:
                        import json

                        parsed = json.loads(metadata_json)
                        if isinstance(parsed, dict):
                            source_page = parsed.get("page")
                        else:
                            source_page = parsed
                    except Exception:
                        source_page = metadata_json

            chunks.append(
                {
                    "content": content,
                    "resource_name": source_label,
                    "metadata": {"page": source_page} if source_page else None,
                }
            )
            chunk_ids.append(chunk_id)
            total_similarity += similarity

            citations.append(
                SourceCitation(
                    resource_name=source_label,
                    resource_id=mat_id,
                    page_number=source_page,
                    chunk_index=chunk_index,
                    excerpt=content[:120],
                )
            )

            logger.debug(
                "Lecturer chunk retrieved",
                source=source_label,
                chunk_index=chunk_index,
                similarity=round(float(similarity), 4),
            )

        avg_similarity = total_similarity / len(rows) if rows else 0.0
        fallback_used = avg_similarity < 0.22 or not rows

        logger.info(
            "Lecturer RAG decision",
            avg_similarity=round(avg_similarity, 4),
            fallback_used=fallback_used,
            chunks_used=len(chunks),
        )

        context_string = self._build_context_string(chunks) if not fallback_used else ""

        return RAGRetrievalResult(
            context_string=context_string,
            citations=citations if not fallback_used else [],
            chunk_ids_used=chunk_ids if not fallback_used else [],
            retrieval_score=avg_similarity,
            fallback_used=fallback_used,
        )

    async def retrieve_context(
        self,
        question: str,
        student_id: uuid.UUID,
        selected_resource_id: uuid.UUID | None = None,
        top_k: int = None,
    ) -> RAGRetrievalResult:
        """
        Full RAG retrieval pipeline.
        """
        top_k = top_k or settings.RAG_TOP_K
        logger.info(
            "RAG retrieval started",
            student_id=str(student_id),
            question_preview=question[:80],
            selected_resource_id=str(selected_resource_id) if selected_resource_id else None,
        )

        # 1. Generate embedding for the student's question
        try:
            query_embedding = await self._embed_question(question)
            logger.info("Query embedding generated", dim=len(query_embedding))
        except Exception as exc:
            logger.warning(
                "RAG: query embedding unavailable, using general AI knowledge fallback",
                error=str(exc),
            )
            return RAGRetrievalResult(
                context_string="",
                citations=[],
                chunk_ids_used=[],
                retrieval_score=0.0,
                fallback_used=True,
            )

        # 2. Get allowed academic_resource_ids
        allowed_resource_ids = await self._get_allowed_resource_ids(student_id)
        logger.info(
            "Allowed resource IDs found",
            count=len(allowed_resource_ids),
            ids=[str(r) for r in allowed_resource_ids],
        )

        if selected_resource_id:
            resolved_id = None
            # Check student resources
            stmt_own = select(StudentResource.academic_resource_id).where(
                and_(
                    StudentResource.id == selected_resource_id,
                    StudentResource.student_id == student_id,
                    StudentResource.is_deleted == False,
                )
            )
            resolved_id = (await self.db.execute(stmt_own)).scalar_one_or_none()

            # Check lecturer materials
            if not resolved_id:
                stmt_lecturer = (
                    select(LecturerMaterial.academic_resource_id)
                    .join(
                        TeachingWorkspace,
                        LecturerMaterial.teaching_workspace_id == TeachingWorkspace.id,
                    )
                    .join(
                        StudentEnrollment,
                        and_(
                            StudentEnrollment.class_section_id
                            == TeachingWorkspace.class_section_id,
                            TeachingWorkspace.class_section_id.is_not(None),
                        ),
                    )
                    .where(
                        and_(
                            LecturerMaterial.id == selected_resource_id,
                            StudentEnrollment.student_id == student_id,
                            StudentEnrollment.enrollment_status == EnrollmentStatus.ACTIVE,
                            LecturerMaterial.is_student_visible == True,
                            LecturerMaterial.is_deleted == False,
                            LecturerMaterial.is_current == True,
                        )
                    )
                )
                resolved_id = (await self.db.execute(stmt_lecturer)).scalar_one_or_none()

            if resolved_id and resolved_id in allowed_resource_ids:
                allowed_resource_ids = [resolved_id]
            else:
                allowed_resource_ids = []

        if not allowed_resource_ids:
            logger.warning(
                "No allowed resources found for student — falling back", student_id=str(student_id)
            )
            return RAGRetrievalResult(
                context_string="",
                citations=[],
                chunk_ids_used=[],
                retrieval_score=0.0,
                fallback_used=True,
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
        if not self.jina_api_key or not self.jina_api_key.strip():
            raise Exception("Jina API key is not configured")

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
        
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    logger.error("Jina embedding failed", status=response.status_code, text=response.text)
                    raise Exception(f"Jina embedding request failed with status {response.status_code}")
                
                data = response.json()
                return data["data"][0]["embedding"]
        except Exception as e:
            logger.warning("Jina embedding error", error=str(e))
            raise e

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
        from sqlalchemy import exists
        from app.db.models.academic import TeachingAssignment, ClassSection, ClassGroup

        stmt_lecturer = (
            select(LecturerMaterial.academic_resource_id)
            .join(TeachingWorkspace, LecturerMaterial.teaching_workspace_id == TeachingWorkspace.id)
            .join(TeachingAssignment, TeachingAssignment.id == TeachingWorkspace.teaching_assignment_id)
            .join(AcademicResource, LecturerMaterial.academic_resource_id == AcademicResource.id)
            .where(
                and_(
                    LecturerMaterial.is_student_visible == True,
                    LecturerMaterial.is_deleted == False,
                    LecturerMaterial.is_current == True,
                    LecturerMaterial.assessment_id.is_(None),
                    AcademicResource.resource_category != ResourceCategory.QUESTION_BANK,
                    AcademicResource.resource_category != ResourceCategory.ANSWER_KEY,
                    # Student enrollment check (direct or global workspace visibility)
                    or_(
                        # Direct section link
                        exists().where(
                            and_(
                                StudentEnrollment.student_id == student_id,
                                StudentEnrollment.class_section_id == TeachingWorkspace.class_section_id,
                                StudentEnrollment.enrollment_status.in_([EnrollmentStatus.ACTIVE, EnrollmentStatus.ACTIVE.value]),
                                StudentEnrollment.is_deleted == False
                            )
                        ),
                        # Global/course-wide workspace link
                        and_(
                            TeachingWorkspace.class_section_id == None,
                            exists().where(
                                and_(
                                    StudentEnrollment.student_id == student_id,
                                    StudentEnrollment.enrollment_status.in_([EnrollmentStatus.ACTIVE, EnrollmentStatus.ACTIVE.value]),
                                    StudentEnrollment.is_deleted == False,
                                    exists().where(
                                        and_(
                                            ClassSection.id == StudentEnrollment.class_section_id,
                                            ClassSection.department_id == TeachingAssignment.department_id,
                                            ClassSection.is_active == True,
                                            or_(
                                                TeachingAssignment.option_id == None,
                                                exists().where(
                                                    and_(
                                                        ClassGroup.id == ClassSection.class_group_id,
                                                        ClassGroup.option_id == TeachingAssignment.option_id
                                                    )
                                                )
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
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
