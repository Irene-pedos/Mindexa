from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger

logger = get_logger(__name__)

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.models.academic import TeachingWorkspace
from app.db.models.resource import LecturerMaterial
from app.db.models.study_plan import DEFAULT_INITIAL_READINESS_SCORE, StudyPlan, StudySession
from app.schemas.study_planner import (
    MaterialCoverageItem,
    ReadinessTimelinePoint,
    StudyPlannerDashboardSummary,
    StudyPlanResponse,
    StudySessionResponse,
)
from app.services.study_planner.base import PlannerBase
from app.services.study_planner.common import _ensure_utc, _wall_clock_utc


class ProgressMixin(PlannerBase):
    async def get_summary(self, student_id: uuid.UUID) -> StudyPlannerDashboardSummary:
        """Aggregate overview metrics, Readiness timeline, Material coverage, and Conflict warnings."""
        plans = await self.repo.list_plans_for_student(student_id)
        active_plan = next((p for p in plans if p.status == "ACTIVE"), None)

        now = datetime.now(UTC)
        # "Today" is the student's local day, not the UTC day (which starts 2h late in Rwanda).
        local_midnight_utc = _wall_clock_utc(now + timedelta(minutes=settings.STUDY_PLANNER_UTC_OFFSET_MINUTES), 0, 0)
        start_of_day = local_midnight_utc
        end_of_day = local_midnight_utc + timedelta(days=1) - timedelta(microseconds=1)

        all_sessions = []
        for p in plans:
            if p.sessions:
                all_sessions.extend(p.sessions)

        completed_sessions = [s for s in all_sessions if s.status == "COMPLETED" and not s.is_deleted]

        # Calculate active plan completed and total count for accurate dashboard progress
        if active_plan and active_plan.sessions:
            active_plan_sessions = [s for s in active_plan.sessions if not s.is_deleted]
            completed_count = len([s for s in active_plan_sessions if s.status == "COMPLETED"])
            total_count = len(active_plan_sessions)
        else:
            completed_count = len(completed_sessions)
            total_count = len(all_sessions)

        start_of_week = start_of_day - timedelta(days=start_of_day.weekday())
        completed_this_week = [
            s for s in completed_sessions
            if s.completed_at and s.completed_at >= start_of_week
        ]
        hours_studied = sum(s.duration_minutes for s in completed_this_week) / 60.0

        # Issue M6: Weekly Study Habits Heatmap computed from actual completed sessions
        weekly_activity = [False] * 7
        for s in completed_this_week:
            if s.completed_at:
                weekly_activity[s.completed_at.weekday()] = True

        # Use repo.list_today_sessions_for_student and sort by scheduled_start ascending for deterministic selection
        try:
            today_sessions_list = await self.repo.list_today_sessions_for_student(
                student_id=student_id,
                start_of_day=start_of_day,
                end_of_day=end_of_day,
                exclude_cancelled=True,
                exclude_completed=False,
            )
            today_sessions_list.sort(key=lambda s: s.scheduled_start)
            today_session = today_sessions_list[0] if today_sessions_list else None
        except Exception:
            today_session = None

        if not today_session:
            today_fallback = sorted(
                [s for s in all_sessions if start_of_day <= s.scheduled_start <= end_of_day and s.status in ["SCHEDULED", "RESCHEDULED", "COMPLETED"] and not s.is_deleted],
                key=lambda s: s.scheduled_start
            )
            today_session = today_fallback[0] if today_fallback else None
        upcoming_sessions = sorted(
            [s for s in all_sessions if s.scheduled_start > now and s.status in ["SCHEDULED", "RESCHEDULED"] and not s.is_deleted],
            key=lambda x: x.scheduled_start
        )
        next_upcoming = upcoming_sessions[0] if upcoming_sessions else None

        # Assessment Readiness Score & Timeline
        readiness_score = DEFAULT_INITIAL_READINESS_SCORE
        readiness_timeline: List[ReadinessTimelinePoint] = []
        weak_topics: List[str] = []

        if active_plan:
            readiness_score = active_plan.readiness_score
            if active_plan.readiness_history:
                readiness_timeline = [
                    ReadinessTimelinePoint(label=item.get("label", "Point"), score=item.get("score", 0))
                    for item in active_plan.readiness_history
                ]

        if not readiness_timeline:
            readiness_timeline = [
                ReadinessTimelinePoint(label="Initial", score=readiness_score),
            ]

        if completed_count > 0:
            for s in completed_sessions:
                if s.understanding_level in ["PARTIAL", "NO", "LOW"] and s.topic not in weak_topics:
                    weak_topics.append(s.topic)

        # Proactive Assessment Suggestions - strictly exclude ended or already submitted assessments
        planned_assessment_ids = {p.assessment_id for p in plans if p.assessment_id}
        from app.db.models.attempt import AssessmentAttempt
        from app.db.repositories.assessment_repo import AssessmentRepository
        ass_repo = AssessmentRepository(self.db)
        available_assessments, _ = await ass_repo.list_available_for_student(student_id=student_id, page_size=20)

        # Query attempted assessment IDs for this student
        sub_stmt = select(AssessmentAttempt.assessment_id).where(
            AssessmentAttempt.student_id == student_id,
            AssessmentAttempt.is_deleted == False,
        )
        sub_res = await self.db.execute(sub_stmt)
        submitted_assessment_ids = set(sub_res.scalars().all())

        unplanned = []
        for ass in available_assessments:
            # Skip if student already submitted this assessment
            if ass.id in submitted_assessment_ids:
                continue

            # Skip if assessment window has ended
            end_time = ass.window_end or getattr(ass, "end_date", None)
            if end_time:
                if end_time.tzinfo is None:
                    end_time = end_time.replace(tzinfo=UTC)
                if end_time < now:
                    continue

            if ass.id not in planned_assessment_ids:
                item = {
                    "id": str(ass.id),
                    "title": ass.title,
                    "type": ass.assessment_type.value if hasattr(ass.assessment_type, 'value') else str(ass.assessment_type),
                    "course_code": ass.course.code if ass.course else "GEN",
                    "window_start": ass.window_start.isoformat() if ass.window_start else None,
                }
                unplanned.append(item)

        # Issue M8: Sort unplanned assessments by window_start ascending so nearest deadline is picked first
        unplanned.sort(key=lambda x: x.get("window_start") or "9999-12-31")
        proactive = unplanned[0] if unplanned else None

        # Issue M9: Dynamic Material Coverage Calculation against live non-deleted materials
        material_coverage: List[MaterialCoverageItem] = []
        tw_ids = list({p.teaching_workspace_id for p in plans if p.teaching_workspace_id})

        if tw_ids:
            for tw_id in tw_ids:
                tw_stmt = select(TeachingWorkspace).options(selectinload(TeachingWorkspace.course)).where(TeachingWorkspace.id == tw_id, TeachingWorkspace.is_deleted == False)
                tw_res = await self.db.execute(tw_stmt)
                tw = tw_res.scalar_one_or_none()

                live_mats_stmt = select(LecturerMaterial.id).where(
                    LecturerMaterial.teaching_workspace_id == tw_id,
                    LecturerMaterial.is_student_visible == True,
                    LecturerMaterial.is_deleted == False,
                )
                live_mats_res = await self.db.execute(live_mats_stmt)
                live_mat_ids = {str(mid) for mid in live_mats_res.scalars().all()}
                total_mats = len(live_mat_ids)

                covered_ids: set[str] = set()
                for p in plans:
                    if p.teaching_workspace_id == tw_id:
                        if p.covered_material_ids:
                            covered_ids.update(p.covered_material_ids)
                        if p.sessions:
                            for s in p.sessions:
                                if s.recommended_resource_ids:
                                    covered_ids.update(s.recommended_resource_ids)

                valid_covered_ids = covered_ids.intersection(live_mat_ids)
                covered_cnt = len(valid_covered_ids)
                pct = round((covered_cnt / total_mats * 100.0), 1) if total_mats > 0 else 0.0

                code = tw.course.code if (tw and tw.course) else "COURSE"
                title = (getattr(tw.course, "name", None) or getattr(tw.course, "title", "Course Materials")) if (tw and tw.course) else "Course Materials"

                material_coverage.append(
                    MaterialCoverageItem(
                        course_code=code,
                        course_title=title,
                        covered_count=covered_cnt,
                        total_count=total_mats,
                        coverage_percentage=pct,
                    )
                )

        # Schedule Conflicts
        conflicts = await self.detect_schedule_conflicts(student_id)

        return StudyPlannerDashboardSummary(
            active_plan=self._format_plan(active_plan, include_content=False) if active_plan else None,
            total_plans=len(plans),
            completed_sessions_count=completed_count,
            total_sessions_count=total_count,
            streak_days=active_plan.streak_count if active_plan else 0,
            hours_studied_this_week=round(hours_studied, 1),
            weekly_study_activity=weekly_activity,
            today_session=(
                self._format_session(today_session, include_content=False) if today_session else None
            ),
            next_upcoming_session=(
                self._format_session(next_upcoming, include_content=False) if next_upcoming else None
            ),
            assessment_readiness_score=readiness_score,
            weak_topics=weak_topics[:3],
            proactive_suggestion=proactive,
            unplanned_assessments=unplanned,
            readiness_timeline=readiness_timeline,
            material_coverage=material_coverage,
            schedule_conflicts=conflicts,
        )

    async def complete_session(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        understanding_level: str,
        difficulty_rating: Optional[str] = "Medium",
        confidence_rating: Optional[int] = 4,
        feedback_notes: Optional[str] = None,
        checklist_items: Optional[List[Dict[str, Any]]] = None,
        plan_id: Optional[uuid.UUID] = None,
    ) -> StudySessionResponse:
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session or (plan_id is not None and session.study_plan_id != plan_id):
            raise NotFoundError("Study session not found")

        # Ratings may be re-submitted, but streak and readiness history only move on the first completion.
        first_completion = session.status != "COMPLETED"
        session.status = "COMPLETED"
        session.completed_at = session.completed_at if not first_completion and session.completed_at else datetime.now(UTC)
        session.understanding_level = understanding_level
        session.difficulty_rating = difficulty_rating
        session.confidence_rating = confidence_rating
        session.feedback_notes = feedback_notes
        if checklist_items is not None:
            session.checklist_items = checklist_items

        await self.repo.update_session(session)

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
        if plan:
            if first_completion:
                plan.streak_count += 1

            # Recalculate plan readiness score dynamically
            all_sessions = plan.sessions or []
            completed_sessions = [s for s in all_sessions if s.status == "COMPLETED" and not s.is_deleted]
            total_sessions = len([s for s in all_sessions if not s.is_deleted])

            if total_sessions > 0:
                comp_ratio = len(completed_sessions) / total_sessions
                high_count = sum(1 for s in completed_sessions if s.understanding_level in ["YES", "HIGH", "FULL"])
                partial_count = sum(1 for s in completed_sessions if s.understanding_level in ["PARTIAL", "MEDIUM"])

                mastery_factor = (high_count * 1.0 + partial_count * 0.5) / max(1, len(completed_sessions))
                calculated_score = int((comp_ratio * 40) + (mastery_factor * 60))
                plan.readiness_score = min(100, max(DEFAULT_INITIAL_READINESS_SCORE, calculated_score))

                if first_completion:
                    history = list(plan.readiness_history or [])
                    history.append({
                        "date": datetime.now(UTC).isoformat(),
                        "label": f"Session {len(completed_sessions)}",
                        "score": plan.readiness_score,
                    })
                    plan.readiness_history = history

            await self.repo.update_plan(plan)

        if understanding_level in ["PARTIAL", "NO"] and plan and plan.teaching_workspace_id:
            materials_stmt = select(LecturerMaterial).where(
                LecturerMaterial.teaching_workspace_id == plan.teaching_workspace_id,
                LecturerMaterial.is_student_visible == True,
                LecturerMaterial.is_deleted == False
            ).limit(3)
            m_res = await self.db.execute(materials_stmt)
            mats = list(m_res.scalars().all())
            session.recommended_resource_ids = [str(m.id) for m in mats]
            await self.repo.update_session(session)

        await self.db.commit()
        return self._format_session(session)

    async def list_plans(self, student_id: uuid.UUID) -> List[StudyPlanResponse]:
        plans = await self.repo.list_plans_for_student(student_id)
        return [self._format_plan(p, include_content=False) for p in plans]

    async def get_plan_detail(self, plan_id: uuid.UUID, student_id: uuid.UUID) -> StudyPlanResponse:
        return await self._format_plan_response(plan_id, student_id)

    async def _format_plan_response(
        self, plan_id: uuid.UUID, student_id: uuid.UUID, creation_warnings: Optional[List[str]] = None
    ) -> StudyPlanResponse:
        plan = await self.repo.get_plan_by_id(plan_id, student_id)
        if not plan:
            raise NotFoundError("Study plan not found")
        resp = self._format_plan(plan)
        if creation_warnings:
            resp.creation_warnings = creation_warnings
        return resp

    def _format_plan(self, plan: StudyPlan, *, include_content: bool = True) -> StudyPlanResponse:
        """``include_content=False`` is for list views: sessions then omit their lesson, quiz and chat payloads."""
        sessions = [
            self._format_session(s, include_content=include_content)
            for s in (plan.sessions or [])
            if not s.is_deleted
        ]
        return StudyPlanResponse(
            id=plan.id,
            student_id=plan.student_id,
            title=plan.title,
            study_type=plan.study_type,
            course_id=plan.course_id,
            teaching_workspace_id=plan.teaching_workspace_id,
            assessment_id=plan.assessment_id,
            target_mode=plan.target_mode if isinstance(plan.target_mode, str) else "full_assessment_coverage",
            target_learning_unit_id=(
                plan.target_learning_unit_id
                if isinstance(plan.target_learning_unit_id, uuid.UUID)
                else None
            ),
            start_date=plan.start_date,
            end_date=plan.end_date,
            available_days=plan.available_days or [],
            blackout_dates=plan.blackout_dates or [],
            preferred_time_start=plan.preferred_time_start,
            preferred_time_end=plan.preferred_time_end,
            session_duration_minutes=plan.session_duration_minutes,
            daily_goal=plan.daily_goal,
            preferred_difficulty=plan.preferred_difficulty or "Balanced",
            reminder_preference_minutes=plan.reminder_preference_minutes,
            reminder_channels=plan.reminder_channels or [],
            priority=plan.priority,
            status=plan.status,
            auto_generated=plan.auto_generated,
            streak_count=plan.streak_count,
            readiness_score=plan.readiness_score,
            readiness_history=plan.readiness_history or [],
            covered_material_ids=plan.covered_material_ids or [],
            created_at=plan.created_at,
            sessions=sessions,
        )

    def _format_session(
        self, session: StudySession, *, include_content: bool = True
    ) -> StudySessionResponse:
        """Map a session to its response.

        ``include_content=False`` leaves out the bulky per-session payloads (lesson sections and
        plan, quiz, knowledge-check detail, summary, notes, tutor chat). List and dashboard
        views never show them, and sending every session's lesson with every plan made those
        responses megabytes; the guided session page loads them from its own endpoints.
        """

        def _get_val(attr, default=None):
            val = getattr(session, attr, default)
            if val is None or "Mock" in type(val).__name__:
                return default
            return val

        now = datetime.now(UTC)
        return StudySessionResponse(
            id=_get_val("id", uuid.uuid4()),
            study_plan_id=_get_val("study_plan_id", uuid.uuid4()),
            learning_unit_id=_get_val("learning_unit_id", None),
            title=_get_val("title", "Study Session"),
            topic=_get_val("topic", "General Topic"),
            session_type=_get_val("session_type", "STUDY"),
            scheduled_start=_get_val("scheduled_start", now),
            scheduled_end=_get_val("scheduled_end", now),
            duration_minutes=_get_val("duration_minutes", 60),
            status=_get_val("status", "SCHEDULED"),
            completed_at=_get_val("completed_at", None),
            understanding_level=_get_val("understanding_level", None),
            difficulty_rating=_get_val("difficulty_rating", None),
            confidence_rating=_get_val("confidence_rating", None),
            feedback_notes=_get_val("feedback_notes", None),
            checklist_items=_get_val("checklist_items", []) if include_content else [],
            quiz_questions=_get_val("quiz_questions", []) if include_content else [],
            recommended_resource_ids=_get_val("recommended_resource_ids", []),
            source_material_ids=[str(i) for i in _get_val("source_material_ids", [])],
            lesson_sections_json=_get_val("lesson_sections_json", []) if include_content else [],
            lesson_plan_json=_get_val("lesson_plan_json", None) if include_content else None,
            lesson_status=_get_val("lesson_status", "NOT_GENERATED"),
            current_section_index=_get_val("current_section_index", 0),
            lesson_generated_at=_get_val("lesson_generated_at", None),
            knowledge_check_answers=_get_val("knowledge_check_answers", None) if include_content else None,
            knowledge_check_score=_get_val("knowledge_check_score", None),
            knowledge_check_report=_get_val("knowledge_check_report", None) if include_content else None,
            session_summary_text=_get_val("session_summary_text", None) if include_content else None,
            student_notes=_get_val("student_notes", None) if include_content else None,
            tutor_chat_history=_get_val("tutor_chat_history", []) if include_content else [],
        )

    async def save_session_notes(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        student_notes: str,
    ) -> StudySessionResponse:
        """Save student personal notes for a study session."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise NotFoundError("Study session not found")

        session.student_notes = student_notes
        await self.repo.update_session(session)
        await self.db.commit()
        return self._format_session(session)

    async def schedule_spaced_repetition_session(
        self,
        student_id: uuid.UUID,
        plan_id: uuid.UUID,
        weak_topics: List[str],
        days_ahead: int = 2,
    ) -> Optional[StudySession]:
        """
        Spaced Repetition Auto-Scheduling (4c):
        Schedule a short 20-min REVISION session 2-3 days after a weak performance / weak concept check.
        """
        if not weak_topics:
            return None

        plan = await self.repo.get_plan_by_id(plan_id, student_id)
        if not plan:
            return None

        now = datetime.now(UTC)
        target_date = now + timedelta(days=days_ahead)

        start_hour, start_min = 19, 0
        try:
            parts = plan.preferred_time_start.split(":")
            start_hour, start_min = int(parts[0]), int(parts[1])
        except Exception:
            pass

        sched_start = _wall_clock_utc(target_date, start_hour, start_min)
        sched_end = sched_start + timedelta(minutes=20)

        conflict = await self._find_conflicts_for_slot(student_id, sched_start, sched_end)
        if conflict:
            sched_start = _ensure_utc(conflict.scheduled_end) + timedelta(minutes=15)
            sched_end = sched_start + timedelta(minutes=20)

        topic_name = f"Spaced Revision: {', '.join(weak_topics[:2])}"
        session = StudySession(
            study_plan_id=plan.id,
            student_id=student_id,
            title=f"Spaced Repetition Review: {weak_topics[0]}",
            topic=topic_name,
            session_type="REVISION",
            scheduled_start=sched_start,
            scheduled_end=sched_end,
            duration_minutes=20,
            status="SCHEDULED",
            checklist_items=await self._default_checklist(topic_name, "REVISION"),
        )
        return await self.repo.create_session(session)
