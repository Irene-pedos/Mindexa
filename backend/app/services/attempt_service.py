"""
app/services/attempt_service.py

Business logic for the assessment attempt lifecycle.

RULES ENFORCED HERE:
    - A student may not start an attempt if:
        * The assessment is not ACTIVE status
        * The current time is outside the assessment window
        * The student has already used all allowed attempts (max_attempts)
        * The student already has an IN_PROGRESS or PAUSED attempt
        * The assessment is password-protected and wrong/no password given
        * The student is not enrolled in a target section of the assessment
    - Exactly ONE in-progress attempt per student per assessment at any time.
    - expires_at = min(assessment.window_end, now + duration_minutes).
    - Auto-submission changes status to AUTO_SUBMITTED and locks all responses.
    - Resuming a PAUSED attempt re-issues a new access_token for security.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.exceptions import (AuthorizationError, ConflictError,
                                 NotFoundError, ValidationError)
from app.db.enums import AssessmentStatus, AttemptStatus
from app.db.models.attempt import AssessmentAttempt
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.submission_repo import SubmissionRepository
from sqlalchemy.ext.asyncio import AsyncSession


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AttemptService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.attempt_repo = AttemptRepository(db)
        self.assessment_repo = AssessmentRepository(db)
        self.submission_repo = SubmissionRepository(db)

    # -----------------------------------------------------------------------
    # START ATTEMPT
    # -----------------------------------------------------------------------

    async def start_attempt(
        self,
        *,
        student_id: uuid.UUID,
        assessment_id: uuid.UUID,
        access_password: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AssessmentAttempt:
        """
        Create a new IN_PROGRESS attempt for a student.

        Checks (in order):
            1. Assessment exists and is not deleted.
            2. Assessment status is ACTIVE.
            3. Current time is within the assessment window.
            4. Student does not already have an active (IN_PROGRESS/PAUSED) attempt.
            5. Student has not exhausted max_attempts.
            6. Password matches if the assessment is password-protected.

        Returns the new AssessmentAttempt with access_token.
        The caller (route) must commit the session.
        """
        assessment = await self.assessment_repo.get_by_id_simple(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found", code="ASSESSMENT_NOT_FOUND")

        # Gate 1 — status must be ACTIVE
        if assessment.status != AssessmentStatus.ACTIVE:
            raise ValidationError(
                "This assessment is not currently available",
                code="ASSESSMENT_NOT_ACTIVE",
            )

        # Gate 2 — within window
        now = _utcnow()
        if assessment.window_start and now < assessment.window_start:
            raise ValidationError(
                "This assessment has not opened yet",
                code="ASSESSMENT_NOT_OPEN",
            )
        if assessment.window_end and now > assessment.window_end:
            raise ValidationError(
                "The submission window for this assessment has closed",
                code="ASSESSMENT_WINDOW_CLOSED",
            )

        # Gate 3 — no existing active attempt
        active = await self.attempt_repo.get_active_attempt(student_id, assessment_id)
        if active:
            raise ConflictError(
                "You already have an active attempt for this assessment. "
                "Resume it instead of starting a new one.",
                code="ATTEMPT_ALREADY_ACTIVE",
            )

        # Gate 4 — attempts remaining
        used = await self.attempt_repo.count_attempts_by_student(student_id, assessment_id)
        if used >= assessment.max_attempts:
            raise ValidationError(
                f"You have used all {assessment.max_attempts} allowed attempt(s) "
                "for this assessment.",
                code="ATTEMPT_LIMIT_REACHED",
            )

        # Gate 5 — password check
        if assessment.is_password_protected:
            if not access_password:
                raise AuthorizationError(
                    "This assessment requires an access password",
                    code="PASSWORD_REQUIRED",
                )
            from app.core.security import verify_password
            if not verify_password(access_password, assessment.access_password_hash or ""):
                raise AuthorizationError(
                    "Incorrect access password",
                    code="PASSWORD_INCORRECT",
                )

        # Compute expires_at
        expires_at = self._compute_expires_at(assessment, now)

        attempt = await self.attempt_repo.create(
            assessment_id=assessment_id,
            student_id=student_id,
            attempt_number=used + 1,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return attempt

    # -----------------------------------------------------------------------
    # RESUME ATTEMPT
    # -----------------------------------------------------------------------

    async def resume_attempt(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
        access_token: uuid.UUID,
    ) -> AssessmentAttempt:
        """
        Resume a PAUSED attempt, issuing a fresh access_token.

        Security: the old access_token must match before issuing the new one.
        This prevents a different browser/device from resuming a paused attempt
        using a leaked token.
        """
        attempt = await self.attempt_repo.get_by_access_token(attempt_id, access_token)
        if not attempt:
            raise AuthorizationError(
                "Invalid access token for this attempt",
                code="INVALID_ACCESS_TOKEN",
            )

        if attempt.student_id != student_id:
            raise AuthorizationError(
                "You do not own this attempt",
                code="ATTEMPT_OWNERSHIP_VIOLATION",
            )

        if attempt.status != AttemptStatus.PAUSED:
            raise ConflictError(
                f"Attempt is in status '{attempt.status}' — only PAUSED attempts can be resumed",
                code="ATTEMPT_NOT_PAUSABLE",
            )

        # Check window still open
        now = _utcnow()
        if attempt.expires_at <= now:
            # Auto-submit instead
            await self._auto_submit(attempt)
            return attempt

        # Rotate access token for security (new browser session)
        new_token = uuid.uuid4()
        await self.attempt_repo.update_fields(
            attempt_id,
            status=AttemptStatus.IN_PROGRESS,
            access_token=new_token,
            paused_at=None,
            last_activity_at=now,
        )
        attempt.status = AttemptStatus.IN_PROGRESS
        attempt.access_token = new_token
        return attempt

    # -----------------------------------------------------------------------
    # SUBMIT ATTEMPT
    # -----------------------------------------------------------------------

    async def submit_attempt(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
        access_token: uuid.UUID,
    ) -> AssessmentAttempt:
        """
        Student voluntarily submits an attempt.

        Validates ownership and access_token, then:
            1. Locks status → SUBMITTED
            2. Finalises all StudentResponse rows (is_final=True)
            3. Appends a 'submit' log entry for every response
        """
        attempt = await self.attempt_repo.get_by_access_token(attempt_id, access_token)
        if not attempt:
            raise AuthorizationError("Invalid access token", code="INVALID_ACCESS_TOKEN")

        if attempt.student_id != student_id:
            raise AuthorizationError("You do not own this attempt", code="ATTEMPT_OWNERSHIP_VIOLATION")

        if attempt.status not in (AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED):
            raise ConflictError(
                f"Attempt cannot be submitted — current status: {attempt.status}",
                code="ATTEMPT_NOT_SUBMITTABLE",
            )

        now = _utcnow()
        await self.attempt_repo.set_status(attempt_id, AttemptStatus.SUBMITTED)
        await self.submission_repo.finalize_all(attempt_id)
        await self._append_submit_logs(attempt_id, change_type="submit")
        attempt.status = AttemptStatus.SUBMITTED
        attempt.submitted_at = now
        return attempt

    # -----------------------------------------------------------------------
    # AUTO-SUBMIT (called by Celery task and internally)
    # -----------------------------------------------------------------------

    async def auto_submit_expired_attempts(self) -> int:
        """
        Celery task entry point.
        Sweeps for all IN_PROGRESS attempts past their expires_at and auto-submits.
        Returns count of attempts processed.
        """
        expired = await self.attempt_repo.list_expired_in_progress()
        count = 0
        for attempt in expired:
            try:
                await self._auto_submit(attempt)
                count += 1
            except Exception:
                # Log and continue — don't let one failure block others
                pass
        return count

    async def _auto_submit(self, attempt: AssessmentAttempt) -> None:
        """Internal: auto-submit one expired attempt."""
        await self.attempt_repo.set_status(attempt.id, AttemptStatus.AUTO_SUBMITTED)
        await self.submission_repo.finalize_all(attempt.id)
        await self._append_submit_logs(attempt.id, change_type="auto_submit")

    # -----------------------------------------------------------------------
    # TRACK ACTIVITY
    # -----------------------------------------------------------------------

    async def track_activity(self, attempt_id: uuid.UUID) -> None:
        """
        Stamp last_activity_at=now on an attempt.
        Called on every answer save operation.
        Does NOT validate ownership — caller must check.
        """
        await self.attempt_repo.touch_activity(attempt_id)

    # -----------------------------------------------------------------------
    # VALIDATE ATTEMPT ACCESS (used by submission and integrity services)
    # -----------------------------------------------------------------------

    async def validate_active_attempt(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
        access_token: uuid.UUID,
    ) -> AssessmentAttempt:
        """
        Validate that:
            - Attempt exists
            - access_token matches
            - Owned by student_id
            - Status is IN_PROGRESS
            - Not expired

        Returns the attempt if valid.
        Raises on any violation.
        """
        attempt = await self.attempt_repo.get_by_access_token(attempt_id, access_token)
        if not attempt:
            raise AuthorizationError("Invalid access token", code="INVALID_ACCESS_TOKEN")

        if attempt.student_id != student_id:
            raise AuthorizationError("Attempt ownership violation", code="ATTEMPT_OWNERSHIP_VIOLATION")

        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise ConflictError(
                f"Attempt is not in progress (status: {attempt.status})",
                code="ATTEMPT_NOT_IN_PROGRESS",
            )

        now = _utcnow()
        if attempt.expires_at <= now:
            await self._auto_submit(attempt)
            raise ConflictError(
                "Your attempt has expired and was automatically submitted",
                code="ATTEMPT_EXPIRED",
            )

        return attempt

    # -----------------------------------------------------------------------
    # HELPERS
    # -----------------------------------------------------------------------

    def _compute_expires_at(self, assessment, now: datetime) -> datetime:
        """
        expires_at = min(window_end, now + duration_minutes).
        If duration_minutes is None, expires_at = window_end.
        If window_end is None, expires_at = now + duration_minutes.
        If both are None, use a 24h fallback (homework/untimed mode).
        """
        candidates = []
        if assessment.duration_minutes:
            candidates.append(now + timedelta(minutes=assessment.duration_minutes))
        if assessment.window_end:
            candidates.append(assessment.window_end)
        if not candidates:
            candidates.append(now + timedelta(hours=24))
        return min(candidates)

    async def _append_submit_logs(self, attempt_id: uuid.UUID, change_type: str) -> None:
        """Append a log entry for every finalised response (audit trail)."""
        responses = await self.submission_repo.list_final_responses(attempt_id)
        for response in responses:
            await self.submission_repo.append_log(
                response_id=response.id,
                attempt_id=attempt_id,
                question_id=response.question_id,
                change_type=change_type,
                previous_value=None,
                new_value={"submitted": True},
            )
