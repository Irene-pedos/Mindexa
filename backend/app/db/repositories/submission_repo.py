"""
app/db/repositories/submission_repo.py

Data access for StudentResponse and StudentResponseLog.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.attempt import StudentResponse, StudentResponseLog


def _utcnow() -> datetime:
    return datetime.now(UTC)


class SubmissionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # StudentResponse — CREATE / UPSERT
    # -----------------------------------------------------------------------

    async def upsert_response(
        self,
        *,
        attempt_id: uuid.UUID,
        question_id: uuid.UUID,
        answer_type: str,
        answer_text: str | None = None,
        selected_option_ids: list | None = None,
        ordered_option_ids: list | None = None,
        match_pairs_json: dict | None = None,
        fill_blank_answers: dict | None = None,
        file_url: str | None = None,
        time_spent_seconds: int | None = None,
        is_skipped: bool = False,
    ) -> tuple[StudentResponse, bool]:
        """
        Create or update a student response. Returns (response, created).

        LOCKING NOTE:
            The unique constraint on (attempt_id, question_id) prevents
            duplicate rows. The service layer must NOT call this after
            is_final=True — the constraint check is at service layer.
        """
        existing = await self.get_response(attempt_id, question_id)

        if existing:
            existing.answer_type = answer_type
            existing.answer_text = answer_text
            existing.selected_option_ids = selected_option_ids
            existing.ordered_option_ids = ordered_option_ids
            existing.match_pairs_json = match_pairs_json
            existing.fill_blank_answers = fill_blank_answers
            existing.file_url = file_url
            existing.saved_at = _utcnow()
            if time_spent_seconds is not None:
                existing.time_spent_seconds = time_spent_seconds
            existing.is_skipped = is_skipped
            await self.db.flush()
            return existing, False

        response = StudentResponse(
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
            saved_at=_utcnow(),
            is_final=False,
        )
        self.db.add(response)
        await self.db.flush()
        return response, True

    # -----------------------------------------------------------------------
    # StudentResponse — READS
    # -----------------------------------------------------------------------

    async def get_response(
        self, attempt_id: uuid.UUID, question_id: uuid.UUID
    ) -> StudentResponse | None:
        result = await self.db.execute(
            select(StudentResponse).where(
                StudentResponse.attempt_id == attempt_id,
                StudentResponse.question_id == question_id,
                StudentResponse.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_response_by_id(self, response_id: uuid.UUID) -> StudentResponse | None:
        result = await self.db.execute(
            select(StudentResponse).where(
                StudentResponse.id == response_id,
                StudentResponse.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_responses_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[StudentResponse]:
        result = await self.db.execute(
            select(StudentResponse)
            .options(selectinload(StudentResponse.question))
            .where(
                StudentResponse.attempt_id == attempt_id,
                StudentResponse.is_deleted == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def list_final_responses(self, attempt_id: uuid.UUID) -> list[StudentResponse]:
        """Return only is_final=True responses (after submission)."""
        result = await self.db.execute(
            select(StudentResponse).where(
                StudentResponse.attempt_id == attempt_id,
                StudentResponse.is_final == True,  # noqa: E712
                StudentResponse.is_deleted == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def count_responses(self, attempt_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(StudentResponse.id)).where(
                StudentResponse.attempt_id == attempt_id,
                StudentResponse.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one()

    # -----------------------------------------------------------------------
    # StudentResponse — UPDATES
    # -----------------------------------------------------------------------

    async def finalize_all(self, attempt_id: uuid.UUID) -> None:
        """
        Lock all responses for an attempt (set is_final=True, submitted_at=now).
        Called at attempt submission time.
        """
        now = _utcnow()
        await self.db.execute(
            update(StudentResponse)
            .where(
                StudentResponse.attempt_id == attempt_id,
                StudentResponse.is_deleted == False,  # noqa: E712
            )
            .values(is_final=True, submitted_at=now)
        )

    # -----------------------------------------------------------------------
    # StudentResponseLog — APPEND
    # -----------------------------------------------------------------------

    async def append_log(
        self,
        *,
        response_id: uuid.UUID,
        attempt_id: uuid.UUID,
        question_id: uuid.UUID,
        change_type: str,
        previous_value: dict | None,
        new_value: dict | None,
    ) -> StudentResponseLog:
        """Append an immutable audit log entry. Never call update on this."""
        entry = StudentResponseLog(
            response_id=response_id,
            attempt_id=attempt_id,
            question_id=question_id,
            change_type=change_type,
            previous_value=previous_value,
            new_value=new_value,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def list_logs_for_response(
        self, response_id: uuid.UUID
    ) -> list[StudentResponseLog]:
        result = await self.db.execute(
            select(StudentResponseLog)
            .where(StudentResponseLog.response_id == response_id)
            .order_by(StudentResponseLog.created_at.asc())
        )
        return list(result.scalars().all())

    async def list_logs_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[StudentResponseLog]:
        result = await self.db.execute(
            select(StudentResponseLog)
            .where(StudentResponseLog.attempt_id == attempt_id)
            .order_by(StudentResponseLog.created_at.asc())
        )
        return list(result.scalars().all())
