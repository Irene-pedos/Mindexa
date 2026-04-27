"""
app/db/schemas/ai.py

AI traceability and grade review schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime

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
    actor_id: uuid.UUID | None
    actor_role: str | None
    subject_entity_type: str | None
    subject_entity_id: uuid.UUID | None
    model_name: str
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    latency_ms: int | None
    prompt_summary: str | None
    human_reviewed: bool | None
    human_reviewed_at: datetime | None
    created_at: datetime


class AIGradeReviewResponse(BaseAuditedResponse):
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    grading_decision: str
    ai_suggested_total: float | None
    lecturer_final_total: float | None
    score_delta: float | None
    max_possible_score: float | None
    lecturer_id: uuid.UUID | None
    review_started_at: datetime | None
    review_completed_at: datetime | None
    review_duration_seconds: int | None
    lecturer_notes: str | None
