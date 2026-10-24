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
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog

from app.core import links as frontend_links
from app.core.exceptions import (AuthorizationError, BadRequestError, ConflictError,
                                 NotFoundError, ValidationError)
from app.db.enums import (AssessmentStatus, AssessmentType, AttemptStatus,
                          StudentGroupStatus)
from app.db.models.attempt import AssessmentAttempt
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.auth import UserRepository
from app.db.repositories.group_repo import GroupRepository
from app.db.repositories.submission_repo import SubmissionRepository
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

# A submit this much after expires_at still counts as a normal submission
# (covers network latency between the client timer and the server clock).
SUBMIT_LATENCY_TOLERANCE_SECONDS = 30


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AttemptService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.attempt_repo = AttemptRepository(db)
        self.assessment_repo = AssessmentRepository(db)
        self.user_repo = UserRepository(db)
        self.group_repo = GroupRepository(db)
        self.submission_repo = SubmissionRepository(db)

    # -----------------------------------------------------------------------
    # START ATTEMPT
    # -----------------------------------------------------------------------

    async def start_attempt(
        self,
        *,
        student_id: uuid.UUID,
        assessment_id: uuid.UUID,
        access_password: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
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

        # Gate 1 — status must be PUBLISHED or ACTIVE
        if assessment.status not in [AssessmentStatus.PUBLISHED, AssessmentStatus.ACTIVE]:
            raise ValidationError(
                "This assessment is not currently available",
                code="ASSESSMENT_NOT_ACTIVE",
            )

        # Gate 1b — audience type targeting check
        if assessment.audience_type == "selected":
            target_ids = assessment.target_student_ids or []
            # Only block if a non-empty target list is configured; an empty
            # list indicates the assessment was not yet fully configured and
            # should be treated as open to all enrolled students.
            if target_ids and str(student_id) not in [str(tid) for tid in target_ids]:
                raise AuthorizationError(
                    "You are not eligible for this assessment.",
                    code="STUDENT_NOT_TARGETED",
                )
        elif assessment.audience_type == "sections":
            from app.db.enums import EnrollmentStatus
            from app.db.models.academic import StudentEnrollment
            from app.db.models.assessment import AssessmentTargetSection
            from sqlalchemy import select

            # First check that at least one target section is configured.
            # If none exist (misconfigured assessment), treat as open to all.
            section_count_stmt = (
                select(AssessmentTargetSection.id)
                .where(
                    AssessmentTargetSection.assessment_id == assessment_id,
                    AssessmentTargetSection.is_deleted == False,
                )
                .limit(1)
            )
            section_count_res = await self.db.execute(section_count_stmt)
            has_configured_sections = section_count_res.scalars().first() is not None

            if has_configured_sections:
                stmt = (
                    select(StudentEnrollment.id)
                    .join(AssessmentTargetSection, AssessmentTargetSection.class_section_id == StudentEnrollment.class_section_id)
                    .where(
                        StudentEnrollment.student_id == student_id,
                        StudentEnrollment.enrollment_status.in_([EnrollmentStatus.ACTIVE, EnrollmentStatus.ACTIVE.value]),
                        StudentEnrollment.is_deleted == False,
                        AssessmentTargetSection.assessment_id == assessment_id,
                        AssessmentTargetSection.is_deleted == False,
                    )
                )
                res = await self.db.execute(stmt)
                if not res.scalars().first():
                    raise AuthorizationError(
                        "You are not eligible for this assessment.",
                        code="STUDENT_NOT_TARGETED",
                    )

        # Gate 1c — Institutional eligibility gate (Phase 6A: CAT reassessment block, Summative entry)
        asm_type = getattr(assessment, "assessment_type", None)
        asm_type_str = (asm_type.value if hasattr(asm_type, "value") else str(asm_type or "")).upper()
        if asm_type_str in ["CAT", "SUMMATIVE", "EXAM"]:
            from app.services.eligibility_service import EligibilityService
            eligibility_service = EligibilityService(self.db)
            await eligibility_service.evaluate_attempt_start_gate(
                student_id=student_id,
                assessment_id=assessment_id,
                assessment=assessment,
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

        group_id = None
        if assessment.is_group_assessment:
            group = await self.group_repo.get_student_group_for_assessment(
                assessment_id=assessment_id,
                student_id=student_id,
                include_members=False,
            )
            if not group:
                raise AuthorizationError(
                    "You are not assigned to a group for this assessment.",
                    code="GROUP_MEMBERSHIP_REQUIRED",
                )
            if group.status == StudentGroupStatus.INVALIDATED:
                raise ConflictError(
                    "Your lecturer must recreate groups before this assessment can start.",
                    code="GROUPS_INVALIDATED",
                )
            group_id = group.id

        # Load student profile to check for extra_time_percent accommodation
        user = await self.user_repo.get_by_id(student_id)
        extra_time_percent = 0
        if user and user.profile and getattr(user.profile, "extra_time_percent", 0):
            extra_time_percent = max(0, user.profile.extra_time_percent)

        # Compute expires_at with student accommodations
        expires_at = self._compute_expires_at(
            assessment=assessment,
            now=now,
            extra_time_percent=extra_time_percent,
        )
        access_token = uuid.uuid4()

        attempt = await self.attempt_repo.create(
            assessment_id=assessment_id,
            student_id=student_id,
            attempt_number=used + 1,
            grading_mode=assessment.grading_mode,
            expires_at=expires_at,
            access_token=access_token,
            group_id=group_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return attempt

    # -----------------------------------------------------------------------
    # RESUME ATTEMPT
    # -----------------------------------------------------------------------
    # PAUSE ATTEMPT
    # -----------------------------------------------------------------------

    async def pause_attempt(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
        access_token: uuid.UUID,
    ) -> AssessmentAttempt:
        """
        Pause an active IN_PROGRESS attempt for take-home/homework assessments.
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

        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise ConflictError(
                f"Attempt is in status '{attempt.status}' — only IN_PROGRESS attempts can be paused",
                code="ATTEMPT_NOT_IN_PROGRESS",
            )

        # Check if pause/resume is allowed
        if attempt.assessment:
            is_open_assessment = (
                attempt.assessment.assessment_type == AssessmentType.HOMEWORK
                or str(attempt.assessment.assessment_type).upper() == "HOMEWORK"
                or attempt.assessment.assessment_type == AssessmentType.FORMATIVE
                or str(attempt.assessment.assessment_type).upper() == "FORMATIVE"
            )
            if not attempt.assessment.allow_resume and not is_open_assessment:
                raise AuthorizationError(
                    f"Pausing and resuming is disabled for {attempt.assessment.assessment_type} assessments.",
                    code="PAUSE_DISABLED",
                )

        now = _utcnow()

        # Check if window or duration deadline has already passed
        effective_deadline = attempt.expires_at
        if attempt.assessment and attempt.assessment.window_end:
            grace = timedelta(minutes=attempt.assessment.grace_period_minutes or 0)
            window_cutoff = attempt.assessment.window_end + grace
            if not attempt.assessment.late_submission_allowed:
                if effective_deadline:
                    effective_deadline = min(effective_deadline, window_cutoff)
                else:
                    effective_deadline = window_cutoff

        if effective_deadline and now >= effective_deadline:
            await self._auto_submit(attempt)
            await self.db.commit()
            raise ValidationError(
                "Assessment deadline has passed. Your attempt has been automatically finalized.",
                code="ASSESSMENT_WINDOW_CLOSED",
            )

        await self.attempt_repo.update_fields(
            attempt_id,
            status=AttemptStatus.PAUSED,
            paused_at=now,
            last_activity_at=now,
        )
        attempt.status = AttemptStatus.PAUSED
        attempt.paused_at = now

        # Append audit log for state-changing pause action
        await self._append_submit_logs(attempt_id, change_type="pause", audit_payload={"submitted": False})
        return attempt

    # -----------------------------------------------------------------------
    # RESUME ATTEMPT
    # -----------------------------------------------------------------------

    async def reclaim_attempt(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> AssessmentAttempt:
        """
        Re-issue the session token to the attempt's owner when the browser that
        started it is gone (cleared storage, another device). Same rules as
        resume_attempt — supervised exams that disallow resuming stay blocked —
        and the old session's token stops working once this one is issued.
        """
        return await self.resume_attempt(
            attempt_id=attempt_id, student_id=student_id, access_token=None
        )

    async def resume_attempt(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
        access_token: uuid.UUID | None,
    ) -> AssessmentAttempt:
        """
        Resume a PAUSED or IN_PROGRESS attempt, issuing a fresh access_token.

        Security: the old access_token must match before issuing the new one.
        This prevents a different browser/device from resuming a paused attempt
        using a leaked token. `access_token=None` is only used by reclaim_attempt,
        where the caller has already authenticated as the attempt's owner.
        """
        if access_token is None:
            attempt = await self.attempt_repo.get_by_id(attempt_id)
        else:
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

        if attempt.status not in (AttemptStatus.PAUSED, AttemptStatus.IN_PROGRESS):
            raise ConflictError(
                f"Attempt is in status '{attempt.status}' — only active or PAUSED attempts can be resumed",
                code="ATTEMPT_NOT_PAUSABLE",
            )

        # SECURITY: Only allow resume for assessments configured to allow resume or open-type assessments
        if attempt.assessment:
            is_open_assessment = (
                attempt.assessment.assessment_type == AssessmentType.HOMEWORK
                or str(attempt.assessment.assessment_type).upper() == "HOMEWORK"
                or attempt.assessment.assessment_type == AssessmentType.FORMATIVE
                or str(attempt.assessment.assessment_type).upper() == "FORMATIVE"
            )
            if not attempt.assessment.allow_resume and not is_open_assessment:
                raise AuthorizationError(
                    f"Resuming is disabled for {attempt.assessment.assessment_type} assessments to maintain integrity. "
                    "Please contact your invigilator if you believe this is an error.",
                    code="RESUME_DISABLED",
                )

        now = _utcnow()
        paused_at = attempt.paused_at
        if paused_at and attempt.expires_at:
            paused_duration = max(timedelta(0), now - paused_at)
            attempt.expires_at += paused_duration
            if attempt.assessment and attempt.assessment.window_end and not attempt.assessment.late_submission_allowed:
                grace = timedelta(minutes=attempt.assessment.grace_period_minutes or 0)
                attempt.expires_at = min(attempt.expires_at, attempt.assessment.window_end + grace)
            await self.attempt_repo.update_fields(attempt_id, expires_at=attempt.expires_at)

        # Check window still open
        effective_deadline = attempt.expires_at
        if attempt.assessment and attempt.assessment.window_end:
            grace = timedelta(minutes=attempt.assessment.grace_period_minutes or 0)
            window_cutoff = attempt.assessment.window_end + grace
            if not attempt.assessment.late_submission_allowed:
                if effective_deadline:
                    effective_deadline = min(effective_deadline, window_cutoff)
                else:
                    effective_deadline = window_cutoff

        if effective_deadline and now >= effective_deadline:
            # Auto-submit instead
            await self._auto_submit(attempt)
            await self.db.commit()
            raise ValidationError(
                "Assessment window closed while paused. Your attempt has been automatically submitted.",
                code="ASSESSMENT_WINDOW_CLOSED",
            )

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

        # Append audit log for state-changing resume action
        await self._append_submit_logs(
            attempt_id,
            change_type="resume",
            audit_payload={"submitted": False, "reclaimed": access_token is None},
        )
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

        # A submit arriving well after the deadline is recorded as an automatic
        # submission, not a regular one (a few seconds of network latency are fine).
        late = bool(
            attempt.expires_at
            and now > attempt.expires_at + timedelta(seconds=SUBMIT_LATENCY_TOLERANCE_SECONDS)
        )
        final_status = AttemptStatus.AUTO_SUBMITTED if late else AttemptStatus.SUBMITTED
        await self.attempt_repo.set_status(attempt_id, final_status)
        await self.submission_repo.finalize_all(attempt_id)
        await self._append_submit_logs(
            attempt_id,
            change_type="auto_submit" if late else "submit",
            audit_payload={"submitted": True, "late": late},
        )

        # Automatic grading and result calculations are dispatched asynchronously via Celery in the route handler.

        # 4. Trigger Notifications
        try:
            from app.db.enums import NotificationType
            from app.db.repositories.notification_repo import \
                NotificationRepository
            notif_repo = NotificationRepository(self.db)

            # Notify Student
            await notif_repo.create(
                recipient_id=student_id,
                notification_type=NotificationType.SYSTEM_ANNOUNCEMENT,
                title="Assessment Submitted",
                body=f"Your attempt for '{attempt.assessment.title}' has been securely recorded.",
                reference_id=attempt_id,
                reference_type="attempt",
                action_url=frontend_links.student_result(attempt_id)
            )

            # Notify Lecturer (if assessment has an owner)
            if attempt.assessment and attempt.assessment.created_by_id:
                await notif_repo.create(
                    recipient_id=attempt.assessment.created_by_id,
                    notification_type=NotificationType.NEW_SUBMISSION,
                    title="New Submission Received",
                    body=f"A student has submitted an attempt for '{attempt.assessment.title}'.",
                    reference_id=attempt_id,
                    reference_type="attempt",
                    action_url=frontend_links.lecturer_grading(attempt.assessment_id)
                )
        except Exception as e:
            # Don't fail submission if notification fails
            print(f"FAILED to send submission notifications: {e}")

        # Phase 6A: If submitting a reassessment, mark requirement as SUBMITTED (satisfies CAT gate A-06)
        try:
            from app.services.eligibility_service import EligibilityService
            eligibility_service = EligibilityService(self.db)
            await eligibility_service.process_reassessment_attempt_submitted(
                reassessment_attempt_id=attempt_id,
                reassessment_assessment_id=attempt.assessment_id,
                student_id=student_id,
            )
        except Exception as e:
            print(f"FAILED to update reassessment requirement status on submit: {e}")

        attempt.status = final_status
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
                await self.db.rollback()
                logger.exception(
                    "Failed to auto-submit expired assessment attempt",
                    attempt_id=str(attempt.id),
                )
        return count

    async def _auto_submit(self, attempt: AssessmentAttempt) -> None:
        """Internal: auto-submit one expired attempt."""
        await self.attempt_repo.set_status(attempt.id, AttemptStatus.AUTO_SUBMITTED)
        await self.submission_repo.finalize_all(attempt.id)
        await self._append_submit_logs(attempt.id, change_type="auto_submit", audit_payload={"submitted": True})

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
        if attempt.expires_at and attempt.expires_at <= now:
            await self._auto_submit(attempt)
            # The caller's error rolls the session back; commit first so the
            # auto-submit (and the answers already saved) are not undone.
            await self.db.commit()
            raise ConflictError(
                "Your attempt has expired and was automatically submitted",
                code="ATTEMPT_EXPIRED",
            )

        return attempt

    # -----------------------------------------------------------------------
    # HELPERS
    # -----------------------------------------------------------------------

    def _compute_expires_at(
        self,
        assessment,
        now: datetime,
        extra_time_percent: int = 0,
    ) -> datetime:
        """
        Compute attempt expiration timestamp factoring in extra time accommodations.

        adjusted_duration_minutes = duration_minutes * (1 + extra_time_percent / 100).

        expires_at = min(window_end, now + adjusted_duration_minutes).
        If allow_accommodation_past_window_end is True on assessment, duration is not capped by window_end.
        If duration_minutes is None, expires_at = window_end.
        If window_end is None, expires_at = now + adjusted_duration_minutes.
        If both are None, use a 24h fallback (homework/untimed mode).
        """
        candidates = []
        if assessment.duration_minutes:
            multiplier = 1.0 + (max(0, extra_time_percent) / 100.0)
            adjusted_minutes = assessment.duration_minutes * multiplier
            duration_expiry = now + timedelta(minutes=adjusted_minutes)

            allow_past_window = getattr(assessment, "allow_accommodation_past_window_end", False)
            if allow_past_window and extra_time_percent > 0:
                return duration_expiry

            candidates.append(duration_expiry)

        if assessment.window_end:
            candidates.append(assessment.window_end)
        if not candidates:
            candidates.append(now + timedelta(hours=24))
        return min(candidates)

    async def _append_submit_logs(
        self,
        attempt_id: uuid.UUID,
        change_type: str,
        audit_payload: dict,
    ) -> None:
        """Append a log entry for every finalised response (audit trail)."""
        responses = await self.submission_repo.list_responses_for_attempt(attempt_id)
        for response in responses:
            await self.submission_repo.append_log(
                response_id=response.id,
                attempt_id=attempt_id,
                question_id=response.question_id,
                change_type=change_type,
                previous_value=None,
                new_value=audit_payload,
            )

    # ─── Choice-Based Section Selection (Phase 2) ─────────────────────────────

    async def select_question(
        self,
        *,
        attempt_id: uuid.UUID,
        section_id: uuid.UUID,
        question_id: uuid.UUID,
        current_user: Any,
    ) -> Any:
        """
        Record a student's question selection within a choice section.
        Enforces:
        - Ownership (only the attempt student can select)
        - Attempt state (IN_PROGRESS, not expired)
        - Section belongs to this assessment
        - Question belongs to this section
        - Choice limit N (CHOICE_LIMIT_EXCEEDED)
        """
        attempt = await self.attempt_repo.get_by_id_simple(attempt_id)
        if not attempt:
            raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

        # 1. Ownership check (IDOR prevention)
        if str(attempt.student_id) != str(current_user.id):
            raise AuthorizationError("You do not own this attempt", code="FORBIDDEN")

        # 2. Attempt active state check
        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise ValidationError(
                f"Cannot select questions when attempt status is {attempt.status.value}",
                code="ATTEMPT_NOT_ACTIVE",
            )
        now = _utcnow()
        if attempt.expires_at and now > attempt.expires_at:
            raise ValidationError("Attempt has expired", code="ATTEMPT_EXPIRED")

        # 3. Section exists and belongs to assessment
        section = await self.assessment_repo.get_section(section_id)
        if not section or str(section.assessment_id) != str(attempt.assessment_id):
            raise NotFoundError("Section not found in this assessment", code="SECTION_NOT_FOUND")

        # 4. Question exists in this section
        from sqlmodel import select, col
        from app.db.models.question import AssessmentQuestion
        aq_res = await self.db.execute(
            select(AssessmentQuestion).where(
                col(AssessmentQuestion.assessment_id) == attempt.assessment_id,
                col(AssessmentQuestion.assessment_section_id) == section_id,
                col(AssessmentQuestion.question_id) == question_id,
                col(AssessmentQuestion.is_deleted) == False,  # noqa: E712
            )
        )
        aq = aq_res.scalar_one_or_none()
        if not aq:
            raise ValidationError("Question does not belong to this section", code="QUESTION_NOT_IN_SECTION")

        # 5. Check if already selected (idempotent)
        existing = await self.attempt_repo.get_selection(attempt_id, question_id)
        if existing:
            return existing

        # 6. Check choice limit N
        n = getattr(section, "questions_to_answer", None)
        if n is not None:
            current_count = await self.attempt_repo.count_selections_for_section(attempt_id, section_id)
            if current_count >= int(n):
                raise BadRequestError(
                    f"Cannot select more than {n} questions in section '{section.title}'",
                    code="CHOICE_LIMIT_EXCEEDED",
                )
            selected_order = current_count + 1
        else:
            current_count = await self.attempt_repo.count_selections_for_section(attempt_id, section_id)
            selected_order = current_count + 1

        selection = await self.attempt_repo.create_selection(
            attempt_id=attempt_id,
            assessment_section_id=section_id,
            question_id=question_id,
            selected_order=selected_order,
        )
        await self.db.commit()
        await self.db.refresh(selection)
        return selection

    async def deselect_question(
        self,
        *,
        attempt_id: uuid.UUID,
        question_id: uuid.UUID,
        current_user: Any,
    ) -> None:
        """
        Deselect a previously chosen question in a choice section.
        """
        attempt = await self.attempt_repo.get_by_id_simple(attempt_id)
        if not attempt:
            raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

        # 1. Ownership check (IDOR prevention)
        if str(attempt.student_id) != str(current_user.id):
            raise AuthorizationError("You do not own this attempt", code="FORBIDDEN")

        # 2. Attempt active state check
        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise ValidationError(
                f"Cannot deselect questions when attempt status is {attempt.status.value}",
                code="ATTEMPT_NOT_ACTIVE",
            )
        now = _utcnow()
        if attempt.expires_at and now > attempt.expires_at:
            raise ValidationError("Attempt has expired", code="ATTEMPT_EXPIRED")

        selection = await self.attempt_repo.get_selection(attempt_id, question_id)
        if not selection:
            raise NotFoundError("Selection not found for this question", code="SELECTION_NOT_FOUND")

        sec_id = selection.assessment_section_id
        await self.attempt_repo.delete_selection(attempt_id, question_id)

        # Re-index remaining selections for this section
        remaining = await self.attempt_repo.list_selections_for_attempt(attempt_id, sec_id)
        for idx, sel in enumerate(remaining, start=1):
            sel.selected_order = idx
            self.db.add(sel)

        await self.db.commit()

