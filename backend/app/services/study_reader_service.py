"""
app/services/study_reader_service.py

Service layer for the Study Reader revision workspace:
- Material & personal resource authorization
- Reading progress persistence
- Annotations & highlights CRUD
- Key conceptual points CRUD
- Revision sheet Markdown export
- Quick document skim (bullets with page references)
"""

import asyncio
import json
import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Any, ClassVar, List, Optional

from app.agents.study_reader_agent import StudyReaderAgent
from app.core.ai.gateway import AIGateway
from app.core.ai.provider_factory import (get_ai_provider,
                                          get_embedding_provider)
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.exceptions import (AuthorizationError, NotFoundError,
                                 ValidationError)
from app.db.enums import AIActionType
from app.db.models.resource import (LecturerMaterial, LecturerMaterialChunk,
                                    StudentResource, StudentResourceChunk)
from app.db.repositories.study_reader_repo import StudyReaderRepository
from app.schemas.study_reader import (AnnotationCreate, AnnotationResponse,
                                      AnnotationUpdate, ExamLensResponse,
                                      FocusNextRecommendation, FocusResponse,
                                      KeyPointCreate, KeyPointResponse,
                                      KeyPointUpdate, PageCheckFeedbackItem,
                                      PageCheckQuestion, PageCheckRequest,
                                      PageCheckResponse,
                                      PageCheckSubmitRequest,
                                      PageCheckSubmitResponse, PageHeatItem,
                                      ReaderLearningUnitItem,
                                      ReaderMetadataResponse,
                                      ReadingProgressResponse,
                                      ReadingProgressUpdate,
                                      RevisionSheetExportResponse, SkimBullet,
                                      SkimResponse, WeakQuestionContext)
from app.services.student_service import StudentService
from sqlalchemy import and_, asc, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession


