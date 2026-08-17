from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, List, Optional

from app.core.exceptions import ConflictError
from app.core.logging import get_logger

logger = get_logger(__name__)

from app.db.enums import NotificationChannel, NotificationType
from app.db.models.academic import Course, TeachingWorkspace
from app.db.models.assessment import Assessment
from app.db.models.notification import Notification
from app.db.models.resource import LecturerMaterial
from app.db.models.study_plan import (DEFAULT_INITIAL_READINESS_SCORE,
                                      StudyPlan, StudySession)
from app.db.repositories.study_planner_repo import StudyPlannerRepository
from app.schemas.study_planner import (CreateStudyPlanRequest,
                                       GeneratePlanFromAssessmentRequest,
                                       MaterialCoverageItem,
                                       ReadinessTimelinePoint,
                                       ScheduleConflictWarning,
                                       StudyPlannerDashboardSummary,
                                       StudyPlanResponse, StudySessionResponse)
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _clamp_session_duration(preferred_time_start: Optional[str], preferred_time_end: Optional[str], session_duration_minutes: int) -> int:
    """Ensure session_duration_minutes does not exceed the window between preferred_time_start and preferred_time_end."""
    if preferred_time_start and preferred_time_end and ":" in preferred_time_start and ":" in preferred_time_end:
        try:
            start_parts = preferred_time_start.split(":")
            end_parts = preferred_time_end.split(":")
            start_mins = int(start_parts[0]) * 60 + int(start_parts[1])
            end_mins = int(end_parts[0]) * 60 + int(end_parts[1])
            if end_mins > start_mins:
                max_allowed = end_mins - start_mins
                return min(session_duration_minutes, max_allowed)
        except Exception:
            pass
    return session_duration_minutes


