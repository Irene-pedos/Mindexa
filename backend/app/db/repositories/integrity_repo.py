"""
app/db/repositories/integrity_repo.py

Data access for IntegrityEvent, IntegrityFlag, IntegrityWarning, SupervisionSession.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import IntegrityFlagStatus, SupervisionSessionStatus
from app.db.models.integrity import (
    IntegrityEvent,
    IntegrityFlag,
    IntegrityWarning,
    SupervisionSession,
)
from app.db.models.auth import User, UserProfile
from app.db.models.attempt import AssessmentAttempt
from app.db.enums import AttemptStatus


def _utcnow() -> datetime:
    return datetime.now(UTC)


class IntegrityRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # IntegrityEvent — append-only
    # -----------------------------------------------------------------------

    async def record_event(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        event_type: str,
        metadata_json: dict | None = None,
    ) -> IntegrityEvent:
        event = IntegrityEvent(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            event_type=event_type,
            metadata_json=metadata_json,
        )
        self.db.add(event)
        await self.db.flush()
        return event

    async def list_events_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[IntegrityEvent]:
        result = await self.db.execute(
            select(IntegrityEvent)
            .where(IntegrityEvent.attempt_id == attempt_id)
            .order_by(IntegrityEvent.created_at.asc())
        )
        return list(result.scalars().all())

    async def count_events_by_type(
        self, attempt_id: uuid.UUID
    ) -> dict[str, int]:
        """Return {event_type: count} dict for an attempt. Used in risk evaluation."""
        result = await self.db.execute(
            select(IntegrityEvent.event_type, func.count(IntegrityEvent.id))
            .where(IntegrityEvent.attempt_id == attempt_id)
            .group_by(IntegrityEvent.event_type)
        )
        return {row[0]: row[1] for row in result.all()}

    async def count_event_type(
        self, attempt_id: uuid.UUID, event_type: str
    ) -> int:
        result = await self.db.execute(
            select(func.count(IntegrityEvent.id)).where(
                IntegrityEvent.attempt_id == attempt_id,
                IntegrityEvent.event_type == event_type,
            )
        )
        return result.scalar_one()

    async def list_events_for_assessment(
        self, assessment_id: uuid.UUID, page: int = 1, page_size: int = 100
    ) -> tuple[list[dict], int]:
        """Supervisor live feed — all events across all attempts for an assessment with student names."""
        count_result = await self.db.execute(
            select(func.count(IntegrityEvent.id)).where(
                IntegrityEvent.assessment_id == assessment_id
            )
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(
                IntegrityEvent,
                UserProfile.first_name,
                UserProfile.last_name
            )
            .join(User, User.id == IntegrityEvent.student_id)
            .join(UserProfile, UserProfile.user_id == User.id)
            .where(IntegrityEvent.assessment_id == assessment_id)
            .order_by(IntegrityEvent.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        
        events = []
        for row in result.all():
            event = row[0]
            first_name = row[1] or ""
            last_name = row[2] or ""
            
            # Determine severity based on event type
            severity = "low"
            risk_score = 10
            if event.event_type in ["DEVTOOLS_DETECTED", "SUSPICIOUS_DEVICE"]:
                severity = "high"
                risk_score = 80
            elif event.event_type in ["COPY_ATTEMPT", "FULLSCREEN_EXIT", "TAB_SWITCH"]:
                # Actually these depend on count, but for the feed we'll mark as medium
                severity = "medium"
                risk_score = 40

            # Convert to dict and add student_name
            event_dict = {
                "id": event.id,
                "attempt_id": event.attempt_id,
                "assessment_id": event.assessment_id,
                "student_id": event.student_id,
                "event_type": event.event_type,
                "metadata_json": event.metadata_json,
                "created_at": event.created_at,
                "student_name": f"{first_name} {last_name}".strip() or "Unknown Student",
                "severity": severity,
                "risk_score": risk_score
            }
            events.append(event_dict)

        return events, total

    async def get_supervision_stats(self, assessment_id: uuid.UUID) -> dict:
        """Fetch aggregated stats for live supervision."""
        # Online Count: Attempts that are currently ACTIVE
        online_result = await self.db.execute(
            select(func.count(AssessmentAttempt.id))
            .where(
                AssessmentAttempt.assessment_id == assessment_id,
                AssessmentAttempt.status == AttemptStatus.ACTIVE
            )
        )
        online_count = online_result.scalar_one()

        # Warning Count: Sum of total_integrity_warnings across all attempts for this assessment
        warning_result = await self.db.execute(
            select(func.sum(AssessmentAttempt.total_integrity_warnings))
            .where(AssessmentAttempt.assessment_id == assessment_id)
        )
        warning_count = warning_result.scalar() or 0

        # High Risk Count: Attempts with risk score > 70 or is_flagged
        high_risk_result = await self.db.execute(
            select(func.count(AssessmentAttempt.id))
            .where(
                AssessmentAttempt.assessment_id == assessment_id,
                (AssessmentAttempt.integrity_risk_score > 70) | (AssessmentAttempt.is_flagged == True)
            )
        )
        high_risk_count = high_risk_result.scalar_one()

        return {
            "online_count": online_count,
            "warning_count": int(warning_count),
            "high_risk_count": high_risk_count,
        }

    # -----------------------------------------------------------------------
    # IntegrityFlag — CRUD
    # -----------------------------------------------------------------------

    async def create_flag(
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
        flag = IntegrityFlag(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            raised_by=raised_by,
            raised_by_id=raised_by_id,
            description=description,
            risk_level=risk_level,
            status=IntegrityFlagStatus.OPEN,
            evidence_event_ids=evidence_event_ids,
        )
        self.db.add(flag)
        await self.db.flush()
        return flag

    async def get_flag_by_id(self, flag_id: uuid.UUID) -> IntegrityFlag | None:
        result = await self.db.execute(
            select(IntegrityFlag).where(
                IntegrityFlag.id == flag_id,
                IntegrityFlag.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_flags_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[IntegrityFlag]:
        result = await self.db.execute(
            select(IntegrityFlag)
            .where(
                IntegrityFlag.attempt_id == attempt_id,
                IntegrityFlag.is_deleted == False,  # noqa: E712
            )
            .order_by(IntegrityFlag.created_at.asc())
        )
        return list(result.scalars().all())

    async def list_open_flags_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[IntegrityFlag]:
        result = await self.db.execute(
            select(IntegrityFlag).where(
                IntegrityFlag.attempt_id == attempt_id,
                IntegrityFlag.status == IntegrityFlagStatus.OPEN,
                IntegrityFlag.is_deleted == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def has_confirmed_flag(self, attempt_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(IntegrityFlag.id).where(
                IntegrityFlag.attempt_id == attempt_id,
                IntegrityFlag.status == IntegrityFlagStatus.CONFIRMED,
                IntegrityFlag.is_deleted == False,  # noqa: E712
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def resolve_flag(
        self,
        flag_id: uuid.UUID,
        status: str,
        resolved_by_id: uuid.UUID,
        resolution_notes: str,
    ) -> None:
        await self.db.execute(
            update(IntegrityFlag)
            .where(IntegrityFlag.id == flag_id)
            .values(
                status=status,
                resolved_by_id=resolved_by_id,
                resolved_at=_utcnow(),
                resolution_notes=resolution_notes,
            )
        )

    async def list_flags_for_assessment(
        self,
        assessment_id: uuid.UUID,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[IntegrityFlag], int]:
        filters = [
            IntegrityFlag.assessment_id == assessment_id,
            IntegrityFlag.is_deleted == False,  # noqa: E712
        ]
        if status:
            filters.append(IntegrityFlag.status == status)

        count_result = await self.db.execute(
            select(func.count(IntegrityFlag.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(IntegrityFlag)
            .where(*filters)
            .order_by(IntegrityFlag.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def list_all_flags(
        self,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict], int]:
        from app.db.models.auth import User, UserProfile
        from app.db.models.assessment import Assessment

        filters = [
            IntegrityFlag.is_deleted == False,  # noqa: E712
        ]
        if status:
            filters.append(IntegrityFlag.status == status)

        count_result = await self.db.execute(
            select(func.count(IntegrityFlag.id)).where(*filters)
        )
        total = count_result.scalar_one()

        stmt = (
            select(IntegrityFlag, UserProfile.first_name, UserProfile.last_name, Assessment.title)
            .join(User, User.id == IntegrityFlag.student_id)
            .join(UserProfile, UserProfile.user_id == User.id)
            .join(Assessment, Assessment.id == IntegrityFlag.assessment_id)
            .where(*filters)
            .order_by(IntegrityFlag.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        flags = []
        for flag, fn, ln, title in rows:
            # We convert to dict for the router to handle or model_validate
            d = flag.model_dump()
            d["student_name"] = f"{fn} {ln}"
            d["assessment_name"] = title
            flags.append(d)

        return flags, total


    # -----------------------------------------------------------------------
    # IntegrityWarning — CRUD
    # -----------------------------------------------------------------------

    async def create_warning(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        warning_level: str,
        message: str,
        issued_by_id: uuid.UUID | None = None,
        trigger_event_id: uuid.UUID | None = None,
        raised_flag_id: uuid.UUID | None = None,
    ) -> IntegrityWarning:
        warning = IntegrityWarning(
            attempt_id=attempt_id,
            assessment_id=assessment_id,
            student_id=student_id,
            warning_level=warning_level,
            message=message,
            issued_by_id=issued_by_id,
            issued_at=_utcnow(),
            trigger_event_id=trigger_event_id,
            raised_flag_id=raised_flag_id,
        )
        self.db.add(warning)
        await self.db.flush()
        return warning

    async def get_warning_by_id(
        self, warning_id: uuid.UUID
    ) -> IntegrityWarning | None:
        result = await self.db.execute(
            select(IntegrityWarning).where(
                IntegrityWarning.id == warning_id,
                IntegrityWarning.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def acknowledge_warning(self, warning_id: uuid.UUID) -> None:
        await self.db.execute(
            update(IntegrityWarning)
            .where(IntegrityWarning.id == warning_id)
            .values(acknowledged_at=_utcnow())
        )

    async def count_warnings_for_attempt(self, attempt_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(IntegrityWarning.id)).where(
                IntegrityWarning.attempt_id == attempt_id,
                IntegrityWarning.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one()

    async def list_warnings_for_attempt(
        self, attempt_id: uuid.UUID
    ) -> list[IntegrityWarning]:
        result = await self.db.execute(
            select(IntegrityWarning)
            .where(
                IntegrityWarning.attempt_id == attempt_id,
                IntegrityWarning.is_deleted == False,  # noqa: E712
            )
            .order_by(IntegrityWarning.issued_at.asc())
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # SupervisionSession — CRUD
    # -----------------------------------------------------------------------

    async def create_session(
        self,
        *,
        assessment_id: uuid.UUID,
        supervisor_id: uuid.UUID,
    ) -> SupervisionSession:
        session = SupervisionSession(
            assessment_id=assessment_id,
            supervisor_id=supervisor_id,
            status=SupervisionSessionStatus.ACTIVE,
            started_at=_utcnow(),
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def end_session(self, session_id: uuid.UUID) -> None:
        await self.db.execute(
            update(SupervisionSession)
            .where(SupervisionSession.id == session_id)
            .values(status=SupervisionSessionStatus.ENDED, ended_at=_utcnow())
        )

    async def get_active_session(
        self, assessment_id: uuid.UUID, supervisor_id: uuid.UUID
    ) -> SupervisionSession | None:
        result = await self.db.execute(
            select(SupervisionSession).where(
                SupervisionSession.assessment_id == assessment_id,
                SupervisionSession.supervisor_id == supervisor_id,
                SupervisionSession.status == SupervisionSessionStatus.ACTIVE,
                SupervisionSession.is_deleted == False,  # noqa: E712
            ).limit(1)
        )
        return result.scalar_one_or_none()

    async def list_sessions_for_assessment(
        self, assessment_id: uuid.UUID
    ) -> list[SupervisionSession]:
        result = await self.db.execute(
            select(SupervisionSession).where(
                SupervisionSession.assessment_id == assessment_id,
                SupervisionSession.is_deleted == False,  # noqa: E712
            ).order_by(SupervisionSession.started_at.desc())
        )
        return list(result.scalars().all())

    async def get_attempt_integrity_report(self, attempt_id: uuid.UUID) -> dict:
        """
        Builds a comprehensive integrity report for a single attempt.
        """
        # 1. Fetch the attempt to get student and assessment links
        from app.db.models.attempt import AssessmentAttempt
        res = await self.db.execute(select(AssessmentAttempt).where(AssessmentAttempt.id == attempt_id))
        attempt = res.scalar_one_or_none()
        if not attempt:
            return None # Service handles this

        # 2. Fetch events, flags, warnings
        events = await self.list_events_for_attempt(attempt_id)
        flags = await self.list_flags_for_attempt(attempt_id)
        warnings = await self.list_warnings_for_attempt(attempt_id)

        # 3. Aggregate event counts
        event_counts = {}
        for e in events:
            etype = e.event_type
            event_counts[etype] = event_counts.get(etype, 0) + 1

        return {
            "attempt_id": attempt_id,
            "student_id": attempt.student_id,
            "assessment_id": attempt.assessment_id,
            "is_flagged": len(flags) > 0,
            "total_warnings": len(warnings),
            "event_counts": event_counts,
            "events": events,
            "flags": flags,
            "warnings": warnings
        }