class StudyReaderService:
    _page_check_cache: ClassVar[dict[tuple[uuid.UUID, str, uuid.UUID, int], tuple[float, list[PageCheckQuestion]]]] = {}
    _focus_cache: ClassVar[dict[tuple[uuid.UUID, str, uuid.UUID], tuple[float, FocusResponse]]] = {}

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = StudyReaderRepository(db)
        self.logger = logging.getLogger(__name__)

    # ── Authorization & Metadata ─────────────────────────────────────────────

    async def assert_access(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> tuple[str, dict[str, Any]]:
        """
        Validates student authorization to read the material/resource.
        Returns title and metadata dict.
        """
        if kind == "lecturer_material":
            stmt = select(LecturerMaterial).where(
                and_(
                    LecturerMaterial.id == source_id,
                    LecturerMaterial.is_deleted == False,
                )
            )
            res = await self.db.execute(stmt)
            mat = res.scalars().first()
            if not mat:
                raise NotFoundError("Course material not found")

            if not mat.is_student_visible:
                raise AuthorizationError("This course material is not visible to students")

            # Check enrollment in workspace
            student_svc = StudentService(self.db)
            workspace = await student_svc.get_workspace_detail(student_id, mat.teaching_workspace_id)
            if not workspace:
                raise AuthorizationError("You are not enrolled in this course workspace")

            # Check if there is a newer current version in this workspace
            latest_mat_id = None
            if not getattr(mat, "is_current", True):
                stmt_latest = select(LecturerMaterial.id).where(
                    and_(
                        LecturerMaterial.teaching_workspace_id == mat.teaching_workspace_id,
                        LecturerMaterial.original_filename == mat.original_filename,
                        LecturerMaterial.is_current == True,
                        LecturerMaterial.is_deleted == False,
                    )
                )
                res_latest = await self.db.execute(stmt_latest)
                latest_mat_id = res_latest.scalar_one_or_none()

            title = mat.display_name or mat.original_filename
            return title, {
                "id": mat.id,
                "kind": kind,
                "title": title,
                "extension": mat.file_extension,
                "mime_type": mat.mime_type,
                "page_count": None,
                "processing_status": mat.processing_status.value if hasattr(mat.processing_status, "value") else str(mat.processing_status),
                "workspace_id": mat.teaching_workspace_id,
                "course_code": workspace.code if hasattr(workspace, "code") else None,
                "course_title": workspace.title if hasattr(workspace, "title") else None,
                "version": getattr(mat, "version", 1),
                "is_current": getattr(mat, "is_current", True),
                "latest_material_id": latest_mat_id,
            }

        elif kind == "student_resource":
            stmt = select(StudentResource).where(
                and_(
                    StudentResource.id == source_id,
                    StudentResource.is_deleted == False,
                )
            )
            res = await self.db.execute(stmt)
            resource = res.scalars().first()
            if not resource:
                raise NotFoundError("Study resource not found")

            if resource.student_id != student_id:
                raise AuthorizationError("You do not have access to this study resource")

            title = resource.display_name or resource.original_filename
            return title, {
                "id": resource.id,
                "kind": kind,
                "title": title,
                "extension": resource.file_extension,
                "mime_type": resource.mime_type,
                "page_count": resource.page_count,
                "processing_status": resource.processing_status.value if hasattr(resource.processing_status, "value") else str(resource.processing_status),
                "workspace_id": None,
                "course_code": None,
                "course_title": None,
                "version": 1,
                "is_current": True,
                "latest_material_id": None,
            }

        else:
            raise ValidationError(f"Invalid source kind: {kind}")

    async def get_metadata(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> ReaderMetadataResponse:
        _, meta = await self.assert_access(student_id, kind, source_id)
        return ReaderMetadataResponse(**meta)

    async def get_learning_units(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> List[ReaderLearningUnitItem]:
        """
        Fetch ordered Learning Units for this specific document.
        """
        await self.assert_access(student_id, kind, source_id)
        if kind != "lecturer_material":
            return []

        from app.db.models.learning_unit import LearningUnit

        stmt = select(LearningUnit).where(
            LearningUnit.source_material_id == source_id,
            LearningUnit.is_active == True,
            LearningUnit.is_deleted == False,
        ).order_by(LearningUnit.order_index.asc())

        res = await self.db.execute(stmt)
        units = list(res.scalars().all())

        return [
            ReaderLearningUnitItem(
                id=u.id,
                order_index=u.order_index,
                title=u.title,
                summary=u.summary,
                learning_outcomes=u.learning_outcomes or [],
                start_page=u.start_page,
                end_page=u.end_page,
                chunk_count=len(u.source_chunk_ids or []),
                estimated_study_minutes=u.estimated_study_minutes,
            )
            for u in units
        ]

    # ── Reading Progress ─────────────────────────────────────────────────────

    async def get_progress(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> Optional[ReadingProgressResponse]:
        await self.assert_access(student_id, kind, source_id)
        progress = await self.repo.get_progress(student_id, kind, source_id)
        if not progress:
            return None
        return ReadingProgressResponse(
            id=progress.id,
            student_id=progress.student_id,
            source_kind=progress.source_kind,
            source_id=progress.source_id,
            last_page=progress.last_page,
            last_scale=progress.last_scale,
            page_count_seen=progress.page_count_seen,
            updated_at=progress.updated_at,
        )

    async def save_progress(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        data: ReadingProgressUpdate,
    ) -> ReadingProgressResponse:
        await self.assert_access(student_id, kind, source_id)
        progress = await self.repo.upsert_progress(student_id, kind, source_id, data)
        await self.db.commit()
        await self.db.refresh(progress)
        return ReadingProgressResponse(
            id=progress.id,
            student_id=progress.student_id,
            source_kind=progress.source_kind,
            source_id=progress.source_id,
            last_page=progress.last_page,
            last_scale=progress.last_scale,
            page_count_seen=progress.page_count_seen,
            updated_at=progress.updated_at,
        )

    # ── Annotations ──────────────────────────────────────────────────────────

    async def list_annotations(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        page_number: Optional[int] = None,
        limit: int = 500,
        offset: int = 0,
    ) -> List[AnnotationResponse]:
        await self.assert_access(student_id, kind, source_id)
        annotations = await self.repo.list_annotations(
            student_id, kind, source_id, page_number=page_number, limit=limit, offset=offset
        )
        return [
            AnnotationResponse(
                id=a.id,
                student_id=a.student_id,
                source_kind=a.source_kind,
                source_id=a.source_id,
                page_number=a.page_number,
                color=a.color,
                selected_text=a.selected_text,
                rects=a.rects_json or [],
                note_text=a.note_text,
                created_at=a.created_at,
                updated_at=a.updated_at,
            )
            for a in annotations
        ]

    async def create_annotation(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        data: AnnotationCreate,
    ) -> AnnotationResponse:
        await self.assert_access(student_id, kind, source_id)
        annotation = await self.repo.create_annotation(student_id, kind, source_id, data)
        await self.db.commit()
        await self.db.refresh(annotation)
        return AnnotationResponse(
            id=annotation.id,
            student_id=annotation.student_id,
            source_kind=annotation.source_kind,
            source_id=annotation.source_id,
            page_number=annotation.page_number,
            color=annotation.color,
            selected_text=annotation.selected_text,
            rects=annotation.rects_json or [],
            note_text=annotation.note_text,
            created_at=annotation.created_at,
            updated_at=annotation.updated_at,
        )

    async def update_annotation(
        self,
        annotation_id: uuid.UUID,
        student_id: uuid.UUID,
        data: AnnotationUpdate,
    ) -> AnnotationResponse:
        annotation = await self.repo.update_annotation(annotation_id, student_id, data)
        if not annotation:
            raise NotFoundError("Annotation not found")
        await self.db.commit()
        await self.db.refresh(annotation)
        return AnnotationResponse(
            id=annotation.id,
            student_id=annotation.student_id,
            source_kind=annotation.source_kind,
            source_id=annotation.source_id,
            page_number=annotation.page_number,
            color=annotation.color,
            selected_text=annotation.selected_text,
            rects=annotation.rects_json or [],
            note_text=annotation.note_text,
            created_at=annotation.created_at,
            updated_at=annotation.updated_at,
        )

    async def delete_annotation(
        self, annotation_id: uuid.UUID, student_id: uuid.UUID
    ) -> None:
        success = await self.repo.delete_annotation(annotation_id, student_id)
        if not success:
            raise NotFoundError("Annotation not found")
        await self.db.commit()

    # ── Key Points ───────────────────────────────────────────────────────────

    async def list_key_points(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        page_number: Optional[int] = None,
        tag: Optional[str] = None,
        limit: int = 500,
        offset: int = 0,
    ) -> List[KeyPointResponse]:
        await self.assert_access(student_id, kind, source_id)
        key_points = await self.repo.list_key_points(
            student_id, kind, source_id, page_number=page_number, tag=tag, limit=limit, offset=offset
        )
        return [
            KeyPointResponse(
                id=kp.id,
                student_id=kp.student_id,
                source_kind=kp.source_kind,
                source_id=kp.source_id,
                title=kp.title,
                quote=kp.quote,
                page_number=kp.page_number,
                tag=kp.tag,
                confidence=kp.confidence,
                annotation_id=kp.annotation_id,
                next_review_at=kp.next_review_at,
                created_at=kp.created_at,
                updated_at=kp.updated_at,
            )
            for kp in key_points
        ]

    async def create_key_point(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        data: KeyPointCreate,
    ) -> KeyPointResponse:
        await self.assert_access(student_id, kind, source_id)
        kp = await self.repo.create_key_point(student_id, kind, source_id, data)
        await self.db.commit()
        await self.db.refresh(kp)
        return KeyPointResponse(
            id=kp.id,
            student_id=kp.student_id,
            source_kind=kp.source_kind,
            source_id=kp.source_id,
            title=kp.title,
            quote=kp.quote,
            page_number=kp.page_number,
            tag=kp.tag,
            confidence=kp.confidence,
            annotation_id=kp.annotation_id,
            next_review_at=kp.next_review_at,
            created_at=kp.created_at,
            updated_at=kp.updated_at,
        )

    async def update_key_point(
        self,
        key_point_id: uuid.UUID,
        student_id: uuid.UUID,
        data: KeyPointUpdate,
    ) -> KeyPointResponse:
        kp = await self.repo.update_key_point(key_point_id, student_id, data)
        if not kp:
            raise NotFoundError("Key point not found")
        await self.db.commit()
        await self.db.refresh(kp)
        return KeyPointResponse(
            id=kp.id,
            student_id=kp.student_id,
            source_kind=kp.source_kind,
            source_id=kp.source_id,
            title=kp.title,
            quote=kp.quote,
            page_number=kp.page_number,
            tag=kp.tag,
            confidence=kp.confidence,
            annotation_id=kp.annotation_id,
            next_review_at=kp.next_review_at,
            created_at=kp.created_at,
            updated_at=kp.updated_at,
        )

    async def delete_key_point(
        self, key_point_id: uuid.UUID, student_id: uuid.UUID
    ) -> None:
        success = await self.repo.delete_key_point(key_point_id, student_id)
        if not success:
            raise NotFoundError("Key point not found")
        await self.db.commit()

    # ── Revision Sheet Export ─────────────────────────────────────────────────

    async def export_revision_sheet(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> RevisionSheetExportResponse:
        title, _ = await self.assert_access(student_id, kind, source_id)
        key_points = await self.list_key_points(student_id, kind, source_id)
        annotations = await self.list_annotations(student_id, kind, source_id)

        # Generate structured markdown summary
        md_lines = [
            f"# Revision Sheet: {title}",
            f"*Generated by Mindexa Study Workspace on {datetime.now(UTC).isoformat()}*",
            "",
            "## 📌 Key Concepts & Takeaways",
        ]

        if not key_points:
            md_lines.append("_No key points recorded yet for this material._\n")
        else:
            # Group by tag
            tags = {}
            for kp in key_points:
                tags.setdefault(kp.tag, []).append(kp)

            for tag_name, items in tags.items():
                md_lines.append(f"\n### {tag_name.replace('_', ' ').title()}")
                for item in items:
                    conf_badge = f"[{item.confidence.upper()}]"
                    md_lines.append(f"- **{item.title}** (p. {item.page_number}) `{conf_badge}`")
                    if item.quote:
                        md_lines.append(f"  > \"{item.quote}\"")

        md_lines.append("\n## 🖍️ Highlights & Study Notes")
        if not annotations:
            md_lines.append("_No highlights saved yet._\n")
        else:
            for ann in annotations:
                color_label = ann.color.replace("_", " ").title()
                md_lines.append(f"\n#### Page {ann.page_number} ({color_label})")
                md_lines.append(f"> \"{ann.selected_text}\"")
                if ann.note_text:
                    md_lines.append(f"**Note:** {ann.note_text}")

        markdown = "\n".join(md_lines)

        return RevisionSheetExportResponse(
            source_id=source_id,
            source_kind=kind,
            title=title,
            key_points=key_points,
            annotations=annotations,
            markdown=markdown,
        )

    # ── Language Policy Enforcement ──────────────────────────────────────────

    async def _assert_language_allowed_for_source(
        self,
        kind: str,
        source_id: uuid.UUID,
        action: str,
        extra_context: Optional[dict[str, Any]] = None,
    ) -> None:
        """
        Enforces institutional AI language policy for study reader operations (skim, page-check, etc.).
        """
        if kind == "lecturer_material":
            from app.core.ai.language_policy import assert_ai_allowed
            from app.db.models.academic import TeachingWorkspace

            stmt = (
                select(TeachingWorkspace.language, LecturerMaterial.teaching_workspace_id)
                .join(TeachingWorkspace, LecturerMaterial.teaching_workspace_id == TeachingWorkspace.id)
                .where(LecturerMaterial.id == source_id)
            )
            res = await self.db.execute(stmt)
            row = res.first()
            if row and row[0]:
                ctx = {"material_id": str(source_id), "workspace_id": str(row[1])}
                if extra_context:
                    ctx.update(extra_context)
                assert_ai_allowed(row[0], action=action, context=ctx)

    # ── Document Skim ────────────────────────────────────────────────────────

    async def skim_document(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> SkimResponse:
        title, _ = await self.assert_access(student_id, kind, source_id)
        await self._assert_language_allowed_for_source(kind, source_id, action="study_reader_skim")

        # Fetch existing chunks to generate skim without re-reading entire raw PDF
        chunks_text = []
        if kind == "lecturer_material":
            stmt = (
                select(LecturerMaterialChunk)
                .where(LecturerMaterialChunk.lecturer_material_id == source_id)
                .order_by(LecturerMaterialChunk.chunk_index.asc())
                .limit(25)
            )
            res = await self.db.execute(stmt)
            for c in res.scalars().all():
                page_str = f" [Page {c.source_page}]" if c.source_page else ""
                chunks_text.append(f"{c.content}{page_str}")
        else:
            stmt = (
                select(StudentResourceChunk)
                .where(StudentResourceChunk.student_resource_id == source_id)
                .order_by(StudentResourceChunk.chunk_index.asc())
                .limit(25)
            )
            res = await self.db.execute(stmt)
            for c in res.scalars().all():
                page_str = f" [Page {c.source_page}]" if c.source_page else ""
                chunks_text.append(f"{c.content}{page_str}")

        combined_context = "\n---\n".join(chunks_text) if chunks_text else f"Material Title: {title}"

        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)
        agent = StudyReaderAgent(gateway)

        return await agent.skim(
            title=title,
            chunks_text=chunks_text,
            student_id=student_id,
            source_id=source_id,
            source_kind=kind,
        )

    # ── Phase 3: Focus & Weakness Engine ─────────────────────────────────────

    async def get_focus(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> FocusResponse:
        title, meta = await self.assert_access(student_id, kind, source_id)
        cache_key = (student_id, kind, source_id)
        cached = self._focus_cache.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return cached[1]

        from app.db.models.assessment import Assessment
        from app.db.models.question import Question
        from app.db.models.result import AssessmentResult, ResultBreakdown
        from app.schemas.study_reader import (FocusNextRecommendation,
                                              FocusResponse, PageHeatItem,
                                              WeakQuestionContext)
        from app.services.rag_service import RAGService

        page_heat_map: dict[int, float] = {}
        page_weak_questions: dict[int, list[WeakQuestionContext]] = {}
        page_kp_count: dict[int, int] = {}
        page_ann_count: dict[int, int] = {}
        exam_mapping = False

        workspace_id = meta.get("workspace_id")

        if kind == "lecturer_material" and workspace_id:
            exam_mapping = True
            # 1. Load this student's released results for assessments in workspace
            stmt = (
                select(
                    AssessmentResult.id.label("result_id"),
                    AssessmentResult.assessment_id,
                    Assessment.title.label("assessment_title"),
                    ResultBreakdown.question_id,
                    ResultBreakdown.score,
                    ResultBreakdown.max_score,
                    ResultBreakdown.is_correct,
                    ResultBreakdown.feedback,
                    Question.content.label("question_content"),
                )
                .join(Assessment, AssessmentResult.assessment_id == Assessment.id)
                .join(ResultBreakdown, ResultBreakdown.result_id == AssessmentResult.id)
                .join(Question, ResultBreakdown.question_id == Question.id)
                .where(
                    and_(
                        AssessmentResult.student_id == student_id,
                        Assessment.teaching_workspace_id == workspace_id,
                        AssessmentResult.is_released == True,
                        AssessmentResult.integrity_hold == False,
                        AssessmentResult.is_deleted == False,
                        or_(
                            and_(
                                ResultBreakdown.score.is_not(None),
                                ResultBreakdown.max_score > 0,
                                ResultBreakdown.score < ResultBreakdown.max_score * 0.7,
                            ),
                            ResultBreakdown.is_correct == False,
                            ResultBreakdown.was_skipped == True,
                        ),
                    )
                )
            )
            res = await self.db.execute(stmt)
            weak_rows = res.all()
            weak_rows.sort(
                key=lambda r: (
                    float(r.score) / float(r.max_score)
                    if r.score is not None and r.max_score > 0
                    else 1.0,
                    str(r.question_id),
                )
            )
            unique_rows = {}
            for row in weak_rows:
                unique_rows.setdefault(row.question_id, row)
            weak_rows = list(unique_rows.values())[:20]

            if weak_rows:
                rag_service = RAGService(self.db)
                questions = [row.question_content for row in weak_rows]
                retrieval_results = await rag_service.retrieve_context_batch(
                    questions=questions,
                    student_id=student_id,
                    selected_resource_id=source_id,
                    top_k=4,
                )

                for r, retrieval in zip(weak_rows, retrieval_results):
                    try:
                        if not retrieval.fallback_used and retrieval.citations:
                            for cit in retrieval.citations:
                                page_num = cit.page_number or 1
                                loss = (
                                    1.0 - (r.score / r.max_score)
                                    if (r.score is not None and r.max_score > 0)
                                    else 1.0
                                )
                                heat_increment = min(0.6, loss * 0.45 + (retrieval.retrieval_score or 0.3) * 0.25)
                                page_heat_map[page_num] = page_heat_map.get(page_num, 0.0) + heat_increment

                                q_ctx = WeakQuestionContext(
                                    question_id=r.question_id,
                                    assessment_id=r.assessment_id,
                                    assessment_title=r.assessment_title,
                                    score=r.score,
                                    max_score=r.max_score,
                                    stem_preview=r.question_content[:100] + ("…" if len(r.question_content) > 100 else ""),
                                    feedback=r.feedback,
                                    similarity=retrieval.retrieval_score or 0.0,
                                )
                                page_weak_questions.setdefault(page_num, []).append(q_ctx)
                    except Exception as exc:
                        self.logger.warning("Failed to process focus context: %s", exc)

        # 2. Merge Phase 2 key points and annotations on these pages
        key_points = await self.repo.list_key_points(student_id, kind, source_id)
        for kp in key_points:
            page_kp_count[kp.page_number] = page_kp_count.get(kp.page_number, 0) + 1
            if kp.confidence == "lost":
                page_heat_map[kp.page_number] = page_heat_map.get(kp.page_number, 0.0) + 0.35
            elif kp.confidence == "fuzzy":
                page_heat_map[kp.page_number] = page_heat_map.get(kp.page_number, 0.0) + 0.20

        annotations = await self.repo.list_annotations(student_id, kind, source_id)
        for ann in annotations:
            page_ann_count[ann.page_number] = page_ann_count.get(ann.page_number, 0) + 1
            if ann.color == "confused":
                page_heat_map[ann.page_number] = page_heat_map.get(ann.page_number, 0.0) + 0.15

        # 3. Assemble heatmap list
        all_pages = sorted(list(set(page_heat_map.keys()) | set(page_kp_count.keys()) | set(page_ann_count.keys())))
        heatmap: list[PageHeatItem] = []
        for p in all_pages:
            raw_heat = page_heat_map.get(p, 0.0)
            norm_heat = min(1.0, round(raw_heat, 2))
            level: Any = "none"
            if norm_heat >= 0.6:
                level = "high"
            elif norm_heat >= 0.3:
                level = "medium"
            elif norm_heat > 0.0:
                level = "low"

            wqs = page_weak_questions.get(p, [])
            reason = None
            if wqs:
                assessments_str = ", ".join(list(set(w.assessment_title for w in wqs))[:2])
                reason = f"Lost marks on {len(wqs)} question(s) from {assessments_str}"
            elif page_kp_count.get(p, 0) > 0:
                reason = f"{page_kp_count.get(p, 0)} student key point(s) recorded"

            heatmap.append(
                PageHeatItem(
                    page_number=p,
                    heat=norm_heat,
                    heat_level=level,
                    weak_question_count=len(wqs),
                    weak_questions=wqs,
                    key_point_count=page_kp_count.get(p, 0),
                    annotation_count=page_ann_count.get(p, 0),
                    summary_reason=reason,
                )
            )

        # 4. Generate "Focus next" recommendations
        focus_next: list[FocusNextRecommendation] = []
        high_heat_pages = [h for h in heatmap if h.heat_level in ["high", "medium"]]
        high_heat_pages.sort(key=lambda x: x.heat, reverse=True)

        for item in high_heat_pages[:5]:
            q_info = item.weak_questions[0] if item.weak_questions else None
            title_text = f"Review Page {item.page_number}"
            reason_text = item.summary_reason or "Identified conceptual weakness"
            if q_info:
                title_text = f"Revisit: {q_info.assessment_title}"
                reason_text = f"Marks lost on: {q_info.stem_preview}"

            focus_next.append(
                FocusNextRecommendation(
                    start_page=item.page_number,
                    end_page=item.page_number,
                    title=title_text,
                    reason=reason_text,
                    heat_level=item.heat_level if item.heat_level in ["high", "medium", "low"] else "medium",
                    question_id=q_info.question_id if q_info else None,
                    assessment_title=q_info.assessment_title if q_info else None,
                )
            )

        # 5. Spaced reviews queue
        due_kps = await self.repo.list_due_spaced_reviews(student_id, kind, source_id)
        spaced_reviews = [
            KeyPointResponse(
                id=k.id,
                student_id=k.student_id,
                source_kind=k.source_kind,
                source_id=k.source_id,
                title=k.title,
                quote=k.quote,
                page_number=k.page_number,
                tag=k.tag,
                confidence=k.confidence,
                annotation_id=k.annotation_id,
                next_review_at=k.next_review_at,
                created_at=k.created_at,
                updated_at=k.updated_at,
            )
            for k in due_kps
        ]

        response = FocusResponse(
            exam_mapping=exam_mapping,
            source_kind=kind,
            source_id=source_id,
            heatmap=heatmap,
            focus_next=focus_next,
            spaced_reviews=spaced_reviews,
            total_weak_points=len(high_heat_pages),
        )
        self._focus_cache[cache_key] = (time.monotonic() + 10.0, response)
        return response

    # ── Page-Check Quiz ──────────────────────────────────────────────────────

    async def extract_exact_page_text(
        self, kind: str, source_id: uuid.UUID, page_number: int
    ) -> str:
        """
        Extracts raw grounded page text directly from the underlying PDF document
        using PyMuPDF (fitz), cached in Redis by (source_id, page_number) for fast, reliable page-scoped AI grounding.
        Falls back to exact-matching page chunks if PDF extraction fails.
        """
        from app.core.cache import cache

        cache_key = f"{source_id}:{page_number}"
        try:
            cached_text = await cache.get("study_page_text", cache_key)
            if cached_text and isinstance(cached_text, str) and cached_text.strip():
                return cached_text.strip()
        except Exception:
            pass

        import os
        import fitz
        from app.core.config import settings

        file_path = None
        if kind == "lecturer_material":
            stmt = select(LecturerMaterial.file_path).where(LecturerMaterial.id == source_id)
            res = await self.db.execute(stmt)
            file_path = res.scalar_one_or_none()
        else:
            stmt = select(StudentResource.file_path).where(StudentResource.id == source_id)
            res = await self.db.execute(stmt)
            file_path = res.scalar_one_or_none()

        if file_path:
            abs_path = file_path if os.path.isabs(file_path) else os.path.join(settings.UPLOAD_DIR, file_path)
            if os.path.exists(abs_path) and abs_path.lower().endswith(".pdf"):
                try:
                    doc = fitz.open(abs_path)
                    if 0 <= page_number - 1 < len(doc):
                        page = doc.load_page(page_number - 1)
                        extracted = page.get_text().strip()
                        doc.close()
                        if extracted:
                            try:
                                await cache.set("study_page_text", cache_key, extracted, ttl=86400)
                            except Exception:
                                pass
                            return extracted
                    doc.close()
                except Exception as exc:
                    self.logger.warning("PyMuPDF page extraction error for %s (p.%s): %s", source_id, page_number, exc)

        # Fallback to chunk text with STRICT page matching (only pull chunks specifically tagged with this page_number)
        chunks_text = []
        if kind == "lecturer_material":
            stmt = (
                select(LecturerMaterialChunk)
                .where(
                    and_(
                        LecturerMaterialChunk.lecturer_material_id == source_id,
                        LecturerMaterialChunk.source_page == page_number,
                    )
                )
                .order_by(LecturerMaterialChunk.chunk_index.asc())
                .limit(8)
            )
            res = await self.db.execute(stmt)
            for c in res.scalars().all():
                chunks_text.append(c.content)
        else:
            stmt = (
                select(StudentResourceChunk)
                .where(
                    and_(
                        StudentResourceChunk.student_resource_id == source_id,
                        StudentResourceChunk.source_page == page_number,
                    )
                )
                .order_by(StudentResourceChunk.chunk_index.asc())
                .limit(8)
            )
            res = await self.db.execute(stmt)
            for c in res.scalars().all():
                chunks_text.append(c.content)

        combined_fallback = "\n\n".join(chunks_text).strip()
        if combined_fallback:
            try:
                await cache.set("study_page_text", cache_key, combined_fallback, ttl=86400)
            except Exception:
                pass
        return combined_fallback

    async def generate_page_check(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        page_number: int,
        selected_text: Optional[str] = None,
    ) -> PageCheckResponse:
        if page_number < 1 or page_number > 5000:
            raise ValidationError("Invalid page number. Page number must be between 1 and 5000.")

        title, _ = await self.assert_access(student_id, kind, source_id)
        await self._assert_language_allowed_for_source(
            kind, source_id, action="study_reader_page_check", extra_context={"page_number": page_number}
        )

        # Retrieve exact page text grounded in PyMuPDF with chunk fallback
        page_context = await self.extract_exact_page_text(kind, source_id, page_number)
        if not page_context.strip():
            page_context = f"Page {page_number} of {title}"

        # Guard against excessively large excerpt or page context
        if selected_text:
            safe_selected = selected_text[:4000]
            page_context = f"[FOCUS EXCERPT]:\n{safe_selected}\n\n[PAGE CONTEXT]:\n{page_context[:12000]}"
        else:
            page_context = page_context[:15000]

        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)
        agent = StudyReaderAgent(gateway)

        response = await agent.generate_page_check(
            title=title,
            page_number=page_number,
            page_context=page_context,
            student_id=student_id,
            source_id=source_id,
            source_kind=kind,
            selected_text=selected_text,
        )

        self._page_check_cache[(student_id, kind, source_id, page_number)] = (
            time.monotonic() + 300.0,
            response.questions,
        )
        return response

    async def submit_page_check(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        req: PageCheckSubmitRequest,
    ) -> PageCheckSubmitResponse:
        title, _ = await self.assert_access(student_id, kind, source_id)

        from datetime import timedelta

        from app.schemas.study_reader import (PageCheckFeedbackItem,
                                              PageCheckSubmitResponse)

        cached = self._page_check_cache.get((student_id, kind, source_id, req.page_number))
        if not cached or cached[0] <= time.monotonic():
            raise ValidationError("Page check has expired. Generate a new page check.", code="PAGE_CHECK_NOT_FOUND")
        questions_by_id = {question.id: question for question in cached[1]}
        score = 0
        max_score = len(req.answers)
        feedback_list: list[PageCheckFeedbackItem] = []

        for a in req.answers:
            question = questions_by_id.get(a.question_id)
            if question is None:
                raise ValidationError("Question is not part of this page check.", code="QUESTION_NOT_IN_PAGE_CHECK")
            if a.selected_option_index >= len(question.options):
                raise ValidationError("Selected option is out of range.", code="OPTION_INDEX_OUT_OF_RANGE")
            is_correct = a.selected_option_index == question.correct_option_index
            if is_correct:
                score += 1
            feedback_list.append(
                PageCheckFeedbackItem(
                    question_id=a.question_id,
                    is_correct=is_correct,
                    selected_option_index=a.selected_option_index,
                    correct_option_index=question.correct_option_index,
                    explanation=question.explanation,
                )
            )

        percentage = round((score / max_score * 100) if max_score > 0 else 0.0, 1)
        passed = percentage >= 70.0
        created_kp_id: Optional[uuid.UUID] = None

        if not passed:
            # Create/update a key point flagging this page for spaced revisit
            now = datetime.now(UTC)
            kp_data = KeyPointCreate(
                title=f"Page Check Review: Page {req.page_number}",
                quote=f"Scored {score}/{max_score} ({percentage}%) on comprehension check.",
                page_number=req.page_number,
                tag="exam_likely",
                confidence="lost" if percentage < 40 else "fuzzy",
                next_review_at=now + timedelta(days=1),
            )
            created_kp = await self.repo.create_key_point(student_id, kind, source_id, kp_data)
            await self.db.commit()
            created_kp_id = created_kp.id

        return PageCheckSubmitResponse(
            page_number=req.page_number,
            score=score,
            max_score=max_score,
            percentage=percentage,
            passed=passed,
            feedback=feedback_list,
            created_key_point_id=created_kp_id,
        )

    # ── Exam Lens ────────────────────────────────────────────────────────────

    async def get_exam_lens(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        assessment_id: uuid.UUID,
    ) -> ExamLensResponse:
        focus_resp = await self.get_focus(student_id, kind, source_id)
        from app.db.models.assessment import Assessment

        stmt = select(Assessment.title).where(Assessment.id == assessment_id)
        res = await self.db.execute(stmt)
        assessment_title = res.scalar_one_or_none() or "Assessment"

        filtered_pages = []
        for p in focus_resp.heatmap:
            matched_wqs = [q for q in p.weak_questions if q.assessment_id == assessment_id]
            if matched_wqs:
                p_copy = p.model_copy(update={"weak_questions": matched_wqs, "weak_question_count": len(matched_wqs)})
                filtered_pages.append(p_copy)

        return ExamLensResponse(
            assessment_id=assessment_id,
            assessment_title=assessment_title,
            pages=filtered_pages,
        )

    # ── Orphan Cleanup ───────────────────────────────────────────────────────

    async def cleanup_orphans(self) -> dict[str, int]:
        """
        Scans for study reader progress, annotations, and key points pointing to deleted/missing
        resources, soft-deletes them, and returns an audit count.
        """
        stats = await self.repo.cleanup_orphans()
        await self.db.commit()
        return stats