class StudyPlannerService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = StudyPlannerRepository(db)

    async def create_manual_plan(
        self, student_id: uuid.UUID, data: CreateStudyPlanRequest
    ) -> StudyPlanResponse:
        """Create a manual study plan and generate session slots based on available days."""
        start_date = _ensure_utc(data.start_date)
        end_date = _ensure_utc(data.end_date)

        course_id: Optional[uuid.UUID] = None
        teaching_workspace_id: Optional[uuid.UUID] = data.teaching_workspace_id

        if data.course_id:
            course_stmt = select(Course.id).where(Course.id == data.course_id, Course.is_deleted == False)
            c_res = await self.db.execute(course_stmt)
            if c_res.scalar_one_or_none():
                course_id = data.course_id
            else:
                tw_stmt = select(TeachingWorkspace).where(TeachingWorkspace.id == data.course_id, TeachingWorkspace.is_deleted == False)
                tw_res = await self.db.execute(tw_stmt)
                tw = tw_res.scalar_one_or_none()
                if tw:
                    teaching_workspace_id = tw.id
                    course_id = tw.course_id

        if teaching_workspace_id and not course_id:
            tw_stmt = select(TeachingWorkspace).where(TeachingWorkspace.id == teaching_workspace_id, TeachingWorkspace.is_deleted == False)
            tw_res = await self.db.execute(tw_stmt)
            tw = tw_res.scalar_one_or_none()
            if tw:
                course_id = tw.course_id
            else:
                teaching_workspace_id = None

        if data.assessment_id:
            ass_stmt = select(Assessment.id).where(Assessment.id == data.assessment_id, Assessment.is_deleted == False)
            ass_res = await self.db.execute(ass_stmt)
            if ass_res.scalar_one_or_none():
                assessment_id = data.assessment_id
            else:
                assessment_id = None
        else:
            assessment_id = None

        plan = StudyPlan(
            student_id=student_id,
            title=data.title,
            study_type=data.study_type,
            course_id=course_id,
            teaching_workspace_id=teaching_workspace_id,
            assessment_id=assessment_id,
            start_date=start_date,
            end_date=end_date,
            available_days=data.available_days,
            blackout_dates=data.blackout_dates,
            preferred_time_start=data.preferred_time_start,
            preferred_time_end=data.preferred_time_end,
            session_duration_minutes=_clamp_session_duration(data.preferred_time_start, data.preferred_time_end, data.session_duration_minutes),
            daily_goal=data.daily_goal,
            preferred_difficulty=data.preferred_difficulty,
            reminder_preference_minutes=data.reminder_preference_minutes,
            reminder_channels=data.reminder_channels,
            priority=data.priority,
            status="ACTIVE",
            auto_generated=False,
            streak_count=0,
            readiness_score=DEFAULT_INITIAL_READINESS_SCORE,
            readiness_history=[
                {"label": "Initial", "score": DEFAULT_INITIAL_READINESS_SCORE},
            ],
        )
        plan = await self.repo.create_plan(plan)

        creation_warnings: List[str] = []
        if data.auto_generate_sessions:
            creation_warnings = await self._generate_session_slots(plan)

        notif = Notification(
            recipient_id=student_id,
            notification_type=NotificationType.SYSTEM_ANNOUNCEMENT,
            channel=NotificationChannel.IN_APP,
            title=f"Study Plan Created: {plan.title}",
            body=f"Your AI study plan is ready. First session starts at {data.preferred_time_start}.",
            action_url="/student/study",
            reference_id=plan.id,
            reference_type="study_plan",
        )
        self.db.add(notif)
        await self.db.commit()

        return await self._format_plan_response(plan.id, student_id, creation_warnings=creation_warnings)

    async def generate_ai_plan_from_assessment(
        self, student_id: uuid.UUID, data: GeneratePlanFromAssessmentRequest
    ) -> StudyPlanResponse:
        """AI automatic plan creation based on target assessment deadlines, topics, and course materials."""
        stmt = select(Assessment).where(Assessment.id == data.assessment_id)
        res = await self.db.execute(stmt)
        assessment = res.scalar_one_or_none()

        if not assessment:
            raise ValueError("Assessment not found")

        now = datetime.now(UTC)
        # Prefer user-supplied dates; fall back to assessment window / now only when omitted.
        start_date = _ensure_utc(data.start_date) if data.start_date else _ensure_utc(now)
        end_date = (
            _ensure_utc(data.end_date)
            if data.end_date
            else _ensure_utc(assessment.window_start or assessment.window_end or (now + timedelta(days=7)))
        )
        if end_date <= start_date:
            end_date = start_date + timedelta(days=7)

        materials_stmt = select(LecturerMaterial).where(
            LecturerMaterial.teaching_workspace_id == assessment.teaching_workspace_id,
            LecturerMaterial.is_student_visible == True,
            LecturerMaterial.is_deleted == False
        )
        mat_res = await self.db.execute(materials_stmt)
        materials = list(mat_res.scalars().all())
        material_titles = [m.title for m in materials] if materials else ["Course Core Concepts", "Practice Problems", "Past Questions"]

        title = f"AI Study Prep: {assessment.title}"
        plan = StudyPlan(
            student_id=student_id,
            title=title,
            study_type="Assessment Preparation",
            course_id=assessment.course_id,
            teaching_workspace_id=assessment.teaching_workspace_id,
            assessment_id=assessment.id,
            start_date=start_date,
            end_date=end_date,
            available_days=data.available_days,
            blackout_dates=data.blackout_dates,
            preferred_time_start=data.preferred_time_start,
            preferred_time_end=data.preferred_time_end,
            session_duration_minutes=_clamp_session_duration(data.preferred_time_start, data.preferred_time_end, data.session_duration_minutes),
            daily_goal=data.daily_goal,
            preferred_difficulty=data.preferred_difficulty,
            reminder_preference_minutes=data.reminder_preference_minutes,
            reminder_channels=data.reminder_channels,
            priority=data.priority,
            status="ACTIVE",
            auto_generated=True,
            streak_count=0,
            readiness_score=DEFAULT_INITIAL_READINESS_SCORE,
            readiness_history=[
                {"label": "Initial", "score": DEFAULT_INITIAL_READINESS_SCORE},
            ],
        )
        plan = await self.repo.create_plan(plan)

        profile = await self.repo.get_or_create_learning_profile(student_id, assessment.course_id)
        creation_warnings = await self._generate_ai_session_schedule(plan, assessment, material_titles, profile=profile)

        notif = Notification(
            recipient_id=student_id,
            notification_type=NotificationType.ASSESSMENT_PUBLISHED,
            channel=NotificationChannel.IN_APP,
            title=f"AI Study Plan Ready: {assessment.title}",
            body=f"AI has generated a targeted study plan for '{assessment.title}'. First session starts at {data.preferred_time_start}.",
            action_url="/student/study",
            reference_id=plan.id,
            reference_type="study_plan",
        )
        self.db.add(notif)
        await self.db.commit()

        return await self._format_plan_response(plan.id, student_id, creation_warnings=creation_warnings)

    async def _default_checklist(self, topic: str, s_type: str) -> List[Dict[str, Any]]:
        return [
          {"id": "c1", "text": f"Read lecture slides for {topic}", "completed": False},
          {"id": "c2", "text": "Review core concepts & definitions", "completed": False},
          {"id": "c3", "text": f"Solve practice questions ({s_type.lower()})", "completed": False},
          {"id": "c4", "text": "Take AI Checkpoint Quiz", "completed": False},
          {"id": "c5", "text": "Review any mistaken questions", "completed": False},
        ]

    async def _find_conflicts_for_slot(
        self,
        student_id: uuid.UUID,
        proposed_start: datetime,
        proposed_end: datetime,
        exclude_session_id: Optional[uuid.UUID] = None,
        exclude_plan_id: Optional[uuid.UUID] = None,
    ) -> Optional[StudySession]:
        """
        Shared conflict-checking utility across all active student plans.
        Returns conflicting StudySession if proposed_start < s.scheduled_end and proposed_end > s.scheduled_start.
        """
        plans = await self.repo.list_plans_for_student(student_id)
        if not isinstance(plans, list):
            return None

        p_start = _ensure_utc(proposed_start)
        p_end = _ensure_utc(proposed_end)

        for p in plans:
            if exclude_plan_id and getattr(p, "id", None) == exclude_plan_id:
                continue
            for s in (getattr(p, "sessions", []) or []):
                if getattr(s, "is_deleted", False):
                    continue
                if exclude_session_id and getattr(s, "id", None) == exclude_session_id:
                    continue
                if getattr(s, "status", None) not in ["SCHEDULED", "RESCHEDULED", "IN_PROGRESS"]:
                    continue

                s_start = _ensure_utc(getattr(s, "scheduled_start", None))
                s_end = _ensure_utc(getattr(s, "scheduled_end", None))

                if s_start and s_end and s_start < p_end and s_end > p_start:
                    return s
        return None

    def _build_session_title(self, plan: StudyPlan, topic: str, session_type: str, course_code: Optional[str] = None) -> str:
        prefix = f"{course_code} — " if course_code else ""
        return f"{prefix}{topic}"

    async def _resolve_topic_list(self, plan: StudyPlan, estimated_session_count: int = 10) -> List[Tuple[str, str, List[str], Optional[uuid.UUID]]]:
        """
        Generates Learning Unit (LU)-aware course-grounded topics, session types, material IDs, and LU IDs.
        Returns a list of (topic_name, session_type, source_material_ids, learning_unit_id) tuples.
        """
        if plan.teaching_workspace_id:
            try:
                from app.db.models.learning_unit import (
                    LearningUnit, StudentLearningUnitProgress, AssessmentLearningUnitCoverage
                )
                lu_stmt = select(LearningUnit).where(
                    LearningUnit.teaching_workspace_id == plan.teaching_workspace_id,
                    LearningUnit.is_active == True,
                    LearningUnit.is_deleted == False,
                ).order_by(LearningUnit.order_index.asc())
                lu_res = await self.db.execute(lu_stmt)
                lus = list(lu_res.scalars().all())

                if lus:
                    lu_ids = [lu.id for lu in lus]
                    prog_stmt = select(StudentLearningUnitProgress).where(
                        StudentLearningUnitProgress.student_id == plan.student_id,
                        StudentLearningUnitProgress.learning_unit_id.in_(lu_ids),
                    )
                    prog_res = await self.db.execute(prog_stmt)
                    progress_map = {p.learning_unit_id: p.status for p in prog_res.scalars().all()}

                    candidate_lus = lus
                    if getattr(plan, "target_mode", None) == "up_to_learning_unit" and getattr(plan, "target_learning_unit_id", None):
                        target_idx = next((i for i, lu in enumerate(lus) if lu.id == plan.target_learning_unit_id), len(lus) - 1)
                        candidate_lus = lus[: target_idx + 1]
                    elif plan.assessment_id:
                        cov_stmt = select(AssessmentLearningUnitCoverage.learning_unit_id).where(
                            AssessmentLearningUnitCoverage.assessment_id == plan.assessment_id
                        )
                        cov_res = await self.db.execute(cov_stmt)
                        covered_ids = set(cov_res.scalars().all())
                        if covered_ids:
                            candidate_lus = [lu for lu in lus if lu.id in covered_ids]

                    review_first = [lu for lu in candidate_lus if progress_map.get(lu.id) == "NEEDS_REVIEW"]
                    remaining = [lu for lu in candidate_lus if progress_map.get(lu.id) not in ("COMPLETED", "NEEDS_REVIEW")]
                    ordered_lus = review_first + remaining
                    if not ordered_lus:
                        ordered_lus = candidate_lus

                    result = []
                    for idx in range(estimated_session_count):
                        lu = ordered_lus[idx % len(ordered_lus)]
                        s_type = "REVISION" if progress_map.get(lu.id) == "NEEDS_REVIEW" else ("PRACTICE" if idx % 3 == 2 else "STUDY")
                        m_ids = [str(lu.source_material_id)] if lu.source_material_id else []
                        result.append((lu.title, s_type, m_ids, lu.id))
                    return result
            except Exception as exc:
                logger.warning("Failed to resolve Learning Units for plan topic list, attempting AI fallback", error=str(exc))

        course_name = plan.title
        materials = []

        if plan.teaching_workspace_id:
            try:
                from app.db.models.academic import TeachingWorkspace, LecturerMaterial
                ws = await self.db.get(TeachingWorkspace, plan.teaching_workspace_id)
                if ws and hasattr(ws, "title") and ws.title:
                    course_name = ws.title

                mats_stmt = select(LecturerMaterial).where(
                    and_(
                        LecturerMaterial.teaching_workspace_id == plan.teaching_workspace_id,
                        LecturerMaterial.is_student_visible == True,
                        LecturerMaterial.is_deleted == False,
                        LecturerMaterial.is_current == True,
                    )
                )
                mats_res = await self.db.execute(mats_stmt)
                materials = list(mats_res.scalars().all())
            except Exception as exc:
                logger.warning("Failed to load workspace materials for topic resolution", error=str(exc))

        material_titles = [m.title for m in materials if getattr(m, "title", None)]
        material_ids = [str(m.id) for m in materials if getattr(m, "id", None)]

        try:
            from app.agents.study_planner_agent import StudyPlannerAgent
            from app.core.ai.gateway import AIGateway
            from app.core.ai.provider_factory import get_ai_provider, get_embedding_provider

            chat_provider = get_ai_provider()
            embed_provider = get_embedding_provider()
            gateway = AIGateway(self.db, chat_provider, embed_provider)
            agent = StudyPlannerAgent(gateway)

            profile = await self.repo.get_or_create_learning_profile(plan.student_id)

            topic_plans = await agent.generate_session_topics(
                student_id=plan.student_id,
                assessment_title=plan.title,
                course_context=course_name,
                material_titles=material_titles if material_titles else ["Core Study Notes"],
                session_count=estimated_session_count,
                difficulty_pace=plan.preferred_difficulty or "Balanced",
                weak_topics=getattr(profile, "weak_topics", None),
                topic_confidence=getattr(profile, "topic_confidence", None),
            )
            return [
                (tp.topic, tp.session_type, material_ids[:3] if material_ids else [], None)
                for tp in topic_plans
            ]
        except Exception as exc:
            logger.warning("AI topic resolution failed for plan, using fallback topics", error=str(exc))

        fallbacks = [
            (f"Foundations of {plan.title}", "STUDY", material_ids[:2] if material_ids else []),
            ("Key Terms & Core Concepts Practice", "PRACTICE", material_ids[:1] if material_ids else []),
            ("Practical Application & Problem Solving", "STUDY", material_ids[:2] if material_ids else []),
            ("Comprehensive Topic Revision", "REVISION", material_ids[:2] if material_ids else []),
        ]
        result = []
        for i in range(estimated_session_count):
            base_topic, s_type, m_ids = fallbacks[i % len(fallbacks)]
            topic_str = f"{base_topic} (Module {i + 1})" if i >= len(fallbacks) else base_topic
            result.append((topic_str, s_type, m_ids, None))
        return result

    async def _generate_session_slots(self, plan: StudyPlan) -> List[str]:
        warnings: List[str] = []
        curr = _ensure_utc(plan.start_date)
        end = _ensure_utc(plan.end_date)
        day_map = {
            "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
            "Friday": 4, "Saturday": 5, "Sunday": 6
        }
        allowed_weekdays = [day_map[d] for d in plan.available_days if d in day_map]
        if not allowed_weekdays:
            allowed_weekdays = [0, 1, 2, 3, 4]

        start_hour, start_min = 19, 0
        try:
            parts = plan.preferred_time_start.split(":")
            start_hour, start_min = int(parts[0]), int(parts[1])
        except Exception:
            pass

        end_hour, end_min = None, None
        if plan.preferred_time_end:
            try:
                parts_end = plan.preferred_time_end.split(":")
                end_hour, end_min = int(parts_end[0]), int(parts_end[1])
            except Exception:
                pass

        blackout_set = set(plan.blackout_dates or [])
        total_days = max(1, (end - curr).days + 1)
        available_days_count = sum(
            1 for d in range(total_days)
            if (curr + timedelta(days=d)).weekday() in allowed_weekdays
            and (curr + timedelta(days=d)).strftime("%Y-%m-%d") not in blackout_set
        )
        estimated_session_count = min(30, max(5, available_days_count))

        topic_tuples = await self._resolve_topic_list(plan, estimated_session_count=estimated_session_count)

        course_code = None
        if plan.teaching_workspace_id:
            try:
                from app.db.models.academic import TeachingWorkspace
                ws = await self.db.get(TeachingWorkspace, plan.teaching_workspace_id)
                if ws and hasattr(ws, "code"):
                    course_code = ws.code
            except Exception:
                pass

        session_count = 1
        while curr <= end and session_count <= estimated_session_count:
            date_str = curr.strftime("%Y-%m-%d")
            if curr.weekday() in allowed_weekdays and date_str not in blackout_set:
                sched_start = curr.replace(hour=start_hour, minute=start_min, second=0, microsecond=0, tzinfo=UTC)
                dur = plan.session_duration_minutes
                if end_hour is not None and end_min is not None:
                    window_limit = curr.replace(hour=end_hour, minute=end_min, second=0, microsecond=0, tzinfo=UTC)
                    if window_limit > sched_start:
                        max_window = int((window_limit - sched_start).total_seconds() / 60)
                        dur = min(dur, max_window)
                sched_end = sched_start + timedelta(minutes=dur)

                # Conflict Avoidance & Auto-Shift Check
                conflict = await self._find_conflicts_for_slot(plan.student_id, sched_start, sched_end, exclude_plan_id=plan.id)
                if conflict:
                    shifted_start = _ensure_utc(conflict.scheduled_end)
                    if shifted_start < sched_end:
                        shifted_start = sched_start + timedelta(minutes=30)
                    shifted_end = shifted_start + timedelta(minutes=dur)

                    day_limit = curr.replace(hour=end_hour or 23, minute=end_min or 59, second=0, microsecond=0, tzinfo=UTC)
                    if shifted_end <= day_limit and not await self._find_conflicts_for_slot(plan.student_id, shifted_start, shifted_end, exclude_plan_id=plan.id):
                        sched_start = shifted_start
                        sched_end = shifted_end
                    else:
                        conflict_title = getattr(conflict, "title", None) or getattr(conflict, "topic", "Existing Session")
                        warnings.append(
                            f"Session {session_count} on {date_str} overlaps with existing session '{conflict_title}' ({_ensure_utc(conflict.scheduled_start).strftime('%b %d, %H:%M')})."
                        )

                topic_name, s_type, source_mats, lu_id = topic_tuples[(session_count - 1) % len(topic_tuples)]
                session_title = self._build_session_title(plan, topic_name, s_type, course_code)

                session = StudySession(
                    study_plan_id=plan.id,
                    student_id=plan.student_id,
                    learning_unit_id=lu_id,
                    title=session_title,
                    topic=topic_name,
                    session_type=s_type,
                    scheduled_start=sched_start,
                    scheduled_end=sched_end,
                    duration_minutes=dur,
                    status="SCHEDULED",
                    source_material_ids=source_mats,
                    checklist_items=await self._default_checklist(topic_name, s_type),
                )
                await self.repo.create_session(session)
                session_count += 1
            curr += timedelta(days=1)

        return warnings

    async def _generate_ai_session_schedule(
        self, plan: StudyPlan, assessment: Assessment, material_titles: List[str], profile: Optional[Any] = None
    ) -> List[str]:
        warnings: List[str] = []
        curr = _ensure_utc(plan.start_date)
        end = _ensure_utc(plan.end_date)
        day_map = {
            "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
            "Friday": 4, "Saturday": 5, "Sunday": 6
        }
        allowed_weekdays = [day_map[d] for d in plan.available_days if d in day_map]
        if not allowed_weekdays:
            allowed_weekdays = [0, 1, 2, 3, 4, 5]

        start_hour, start_min = 19, 0
        try:
            parts = plan.preferred_time_start.split(":")
            start_hour, start_min = int(parts[0]), int(parts[1])
        except Exception:
            pass

        end_hour, end_min = None, None
        if plan.preferred_time_end:
            try:
                parts_end = plan.preferred_time_end.split(":")
                end_hour, end_min = int(parts_end[0]), int(parts_end[1])
            except Exception:
                pass

        blackout_set = set(plan.blackout_dates or [])

        # Issue M3: Calculate dynamic target session count based on actual window size
        total_days = max(1, (end - curr).days + 1)
        available_days_count = sum(
            1 for d in range(total_days)
            if (curr + timedelta(days=d)).weekday() in allowed_weekdays
            and (curr + timedelta(days=d)).strftime("%Y-%m-%d") not in blackout_set
        )
        target_session_count = min(30, max(5, available_days_count))

        # Issue M2: Density adjustment based on preferred_difficulty
        pace = (plan.preferred_difficulty or "Balanced").lower()
        duration_minutes = plan.session_duration_minutes
        step_interval = 1
        if "intensive" in pace or "bootcamp" in pace:
            duration_minutes = min(180, int(plan.session_duration_minutes * 1.25))
            step_interval = 1
        elif "light" in pace or "small" in pace:
            duration_minutes = max(15, int(plan.session_duration_minutes * 0.75))
            step_interval = 2

        # Issue M1: Pass student profile weak topics & confidence
        weak_topics = getattr(profile, "weak_topics", None)
        topic_confidence = getattr(profile, "topic_confidence", None)

        course_code = None
        if assessment and hasattr(assessment, "course") and assessment.course:
            course_code = getattr(assessment.course, "code", None)

        # Call StudyPlannerAgent to generate dynamic topics
        try:
            from app.agents.study_planner_agent import StudyPlannerAgent
            from app.core.ai.gateway import AIGateway
            from app.core.ai.provider_factory import (get_ai_provider,
                                                      get_embedding_provider)

            chat_provider = get_ai_provider()
            embed_provider = get_embedding_provider()
            gateway = AIGateway(self.db, chat_provider, embed_provider)
            agent = StudyPlannerAgent(gateway)

            topic_plans = await agent.generate_session_topics(
                student_id=plan.student_id,
                assessment_title=assessment.title,
                course_context=(getattr(assessment.course, "name", None) or getattr(assessment.course, "title", None) or assessment.title) if assessment.course else assessment.title,
                material_titles=material_titles,
                session_count=target_session_count,
                difficulty_pace=plan.preferred_difficulty or "Balanced",
                weak_topics=weak_topics,
                topic_confidence=topic_confidence,
            )
            topics = [(tp.topic, tp.session_type) for tp in topic_plans]
        except Exception as exc:
            logger.warning("AI topic plan generation failed, using fallback topics", error=str(exc))
            topics = [
                (f"Foundations & Core Principles of {assessment.title}", "STUDY"),
                ("Key Theoretical Frameworks & Definitions", "PRACTICE"),
                (f"Detailed Analysis of {material_titles[0] if material_titles else 'Primary Course Notes'}", "STUDY"),
                ("Practical Application & Problem Solving", "REVISION"),
                (f"Review of {material_titles[1] if len(material_titles) > 1 else 'Lecture Slides'}", "STUDY"),
                ("Past Question Breakdown", "PRACTICE"),
                ("Comprehensive Final Revision", "REVISION"),
            ]

        session_idx = 0
        matching_day_counter = 0
        max_possible_sessions = max(available_days_count, target_session_count)
        while curr <= end and session_idx < max_possible_sessions:
            date_str = curr.strftime("%Y-%m-%d")
            if curr.weekday() in allowed_weekdays and date_str not in blackout_set:
                matching_day_counter += 1
                if step_interval == 1 or (matching_day_counter % step_interval == 1):
                    sched_start = curr.replace(hour=start_hour, minute=start_min, second=0, microsecond=0, tzinfo=UTC)
                    actual_dur = duration_minutes
                    if end_hour is not None and end_min is not None:
                        window_limit = curr.replace(hour=end_hour, minute=end_min, second=0, microsecond=0, tzinfo=UTC)
                        if window_limit > sched_start:
                            max_window = int((window_limit - sched_start).total_seconds() / 60)
                            actual_dur = min(actual_dur, max_window)
                    sched_end = sched_start + timedelta(minutes=actual_dur)

                    # Conflict Avoidance & Auto-Shift Check
                    conflict = await self._find_conflicts_for_slot(plan.student_id, sched_start, sched_end, exclude_plan_id=plan.id)
                    if conflict:
                        shifted_start = _ensure_utc(conflict.scheduled_end)
                        if shifted_start < sched_end:
                            shifted_start = sched_start + timedelta(minutes=30)
                        shifted_end = shifted_start + timedelta(minutes=actual_dur)

                        day_limit = curr.replace(hour=end_hour or 23, minute=end_min or 59, second=0, microsecond=0, tzinfo=UTC)
                        if shifted_end <= day_limit and not await self._find_conflicts_for_slot(plan.student_id, shifted_start, shifted_end, exclude_plan_id=plan.id):
                            sched_start = shifted_start
                            sched_end = shifted_end
                        else:
                            conflict_title = getattr(conflict, "title", None) or getattr(conflict, "topic", "Existing Session")
                            warnings.append(
                                f"Session {session_idx + 1} on {date_str} overlaps with existing session '{conflict_title}' ({_ensure_utc(conflict.scheduled_start).strftime('%b %d, %H:%M')})."
                            )

                    topic_name, s_type = topics[session_idx % len(topics)]
                    s_title = self._build_session_title(plan, topic_name, s_type, course_code)

                    session = StudySession(
                        study_plan_id=plan.id,
                        student_id=plan.student_id,
                        title=s_title,
                        topic=topic_name,
                        session_type=s_type,
                        scheduled_start=sched_start,
                        scheduled_end=sched_end,
                        duration_minutes=actual_dur,
                        status="SCHEDULED",
                        checklist_items=await self._default_checklist(topic_name, s_type),
                    )
                    await self.repo.create_session(session)
                    session_idx += 1
            curr += timedelta(days=1)

        return warnings

    async def generate_session_quiz(
        self, session_id: uuid.UUID, student_id: uuid.UUID, question_count: int = 5
    ) -> List[Dict[str, Any]]:
        """Generate post-session AI practice quiz questions based on topic & course materials using StudyPlannerAgent."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Session not found")

        try:
            from app.agents.study_planner_agent import StudyPlannerAgent
            from app.core.ai.gateway import AIGateway
            from app.core.ai.provider_factory import (get_ai_provider,
                                                      get_embedding_provider)

            chat_provider = get_ai_provider()
            embed_provider = get_embedding_provider()
            gateway = AIGateway(self.db, chat_provider, embed_provider)
            agent = StudyPlannerAgent(gateway)

            questions_output = await agent.generate_knowledge_check(
                session=session,
                lesson_content=session.topic,
                question_count=question_count,
            )
            questions = [q.model_dump() for q in questions_output]
        except Exception as exc:
            logger.warning("AI quiz generation failed, using topic quiz fallback", error=str(exc))
            questions = []
            import random
            topic = session.topic
            for i in range(question_count):
                raw_opts = [
                    f"Primary requirement of {topic}",
                    f"Alternative implementation of {topic}",
                    f"Secondary constraint in {topic}",
                    f"Invalid assumption regarding {topic}",
                ]
                shuffled = list(enumerate(raw_opts))
                random.shuffle(shuffled)
                opts = [opt for _, opt in shuffled]
                correct_idx = next(idx for idx, (old_i, _) in enumerate(shuffled) if old_i == 0)
                questions.append({
                    "id": str(uuid.uuid4()),
                    "question_text": f"Question {i+1}: What is a critical principle regarding {topic}?",
                    "question_type": "MCQ",
                    "options": opts,
                    "correct_option_index": correct_idx,
                    "correct_answer": opts[correct_idx],
                    "explanation": f"The primary requirement of {topic} forms the foundation of this academic module.",
                    "generated_by": "fallback",
                })

        session.quiz_questions = questions
        await self.repo.update_session(session)
        return questions

    async def get_summary(self, student_id: uuid.UUID) -> StudyPlannerDashboardSummary:
        """Aggregate overview metrics, Readiness timeline, Material coverage, and Conflict warnings."""
        plans = await self.repo.list_plans_for_student(student_id)
        active_plan = next((p for p in plans if p.status == "ACTIVE"), None)

        now = datetime.now(UTC)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=999999)

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
            active_plan=self._format_plan(active_plan) if active_plan else None,
            total_plans=len(plans),
            completed_sessions_count=completed_count,
            total_sessions_count=total_count,
            streak_days=active_plan.streak_count if active_plan else 0,
            hours_studied_this_week=round(hours_studied, 1),
            weekly_study_activity=weekly_activity,
            today_session=self._format_session(today_session) if today_session else None,
            next_upcoming_session=self._format_session(next_upcoming) if next_upcoming else None,
            assessment_readiness_score=readiness_score,
            weak_topics=weak_topics[:3],
            proactive_suggestion=proactive,
            unplanned_assessments=unplanned,
            readiness_timeline=readiness_timeline,
            material_coverage=material_coverage,
            schedule_conflicts=conflicts,
        )

    async def detect_schedule_conflicts(self, student_id: uuid.UUID) -> List[ScheduleConflictWarning]:
        """Detect overlapping study sessions across active study plans."""
        sessions = await self.repo.list_upcoming_sessions_for_student(student_id)
        conflicts = []
        for i in range(len(sessions)):
            for j in range(i + 1, len(sessions)):
                s1, s2 = sessions[i], sessions[j]
                if s1.study_plan_id != s2.study_plan_id:
                    if (s1.scheduled_start < s2.scheduled_end) and (s2.scheduled_start < s1.scheduled_end):
                        conflicts.append(ScheduleConflictWarning(
                            session_a_id=str(s1.id),
                            session_a_title=s1.title,
                            session_b_id=str(s2.id),
                            session_b_title=s2.title,
                            overlap_time=s1.scheduled_start.strftime("%b %d at %H:%M"),
                        ))
        return conflicts

    async def complete_session(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        understanding_level: str,
        difficulty_rating: Optional[str] = "Medium",
        confidence_rating: Optional[int] = 4,
        feedback_notes: Optional[str] = None,
        checklist_items: Optional[List[Dict[str, Any]]] = None,
    ) -> StudySessionResponse:
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Study session not found")

        session.status = "COMPLETED"
        session.completed_at = datetime.now(UTC)
        session.understanding_level = understanding_level
        session.difficulty_rating = difficulty_rating
        session.confidence_rating = confidence_rating
        session.feedback_notes = feedback_notes
        if checklist_items is not None:
            session.checklist_items = checklist_items

        await self.repo.update_session(session)

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
        if plan:
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

                history = plan.readiness_history or []
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

    async def reschedule_session(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        new_start: datetime,
        new_duration: Optional[int],
        force: bool = False,
    ) -> StudySessionResponse:
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Study session not found")

        new_start_utc = _ensure_utc(new_start)
        dur = new_duration or session.duration_minutes
        proposed_end = new_start_utc + timedelta(minutes=dur)

        if not force:
            # ── Issue B: Plan-boundary & blackout-date enforcement ──────────────
            # Load the parent plan to validate date/blackout constraints.
            plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
            if plan:
                plan_start = _ensure_utc(plan.start_date)
                plan_end = _ensure_utc(plan.end_date)

                if plan_start and new_start_utc < plan_start:
                    raise ConflictError(
                        f"Cannot reschedule before the plan's start date "
                        f"({plan_start.strftime('%b %d, %Y')}). "
                        f"Set force=True to override."
                    )
                if plan_end and proposed_end > plan_end:
                    raise ConflictError(
                        f"Cannot reschedule past the plan's end date "
                        f"({plan_end.strftime('%b %d, %Y')}). "
                        f"Set force=True to override."
                    )
                date_str = new_start_utc.strftime("%Y-%m-%d")
                if date_str in set(plan.blackout_dates or []):
                    raise ConflictError(
                        f"{date_str} is a blackout date on this plan. "
                        f"Set force=True to override."
                    )

            # ── Issue A: Conflict detection via the shared helper ────────────────
            # Previously this was a duplicated inline loop inside try/except Exception,
            # which silently swallowed ConflictError (not a ValueError subclass) and
            # allowed the session to be moved into the conflicting slot.
            conflict = await self._find_conflicts_for_slot(
                student_id,
                new_start_utc,
                proposed_end,
                exclude_session_id=session_id,
            )
            if conflict:
                conflict_title = getattr(conflict, "topic", None) or getattr(conflict, "title", "Existing Session")
                conflict_start = _ensure_utc(getattr(conflict, "scheduled_start", None))
                conflict_time = conflict_start.strftime("%b %d, %H:%M") if conflict_start else "unknown time"
                raise ConflictError(
                    f"Schedule conflict detected: proposed time overlaps with existing session "
                    f"'{conflict_title}' ({conflict_time}). "
                    f"Set force=True to proceed anyway."
                )

        session.scheduled_start = new_start_utc
        session.duration_minutes = dur
        session.scheduled_end = proposed_end
        session.status = "RESCHEDULED"

        await self.repo.update_session(session)
        await self.db.commit()
        return self._format_session(session)


    async def adjust_plan(
        self, plan_id: uuid.UUID, student_id: uuid.UUID, action: str
    ) -> StudyPlanResponse:
        plan = await self.repo.get_plan_by_id(plan_id, student_id)
        if not plan:
            raise ValueError("Study plan not found")

        if action == "reduce_duration":
            plan.session_duration_minutes = max(30, plan.session_duration_minutes - 30)
            for s in (plan.sessions or []):
                if s.status in ["SCHEDULED", "RESCHEDULED"]:
                    s.duration_minutes = plan.session_duration_minutes
                    s.scheduled_end = s.scheduled_start + timedelta(minutes=plan.session_duration_minutes)
                    await self.repo.update_session(s)
        elif action == "shift_weekends":
            plan.available_days = ["Saturday", "Sunday"]
            uncompleted = [s for s in (plan.sessions or []) if s.status in ["SCHEDULED", "RESCHEDULED"] and not s.is_deleted]
            if uncompleted:
                now = datetime.now(UTC)
                start_anchor = max(now, _ensure_utc(plan.start_date) or now)

                start_hour, start_min = 19, 0
                if plan.preferred_time_start and ":" in plan.preferred_time_start:
                    try:
                        p_parts = plan.preferred_time_start.split(":")
                        start_hour, start_min = int(p_parts[0]), int(p_parts[1])
                    except Exception:
                        pass

                curr_date = start_anchor.date()
                blackout_set = set(plan.blackout_dates or [])

                for s in uncompleted:
                    while curr_date.weekday() not in (5, 6) or curr_date.strftime("%Y-%m-%d") in blackout_set:
                        curr_date += timedelta(days=1)

                    new_start = datetime(
                        curr_date.year, curr_date.month, curr_date.day,
                        start_hour, start_min, 0, tzinfo=UTC
                    )
                    s.scheduled_start = new_start
                    s.scheduled_end = new_start + timedelta(minutes=s.duration_minutes)
                    s.status = "RESCHEDULED"
                    await self.repo.update_session(s)

                    curr_date += timedelta(days=1)
        elif action == "rebalance_topics":
            uncompleted = [s for s in (plan.sessions or []) if s.status in ["SCHEDULED", "RESCHEDULED"] and not s.is_deleted]
            if uncompleted:
                now = datetime.now(UTC)
                start_anchor = max(now, _ensure_utc(plan.start_date) or now)
                end_anchor = _ensure_utc(plan.end_date) or (start_anchor + timedelta(days=7))
                if end_anchor > start_anchor:
                    total_days = max(1, (end_anchor - start_anchor).days)
                    step_days = total_days / max(1, len(uncompleted))
                    for idx, s in enumerate(uncompleted):
                        new_start = start_anchor + timedelta(days=idx * step_days)
                        s.scheduled_start = new_start
                        s.scheduled_end = new_start + timedelta(minutes=s.duration_minutes)
                        s.status = "RESCHEDULED"
                        await self.repo.update_session(s)
        else:
            raise ValueError(f"Action '{action}' is not supported")

        await self.repo.update_plan(plan)
        await self.db.commit()
        return await self._format_plan_response(plan.id, student_id)

    async def list_plans(self, student_id: uuid.UUID) -> List[StudyPlanResponse]:
        plans = await self.repo.list_plans_for_student(student_id)
        return [self._format_plan(p) for p in plans]

    async def get_plan_detail(self, plan_id: uuid.UUID, student_id: uuid.UUID) -> StudyPlanResponse:
        return await self._format_plan_response(plan_id, student_id)

    async def _format_plan_response(
        self, plan_id: uuid.UUID, student_id: uuid.UUID, creation_warnings: Optional[List[str]] = None
    ) -> StudyPlanResponse:
        plan = await self.repo.get_plan_by_id(plan_id, student_id)
        if not plan:
            raise ValueError("Study plan not found")
        resp = self._format_plan(plan)
        if creation_warnings:
            resp.creation_warnings = creation_warnings
        return resp

    def _format_plan(self, plan: StudyPlan) -> StudyPlanResponse:
        sessions = [self._format_session(s) for s in (plan.sessions or []) if not s.is_deleted]
        return StudyPlanResponse(
            id=plan.id,
            student_id=plan.student_id,
            title=plan.title,
            study_type=plan.study_type,
            course_id=plan.course_id,
            teaching_workspace_id=plan.teaching_workspace_id,
            assessment_id=plan.assessment_id,
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

    def _format_session(self, session: StudySession) -> StudySessionResponse:
        def _get_val(attr, default=None):
            val = getattr(session, attr, default)
            if val is None or "Mock" in type(val).__name__:
                return default
            return val

        now = datetime.now(UTC)
        return StudySessionResponse(
            id=_get_val("id", uuid.uuid4()),
            study_plan_id=_get_val("study_plan_id", uuid.uuid4()),
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
            checklist_items=_get_val("checklist_items", []),
            quiz_questions=_get_val("quiz_questions", []),
            recommended_resource_ids=_get_val("recommended_resource_ids", []),
            lesson_sections_json=_get_val("lesson_sections_json", []),
            lesson_plan_json=_get_val("lesson_plan_json", None),
            lesson_status=_get_val("lesson_status", "NOT_GENERATED"),
            current_section_index=_get_val("current_section_index", 0),
            lesson_generated_at=_get_val("lesson_generated_at", None),
            knowledge_check_answers=_get_val("knowledge_check_answers", None),
            knowledge_check_score=_get_val("knowledge_check_score", None),
            knowledge_check_report=_get_val("knowledge_check_report", None),
            session_summary_text=_get_val("session_summary_text", None),
            student_notes=_get_val("student_notes", None),
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
            raise ValueError("Study session not found")

        session.student_notes = student_notes
        await self.repo.update_session(session)
        await self.db.commit()
        return self._format_session(session)

    @staticmethod
    def _is_valid_mermaid(diagram: str | None) -> bool:
        """
        Lightweight structural validation for Mermaid diagram strings.

        A diagram is considered valid if it:
        1. Starts with a recognised Mermaid diagram-type keyword.
        2. Contains at least one proper node declaration (NodeID[Label]) or
           a labelled edge (A --> B), indicating a real graph was produced.

        If the AI emits prose, a plain label with no syntax, or a truncated
        string, this returns False and the caller should null out the field
        rather than storing something guaranteed to render badly.
        """
        import re
        if not diagram or not isinstance(diagram, str):
            return False
        trimmed = diagram.strip()
        _VALID_PREFIXES = (
            "graph ", "graph\n",
            "flowchart ", "flowchart\n",
            "sequenceDiagram", "classDiagram",
            "stateDiagram", "erDiagram",
            "gantt", "pie", "mindmap",
        )
        if not any(trimmed.lower().startswith(p.lower()) for p in _VALID_PREFIXES):
            return False
        # Must contain at least one node definition (NodeId[Label]) or arrow edge
        has_node = bool(re.search(r"\w+\s*[\[\(\{]", trimmed))
        has_edge = bool(re.search(r"-->|->>|--|\.\.\.>", trimmed))
        return has_node or has_edge

    def _build_fallback_lesson_plan(
        self, session: StudySession, rag_citations: List[Dict[str, Any]]
    ) -> Any:
        from app.agents.study_planner_agent import (LessonPlanOutput,
                                                    LessonSection)

        duration = session.duration_minutes or 60
        if duration <= 30:
            section_count = 4
        elif duration <= 60:
            section_count = 6
        else:
            section_count = 8

        sec_duration = max(5, duration // section_count)

        # ── Detect whether the topic is technical/procedural ─────────────────────────────
        _TECHNICAL_KEYWORDS = {
            "python", "java", "javascript", "typescript", "sql", "html", "css",
            "react", "algorithm", "data structure", "network", "api", "database",
            "programming", "code", "software", "machine learning", "neural",
            "statistics", "calculus", "physics", "circuit", "engineering",
            "protocol", "compiler", "runtime", "operating system", "linux",
        }
        _PROCESS_KEYWORDS = {
            "process", "flow", "pipeline", "cycle", "sequence", "hierarchy",
            "architecture", "system", "stage", "workflow", "lifecycle",
        }
        topic_lower = (session.topic or "").lower()
        is_technical = any(kw in topic_lower for kw in _TECHNICAL_KEYWORDS)

        sections = []
        diagram_added = False  # Cap: at most ONE diagram per lesson

        for i in range(1, section_count + 1):
            examples: list = []
            tables: list = []
            diagram: str | None = None
            activities: list = [
                f"In your own words, explain how the concepts in section {i} apply to {session.topic}."
            ]

            if i == 1:
                title = f"{i}. Core Concepts & Overview of {session.topic}"
                content = (
                    f"### Introduction & Definitions\n"
                    f"Welcome to today's {duration}-minute guided study session focusing on **{session.topic}**.\n\n"
                    f"In this section we cover foundational principles and structural definitions that "
                    f"will anchor everything in the sections that follow.\n\n"
                    f"#### Core Principles\n"
                    f"Begin by identifying the key actors, concepts, or mechanisms that define {session.topic}. "
                    f"Understanding these building blocks is essential before moving to applied analysis."
                )
                key_points = [
                    f"Foundational Definition: A clear understanding of the core mechanisms governing {session.topic}.",
                    "Systematic Approach: Organising concepts into coherent groups before applying them.",
                ]
                # Diagram: only if the topic has a detectable process/flow dimension
                if not diagram_added and any(kw in topic_lower for kw in _PROCESS_KEYWORDS):
                    diagram = (
                        "graph TD\n"
                        f" A[Input / Context] --> B[Core Processing: {session.topic}]\n"
                        " B --> C[Analysis & Evaluation]\n"
                        " C --> D[Output / Conclusion]"
                    )
                    diagram_added = True

            elif i == section_count:
                title = f"{i}. Review, Key Takeaways & Self-Check"
                content = (
                    f"### Session Summary & Self-Evaluation\n"
                    f"To solidify your mastery of **{session.topic}**, revisit the core principles from each section.\n\n"
                    f"Ask yourself: can you explain each concept without notes? "
                    f"If a concept feels unclear, mark it as a revision target and return to it tomorrow."
                )
                key_points = [
                    "Active Recall: Test yourself on key definitions without looking at notes.",
                    "Practical Synthesis: Combine multiple concepts into a cohesive explanation.",
                ]
                tables = [
                    {
                        "title": f"{session.topic}: Session Concept Review",
                        "headers": ["Concept Covered", "Core Principle", "Confidence Level"],
                        "rows": [
                            ["Foundational Definitions", "Core mechanisms and terminology", "Self-rate: 1–5"],
                            ["Applied Analysis", "Applying concepts to real scenarios", "Self-rate: 1–5"],
                            ["Critical Evaluation", "Comparing and contrasting approaches", "Self-rate: 1–5"],
                        ],
                    }
                ]

            else:
                title = f"{i}. Deep Dive Part {i - 1}: Analysis & Application"
                content = (
                    f"### Section {i} — Detailed Analysis ({sec_duration} Minutes)\n"
                    f"Continuing our exploration of **{session.topic}**, this section examines how "
                    f"core principles are applied in context.\n\n"
                    f"Focus on understanding **why** each mechanism works the way it does, not just "
                    f"**what** it does. Connect this material back to the foundational concepts in Section 1.\n\n"
                    f"#### Key Considerations\n"
                    f"Think critically about edge cases, exceptions, and real-world scenarios where "
                    f"{session.topic} principles are tested."
                )
                key_points = [
                    f"Contextual Application: How core {session.topic} principles manifest in practical scenarios.",
                    "Critical Thinking: Identifying exceptions and edge cases that challenge simple rules.",
                ]
                # Code example: only on the second section and only for technical topics
                if i == 2 and is_technical:
                    examples = [
                        {
                            "title": f"Illustrative Example: {session.topic}",
                            "code": (
                                f"# Pseudocode sketch for {session.topic}\n"
                                f"# Replace with a real worked example from your course notes\n"
                                f"result = process({session.topic!r})"
                            ),
                            "explanation": (
                                f"This pseudocode outlines the core operation pattern for {session.topic}. "
                                f"Adapt it using your actual course material."
                            ),
                        }
                    ]

            sections.append(
                LessonSection(
                    section_title=title,
                    content=content,
                    key_points=key_points,
                    diagram_prompt=diagram,
                    estimated_minutes=sec_duration,
                    examples=examples,
                    tables=tables,
                    charts=[],
                    activities=activities,
                )
            )

        refs = [c.get("title") or c.get("resource_name", "Lecturer Material") for c in rag_citations] if rag_citations else ["Lecturer Course Repository & Syllabus"]

        return LessonPlanOutput(
            title=session.title,
            topic=session.topic,
            estimated_duration_minutes=duration,
            objectives=[
                f"Master core concepts and principles of {session.topic}",
                f"Apply and analyse key ideas across {section_count} structured sections",
                f"Evaluate comprehension with interactive self-check questions",
            ],
            introduction=f"Welcome to today's {duration}-minute comprehensive study session on {session.topic}. This guided lesson breaks down complex principles into {section_count} structured, time-allocated sections.",
            sections=sections,
            lecturer_references=refs,
            citations=rag_citations,
            summary=f"In this session on {session.topic}, you worked through {section_count} structured sections covering core definitions, applied analysis, and a final self-check review.",
            glossary=[
                {"term": session.topic, "definition": f"The primary subject area covered in this study session."},
                {"term": "Active Recall", "definition": "A learning strategy involving retrieving information from memory without looking at notes."},
            ],
            references=["Institutional Course Catalog", "Mindexa AI Study Companion"],
            generated_by="fallback",
        )

    async def start_guided_session(
        self, session_id: uuid.UUID, student_id: uuid.UUID
    ) -> StudySessionResponse:
        """Start or resume a guided study session, generating structured lesson content if needed."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Study session not found")

        if session.lesson_status == "NOT_GENERATED":
            plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
            course_id = plan.course_id if plan else None

            # Retrieve student learning profile for personalization
            profile = await self.repo.get_or_create_learning_profile(student_id, course_id)
            profile_dict = {
                "weak_topics": profile.weak_topics or [],
                "topic_confidence": profile.topic_confidence or {},
            }

            # Check language policy before AI lesson generation
            from app.core.ai.language_policy import is_ai_allowed
            ws_lang = None
            if plan and plan.teaching_workspace_id:
                from app.db.models.academic import TeachingWorkspace
                ws = await self.db.get(TeachingWorkspace, plan.teaching_workspace_id)
                if ws:
                    ws_lang = getattr(ws, "language", None)

            if not is_ai_allowed(ws_lang):
                lesson_output = self._generate_fallback_lesson(session, plan, duration=session.duration_minutes or 60)
                session.lesson_plan_json = lesson_output.model_dump()
                session.lesson_status = "GENERATED"
                await self.repo.update_session(session)
                return StudySessionResponse.model_validate(session)

            # Retrieve RAG context grounded in vector embeddings
            rag_context = ""
            rag_citations = []
            try:
                from app.services.rag_service import RAGService
                rag_service = RAGService(self.db)
                if plan and plan.teaching_workspace_id:
                    rag_res = await rag_service.retrieve_context_for_lecturer(
                        topic=session.topic,
                        teaching_workspace_id=plan.teaching_workspace_id,
                        top_k=8,
                    )
                    if rag_res and rag_res.context_string:
                        rag_context = rag_res.context_string
                        if hasattr(rag_res, "citations") and rag_res.citations:
                            rag_citations = [c.model_dump() for c in rag_res.citations]

                if not rag_context:
                    rag_res = await rag_service.retrieve_context(
                        question=session.topic,
                        student_id=student_id,
                        top_k=8,
                    )
                    if rag_res and rag_res.context_string:
                        rag_context = rag_res.context_string
                        if hasattr(rag_res, "citations") and rag_res.citations:
                            rag_citations = [c.model_dump() for c in rag_res.citations]
            except Exception as exc:
                logger.warning(
                    "Guided lesson RAG vector retrieval failed, attempting fallback",
                    error=str(exc),
                )

            if not rag_context and plan and plan.teaching_workspace_id:
                topic_keywords = [w for w in session.topic.replace("-", " ").split() if len(w) > 3]
                m_stmt = select(LecturerMaterial).where(
                    LecturerMaterial.teaching_workspace_id == plan.teaching_workspace_id,
                    LecturerMaterial.is_student_visible == True,
                    LecturerMaterial.is_deleted == False,
                )
                if topic_keywords:
                    m_stmt = m_stmt.where(
                        or_(*[LecturerMaterial.display_name.ilike(f"%{kw}%") for kw in topic_keywords] +
                            [LecturerMaterial.original_filename.ilike(f"%{kw}%") for kw in topic_keywords])
                    )
                m_stmt = m_stmt.limit(5)
                m_res = await self.db.execute(m_stmt)
                mats = list(m_res.scalars().all()) if hasattr(m_res, "scalars") else []
                if not mats:
                    m_stmt_all = select(LecturerMaterial).where(
                        LecturerMaterial.teaching_workspace_id == plan.teaching_workspace_id,
                        LecturerMaterial.is_student_visible == True,
                        LecturerMaterial.is_deleted == False,
                    ).limit(5)
                    m_res_all = await self.db.execute(m_stmt_all)
                    mats = list(m_res_all.scalars().all()) if hasattr(m_res_all, "scalars") else []

                if mats:
                    mat_ids = [m.id for m in mats]
                    from app.db.models.resource import LecturerMaterialChunk
                    c_stmt = select(LecturerMaterialChunk).where(
                        LecturerMaterialChunk.lecturer_material_id.in_(mat_ids),
                        LecturerMaterialChunk.is_deleted == False,
                    ).limit(10)
                    c_res = await self.db.execute(c_stmt)
                    chunks = list(c_res.scalars().all()) if hasattr(c_res, "scalars") else []
                    if chunks:
                        rag_context_lines = []
                        for c in chunks:
                            mat_name = next((m.display_name or m.original_filename for m in mats if m.id == c.lecturer_material_id), "Lecturer Material")
                            rag_context_lines.append(f"--- Document: {mat_name} (Chunk {c.chunk_index}) ---\n{c.content[:1000]}")
                            rag_citations.append({
                                "resource_id": str(c.lecturer_material_id),
                                "resource_name": mat_name,
                                "title": mat_name,
                                "snippet": c.content[:300],
                                "chunk_index": c.chunk_index,
                            })
                        rag_context = "\n\n".join(rag_context_lines)
                    else:
                        rag_context = ""

            try:
                from app.agents.study_planner_agent import StudyPlannerAgent
                from app.core.ai.gateway import AIGateway
                from app.core.ai.provider_factory import (
                    get_ai_provider, get_embedding_provider)

                chat_provider = get_ai_provider()
                embed_provider = get_embedding_provider()
                gateway = AIGateway(self.db, chat_provider, embed_provider)
                agent = StudyPlannerAgent(gateway)

                lesson_output = await agent.generate_lesson(
                    session=session,
                    rag_context=rag_context,
                    learning_profile=profile_dict,
                )
                if hasattr(lesson_output, "citations") and not lesson_output.citations and rag_citations:
                    lesson_output.citations = rag_citations

                grounded_refs = list(dict.fromkeys([c.get("resource_name") or c.get("title") for c in rag_citations if c.get("resource_name") or c.get("title")]))
                if grounded_refs and hasattr(lesson_output, "lecturer_references"):
                    lesson_output.lecturer_references = grounded_refs

                session.lesson_plan_json = lesson_output.model_dump()
                # Guard: null out any diagram_prompt that doesn't pass structural Mermaid validation
                # before persisting so the frontend renderer never receives malformed syntax.
                sanitised_sections = []
                for sec in lesson_output.sections:
                    if not self._is_valid_mermaid(sec.diagram_prompt):
                        sec.diagram_prompt = None
                    sanitised_sections.append(sec)
                session.lesson_sections_json = [sec.model_dump() for sec in sanitised_sections]
                session.session_summary_text = getattr(lesson_output, "summary", "") or session.session_summary_text
            except Exception as exc:
                logger.warning("Guided lesson AI generation failed, using fallback lesson content", error=str(exc))
                fallback_output = self._build_fallback_lesson_plan(session, rag_citations)
                session.lesson_plan_json = fallback_output.model_dump()
                # Same guard for the fallback path
                sanitised_fallback = []
                for sec in fallback_output.sections:
                    if not self._is_valid_mermaid(sec.diagram_prompt):
                        sec.diagram_prompt = None
                    sanitised_fallback.append(sec)
                session.lesson_sections_json = [sec.model_dump() for sec in sanitised_fallback]
                session.session_summary_text = fallback_output.summary

            session.lesson_status = "IN_PROGRESS"
            session.lesson_generated_at = datetime.now(UTC)
        elif session.lesson_status != "COMPLETED":
            session.lesson_status = "IN_PROGRESS"

        await self.repo.update_session(session)
        await self.db.commit()
        return self._format_session(session)

    async def get_guided_session_detail(
        self, session_id: uuid.UUID, student_id: uuid.UUID
    ) -> StudySessionResponse:
        """Get current status and section content of a guided study session."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Study session not found")
        return self._format_session(session)

    async def ask_guided_session_question(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        question: str,
        section_context: str = "",
    ) -> Dict[str, Any]:
        """Ask AI a context-aware question during a guided study session, with chat history and citations."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Study session not found")

        from app.agents.student_support_agent import StudySupportAgent
        from app.core.ai.gateway import AIGateway
        from app.core.ai.provider_factory import (get_ai_provider,
                                                  get_embedding_provider)

        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)
        agent = StudySupportAgent(gateway)

        existing_history = list(session.tutor_chat_history or [])
        conv_history = [
            {"role": item["role"], "content": item["content"]}
            for item in existing_history
            if isinstance(item, dict) and "role" in item and "content" in item
        ]

        prompt_with_context = (
            f"[CURRENT GUIDED LESSON CONTEXT: Topic='{session.topic}', Section Context='{section_context}']\n\n{question}"
        )

        output = await agent.answer(
            question=prompt_with_context,
            student_id=student_id,
            conversation_history=conv_history,
            selected_resource_id=None,
            db=self.db,
            log_to_global_history=False,  # Guided-lesson panel must not pollute the global Study AI Tutor history
        )

        citations_data = [c.model_dump() for c in output.citations]
        now_iso = datetime.now(UTC).isoformat()

        user_msg = {"role": "user", "content": question, "timestamp": now_iso}
        ai_msg = {
            "role": "assistant",
            "content": output.answer,
            "citations": citations_data,
            "timestamp": now_iso,
        }

        updated_history = existing_history + [user_msg, ai_msg]
        session.tutor_chat_history = updated_history
        await self.repo.update_session(session)
        await self.db.commit()

        return {
            "answer": output.answer,
            "citations": citations_data,
            "fallback_used": output.fallback_used,
            "history": updated_history,
        }

    async def generate_guided_exercise(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        section_index: int = 0,
    ) -> Dict[str, Any]:
        """Generate one inline practice activity for the current section with immediate feedback, grounded in AI and RAG."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Study session not found")

        sections = session.lesson_sections_json or []
        sec_item = sections[section_index] if section_index < len(sections) else {}
        sec_title = sec_item.get("section_title", session.topic)
        sec_content = sec_item.get("content", "")

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
        rag_context = ""
        try:
            from app.services.rag_service import RAGService
            rag_service = RAGService(self.db)
            if plan and plan.teaching_workspace_id:
                rag_res = await rag_service.retrieve_context_for_lecturer(
                    topic=sec_title,
                    teaching_workspace_id=plan.teaching_workspace_id,
                    top_k=3,
                )
                if rag_res and rag_res.context_string:
                    rag_context = rag_res.context_string
            if not rag_context:
                rag_res = await rag_service.retrieve_context(
                    question=sec_title,
                    student_id=student_id,
                    top_k=3,
                )
                if rag_res and rag_res.context_string:
                    rag_context = rag_res.context_string
        except Exception as exc:
            logger.warning("RAG context retrieval for guided exercise failed", error=str(exc))

        try:
            from app.agents.study_planner_agent import StudyPlannerAgent
            from app.core.ai.gateway import AIGateway
            from app.core.ai.provider_factory import (get_ai_provider,
                                                      get_embedding_provider)

            chat_provider = get_ai_provider()
            embed_provider = get_embedding_provider()
            gateway = AIGateway(self.db, chat_provider, embed_provider)
            agent = StudyPlannerAgent(gateway)

            ex_output = await agent.generate_guided_exercise(
                student_id=student_id,
                session_id=session_id,
                topic=session.topic,
                section_title=sec_title,
                section_content=sec_content,
                rag_context=rag_context,
            )
            return {
                "id": str(uuid.uuid4()),
                "section_index": section_index,
                "section_title": sec_title,
                "question_text": ex_output.question_text,
                "question_type": "MCQ",
                "options": ex_output.options,
                "correct_option_index": ex_output.correct_option_index,
                "explanation": ex_output.explanation,
            }
        except Exception as exc:
            logger.warning(
                "AI guided exercise generation failed, using topic section fallback",
                error=str(exc),
            )
            # Dynamic topic fallback with randomized option positions
            raw_options = [
                f"Core principle of {sec_title} applies directly to solve this scenario.",
                f"The guidelines of {sec_title} provide alternative implementation steps.",
                f"Applying {sec_title} reduces logic errors in this context.",
                f"None of the above statements are accurate.",
            ]
            import random
            shuffled = list(enumerate(raw_options))
            random.shuffle(shuffled)
            options = [opt for _, opt in shuffled]
            correct_idx = next(i for i, (old_i, _) in enumerate(shuffled) if old_i == 0)

            return {
                "id": str(uuid.uuid4()),
                "section_index": section_index,
                "section_title": sec_title,
                "question_text": f"Quick Check: Which statement best reflects the key principle of {sec_title}?",
                "question_type": "MCQ",
                "options": options,
                "correct_option_index": correct_idx,
                "explanation": f"Core principle of {sec_title} governs the correct approach for this module.",
            }

    async def submit_guided_knowledge_check(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        answers: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Grade knowledge check responses, persist evaluation, and update StudentLearningProfile."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Study session not found")

        questions = session.quiz_questions or []
        if not questions:
            questions = await self.generate_session_quiz(session_id, student_id, question_count=5)
        if not questions:
            raise ValueError("Unable to grade knowledge check: no questions found or generated.")

        try:
            from app.agents.study_planner_agent import StudyPlannerAgent
            from app.core.ai.gateway import AIGateway
            from app.core.ai.provider_factory import (get_ai_provider,
                                                      get_embedding_provider)

            chat_provider = get_ai_provider()
            embed_provider = get_embedding_provider()
            gateway = AIGateway(self.db, chat_provider, embed_provider)
            agent = StudyPlannerAgent(gateway)

            report_obj = await agent.grade_knowledge_check(
                student_id=student_id,
                session_id=session_id,
                questions=questions,
                student_answers=answers,
                session_topic=session.topic,
            )
            report = report_obj.model_dump()
        except Exception as exc:
            logger.error(
                "Knowledge check AI evaluation failed; falling back to deterministic option grading",
                error=str(exc),
            )
            raw_questions = questions if isinstance(questions, list) else []
            total_q = len(raw_questions)
            if total_q == 0:
                raise ValueError("Unable to grade knowledge check: no questions found or grading evaluation failed.")

            from app.agents.study_planner_agent import \
                evaluate_question_response
            correct_count = 0
            q_grades = []
            for i, q_item in enumerate(raw_questions):
                q_dict = q_item.model_dump() if hasattr(q_item, "model_dump") else (q_item if isinstance(q_item, dict) else {})
                q_id = str(q_dict.get("id", i))
                raw_ans = answers.get(q_id, answers.get(str(i), ""))

                is_correct, score_pct, student_ans_str, correct_ans_str = evaluate_question_response(q_dict, raw_ans)

                if is_correct:
                    correct_count += 1

                q_grades.append({
                    "question_id": q_id,
                    "is_correct": is_correct,
                    "score": score_pct / 100.0,
                    "student_answer": student_ans_str,
                    "correct_answer": correct_ans_str,
                    "explanation": q_dict.get("explanation", "Evaluated based on answer verification key."),
                })

            calc_percentage = round((correct_count / total_q * 100), 1)
            report = {
                "total_questions": total_q,
                "score_percentage": calc_percentage,
                "question_grades": q_grades,
                "mastered_concepts": [session.topic] if calc_percentage >= 70 else [],
                "weak_concepts": [session.topic] if calc_percentage < 70 else [],
                "estimated_confidence_level": int(calc_percentage),
                "recommendations": [
                    "Review missed questions to improve concept understanding."
                    if calc_percentage < 70
                    else "Great job! Keep maintaining this streak."
                ],
            }

        score = float(report.get("score_percentage", 0.0))
        await self.repo.update_session_knowledge_check(
            session_id=session_id,
            answers=answers,
            score=score,
            report=report,
        )

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
        course_id = plan.course_id if plan else None
        profile = await self.repo.get_or_create_learning_profile(student_id, course_id)

        conf_dict = dict(profile.topic_confidence or {})
        conf_dict[session.topic] = int(report.get("estimated_confidence_level", int(score)))
        weak_list = list(profile.weak_topics or [])
        for w in report.get("weak_concepts", []):
            if w not in weak_list:
                weak_list.append(w)

        old_avg = profile.average_knowledge_check_score
        new_avg = score if old_avg is None else round((old_avg + score) / 2, 1)

        await self.repo.update_learning_profile(
            profile.id,
            topic_confidence=conf_dict,
            weak_topics=weak_list,
            average_knowledge_check_score=new_avg,
            last_studied_at=datetime.now(UTC),
        )

        # Issue M10: Auto-populate recommended_resource_ids from lecturer materials matching weak concepts or session topic
        try:
            mats_stmt = select(LecturerMaterial).where(
                LecturerMaterial.is_student_visible == True,
                LecturerMaterial.is_deleted == False,
            )
            if plan and plan.teaching_workspace_id:
                mats_stmt = mats_stmt.where(LecturerMaterial.teaching_workspace_id == plan.teaching_workspace_id)

            m_res = await self.db.execute(mats_stmt)
            mats = list(m_res.scalars().all())
            if mats:
                weak_set = set(report.get("weak_concepts", []) or [session.topic])
                rec_ids = [
                    str(m.id) for m in mats
                    if any(
                        w.lower() in (getattr(m, "display_name", None) or getattr(m, "original_filename", "") or "").lower()
                        or (getattr(m, "display_name", None) or getattr(m, "original_filename", "") or "").lower() in w.lower()
                        for w in weak_set
                    )
                ]
                if not rec_ids:
                    rec_ids = [str(mats[0].id)]
                session.recommended_resource_ids = rec_ids
                await self.repo.update_session(session)

                if plan:
                    curr_covered = set(plan.covered_material_ids or [])
                    curr_covered.update(rec_ids)
                    plan.covered_material_ids = list(curr_covered)
                    await self.repo.update_plan(plan)
        except Exception as exc:
            logger.warning("Failed to auto-recommend materials for knowledge check", error=str(exc))

        # Issue 4c: Spaced repetition auto-scheduling for weak topics
        weak_concepts = report.get("weak_concepts", [])
        if weak_concepts or score < 70:
            try:
                spaced_topics = weak_concepts if weak_concepts else [session.topic]
                await self.schedule_spaced_repetition_session(student_id, session.study_plan_id, spaced_topics, days_ahead=2)
            except Exception as exc:
                logger.warning("Spaced repetition auto-scheduling failed", error=str(exc))

        await self.db.commit()
        return report

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

        sched_start = target_date.replace(hour=start_hour, minute=start_min, second=0, microsecond=0, tzinfo=UTC)
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

    async def complete_guided_session(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> StudySessionResponse:
        """Mark guided study session as completed, generate summary, and update streak & readiness."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Study session not found")

        session.lesson_status = "COMPLETED"
        session.status = "COMPLETED"
        session.completed_at = datetime.now(UTC)

        try:
            from app.agents.study_planner_agent import StudyPlannerAgent
            from app.core.ai.gateway import AIGateway
            from app.core.ai.provider_factory import (get_ai_provider,
                                                      get_embedding_provider)

            chat_provider = get_ai_provider()
            embed_provider = get_embedding_provider()
            gateway = AIGateway(self.db, chat_provider, embed_provider)
            agent = StudyPlannerAgent(gateway)

            summary_out = await agent.generate_session_summary(
                student_id=student_id,
                session_id=session_id,
                topic=session.topic,
                lesson_content=str(session.lesson_sections_json),
                knowledge_check_report=session.knowledge_check_report,
            )
            summary_parts = []
            if getattr(summary_out, "key_takeaways", None):
                summary_parts.append("**Key Takeaways:**\n" + "\n".join(f"- {t}" for t in summary_out.key_takeaways))
            if getattr(summary_out, "concepts_covered", None):
                summary_parts.append("**Concepts Covered:** " + ", ".join(f"`{c}`" for c in summary_out.concepts_covered))
            if getattr(summary_out, "common_mistakes_to_avoid", None):
                summary_parts.append("**Common Pitfalls to Avoid:**\n" + "\n".join(f"- {m}" for m in summary_out.common_mistakes_to_avoid))
            if getattr(summary_out, "recommendations_for_future_revision", None):
                summary_parts.append("**Recommendations for Revision:**\n" + "\n".join(f"- {r}" for r in summary_out.recommendations_for_future_revision))

            session.session_summary_text = "\n\n".join(summary_parts) if summary_parts else f"Summary for {session.topic}: Covered core concepts, worked through practical examples, and completed self-evaluation."
        except Exception as exc:
            logger.warning("Session summary AI generation failed, using topic summary fallback", error=str(exc))
            session.session_summary_text = f"Summary for {session.topic}: Covered core concepts, worked through practical examples, and completed self-evaluation."

        await self.repo.update_session(session)

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
        if plan:
            plan.streak_count += 1
            all_sessions = plan.sessions or []
            comp_sessions = [s for s in all_sessions if s.status == "COMPLETED" and not s.is_deleted]
            total_sessions = len([s for s in all_sessions if not s.is_deleted])
            if total_sessions > 0:
                ratio = len(comp_sessions) / total_sessions
                plan.readiness_score = min(100, max(DEFAULT_INITIAL_READINESS_SCORE, int(ratio * 100)))
            await self.repo.update_plan(plan)

            profile = await self.repo.get_or_create_learning_profile(student_id, plan.course_id)
            await self.repo.update_learning_profile(
                profile.id,
                total_sessions_completed=profile.total_sessions_completed + 1,
                current_streak_days=profile.current_streak_days + 1,
                last_studied_at=datetime.now(UTC),
            )

        # Update StudentLearningUnitProgress if linked to a Learning Unit
        if session.learning_unit_id:
            try:
                from app.db.models.learning_unit import StudentLearningUnitProgress
                prog_stmt = select(StudentLearningUnitProgress).where(
                    StudentLearningUnitProgress.student_id == student_id,
                    StudentLearningUnitProgress.learning_unit_id == session.learning_unit_id,
                )
                prog_res = await self.db.execute(prog_stmt)
                prog = prog_res.scalar_one_or_none()
                if not prog:
                    prog = StudentLearningUnitProgress(
                        student_id=student_id,
                        learning_unit_id=session.learning_unit_id,
                        status="COMPLETED",
                        completed_at=datetime.now(UTC),
                        linked_session_id=session.id,
                    )
                    self.db.add(prog)
                else:
                    prog.status = "COMPLETED"
                    prog.completed_at = datetime.now(UTC)
                    prog.linked_session_id = session.id
                    self.db.add(prog)
            except Exception as exc:
                logger.warning("Failed to update StudentLearningUnitProgress on session completion", error=str(exc))

        await self.db.commit()
        return self._format_session(session)

    async def extract_learning_units(self, material_id: uuid.UUID) -> List[Any]:
        """
        AI Extraction Pipeline (5b): Extract structured Learning Units from material chunks and persist.
        """
        from app.db.models.resource import LecturerMaterial, LecturerMaterialChunk
        from app.db.models.learning_unit import LearningUnit

        material = await self.db.get(LecturerMaterial, material_id)
        if not material or not material.teaching_workspace_id:
            return []

        chunks_stmt = select(LecturerMaterialChunk).where(
            LecturerMaterialChunk.lecturer_material_id == material_id
        ).order_by(LecturerMaterialChunk.chunk_index.asc())
        chunks_res = await self.db.execute(chunks_stmt)
        chunks = list(chunks_res.scalars().all())

        if not chunks:
            return []

        max_idx_stmt = select(func.max(LearningUnit.order_index)).where(
            LearningUnit.teaching_workspace_id == material.teaching_workspace_id,
            LearningUnit.is_deleted == False,
        )
        max_res = await self.db.execute(max_idx_stmt)
        current_max = max_res.scalar() or 0

        from app.agents.study_planner_agent import StudyPlannerAgent
        from app.core.ai.gateway import AIGateway
        from app.core.ai.provider_factory import get_ai_provider, get_embedding_provider

        chat_provider = get_ai_provider()
        embed_provider = get_embedding_provider()
        gateway = AIGateway(self.db, chat_provider, embed_provider)
        agent = StudyPlannerAgent(gateway)

        chunk_dicts = [
            {"chunk_index": c.chunk_index, "content": getattr(c, "content", None) or getattr(c, "snippet", "") or ""}
            for c in chunks
        ]
        segments = await agent.segment_into_learning_units(material.title or "Material", chunk_dicts)

        created_units = []
        for i, seg in enumerate(segments):
            chunk_ids = [str(chunks[c_i].id) for c_i in seg.chunk_indices if 0 <= c_i < len(chunks)]
            lu = LearningUnit(
                teaching_workspace_id=material.teaching_workspace_id,
                source_material_id=material.id,
                order_index=current_max + i + 1,
                title=seg.title,
                summary=seg.summary,
                source_chunk_ids=chunk_ids,
                estimated_study_minutes=seg.estimated_minutes,
                is_active=True,
            )
            self.db.add(lu)
            created_units.append(lu)

        await self.db.commit()
        return created_units

    async def get_workspace_learning_units(
        self, workspace_id: uuid.UUID, student_id: uuid.UUID
    ) -> List[LearningUnitResponse]:
        """Fetch ordered Learning Units for workspace with student progress (5d)."""
        from app.db.models.learning_unit import LearningUnit, StudentLearningUnitProgress
        stmt = select(LearningUnit).where(
            LearningUnit.teaching_workspace_id == workspace_id,
            LearningUnit.is_active == True,
            LearningUnit.is_deleted == False,
        ).order_by(LearningUnit.order_index.asc())
        res = await self.db.execute(stmt)
        lus = list(res.scalars().all())

        if not lus:
            return []

        lu_ids = [lu.id for lu in lus]
        prog_stmt = select(StudentLearningUnitProgress).where(
            StudentLearningUnitProgress.student_id == student_id,
            StudentLearningUnitProgress.learning_unit_id.in_(lu_ids),
        )
        prog_res = await self.db.execute(prog_stmt)
        prog_map = {p.learning_unit_id: p for p in prog_res.scalars().all()}

        output = []
        for lu in lus:
            p = prog_map.get(lu.id)
            output.append(
                LearningUnitResponse(
                    id=lu.id,
                    teaching_workspace_id=lu.teaching_workspace_id,
                    source_material_id=lu.source_material_id,
                    order_index=lu.order_index,
                    title=lu.title,
                    summary=lu.summary,
                    source_chunk_ids=lu.source_chunk_ids or [],
                    estimated_study_minutes=lu.estimated_study_minutes,
                    is_active=lu.is_active,
                    status=p.status if p else "NOT_STARTED",
                    confidence_score=p.confidence_score if p else None,
                )
            )
        return output
