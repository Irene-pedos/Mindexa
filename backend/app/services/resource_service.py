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
from app.core.exceptions import AuthorizationError, ValidationError
from app.core.uploads import (assert_content_matches_extension, assert_not_empty, clean_display_name,
                              read_limited, validated_extension)
from app.db.models.resource import LecturerMaterial, StudentResource
from app.db.models.academic_resource import AcademicResource
from app.db.repositories.resource_repo import ResourceRepository
from app.db.repositories.workspace_repo import WorkspaceRepository
from app.db.schemas.resource import LecturerMaterialCreate


class ResourceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ResourceRepository(db)

    # ── Lecturer Materials ──────────────────────────────────────────────────

    async def upload_lecturer_material(
        self,
        lecturer_id: uuid.UUID,
        file: UploadFile,
        metadata: LecturerMaterialCreate,
    ) -> LecturerMaterial:
        """
        Save a lecturer material file to disk and record it in the DB.
        """
        await self.assert_can_manage_workspace_material(lecturer_id, metadata)

        # 1. Validate name, size and content before anything touches the disk
        ext = validated_extension(file.filename, settings.ALLOWED_UPLOAD_EXTENSIONS)
        content = await read_limited(
            file, settings.max_upload_size_bytes, limit_label=f"{settings.MAX_UPLOAD_SIZE_MB}MB"
        )
        assert_not_empty(content)
        assert_content_matches_extension(ext, content)
        file_size = len(content)
        filename = clean_display_name(file.filename)

        # 2. Create directory structure: uploads/lecturers/{lecturer_id}/materials/
        relative_dir = os.path.join("lecturers", str(lecturer_id), "materials")
        absolute_dir = os.path.join(settings.UPLOAD_DIR, relative_dir)
        os.makedirs(absolute_dir, exist_ok=True)

        # 3. Generate safe filename
        safe_name = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(relative_dir, safe_name)
        absolute_path = os.path.join(settings.UPLOAD_DIR, file_path)

        # 4. Write file to disk
        with open(absolute_path, "wb") as f:
            f.write(content)

        # 5. Handle versioning (mark old versions of this filename as not current in this workspace)
        latest_existing = await self.repo.get_latest_material_by_filename(metadata.teaching_workspace_id, filename)
        next_version = (latest_existing.version + 1) if latest_existing else 1

        superseded_ids = await self.repo.mark_superseded(metadata.teaching_workspace_id, filename)

        # 6. Create DB record
        material = LecturerMaterial(
            lecturer_id=lecturer_id,
            teaching_workspace_id=metadata.teaching_workspace_id,
            course_id=metadata.course_id,
            assessment_id=metadata.assessment_id,
            original_filename=filename,
            safe_filename=safe_name,
            file_path=file_path,
            file_size_bytes=file_size,
            file_extension=ext,
            mime_type=file.content_type or "application/octet-stream",
            material_category=metadata.material_category,
            display_name=metadata.display_name or filename,
            description=metadata.description,
            is_student_visible=metadata.is_student_visible,
            version=next_version,
            is_current=True,
        )

        self.db.add(material)
        await self.db.commit()
        await self.db.refresh(material)

        # 6.1 Copy forward previous version's student study data (annotations, key points, progress)
        if superseded_ids:
            from app.db.repositories.study_reader_repo import StudyReaderRepository
            study_repo = StudyReaderRepository(self.db)
            await study_repo.copy_forward_material_study_data(
                previous_material_ids=superseded_ids,
                new_material_id=material.id,
                kind="lecturer_material",
            )
            await self.db.commit()

        # 6.5 Create AcademicResource for new RAG pipeline
        academic_res = AcademicResource(
            title=material.display_name,
            file_name=material.original_filename,
            file_path=material.file_path,
            file_size=material.file_size_bytes,
            mime_type=material.mime_type,
        )
        self.db.add(academic_res)
        await self.db.commit()
        await self.db.refresh(academic_res)

        material.academic_resource_id = academic_res.id
        await self.db.commit()
        await self.db.refresh(material)

        # 7. Enqueue background RAG processing (New Pipeline)
        from app.workers.tasks.document_processing import process_uploaded_document
        process_uploaded_document.delay(str(academic_res.id))

        return material

    async def list_workspace_materials(self, workspace_id: uuid.UUID) -> List[LecturerMaterial]:
        """List current materials for a workspace."""
        return await self.repo.list_materials_by_workspace(workspace_id)

    async def get_material(self, material_id: uuid.UUID) -> Optional[LecturerMaterial]:
        """Get a specific material."""
        return await self.repo.get_material_by_id(material_id)

    async def assert_can_manage_workspace_material(
        self, lecturer_id: uuid.UUID, metadata: LecturerMaterialCreate
    ) -> None:
        """Only the lecturer assigned to a workspace may add material to it, and any course /
        assessment the upload is tagged with must belong to that same workspace."""
        from sqlalchemy import select

        from app.db.models.assessment import Assessment

        workspace = await WorkspaceRepository(self.db).get_by_id(metadata.teaching_workspace_id)
        if (
            workspace is None
            or workspace.teaching_assignment is None
            or workspace.teaching_assignment.lecturer_id != lecturer_id
        ):
            raise AuthorizationError("You do not teach this workspace")

        if metadata.course_id and metadata.course_id != workspace.course_id:
            raise ValidationError("The course does not match this workspace.", code="COURSE_MISMATCH")

        if metadata.assessment_id:
            owner = (
                await self.db.execute(
                    select(Assessment.teaching_workspace_id).where(
                        Assessment.id == metadata.assessment_id,
                        Assessment.is_deleted == False,
                    )
                )
            ).scalar_one_or_none()
            if owner != metadata.teaching_workspace_id:
                raise ValidationError(
                    "The assessment does not belong to this workspace.", code="ASSESSMENT_MISMATCH"
                )

    async def delete_lecturer_material(self, lecturer_id: uuid.UUID, material_id: uuid.UUID) -> bool:
        """Soft delete a lecturer material if they own it."""
        from sqlalchemy import update, func
        
        material = await self.get_material(material_id)
        if not material or material.lecturer_id != lecturer_id:
            return False
            
        stmt = (
            update(LecturerMaterial)
            .where(LecturerMaterial.id == material_id)
            .values(is_deleted=True, deleted_at=func.now())
        )
        result = await self.db.execute(stmt)
        if result.rowcount > 0 and material.academic_resource_id:
            await self.repo.soft_delete_chunks(material.academic_resource_id)
        return result.rowcount > 0

    # ── Student Resources ────────────────────────────────────────────────────

    async def upload_student_resource(
        self,
        student_id: uuid.UUID,
        file: UploadFile,
        subject_tag: str | None = None,
    ) -> StudentResource:
        """
        Save a personal student study resource to disk and record it in the DB.
        """
        # 1. Validate name, size, content and the student's quota before anything touches the disk
        ext = validated_extension(file.filename, settings.STUDENT_ALLOWED_UPLOAD_EXTENSIONS)
        content = await read_limited(
            file,
            settings.max_student_upload_size_bytes,
            limit_label=f"{settings.MAX_STUDENT_UPLOAD_SIZE_MB}MB",
        )
        assert_not_empty(content)
        assert_content_matches_extension(ext, content)
        file_size = len(content)
        filename = clean_display_name(file.filename)
        await self._assert_student_within_quota(student_id, file_size)

        # 2. Create directory structure: uploads/students/{student_id}/resources/
        relative_dir = os.path.join("students", str(student_id), "resources")
        absolute_dir = os.path.join(settings.UPLOAD_DIR, relative_dir)
        os.makedirs(absolute_dir, exist_ok=True)

        # 3. Generate safe filename
        safe_name = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(relative_dir, safe_name)
        absolute_path = os.path.join(settings.UPLOAD_DIR, file_path)

        # 4. Write file to disk
        with open(absolute_path, "wb") as f:
            f.write(content)

        # 5. Create DB record
        resource = StudentResource(
            student_id=student_id,
            original_filename=filename,
            safe_filename=safe_name,
            file_path=file_path,
            file_size_bytes=file_size,
            file_extension=ext[1:].upper() if ext.startswith(".") else ext.upper(),
            mime_type=file.content_type or "application/octet-stream",
            subject_tag=subject_tag,
            display_name=filename,
        )

        await self.repo.create_student_resource(resource)
        await self.db.commit()
        await self.db.refresh(resource)

        # 5.5 Create AcademicResource for new RAG pipeline
        academic_res = AcademicResource(
            title=resource.display_name,
            file_name=resource.original_filename,
            file_path=resource.file_path,
            file_size=resource.file_size_bytes,
            mime_type=resource.mime_type,
        )
        self.db.add(academic_res)
        await self.db.commit()
        await self.db.refresh(academic_res)

        resource.academic_resource_id = academic_res.id
        await self.db.commit()
        await self.db.refresh(resource)

        # 6. Enqueue background RAG processing (New Pipeline)
        from app.workers.tasks.document_processing import process_uploaded_document
        process_uploaded_document.delay(str(academic_res.id))

        return resource

    async def _assert_student_within_quota(self, student_id: uuid.UUID, incoming_bytes: int) -> None:
        """Cap how many files / bytes one student can have embedded at our expense."""
        count, total_bytes = await self.repo.student_resource_usage(student_id)
        if count >= settings.STUDENT_MAX_RESOURCES:
            raise ValidationError(
                f"You can keep up to {settings.STUDENT_MAX_RESOURCES} study files. "
                "Delete one you no longer need to upload another.",
                code="STUDENT_UPLOAD_COUNT_LIMIT",
            )
        if total_bytes + incoming_bytes > settings.student_storage_quota_bytes:
            raise ValidationError(
                f"This upload would exceed your {settings.STUDENT_STORAGE_QUOTA_MB}MB study storage. "
                "Delete a file you no longer need and try again.",
                code="STUDENT_STORAGE_QUOTA_EXCEEDED",
            )

    async def list_student_resources(self, student_id: uuid.UUID) -> List[StudentResource]:
        """List all personal resources for a student."""
        return await self.repo.list_student_resources(student_id)

    async def delete_student_resource(self, student_id: uuid.UUID, resource_id: uuid.UUID) -> bool:
        """Delete a personal resource if it belongs to the student."""
        resource = await self.repo.get_student_resource(resource_id)
        if not resource or resource.student_id != student_id:
            return False
        
        deleted = await self.repo.delete_student_resource(resource_id)
        if deleted and resource.academic_resource_id:
            # The text of a deleted upload must no longer be retrievable by the tutor.
            await self.repo.soft_delete_chunks(resource.academic_resource_id)
            await self.repo.soft_delete_academic_resource(resource.academic_resource_id)
        return deleted
