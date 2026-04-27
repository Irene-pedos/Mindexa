"""
app/db/schemas/resource.py

File upload and resource management schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.db.enums import ResourceCategory
from app.db.schemas.base import BaseAuditedResponse, MindexaSchema

# ─────────────────────────────────────────────────────────────────────────────
# STUDENT RESOURCE
# ─────────────────────────────────────────────────────────────────────────────

class StudentResourceCreate(MindexaSchema):
    """
    Metadata provided alongside a file upload.
    The actual file bytes are handled by FastAPI's UploadFile — not in this schema.
    """

    resource_category: ResourceCategory = ResourceCategory.GENERAL
    subject_tag: str | None = Field(default=None, max_length=100)
    display_name: str | None = Field(default=None, max_length=255)


class StudentResourceResponse(BaseAuditedResponse):
    student_id: uuid.UUID
    original_filename: str
    display_name: str | None
    file_size_bytes: int
    file_extension: str
    mime_type: str
    resource_category: str
    subject_tag: str | None
    processing_status: str
    processing_completed_at: datetime | None
    processing_error: str | None
    chunk_count: int | None
    page_count: int | None
    expires_at: datetime | None


# ─────────────────────────────────────────────────────────────────────────────
# LECTURER MATERIAL
# ─────────────────────────────────────────────────────────────────────────────

class LecturerMaterialCreate(MindexaSchema):
    """
    Metadata provided when a lecturer uploads a material file.
    """

    course_id: uuid.UUID | None = None
    assessment_id: uuid.UUID | None = None
    material_category: ResourceCategory = ResourceCategory.GENERAL
    display_name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    is_student_visible: bool = False


class LecturerMaterialResponse(BaseAuditedResponse):
    lecturer_id: uuid.UUID
    course_id: uuid.UUID | None
    assessment_id: uuid.UUID | None
    original_filename: str
    display_name: str | None
    description: str | None
    file_size_bytes: int
    file_extension: str
    mime_type: str
    material_category: str
    is_student_visible: bool
    version: int
    is_current: bool
