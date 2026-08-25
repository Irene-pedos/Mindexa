"""
app/db/repositories/study_reader_repo.py

Repository for study reader operations:
- Student reading progress
- Material annotations
- Key points
"""

import uuid
from datetime import UTC, datetime
from typing import List, Optional

from app.core.exceptions import NotFoundError, ValidationError
from app.db.models.resource import LecturerMaterial, StudentResource
from app.db.models.study_reader import (StudentMaterialAnnotation,
                                        StudentMaterialKeyPoint,
                                        StudentReadingProgress)
from app.db.repositories.base import BaseRepository
from app.schemas.study_reader import (AnnotationCreate, AnnotationUpdate,
                                      KeyPointCreate, KeyPointUpdate,
                                      ReadingProgressUpdate)
from sqlalchemy import and_, desc, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession


class StudyReaderRepository(BaseRepository[StudentReadingProgress]):
    def __init__(self, db: AsyncSession) -> None:
        super().__init__(StudentReadingProgress, db)

    # ── Source Validation & Integrity ────────────────────────────────────────

    async def validate_source_exists(self, kind: str, source_id: uuid.UUID) -> bool:
        """
        Validates that the target source (LecturerMaterial or StudentResource) exists and is not deleted.
        """
        if kind == "lecturer_material":
            stmt = select(LecturerMaterial.id).where(
                and_(
                    LecturerMaterial.id == source_id,
                    LecturerMaterial.is_deleted == False,
                )
            )
            res = await self.db.execute(stmt)
            return res.scalar_one_or_none() is not None
        elif kind == "student_resource":
            stmt = select(StudentResource.id).where(
                and_(
                    StudentResource.id == source_id,
                    StudentResource.is_deleted == False,
                )
            )
            res = await self.db.execute(stmt)
            return res.scalar_one_or_none() is not None
        return False

    # ── Reading Progress ─────────────────────────────────────────────────────

    async def get_progress(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> Optional[StudentReadingProgress]:
        stmt = select(StudentReadingProgress).where(
            and_(
                StudentReadingProgress.student_id == student_id,
                StudentReadingProgress.source_kind == kind,
                StudentReadingProgress.source_id == source_id,
                StudentReadingProgress.is_deleted == False,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def upsert_progress(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        data: ReadingProgressUpdate,
    ) -> StudentReadingProgress:
        if not await self.validate_source_exists(kind, source_id):
            raise NotFoundError(f"Referenced {kind} '{source_id}' does not exist or has been deleted.")

        furthest = data.furthest_page_reached or data.page_count_seen or data.last_page
        now = datetime.now(UTC)
        stmt = insert(StudentReadingProgress).values(
            student_id=student_id,
            source_kind=kind,
            source_id=source_id,
            last_page=data.last_page,
            last_scale=data.last_scale,
            rotation=data.rotation,
            zoom_mode=data.zoom_mode,
            two_page_view=data.two_page_view,
            furthest_page_reached=furthest,
            page_count_seen=furthest,
            created_at=now,
            updated_at=now,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_student_reading_progress_source",
            set_={
                "last_page": stmt.excluded.last_page,
                "last_scale": stmt.excluded.last_scale,
                "rotation": stmt.excluded.rotation,
                "zoom_mode": stmt.excluded.zoom_mode,
                "two_page_view": stmt.excluded.two_page_view,
                "furthest_page_reached": func.greatest(
                    StudentReadingProgress.furthest_page_reached,
                    stmt.excluded.furthest_page_reached,
                ),
                "page_count_seen": func.greatest(
                    StudentReadingProgress.page_count_seen,
                    stmt.excluded.page_count_seen,
                ),
                "updated_at": now,
            },
        ).returning(StudentReadingProgress)
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.scalar_one()

    # ── Annotations ──────────────────────────────────────────────────────────

    async def list_annotations(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        page_number: Optional[int] = None,
        limit: int = 500,
        offset: int = 0,
    ) -> List[StudentMaterialAnnotation]:
        query = select(StudentMaterialAnnotation).where(
            and_(
                StudentMaterialAnnotation.student_id == student_id,
                StudentMaterialAnnotation.source_kind == kind,
                StudentMaterialAnnotation.source_id == source_id,
                StudentMaterialAnnotation.is_deleted == False,
            )
        )
        if page_number is not None:
            query = query.where(StudentMaterialAnnotation.page_number == page_number)

        query = (
            query.order_by(
                StudentMaterialAnnotation.page_number.asc(),
                StudentMaterialAnnotation.created_at.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_annotation(
        self, annotation_id: uuid.UUID, student_id: uuid.UUID
    ) -> Optional[StudentMaterialAnnotation]:
        stmt = select(StudentMaterialAnnotation).where(
            and_(
                StudentMaterialAnnotation.id == annotation_id,
                StudentMaterialAnnotation.student_id == student_id,
                StudentMaterialAnnotation.is_deleted == False,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create_annotation(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        data: AnnotationCreate,
    ) -> StudentMaterialAnnotation:
        if not await self.validate_source_exists(kind, source_id):
            raise NotFoundError(f"Referenced {kind} '{source_id}' does not exist or has been deleted.")

        now = datetime.now(UTC)
        rects_dicts = [r.model_dump() for r in data.rects]

        annotation = StudentMaterialAnnotation(
            student_id=student_id,
            source_kind=kind,
            source_id=source_id,
            page_number=data.page_number,
            color=data.color,
            selected_text=data.selected_text,
            rects_json=rects_dicts,
            note_text=data.note_text,
            created_at=now,
            updated_at=now,
        )
        self.db.add(annotation)
        await self.db.flush()
        return annotation

    async def update_annotation(
        self,
        annotation_id: uuid.UUID,
        student_id: uuid.UUID,
        data: AnnotationUpdate,
    ) -> Optional[StudentMaterialAnnotation]:
        annotation = await self.get_annotation(annotation_id, student_id)
        if not annotation:
            return None

        if data.color is not None:
            annotation.color = data.color
        if data.note_text is not None:
            annotation.note_text = data.note_text

        annotation.updated_at = datetime.now(UTC)
        self.db.add(annotation)
        await self.db.flush()
        return annotation

    async def delete_annotation(
        self, annotation_id: uuid.UUID, student_id: uuid.UUID
    ) -> bool:
        annotation = await self.get_annotation(annotation_id, student_id)
        if not annotation:
            return False

        annotation.soft_delete()
        self.db.add(annotation)
        await self.db.flush()
        return True

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
    ) -> List[StudentMaterialKeyPoint]:
        query = select(StudentMaterialKeyPoint).where(
            and_(
                StudentMaterialKeyPoint.student_id == student_id,
                StudentMaterialKeyPoint.source_kind == kind,
                StudentMaterialKeyPoint.source_id == source_id,
                StudentMaterialKeyPoint.is_deleted == False,
            )
        )
        if page_number is not None:
            query = query.where(StudentMaterialKeyPoint.page_number == page_number)
        if tag is not None:
            query = query.where(StudentMaterialKeyPoint.tag == tag)

        query = (
            query.order_by(
                StudentMaterialKeyPoint.page_number.asc(),
                StudentMaterialKeyPoint.created_at.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def list_due_spaced_reviews(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> List[StudentMaterialKeyPoint]:
        now = datetime.now(UTC)
        stmt = (
            select(StudentMaterialKeyPoint)
            .where(
                and_(
                    StudentMaterialKeyPoint.student_id == student_id,
                    StudentMaterialKeyPoint.source_kind == kind,
                    StudentMaterialKeyPoint.source_id == source_id,
                    StudentMaterialKeyPoint.is_deleted == False,
                    StudentMaterialKeyPoint.next_review_at <= now,
                )
            )
            .order_by(StudentMaterialKeyPoint.page_number.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_key_point(
        self, key_point_id: uuid.UUID, student_id: uuid.UUID
    ) -> Optional[StudentMaterialKeyPoint]:
        stmt = select(StudentMaterialKeyPoint).where(
            and_(
                StudentMaterialKeyPoint.id == key_point_id,
                StudentMaterialKeyPoint.student_id == student_id,
                StudentMaterialKeyPoint.is_deleted == False,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create_key_point(
        self,
        student_id: uuid.UUID,
        kind: str,
        source_id: uuid.UUID,
        data: KeyPointCreate,
    ) -> StudentMaterialKeyPoint:
        if not await self.validate_source_exists(kind, source_id):
            raise NotFoundError(f"Referenced {kind} '{source_id}' does not exist or has been deleted.")

        if data.annotation_id:
            ann = await self.get_annotation(data.annotation_id, student_id)
            if not ann or ann.source_kind != kind or ann.source_id != source_id:
                raise ValidationError(
                    "Referenced annotation does not exist or does not match this material.",
                    code="INVALID_ANNOTATION_REFERENCE",
                )

        now = datetime.now(UTC)
        kp = StudentMaterialKeyPoint(
            student_id=student_id,
            source_kind=kind,
            source_id=source_id,
            title=data.title,
            quote=data.quote,
            page_number=data.page_number,
            tag=data.tag,
            confidence=data.confidence,
            annotation_id=data.annotation_id,
            next_review_at=data.next_review_at,
            created_at=now,
            updated_at=now,
        )
        self.db.add(kp)
        await self.db.flush()
        return kp

    async def update_key_point(
        self,
        key_point_id: uuid.UUID,
        student_id: uuid.UUID,
        data: KeyPointUpdate,
    ) -> Optional[StudentMaterialKeyPoint]:
        kp = await self.get_key_point(key_point_id, student_id)
        if not kp:
            return None

        if data.title is not None:
            kp.title = data.title
        if data.quote is not None:
            kp.quote = data.quote
        if data.page_number is not None:
            kp.page_number = data.page_number
        if data.tag is not None:
            kp.tag = data.tag
        if data.confidence is not None:
            kp.confidence = data.confidence
        if data.next_review_at is not None:
            kp.next_review_at = data.next_review_at

        kp.updated_at = datetime.now(UTC)
        self.db.add(kp)
        await self.db.flush()
        return kp

    async def delete_key_point(
        self, key_point_id: uuid.UUID, student_id: uuid.UUID
    ) -> bool:
        kp = await self.get_key_point(key_point_id, student_id)
        if not kp:
            return False

        kp.soft_delete()
        self.db.add(kp)
        await self.db.flush()
        return True

    # ── Material Version Migration & Copy Forward ────────────────────────────

    async def copy_forward_material_study_data(
        self,
        previous_material_ids: List[uuid.UUID],
        new_material_id: uuid.UUID,
        kind: str = "lecturer_material",
    ) -> dict[str, int]:
        """
        Copies forward all student annotations, key points, and progress
        from superseded material version(s) to the newly uploaded material.
        Maintains annotation_id relationships between key points and annotations.
        """
        if not previous_material_ids:
            return {"copied_annotations": 0, "copied_key_points": 0, "copied_progress": 0}

        now = datetime.now(UTC)
        copied_annotations_count = 0
        copied_kps_count = 0
        copied_progress_count = 0

        # 1. Copy reading progress for students who don't have progress on the new material yet
        stmt_prog = select(StudentReadingProgress).where(
            and_(
                StudentReadingProgress.source_kind == kind,
                StudentReadingProgress.source_id.in_(previous_material_ids),
                StudentReadingProgress.is_deleted == False,
            )
        ).order_by(StudentReadingProgress.updated_at.desc())
        res_prog = await self.db.execute(stmt_prog)
        old_progresses = res_prog.scalars().all()

        seen_students_progress = set()
        for p in old_progresses:
            if p.student_id in seen_students_progress:
                continue
            seen_students_progress.add(p.student_id)

            existing = await self.get_progress(p.student_id, kind, new_material_id)
            if not existing:
                new_p = StudentReadingProgress(
                    student_id=p.student_id,
                    source_kind=kind,
                    source_id=new_material_id,
                    last_page=p.last_page,
                    last_scale=p.last_scale,
                    rotation=getattr(p, "rotation", 0),
                    zoom_mode=getattr(p, "zoom_mode", "fit-width"),
                    two_page_view=getattr(p, "two_page_view", False),
                    furthest_page_reached=getattr(p, "furthest_page_reached", p.page_count_seen),
                    page_count_seen=p.page_count_seen,
                    created_at=now,
                    updated_at=now,
                )
                self.db.add(new_p)
                copied_progress_count += 1

        # 2. Copy annotations (map old annotation ID -> new annotation ID)
        stmt_ann = select(StudentMaterialAnnotation).where(
            and_(
                StudentMaterialAnnotation.source_kind == kind,
                StudentMaterialAnnotation.source_id.in_(previous_material_ids),
                StudentMaterialAnnotation.is_deleted == False,
            )
        ).order_by(StudentMaterialAnnotation.created_at.asc())
        res_ann = await self.db.execute(stmt_ann)
        old_annotations = res_ann.scalars().all()

        old_to_new_ann_ids: dict[uuid.UUID, uuid.UUID] = {}
        for a in old_annotations:
            new_ann_id = uuid.uuid4()
            old_to_new_ann_ids[a.id] = new_ann_id
            new_ann = StudentMaterialAnnotation(
                id=new_ann_id,
                student_id=a.student_id,
                source_kind=kind,
                source_id=new_material_id,
                page_number=a.page_number,
                color=a.color,
                selected_text=a.selected_text,
                rects_json=a.rects_json or [],
                note_text=a.note_text,
                created_at=now,
                updated_at=now,
            )
            self.db.add(new_ann)
            copied_annotations_count += 1

        # 3. Copy key points
        stmt_kp = select(StudentMaterialKeyPoint).where(
            and_(
                StudentMaterialKeyPoint.source_kind == kind,
                StudentMaterialKeyPoint.source_id.in_(previous_material_ids),
                StudentMaterialKeyPoint.is_deleted == False,
            )
        ).order_by(StudentMaterialKeyPoint.created_at.asc())
        res_kp = await self.db.execute(stmt_kp)
        old_kps = res_kp.scalars().all()

        for kp in old_kps:
            new_linked_ann_id = old_to_new_ann_ids.get(kp.annotation_id) if kp.annotation_id else None
            new_kp = StudentMaterialKeyPoint(
                student_id=kp.student_id,
                source_kind=kind,
                source_id=new_material_id,
                title=kp.title,
                quote=kp.quote,
                page_number=kp.page_number,
                tag=kp.tag,
                confidence=kp.confidence,
                annotation_id=new_linked_ann_id,
                next_review_at=kp.next_review_at,
                created_at=now,
                updated_at=now,
            )
            self.db.add(new_kp)
            copied_kps_count += 1

        await self.db.flush()
        return {
            "copied_annotations": copied_annotations_count,
            "copied_key_points": copied_kps_count,
            "copied_progress": copied_progress_count,
        }

    # ── Orphan Cleanup Job ───────────────────────────────────────────────────

    async def cleanup_orphans(self) -> dict[str, int]:
        """
        Orphan cleanup job: Identifies study reader records pointing to
        non-existent or soft-deleted parent materials/resources and soft-deletes them.
        """
        now = datetime.now(UTC)
        from sqlalchemy import update

        # Valid IDs
        valid_mats = select(LecturerMaterial.id).where(LecturerMaterial.is_deleted == False)
        valid_res = select(StudentResource.id).where(StudentResource.is_deleted == False)

        # 1. Cleanup Progress
        stmt_p_mat = (
            update(StudentReadingProgress)
            .where(
                and_(
                    StudentReadingProgress.source_kind == "lecturer_material",
                    StudentReadingProgress.source_id.not_in(valid_mats),
                    StudentReadingProgress.is_deleted == False,
                )
            )
            .values(is_deleted=True, deleted_at=now)
        )
        res_p_mat = await self.db.execute(stmt_p_mat)

        stmt_p_res = (
            update(StudentReadingProgress)
            .where(
                and_(
                    StudentReadingProgress.source_kind == "student_resource",
                    StudentReadingProgress.source_id.not_in(valid_res),
                    StudentReadingProgress.is_deleted == False,
                )
            )
            .values(is_deleted=True, deleted_at=now)
        )
        res_p_res = await self.db.execute(stmt_p_res)
        cleaned_progress = (res_p_mat.rowcount or 0) + (res_p_res.rowcount or 0)

        # 2. Cleanup Annotations
        stmt_a_mat = (
            update(StudentMaterialAnnotation)
            .where(
                and_(
                    StudentMaterialAnnotation.source_kind == "lecturer_material",
                    StudentMaterialAnnotation.source_id.not_in(valid_mats),
                    StudentMaterialAnnotation.is_deleted == False,
                )
            )
            .values(is_deleted=True, deleted_at=now)
        )
        res_a_mat = await self.db.execute(stmt_a_mat)

        stmt_a_res = (
            update(StudentMaterialAnnotation)
            .where(
                and_(
                    StudentMaterialAnnotation.source_kind == "student_resource",
                    StudentMaterialAnnotation.source_id.not_in(valid_res),
                    StudentMaterialAnnotation.is_deleted == False,
                )
            )
            .values(is_deleted=True, deleted_at=now)
        )
        res_a_res = await self.db.execute(stmt_a_res)
        cleaned_annotations = (res_a_mat.rowcount or 0) + (res_a_res.rowcount or 0)

        # 3. Cleanup Key Points
        stmt_k_mat = (
            update(StudentMaterialKeyPoint)
            .where(
                and_(
                    StudentMaterialKeyPoint.source_kind == "lecturer_material",
                    StudentMaterialKeyPoint.source_id.not_in(valid_mats),
                    StudentMaterialKeyPoint.is_deleted == False,
                )
            )
            .values(is_deleted=True, deleted_at=now)
        )
        res_k_mat = await self.db.execute(stmt_k_mat)

        stmt_k_res = (
            update(StudentMaterialKeyPoint)
            .where(
                and_(
                    StudentMaterialKeyPoint.source_kind == "student_resource",
                    StudentMaterialKeyPoint.source_id.not_in(valid_res),
                    StudentMaterialKeyPoint.is_deleted == False,
                )
            )
            .values(is_deleted=True, deleted_at=now)
        )
        res_k_res = await self.db.execute(stmt_k_res)
        cleaned_kps = (res_k_mat.rowcount or 0) + (res_k_res.rowcount or 0)

        await self.db.flush()
        return {
            "cleaned_progress": cleaned_progress,
            "cleaned_annotations": cleaned_annotations,
            "cleaned_key_points": cleaned_kps,
        }
