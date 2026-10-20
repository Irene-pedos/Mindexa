"""
app/db/repositories/attempt_repo.py

Data access for AssessmentAttempt.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update, and_, or_, exists
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.enums import AttemptStatus, GradingMode
from app.db.models.attempt import AssessmentAttempt, AttemptSectionSelection


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AttemptRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -----------------------------------------------------------------------
    # CREATE
    # -----------------------------------------------------------------------

    async def create(
        self,
        *,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        attempt_number: int,
        grading_mode: GradingMode,
        expires_at: datetime,
        access_token: uuid.UUID,
        group_id: uuid.UUID | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AssessmentAttempt:
        attempt = AssessmentAttempt(
            assessment_id=assessment_id,
            student_id=student_id,
            attempt_number=attempt_number,
            grading_mode=grading_mode,
            group_id=group_id,
            status=AttemptStatus.IN_PROGRESS,
            started_at=_utcnow(),
            expires_at=expires_at,
            last_activity_at=_utcnow(),
            access_token=access_token,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(attempt)
        await self.db.flush()
        return attempt

    # -----------------------------------------------------------------------
    # READS
    # -----------------------------------------------------------------------

    async def get_by_id_simple(self, attempt_id: uuid.UUID) -> AssessmentAttempt | None:
        """Lightweight fetch: no relationships loaded."""
        result = await self.db.execute(
            select(AssessmentAttempt).where(
                AssessmentAttempt.id == attempt_id,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, attempt_id: uuid.UUID) -> AssessmentAttempt | None:
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(AssessmentAttempt)
            .options(
                selectinload(AssessmentAttempt.assessment),
                selectinload(AssessmentAttempt.responses),
                selectinload(AssessmentAttempt.integrity_flags),
                selectinload(AssessmentAttempt.integrity_warnings),
            )
            .where(
                AssessmentAttempt.id == attempt_id,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_with_questions(self, attempt_id: uuid.UUID) -> AssessmentAttempt | None:
        from app.db.models.assessment import Assessment
        from app.db.models.question import AssessmentQuestion, Question, QuestionOption
        result = await self.db.execute(
            select(AssessmentAttempt)
            .options(
                selectinload(AssessmentAttempt.assessment)
                .selectinload(Assessment.assessment_questions)
                .selectinload(AssessmentQuestion.question)
                .selectinload(Question.options),
                selectinload(AssessmentAttempt.assessment)
                .selectinload(Assessment.sections)
            )
            .where(
                AssessmentAttempt.id == attempt_id,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_student_and_assessment(
        self, student_id: uuid.UUID, assessment_id: uuid.UUID
    ) -> AssessmentAttempt | None:
        """Return the latest attempt for a student on an assessment."""
        result = await self.db.execute(
            select(AssessmentAttempt)
            .where(
                AssessmentAttempt.student_id == student_id,
                AssessmentAttempt.assessment_id == assessment_id,
                AssessmentAttempt.is_deleted.is_(False),
            )
            .order_by(AssessmentAttempt.created_at.desc())
        )
        return result.scalars().first()

    async def get_active_attempt(
        self, student_id: uuid.UUID, assessment_id: uuid.UUID
    ) -> AssessmentAttempt | None:
        """Return the single IN_PROGRESS or PAUSED attempt for a student on an assessment."""
        result = await self.db.execute(
            select(AssessmentAttempt).where(
                AssessmentAttempt.student_id == student_id,
                AssessmentAttempt.assessment_id == assessment_id,
                AssessmentAttempt.status.in_([
                    AttemptStatus.IN_PROGRESS,
                    AttemptStatus.PAUSED,
                ]),
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_access_token(
        self, attempt_id: uuid.UUID, access_token: uuid.UUID
    ) -> AssessmentAttempt | None:
        """Validate the access_token for a specific attempt."""
        result = await self.db.execute(
            select(AssessmentAttempt)
            .options(selectinload(AssessmentAttempt.assessment))
            .where(
                AssessmentAttempt.id == attempt_id,
                AssessmentAttempt.access_token == access_token,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def count_attempts_by_student(
        self, student_id: uuid.UUID, assessment_id: uuid.UUID
    ) -> int:
        """Count all non-deleted attempts for a student on an assessment."""
        result = await self.db.execute(
            select(func.count(AssessmentAttempt.id)).where(
                AssessmentAttempt.student_id == student_id,
                AssessmentAttempt.assessment_id == assessment_id,
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return result.scalar_one()

    async def list_by_student(
        self,
        student_id: uuid.UUID,
        status: str | None = None,
        assessment_id: uuid.UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AssessmentAttempt], int]:
        filters = [
            AssessmentAttempt.student_id == student_id,
            AssessmentAttempt.is_deleted.is_(False),
        ]
        if status:
            filters.append(AssessmentAttempt.status == status)
        if assessment_id:
            filters.append(AssessmentAttempt.assessment_id == assessment_id)

        count_result = await self.db.execute(
            select(func.count(AssessmentAttempt.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(AssessmentAttempt)
            .where(*filters)
            .order_by(AssessmentAttempt.started_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def list_by_assessment(
        self,
        assessment_id: uuid.UUID,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[AssessmentAttempt], int]:
        """Supervisor view: all attempts on an assessment."""
        filters = [
            AssessmentAttempt.assessment_id == assessment_id,
            AssessmentAttempt.is_deleted.is_(False),
        ]
        if status:
            filters.append(AssessmentAttempt.status == status)

        count_result = await self.db.execute(
            select(func.count(AssessmentAttempt.id)).where(*filters)
        )
        total = count_result.scalar_one()

        result = await self.db.execute(
            select(AssessmentAttempt)
            .where(*filters)
            .order_by(AssessmentAttempt.started_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def list_expired_in_progress(self) -> list[AssessmentAttempt]:
        """Return all IN_PROGRESS and PAUSED attempts where expires_at < now or window has closed. Used by auto-submit task."""
        from app.db.models.assessment import Assessment
        now = _utcnow()
        result = await self.db.execute(
            select(AssessmentAttempt)
            .outerjoin(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
            .where(
                AssessmentAttempt.status.in_([AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED]),
                or_(
                    AssessmentAttempt.expires_at < now,
                    and_(
                        Assessment.window_end.is_not(None),
                        Assessment.window_end < now,
                        Assessment.late_submission_allowed.is_(False),
                    ),
                ),
                AssessmentAttempt.is_deleted.is_(False),
            )
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # UPDATES
    # -----------------------------------------------------------------------

    async def update_fields(self, attempt_id: uuid.UUID, **fields) -> None:
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(**fields)
        )

    async def touch_activity(self, attempt_id: uuid.UUID) -> None:
        """Stamp last_activity_at=now. Called on every answer save."""
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(last_activity_at=_utcnow())
        )

    async def set_status(self, attempt_id: uuid.UUID, status: AttemptStatus) -> None:
        values: dict = {"status": status}
        if status in (AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED):
            values["submitted_at"] = _utcnow()
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(**values)
        )

    async def set_total_score(self, attempt_id: uuid.UUID, score: float) -> None:
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(total_score=score)
        )

    async def increment_warning_count(self, attempt_id: uuid.UUID) -> None:
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(
                total_integrity_warnings=AssessmentAttempt.total_integrity_warnings + 1
            )
        )

    async def set_flagged(self, attempt_id: uuid.UUID, flagged: bool) -> None:
        await self.db.execute(
            update(AssessmentAttempt)
            .where(AssessmentAttempt.id == attempt_id)
            .values(is_flagged=flagged)
        )

    async def list_recent_submissions_by_lecturer(
        self, lecturer_id: uuid.UUID, limit: int = 10
    ) -> list[AssessmentAttempt]:
        """
        Return the most recent SUBMITTED or AUTO_SUBMITTED attempts 
        for all assessments created by this lecturer.
        """
        from app.db.models.assessment import Assessment
        from app.db.models.auth import User

        result = await self.db.execute(
            select(AssessmentAttempt)
            .join(Assessment, Assessment.id == AssessmentAttempt.assessment_id)
            .options(
                selectinload(AssessmentAttempt.assessment),
                selectinload(AssessmentAttempt.student).selectinload(User.profile)
            )
            .where(
                Assessment.created_by_id == lecturer_id,
                AssessmentAttempt.status.in_([
                    AttemptStatus.SUBMITTED,
                    AttemptStatus.AUTO_SUBMITTED
                ]),
                AssessmentAttempt.is_deleted.is_(False)
            )
            .order_by(AssessmentAttempt.submitted_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # AttemptSectionSelection (Phase 2 Choice Sections)
    # -----------------------------------------------------------------------

    async def get_selection(
        self, attempt_id: uuid.UUID, question_id: uuid.UUID
    ) -> AttemptSectionSelection | None:
        from app.db.models.attempt import AttemptSectionSelection

        result = await self.db.execute(
            select(AttemptSectionSelection).where(
                AttemptSectionSelection.attempt_id == attempt_id,
                AttemptSectionSelection.question_id == question_id,
                AttemptSectionSelection.is_deleted.is_(False),
            )
        )
        return result.scalar_one_or_none()

    async def list_selections_for_attempt(
        self, attempt_id: uuid.UUID, section_id: uuid.UUID | None = None
    ) -> list[AttemptSectionSelection]:
        from app.db.models.attempt import AttemptSectionSelection

        q = select(AttemptSectionSelection).where(
            AttemptSectionSelection.attempt_id == attempt_id,
            AttemptSectionSelection.is_deleted.is_(False),
        )
        if section_id is not None:
            q = q.where(AttemptSectionSelection.assessment_section_id == section_id)
        q = q.order_by(AttemptSectionSelection.selected_order.asc())
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def count_selections_for_section(
        self, attempt_id: uuid.UUID, section_id: uuid.UUID
    ) -> int:
        from app.db.models.attempt import AttemptSectionSelection

        result = await self.db.execute(
            select(func.count(AttemptSectionSelection.id)).where(
                AttemptSectionSelection.attempt_id == attempt_id,
                AttemptSectionSelection.assessment_section_id == section_id,
                AttemptSectionSelection.is_deleted.is_(False),
            )
        )
        return result.scalar() or 0

    async def create_selection(
        self,
        *,
        attempt_id: uuid.UUID,
        assessment_section_id: uuid.UUID,
        question_id: uuid.UUID,
        selected_order: int,
    ) -> AttemptSectionSelection:
        from app.db.models.attempt import AttemptSectionSelection

        selection = AttemptSectionSelection(
            attempt_id=attempt_id,
            assessment_section_id=assessment_section_id,
            question_id=question_id,
            selected_order=selected_order,
        )
        self.db.add(selection)
        await self.db.flush()
        return selection

    async def delete_selection(
        self, attempt_id: uuid.UUID, question_id: uuid.UUID
    ) -> bool:
        from app.db.models.attempt import AttemptSectionSelection

        selection = await self.get_selection(attempt_id, question_id)
        if not selection:
            return False
        await self.db.delete(selection)
        await self.db.flush()
        return True

