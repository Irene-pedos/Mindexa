"""
app/schemas/export.py

Pydantic schemas for Phase 6C: Excel / Mark-sheet Export Jobs and Templates.
Strictly Pydantic V2 BaseModel with ConfigDict.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import ExportJobStatus, ExportType


# ── Export Request ────────────────────────────────────────────────────────────


class ExportRequest(BaseModel):
    assessment_id: Optional[uuid.UUID] = None
    course_id: Optional[uuid.UUID] = None
    period_id: Optional[uuid.UUID] = None
    template_code: str = "default_marksheet"


# ── Export Job Response ───────────────────────────────────────────────────────


class ExportJobResponse(BaseModel):
    id: uuid.UUID
    requested_by_id: uuid.UUID
    export_type: ExportType
    assessment_id: Optional[uuid.UUID]
    course_id: Optional[uuid.UUID]
    period_id: Optional[uuid.UUID]
    template_id: uuid.UUID
    status: ExportJobStatus
    file_path: Optional[str]
    row_count: Optional[int]
    error: Optional[str]
    finished_at: Optional[datetime]
    expires_at: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Export Template Schemas ───────────────────────────────────────────────────


class ExportTemplateCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=255)
    config_json: Dict[str, Any] = {}
    is_default: bool = False
    institution_id: Optional[uuid.UUID] = None


class ExportTemplateUpdate(BaseModel):
    name: Optional[str] = None
    config_json: Optional[Dict[str, Any]] = None
    is_default: Optional[bool] = None


class ExportTemplateResponse(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    institution_id: Optional[uuid.UUID]
    config_json: Dict[str, Any]
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
