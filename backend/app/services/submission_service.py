"""
app/services/submission_service.py

Business logic for student answer submission (StudentResponse).

RULES ENFORCED HERE:
    - Answers may only be saved to an IN_PROGRESS attempt.
    - The access_token must be validated on every save (CSRF protection).
    - is_final responses MUST NOT be updated (post-submission tampering prevention).
    - Every save appends an immutable StudentResponseLog entry.
    - answer_type determines which payload field is required.
    - The question must belong to the assessment (via AssessmentQuestion).
    - Timestamps: last_activity_at is updated on the attempt for every save.
"""

from __future__ import annotations

import uuid
from typing import Optional

from app.core.exceptions import (AuthorizationError, ConflictError,
                                 NotFoundError, ValidationError)
from app.db.enums import SubmissionAnswerType
from app.db.models.attempt import StudentResponse
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.submission_repo import SubmissionRepository
from app.services.attempt_service import AttemptService
from sqlalchemy.ext.asyncio import AsyncSession


class SubmissionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.submission_repo = SubmissionRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.assessment_repo = AssessmentRepository(db)
        self.attempt_service = AttemptService(db)

    # -----------------------------------------------------------------------
    # SUBMIT / UPDATE ANSWER
    # -----------------------------------------------------------------------

    async def save_answer(
        self,
        *,
        attempt_id: uuid.UUID,
        question_id: uuid.UUID,
        student_id: uuid.UUID,
        access_token: uuid.UUID,
        answer_type: str,
        change_type: str = "manual_save",
        # Payload fields
        answer_text: Optional[str] = None,
        selected_option_ids: Optional[list] = None,
        ordered_option_ids: Optional[list] = None,
        match_pairs_json: Optional[dict] = None,
        fill_blank_answers: Optional[dict] = None,
        file_url: Optional[str] = None,
        time_spent_seconds: Optional[int] = None,
        is_skipped: bool = False,
    ) -> tuple[StudentResponse, bool]:
        """
        Save or update a student answer.

        Validates:
            - Attempt is IN_PROGRESS and belongs to the student.
            - access_token matches (CSRF + stale-tab protection).
            - Attempt has not expired.
            - Response is not already finalised (is_final=True).
            - Question belongs to the assessment.

        Then:
            - Captures the current answer as `previous_value` for the log.
            - Upserts the StudentResponse.
            - Appends a StudentResponseLog entry.
            - Stamps last_activity_at on the attempt.

        Returns (response, created: bool).
        """
        # Gate 1 — validate active attempt
        attempt = await self.attempt_service.validate_active_attempt(
            attempt_id=attempt_id,
            student_id=student_id,
            access_token=access_token,
        )

        # Gate 2 — question belongs to this assessment
        in_assessment = await self.assessment_repo.question_in_assessment(
            attempt.assessment_id, question_id
        )
        if not in_assessment:
            raise ValidationError(
                "This question does not belong to the assessment",
                code="QUESTION_NOT_IN_ASSESSMENT",
            )

        # Gate 3 — existing response not finalised
        existing = await self.submission_repo.get_response(attempt_id, question_id)
        if existing and existing.is_final:
            raise ConflictError(
                "This answer has been locked after submission",
                code="RESPONSE_ALREADY_FINAL",
            )

        # Capture previous state for audit log
        previous_value = _extract_answer_payload(existing) if existing else None

        # Upsert response
        response, created = await self.submission_repo.upsert_response(
            attempt_id=attempt_id,
            question_id=question_id,
            answer_type=answer_type,
            answer_text=answer_text,
            selected_option_ids=selected_option_ids,
            ordered_option_ids=ordered_option_ids,
            match_pairs_json=match_pairs_json,
            fill_blank_answers=fill_blank_answers,
            file_url=file_url,
            time_spent_seconds=time_spent_seconds,
            is_skipped=is_skipped,
        )

        # Append audit log
        new_value = _extract_answer_payload(response)
        await self.log_answer_change(
            response_id=response.id,
            attempt_id=attempt_id,
            question_id=question_id,
            change_type=change_type,
            previous_value=previous_value,
            new_value=new_value,
        )

        # Stamp activity
        await self.attempt_service.track_activity(attempt_id)

        return response, created

    # -----------------------------------------------------------------------
    # LOG ANSWER CHANGE
    # -----------------------------------------------------------------------

    async def log_answer_change(
        self,
        *,
        response_id: uuid.UUID,
        attempt_id: uuid.UUID,
        question_id: uuid.UUID,
        change_type: str,
        previous_value: Optional[dict],
        new_value: Optional[dict],
    ) -> None:
        """
        Append one immutable audit log row.

        Separated from save_answer so it can be called independently
        (e.g., at submission time or from tests).
        """
        await self.submission_repo.append_log(
            response_id=response_id,
            attempt_id=attempt_id,
            question_id=question_id,
            change_type=change_type,
            previous_value=previous_value,
            new_value=new_value,
        )

    # -----------------------------------------------------------------------
    # GET RESPONSE
    # -----------------------------------------------------------------------

    async def get_response(
        self,
        *,
        attempt_id: uuid.UUID,
        question_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> Optional[StudentResponse]:
        """
        Fetch a student's response for a specific question.
        Enforces ownership — student can only see their own response.
        """
        attempt = await self.attempt_repo.get_by_id_simple(attempt_id)
        if not attempt:
            raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")
        if attempt.student_id != student_id:
            raise AuthorizationError("Attempt ownership violation", code="ATTEMPT_OWNERSHIP_VIOLATION")

        return await self.submission_repo.get_response(attempt_id, question_id)

    # -----------------------------------------------------------------------
    # LIST RESPONSES (lecturer/admin view)
    # -----------------------------------------------------------------------

    async def list_responses_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[StudentResponse]:
        """Return all responses for an attempt (grading view — no ownership check)."""
        return await self.submission_repo.list_responses_for_attempt(attempt_id)


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _extract_answer_payload(response: Optional[StudentResponse]) -> Optional[dict]:
    """
    Extract the answer payload from a StudentResponse into a JSONB-safe dict.
    Returns None if response is None.
    """
    if not response:
        return None
    return {
        "answer_type": response.answer_type,
        "answer_text": response.answer_text,
        "selected_option_ids": response.selected_option_ids,
        "ordered_option_ids": response.ordered_option_ids,
        "match_pairs_json": response.match_pairs_json,
        "fill_blank_answers": response.fill_blank_answers,
        "file_url": response.file_url,
        "is_skipped": response.is_skipped,
    }
