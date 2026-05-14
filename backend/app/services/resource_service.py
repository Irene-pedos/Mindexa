"""
app/services/resource_service.py

Business logic for managing lecturer materials and student resources.
"""

import os
import uuid
from typing import List, Optional

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.db.models.resource import LecturerMaterial
from app.db.repositories.resource_repo import ResourceRepository
from app.db.schemas.resource import LecturerMaterialCreate


class ResourceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ResourceRepository(db)

    async def upload_lecturer_material(
        self,
        lecturer_id: uuid.UUID,
        file: UploadFile,
        metadata: LecturerMaterialCreate,
    ) -> LecturerMaterial:
        """
        Save a lecturer material file to disk and record it in the DB.
        """
        # 1. Validate file extension
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
            raise ValidationError(
                f"File extension {ext} is not allowed.",
                code="INVALID_FILE_TYPE",
            )

        # 2. Create directory structure: uploads/lecturers/{lecturer_id}/materials/
        relative_dir = os.path.join("lecturers", str(lecturer_id), "materials")
        absolute_dir = os.path.join(settings.UPLOAD_DIR, relative_dir)
        os.makedirs(absolute_dir, exist_ok=True)

        # 3. Generate safe filename
        safe_name = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(relative_dir, safe_name)
        absolute_path = os.path.join(settings.UPLOAD_DIR, file_path)

        # 4. Write file to disk
        content = await file.read()
        file_size = len(content)
        if file_size > settings.max_upload_size_bytes:
            raise ValidationError(
                f"File size exceeds the {settings.MAX_UPLOAD_SIZE_MB}MB limit.",
                code="FILE_TOO_LARGE",
            )

        with open(absolute_path, "wb") as f:
            f.write(content)

        # 5. Handle versioning (mark old versions of this filename as not current)
        if metadata.course_id:
            await self.repo.mark_superseded(metadata.course_id, file.filename)

        # 6. Create DB record
        material = LecturerMaterial(
            lecturer_id=lecturer_id,
            course_id=metadata.course_id,
            assessment_id=metadata.assessment_id,
            original_filename=file.filename,
            safe_filename=safe_name,
            file_path=file_path,
            file_size_bytes=file_size,
            file_extension=ext,
            mime_type=file.content_type or "application/octet-stream",
            material_category=metadata.material_category,
            display_name=metadata.display_name or file.filename,
            description=metadata.description,
            is_student_visible=metadata.is_student_visible,
        )

        self.db.add(material)
        await self.db.commit()
        await self.db.refresh(material)

        return material

    async def list_course_materials(self, course_id: uuid.UUID) -> List[LecturerMaterial]:
        """List current materials for a course."""
        return await self.repo.list_materials_by_course(course_id)

    async def get_material(self, material_id: uuid.UUID) -> Optional[LecturerMaterial]:
        """Get a specific material."""
        return await self.repo.get_material_by_id(material_id)
