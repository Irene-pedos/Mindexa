"""
app/db/repositories/study_reader_repo.py

Repository for study reader operations:
- Student reading progress
- Material annotations
- Key points
"""

import uuid
from typing import List, Optional
from datetime import datetime, UTC
from sqlalchemy import select, and_, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.study_reader import (
    StudentReadingProgress,
    StudentMaterialAnnotation,
    StudentMaterialKeyPoint,
)
from app.db.repositories.base import BaseRepository
from app.schemas.study_reader import (
    AnnotationCreate,
    AnnotationUpdate,
    KeyPointCreate,
    KeyPointUpdate,
    ReadingProgressUpdate,
)


class StudyReaderRepository(BaseRepository[StudentReadingProgress]):
    def __init__(self, db: AsyncSession) -> None:
        super().__init__(StudentReadingProgress, db)

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
        existing = await self.get_progress(student_id, kind, source_id)
        now = datetime.now(UTC)

        if existing:
            existing.last_page = data.last_page
            existing.last_scale = data.last_scale
            existing.page_count_seen = max(existing.page_count_seen, data.page_count_seen)
            existing.updated_at = now
            self.db.add(existing)
            await self.db.flush()
            return existing

        new_progress = StudentReadingProgress(
            student_id=student_id,
            source_kind=kind,
            source_id=source_id,
            last_page=data.last_page,
            last_scale=data.last_scale,
            page_count_seen=data.page_count_seen,
            created_at=now,
            updated_at=now,
        )
        self.db.add(new_progress)
        await self.db.flush()
        return new_progress

    # ── Annotations ──────────────────────────────────────────────────────────

    async def list_annotations(
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> List[StudentMaterialAnnotation]:
        stmt = (
            select(StudentMaterialAnnotation)
            .where(
                and_(
                    StudentMaterialAnnotation.student_id == student_id,
                    StudentMaterialAnnotation.source_kind == kind,
                    StudentMaterialAnnotation.source_id == source_id,
                    StudentMaterialAnnotation.is_deleted == False,
                )
            )
            .order_by(StudentMaterialAnnotation.page_number.asc(), StudentMaterialAnnotation.created_at.asc())
        )
        result = await self.db.execute(stmt)
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
        self, student_id: uuid.UUID, kind: str, source_id: uuid.UUID
    ) -> List[StudentMaterialKeyPoint]:
        stmt = (
            select(StudentMaterialKeyPoint)
            .where(
                and_(
                    StudentMaterialKeyPoint.student_id == student_id,
                    StudentMaterialKeyPoint.source_kind == kind,
                    StudentMaterialKeyPoint.source_id == source_id,
                    StudentMaterialKeyPoint.is_deleted == False,
                )
            )
            .order_by(StudentMaterialKeyPoint.page_number.asc(), StudentMaterialKeyPoint.created_at.asc())
        )
        result = await self.db.execute(stmt)
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
                    or_(
                        StudentMaterialKeyPoint.confidence.in_(["lost", "fuzzy"]),
                        StudentMaterialKeyPoint.next_review_at <= now,
                    ),
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
