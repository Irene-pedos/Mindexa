from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import List, Optional, Tuple

from sqlalchemy import func, select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.study_plan import StudyPlan, StudySession


class StudyPlannerRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_plan(self, plan: StudyPlan) -> StudyPlan:
        self.db.add(plan)
        await self.db.flush()
        return plan

    async def update_plan(self, plan: StudyPlan) -> StudyPlan:
        """Update an existing study plan record."""
        self.db.add(plan)
        await self.db.flush()
        return plan

    async def create_session(self, session: StudySession) -> StudySession:
        self.db.add(session)
        await self.db.flush()
        return session

    async def update_session(self, session: StudySession) -> StudySession:
        """Update an existing study session record."""
        self.db.add(session)
        await self.db.flush()
        return session

    async def get_plan_by_id(
        self, plan_id: uuid.UUID, student_id: uuid.UUID
    ) -> Optional[StudyPlan]:
        stmt = (
            select(StudyPlan)
            .where(
                StudyPlan.id == plan_id,
                StudyPlan.student_id == student_id,
                StudyPlan.is_deleted == False,
            )
            .options(selectinload(StudyPlan.sessions))
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def list_plans_for_student(
        self, student_id: uuid.UUID, status: Optional[str] = None
    ) -> List[StudyPlan]:
        filters = [
            StudyPlan.student_id == student_id,
            StudyPlan.is_deleted == False,
        ]
        if status:
            filters.append(StudyPlan.status == status)

        stmt = (
            select(StudyPlan)
            .where(and_(*filters))
            .order_by(StudyPlan.created_at.desc())
            .options(selectinload(StudyPlan.sessions))
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def get_session_by_id(
        self, session_id: uuid.UUID, student_id: uuid.UUID
    ) -> Optional[StudySession]:
        stmt = select(StudySession).where(
            StudySession.id == session_id,
            StudySession.student_id == student_id,
            StudySession.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def list_upcoming_sessions_for_student(
        self, student_id: uuid.UUID
    ) -> List[StudySession]:
        stmt = (
            select(StudySession)
            .where(
                StudySession.student_id == student_id,
                StudySession.status.in_(["SCHEDULED", "RESCHEDULED"]),
                StudySession.is_deleted == False,
            )
            .order_by(StudySession.scheduled_start.asc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def list_today_sessions_for_student(
        self,
        student_id: uuid.UUID,
        start_of_day: datetime,
        end_of_day: datetime,
        exclude_cancelled: bool = True,
        exclude_completed: bool = True,
        active_only: bool = False,
    ) -> List[StudySession]:
        """
        List sessions scheduled for today for a given student.
        Excludes soft-deleted, COMPLETED, and CANCELLED sessions by default.
        If active_only=True, only includes pending/scheduled sessions.
        """
        filters = [
            StudySession.student_id == student_id,
            StudySession.scheduled_start >= start_of_day,
            StudySession.scheduled_start <= end_of_day,
            StudySession.is_deleted == False,
        ]
        if exclude_cancelled:
            filters.append(StudySession.status != "CANCELLED")
        if exclude_completed:
            filters.append(StudySession.status != "COMPLETED")
        if active_only:
            filters.append(StudySession.status.in_(["SCHEDULED", "RESCHEDULED"]))

        stmt = (
            select(StudySession)
            .where(and_(*filters))
            .order_by(StudySession.scheduled_start.asc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def update_session_lesson(
        self, session_id: uuid.UUID, **fields
    ) -> Optional[StudySession]:
        """Update lesson fields for a study session."""
        stmt = select(StudySession).where(StudySession.id == session_id, StudySession.is_deleted == False)
        res = await self.db.execute(stmt)
        session = res.scalar_one_or_none()
        if session:
            for key, val in fields.items():
                if hasattr(session, key):
                    setattr(session, key, val)
            self.db.add(session)
            await self.db.flush()
        return session

    async def update_session_knowledge_check(
        self,
        session_id: uuid.UUID,
        answers: dict,
        score: float,
        report: dict,
    ) -> Optional[StudySession]:
        """Update knowledge check evaluation results for a study session."""
        stmt = select(StudySession).where(StudySession.id == session_id, StudySession.is_deleted == False)
        res = await self.db.execute(stmt)
        session = res.scalar_one_or_none()
        if session:
            session.knowledge_check_answers = answers
            session.knowledge_check_score = score
            session.knowledge_check_report = report
            self.db.add(session)
            await self.db.flush()
        return session

    async def get_or_create_learning_profile(
        self, student_id: uuid.UUID, course_id: Optional[uuid.UUID] = None
    ) -> Any:
        """Get or create per-course or platform-wide StudentLearningProfile."""
        from app.db.models.learning_profile import StudentLearningProfile

        stmt = select(StudentLearningProfile).where(
            StudentLearningProfile.student_id == student_id,
            StudentLearningProfile.course_id == course_id,
            StudentLearningProfile.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        profile = res.scalar_one_or_none()
        if not profile:
            profile = StudentLearningProfile(
                student_id=student_id,
                course_id=course_id,
                topic_confidence={},
                weak_topics=[],
                total_sessions_completed=0,
                average_knowledge_check_score=None,
                current_streak_days=0,
            )
            self.db.add(profile)
            await self.db.flush()
        return profile

    async def update_learning_profile(
        self, profile_id: uuid.UUID, **fields
    ) -> Any:
        """Update fields on a StudentLearningProfile."""
        from app.db.models.learning_profile import StudentLearningProfile

        stmt = select(StudentLearningProfile).where(
            StudentLearningProfile.id == profile_id,
            StudentLearningProfile.is_deleted == False,
        )
        res = await self.db.execute(stmt)
        profile = res.scalar_one_or_none()
        if profile:
            for key, val in fields.items():
                if hasattr(profile, key):
                    setattr(profile, key, val)
            self.db.add(profile)
            await self.db.flush()
        return profile
