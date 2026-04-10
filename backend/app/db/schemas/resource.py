"""
app/db/schemas/resource.py

File upload and resource management schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import Field

from app.db.enums import ResourceCategory, ResourceProcessingStatus
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
    subject_tag: Optional[str] = Field(default=None, max_length=100)
    display_name: Optional[str] = Field(default=None, max_length=255)


class StudentResourceResponse(BaseAuditedResponse):
    student_id: uuid.UUID
    original_filename: str
    display_name: Optional[str]
    file_size_bytes: int
    file_extension: str
    mime_type: str
    resource_category: str
    subject_tag: Optional[str]
    processing_status: str
    processing_completed_at: Optional[datetime]
    processing_error: Optional[str]
    chunk_count: Optional[int]
    page_count: Optional[int]
    expires_at: Optional[datetime]


# ─────────────────────────────────────────────────────────────────────────────
# LECTURER MATERIAL
# ─────────────────────────────────────────────────────────────────────────────

class LecturerMaterialCreate(MindexaSchema):
    """
    Metadata provided when a lecturer uploads a material file.
    """

    course_id: Optional[uuid.UUID] = None
    assessment_id: Optional[uuid.UUID] = None
    material_category: ResourceCategory = ResourceCategory.GENERAL
    display_name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    is_student_visible: bool = False


class LecturerMaterialResponse(BaseAuditedResponse):
    lecturer_id: uuid.UUID
    course_id: Optional[uuid.UUID]
    assessment_id: Optional[uuid.UUID]
    original_filename: str
    display_name: Optional[str]
    description: Optional[str]
    file_size_bytes: int
    file_extension: str
    mime_type: str
    material_category: str
    is_student_visible: bool
    version: int
    is_current: bool
