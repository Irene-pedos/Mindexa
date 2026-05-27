from __future__ import annotations

import uuid
from typing import List, Optional
from pydantic import Field
from app.db.schemas.base import MindexaSchema, BaseAuditedResponse
from app.db.enums import LecturerAssignmentRole

class TeachingAssignmentCreate(MindexaSchema):
    lecturer_id: uuid.UUID
    institution_id: uuid.UUID
    campus_id: uuid.UUID | None = None
    college_id: uuid.UUID | None = None
    department_id: uuid.UUID
    option_id: uuid.UUID | None = None
    course_id: uuid.UUID | None = None
    class_section_id: uuid.UUID | None = None
    academic_period_id: uuid.UUID | None = None
    academic_year: str
    role: LecturerAssignmentRole = LecturerAssignmentRole.MAIN_LECTURER

class TeachingAssignmentResponse(BaseAuditedResponse):
    id: uuid.UUID
    lecturer_id: uuid.UUID
    institution_id: uuid.UUID
    campus_id: uuid.UUID | None
    college_id: uuid.UUID | None
    department_id: uuid.UUID
    option_id: uuid.UUID | None
    course_id: uuid.UUID | None
    class_section_id: uuid.UUID | None
    academic_period_id: uuid.UUID | None
    academic_year: str
    role: LecturerAssignmentRole
    is_active: bool

class TeachingAssignmentDetailResponse(TeachingAssignmentResponse):
    institution_name: str | None = None
    campus_name: str | None = None
    college_name: str | None = None
    department_name: str | None = None
    option_name: str | None = None
    course_name: str | None = None
    class_section_name: str | None = None

TeachingAssignmentCreate.model_rebuild()
TeachingAssignmentResponse.model_rebuild()
TeachingAssignmentDetailResponse.model_rebuild()
