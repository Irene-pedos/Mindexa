"""
app/services/integrity_service.py

Business logic for academic integrity monitoring.

DESIGN:
    This service is intentionally stateless and fast — it must handle
    high-volume real-time events during live assessments without adding
    significant latency to the student's submission experience.

ESCALATION MODEL:
    Threshold → Warning level → Flag (automatic at WARNING_3)

    Default thresholds (configurable per assessment in future):
        TAB_SWITCH:           >= 3  → WARNING_1
                              >= 5  → WARNING_2
                              >= 8  → WARNING_3 + auto FLAG (HIGH risk)
        FULLSCREEN_EXIT:      >= 2  → WARNING_1
                              >= 4  → WARNING_2
                              >= 6  → WARNING_3 + auto FLAG (HIGH risk)
        COPY_ATTEMPT:         >= 1  → WARNING_1 (closed-book only)
                              >= 3  → WARNING_2
                              >= 5  → WARNING_3 + FLAG (CRITICAL)
        PASTE_ATTEMPT:        >= 1  → WARNING_2 immediately (closed-book)
                              >= 3  → WARNING_3 + FLAG (CRITICAL)
        DEVTOOLS_DETECTED:    >= 1  → WARNING_3 + FLAG (CRITICAL) immediately
        SUSPICIOUS_INACTIVITY: >= 1 → WARNING_1 (logged only)

RULES:
    - Events are append-only — never deleted or modified.
    - Warnings are issued at most once per level (no duplicate WARNING_1 etc.).
    - A WARNING_3 always auto-raises a SYSTEM flag.
    - CONFIRMED flags set attempt.is_flagged=True and result.integrity_hold=True.
    - The evaluate_risk() method is called after every event to re-assess thresholds.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, NotFoundError
from app.db.enums import (
    IntegrityEventType,
    IntegrityFlagRaisedBy,
    IntegrityFlagStatus,
    RiskLevel,
    WarningLevel,
)
from app.db.models.integrity import IntegrityEvent, IntegrityFlag, IntegrityWarning
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.integrity_repo import IntegrityRepository
from app.db.repositories.result_repo import ResultRepository

# ---------------------------------------------------------------------------
# THRESHOLD CONFIGURATION
# ---------------------------------------------------------------------------

# (event_type -> {threshold: (warning_level, risk_level, description)})
# Thresholds are counts; the entry fires when count EQUALS the threshold.

THRESHOLDS: dict[str, list] = {
    IntegrityEventType.TAB_SWITCH: [
        (3, WarningLevel.WARNING_1, RiskLevel.LOW,
         "Multiple tab switches detected during your assessment"),
        (5, WarningLevel.WARNING_2, RiskLevel.MEDIUM,
         "Repeated tab switching — your supervisor has been notified"),
        (8, WarningLevel.WARNING_3, RiskLevel.HIGH,
         "Critical: repeated tab switching flagged for supervisor review"),
    ],
    IntegrityEventType.FULLSCREEN_EXIT: [
        (2, WarningLevel.WARNING_1, RiskLevel.LOW,
         "Please return to fullscreen mode"),
        (4, WarningLevel.WARNING_2, RiskLevel.MEDIUM,
         "Repeated fullscreen exits — supervisor notified"),
        (6, WarningLevel.WARNING_3, RiskLevel.HIGH,
         "Critical: repeated fullscreen exit flagged"),
    ],
    IntegrityEventType.COPY_ATTEMPT: [
        (1, WarningLevel.WARNING_1, RiskLevel.LOW,
         "Copy attempt detected — this is a closed-book assessment"),
        (3, WarningLevel.WARNING_2, RiskLevel.MEDIUM,
         "Repeated copy attempts — supervisor notified"),
        (5, WarningLevel.WARNING_3, RiskLevel.CRITICAL,
         "Critical: repeated copy attempts flagged"),
    ],
    IntegrityEventType.PASTE_ATTEMPT: [
        (1, WarningLevel.WARNING_2, RiskLevel.MEDIUM,
         "Paste attempt detected — this is a closed-book assessment"),
        (3, WarningLevel.WARNING_3, RiskLevel.CRITICAL,
         "Critical: repeated paste attempts flagged"),
    ],
    IntegrityEventType.WINDOW_BLUR: [
        (5, WarningLevel.WARNING_1, RiskLevel.LOW,
         "Window switching detected"),
        (10, WarningLevel.WARNING_2, RiskLevel.MEDIUM,
         "Repeated window switching — supervisor notified"),
    ],
    IntegrityEventType.EXTENDED_INACTIVITY: [
        (1, WarningLevel.WARNING_1, RiskLevel.LOW,
         "Extended inactivity detected"),
    ],
}

# Warning messages for students
WARNING_MESSAGES = {
    WarningLevel.WARNING_1: (
        "⚠️  Warning 1/3: Suspicious activity detected. "
        "Please remain focused on your assessment."
    ),
    WarningLevel.WARNING_2: (
        "⚠️  Warning 2/3: Your supervisor has been notified of suspicious activity. "
        "Please remain focused."
    ),
    WarningLevel.WARNING_3: (
        "🚨 Warning 3/3: Your attempt has been flagged for supervisor review "
        "due to repeated integrity violations."
    ),
}


class IntegrityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.integrity_repo = IntegrityRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.result_repo = ResultRepository(db)

    # -----------------------------------------------------------------------
    # RECORD EVENT
    # -----------------------------------------------------------------------

    async def record_event(
        self,
        *,
        attempt_id: uuid.UUID,
        student_id: uuid.UUID,
        access_token: uuid.UUID,
        event_type: str,
        metadata_json: dict | None = None,
    ) -> tuple[IntegrityEvent, IntegrityWarning | None]:
        """
        Record one integrity event and evaluate whether it crosses a threshold.

        Returns (event, warning_issued_or_None).

        Security:
            - access_token is validated against the attempt.
            - Only the student who owns the attempt can submit events.
        """
        attempt = await self.attempt_repo.get_by_access_token(attempt_id, access_token)
        if not attempt:
            raise AuthorizationError("Invalid access token", code="INVALID_ACCESS_TOKEN")
        if attempt.student_id != student_id:
            raise AuthorizationError("Attempt ownership violation", code="ATTEMPT_OWNERSHIP_VIOLATION")

        event = await self.integrity_repo.record_event(
            attempt_id=attempt_id,
            assessment_id=attempt.assessment_id,
            student_id=student_id,
            event_type=event_type,
            metadata_json=metadata_json,
        )

        # Evaluate thresholds and potentially issue a warning
        warning = await self.evaluate_risk(
            attempt_id=attempt_id,
            assessment_id=attempt.assessment_id,
            student_id=student_id,
            event_type=event_type,
            trigger_event_id=event.id,
        )

        return event, warning

    # -----------------------------------------------------------------------
    # EVALUATE RISK
    # -----------------------------------------------------------------------

    async def evaluate_risk(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        event_type: str,
        trigger_event_id: uuid.UUID,
    ) -> IntegrityWarning | None:
        """
        Check event count against thresholds and issue a warning if threshold crossed.

        Each warning level is issued at most once per attempt (idempotent).
        WARNING_3 automatically raises a SYSTEM IntegrityFlag.
        """
        thresholds = THRESHOLDS.get(event_type)
        if not thresholds:
            return None  # No thresholds configured for this event type

        count = await self.integrity_repo.count_event_type(attempt_id, event_type)
        existing_warnings = await self.integrity_repo.list_warnings_for_attempt(attempt_id)
        issued_levels = {w.warning_level for w in existing_warnings}

        warning_to_issue = None
        for threshold, warning_level, risk_level, description in thresholds:
            if count >= threshold and warning_level not in issued_levels:
                warning_to_issue = (warning_level, risk_level, description)

        if not warning_to_issue:
            return None

        warning_level, risk_level, description = warning_to_issue
        return await self.issue_warning(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            warning_level=warning_level,
            risk_level=risk_level,
            trigger_event_id=trigger_event_id,
            auto_raise_flag=(warning_level == WarningLevel.WARNING_3),
            flag_description=description,
        )

    # -----------------------------------------------------------------------
    # ISSUE WARNING
    # -----------------------------------------------------------------------

    async def issue_warning(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        warning_level: str,
        risk_level: str,
        trigger_event_id: uuid.UUID | None = None,
        issued_by_id: uuid.UUID | None = None,
        auto_raise_flag: bool = False,
        flag_description: str | None = None,
    ) -> IntegrityWarning:
        """
        Issue a warning to the student and log it.

        If auto_raise_flag=True (WARNING_3), raises a SYSTEM IntegrityFlag.
        Updates the attempt's cached warning counter.
        """
        message = WARNING_MESSAGES.get(WarningLevel(warning_level), "Warning issued.")

        # If WARNING_3, pre-create the flag to get its ID
        flag_id: uuid.UUID | None = None
        if auto_raise_flag:
            flag = await self.raise_flag(
                attempt_id=attempt_id,
                assessment_id=assessment_id,
                student_id=student_id,
                raised_by=IntegrityFlagRaisedBy.SYSTEM,
                description=flag_description or "Automatic flag: critical warning threshold reached",
                risk_level=risk_level,
                evidence_event_ids=[trigger_event_id] if trigger_event_id else None,
            )
            flag_id = flag.id

        warning = await self.integrity_repo.create_warning(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            warning_level=warning_level,
            message=message,
            issued_by_id=issued_by_id,
            trigger_event_id=trigger_event_id,
            raised_flag_id=flag_id,
        )

        # Increment cached warning counter
        await self.attempt_repo.increment_warning_count(attempt_id)

        return warning

    # -----------------------------------------------------------------------
    # RAISE FLAG
    # -----------------------------------------------------------------------

    async def raise_flag(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        raised_by: str,
        description: str,
        risk_level: str,
        raised_by_id: uuid.UUID | None = None,
        evidence_event_ids: list | None = None,
    ) -> IntegrityFlag:
        """
        Raise an integrity flag on an attempt.

        For SYSTEM flags: called automatically when WARNING_3 threshold is crossed.
        For SUPERVISOR flags: called when a supervisor manually raises a flag.
        """
        flag = await self.integrity_repo.create_flag(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            raised_by=raised_by,
            raised_by_id=raised_by_id,
            description=description,
            risk_level=risk_level,
            evidence_event_ids=evidence_event_ids,
        )
        return flag

    # -----------------------------------------------------------------------
    # RESOLVE FLAG
    # -----------------------------------------------------------------------

    async def resolve_flag(
        self,
        *,
        flag_id: uuid.UUID,
        new_status: str,
        resolved_by_id: uuid.UUID,
        resolution_notes: str,
    ) -> None:
        """
        Resolve an integrity flag to a terminal status.

        Terminal statuses: CONFIRMED | DISMISSED | ESCALATED

        If CONFIRMED:
            - Sets attempt.is_flagged=True
            - Sets result.integrity_hold=True (blocks release)
        If DISMISSED:
            - Re-evaluates: if no other CONFIRMED flags, clears attempt.is_flagged
        """
        flag = await self.integrity_repo.get_flag_by_id(flag_id)
        if not flag:
            raise NotFoundError("Integrity flag not found", code="FLAG_NOT_FOUND")

        terminal = {
            IntegrityFlagStatus.CONFIRMED,
            IntegrityFlagStatus.DISMISSED,
            IntegrityFlagStatus.ESCALATED,
        }
        if IntegrityFlagStatus(flag.status) in terminal:
            from app.core.exceptions import ConflictError
            raise ConflictError(
                f"Flag is already in terminal status: {flag.status}",
                code="FLAG_ALREADY_RESOLVED",
            )

        await self.integrity_repo.resolve_flag(
            flag_id=flag_id,
            status=new_status,
            resolved_by_id=resolved_by_id,
            resolution_notes=resolution_notes,
        )

        if new_status == IntegrityFlagStatus.CONFIRMED:
            # Set attempt.is_flagged=True
            await self.attempt_repo.set_flagged(flag.attempt_id, True)
            # Set integrity_hold on result (if result exists)
            result = await self.result_repo.get_by_attempt(flag.attempt_id)
            if result:
                await self.result_repo.set_integrity_hold(result.id, True)

        elif new_status == IntegrityFlagStatus.DISMISSED:
            # Re-check: any remaining CONFIRMED flags?
            still_flagged = await self.integrity_repo.has_confirmed_flag(flag.attempt_id)
            if not still_flagged:
                await self.attempt_repo.set_flagged(flag.attempt_id, False)

    # -----------------------------------------------------------------------
    # ACKNOWLEDGE WARNING
    # -----------------------------------------------------------------------

    async def acknowledge_warning(
        self,
        *,
        warning_id: uuid.UUID,
        student_id: uuid.UUID,
        access_token: uuid.UUID,
    ) -> None:
        """
        Student clicks "I Understand" on the warning overlay.
        Stamps acknowledged_at on the warning.
        """
        warning = await self.integrity_repo.get_warning_by_id(warning_id)
        if not warning:
            raise NotFoundError("Warning not found", code="WARNING_NOT_FOUND")

        # Validate ownership via access token
        attempt = await self.attempt_repo.get_by_access_token(
            warning.attempt_id, access_token
        )
        if not attempt or attempt.student_id != student_id:
            raise AuthorizationError("Invalid access token", code="INVALID_ACCESS_TOKEN")

        await self.integrity_repo.acknowledge_warning(warning_id)

    # -----------------------------------------------------------------------
    # GET FULL REPORT
    # -----------------------------------------------------------------------

    async def get_attempt_integrity_report(
        self,
        attempt_id: uuid.UUID,
    ) -> dict:
        """
        Compile the full integrity picture for one attempt.
        Used by the supervisor panel.
        """
        attempt = await self.attempt_repo.get_by_id_simple(attempt_id)
        if not attempt:
            raise NotFoundError("Attempt not found", code="ATTEMPT_NOT_FOUND")

        events = await self.integrity_repo.list_events_for_attempt(attempt_id)
        flags = await self.integrity_repo.list_flags_for_attempt(attempt_id)
        warnings = await self.integrity_repo.list_warnings_for_attempt(attempt_id)
        event_counts = await self.integrity_repo.count_events_by_type(attempt_id)

        return {
            "attempt_id": attempt_id,
            "student_id": attempt.student_id,
            "is_flagged": attempt.is_flagged,
            "total_warnings": attempt.total_integrity_warnings,
            "event_counts": event_counts,
            "events": events,
            "flags": flags,
            "warnings": warnings,
        }

    # -----------------------------------------------------------------------
    # SUPERVISION SESSION
    # -----------------------------------------------------------------------

    async def start_supervision_session(
        self,
        *,
        assessment_id: uuid.UUID,
        supervisor_id: uuid.UUID,
    ) -> None:
        """Open a supervision session for a lecturer joining the live panel."""
        # End any existing active session first (reconnect handling)
        existing = await self.integrity_repo.get_active_session(assessment_id, supervisor_id)
        if existing:
            await self.integrity_repo.end_session(existing.id)
        await self.integrity_repo.create_session(
            assessment_id=assessment_id,
            supervisor_id=supervisor_id,
        )

    async def end_supervision_session(
        self,
        *,
        assessment_id: uuid.UUID,
        supervisor_id: uuid.UUID,
    ) -> None:
        """Close the supervisor's live monitoring session."""
        session = await self.integrity_repo.get_active_session(assessment_id, supervisor_id)
        if session:
            await self.integrity_repo.end_session(session.id)

    async def get_supervision_stats(self, assessment_id: uuid.UUID) -> dict:
        """Fetch aggregated stats for live supervision panel."""
        return await self.integrity_repo.get_supervision_stats(assessment_id)
