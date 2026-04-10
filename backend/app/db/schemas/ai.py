"""
app/db/schemas/ai.py

AI traceability and grade review schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import Field

from app.db.enums import AIActionStatus, AIActionType, AIGradeDecision
from app.db.schemas.base import BaseAuditedResponse, MindexaSchema


class AIActionLogResponse(MindexaSchema):
    """
    Read-only view of an AI action log entry.
    Only accessible to admins and the lecturer who triggered the action.
    raw_output is excluded from default responses — use a dedicated
    admin endpoint to retrieve the full raw output.
    """

    id: uuid.UUID
    action_type: str
    status: str
    actor_id: Optional[uuid.UUID]
    actor_role: Optional[str]
    subject_entity_type: Optional[str]
    subject_entity_id: Optional[uuid.UUID]
    model_name: str
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    total_tokens: Optional[int]
    latency_ms: Optional[int]
    prompt_summary: Optional[str]
    human_reviewed: Optional[bool]
    human_reviewed_at: Optional[datetime]
    created_at: datetime


class AIGradeReviewResponse(BaseAuditedResponse):
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    grading_decision: str
    ai_suggested_total: Optional[float]
    lecturer_final_total: Optional[float]
    score_delta: Optional[float]
    max_possible_score: Optional[float]
    lecturer_id: Optional[uuid.UUID]
    review_started_at: Optional[datetime]
    review_completed_at: Optional[datetime]
    review_duration_seconds: Optional[int]
    lecturer_notes: Optional[str]
