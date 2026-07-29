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

    async def create_session(self, session: StudySession) -> StudySession:
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
        self, student_id: uuid.UUID, start_of_day: datetime, end_of_day: datetime
    ) -> List[StudySession]:
        stmt = (
            select(StudySession)
            .where(
                StudySession.student_id == student_id,
                StudySession.scheduled_start >= start_of_day,
                StudySession.scheduled_start <= end_of_day,
                StudySession.is_deleted == False,
            )
            .order_by(StudySession.scheduled_start.asc())
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())
