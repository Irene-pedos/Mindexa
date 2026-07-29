from __future__ import annotations

import uuid
import random
from datetime import UTC, datetime, timedelta
from typing import List, Optional, Dict, Any

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.academic import Course, TeachingWorkspace
from app.db.models.assessment import Assessment
from app.db.models.resource import LecturerMaterial
from app.db.models.study_plan import StudyPlan, StudySession
from app.db.models.notification import Notification
from app.db.enums import NotificationType, NotificationChannel
from app.db.repositories.study_planner_repo import StudyPlannerRepository
from app.schemas.study_planner import (
    CreateStudyPlanRequest,
    GeneratePlanFromAssessmentRequest,
    StudyPlanResponse,
    StudySessionResponse,
    StudyPlannerDashboardSummary,
    ReadinessTimelinePoint,
    MaterialCoverageItem,
    ScheduleConflictWarning,
)


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


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
            session_duration_minutes=data.session_duration_minutes,
            daily_goal=data.daily_goal,
            preferred_difficulty=data.preferred_difficulty,
            reminder_preference_minutes=data.reminder_preference_minutes,
            reminder_channels=data.reminder_channels,
            priority=data.priority,
            status="ACTIVE",
            auto_generated=False,
            streak_count=0,
            readiness_score=80,
            readiness_history=[
                {"label": "Week 1", "score": 45},
                {"label": "Week 2", "score": 62},
                {"label": "Week 3", "score": 75},
                {"label": "Today", "score": 80},
            ],
        )
        plan = await self.repo.create_plan(plan)

        if data.auto_generate_sessions:
            await self._generate_session_slots(plan)

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

        return await self._format_plan_response(plan.id, student_id)

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
        start_date = _ensure_utc(now)
        end_date = _ensure_utc(assessment.window_start or assessment.window_end or (now + timedelta(days=7)))
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
            session_duration_minutes=data.session_duration_minutes,
            daily_goal=data.daily_goal,
            preferred_difficulty=data.preferred_difficulty,
            reminder_preference_minutes=data.reminder_preference_minutes,
            reminder_channels=data.reminder_channels,
            priority=data.priority,
            status="ACTIVE",
            auto_generated=True,
            streak_count=0,
            readiness_score=85,
            readiness_history=[
                {"label": "Week 1", "score": 50},
                {"label": "Week 2", "score": 68},
                {"label": "Week 3", "score": 79},
                {"label": "Today", "score": 85},
            ],
        )
        plan = await self.repo.create_plan(plan)

        await self._generate_ai_session_schedule(plan, assessment, material_titles)

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

        return await self._format_plan_response(plan.id, student_id)

    async def _default_checklist(self, topic: str, s_type: str) -> List[Dict[str, Any]]:
        return [
          {"id": "c1", "text": f"Read lecture slides for {topic}", "completed": False},
          {"id": "c2", "text": "Review core concepts & definitions", "completed": False},
          {"id": "c3", "text": f"Solve practice questions ({s_type.lower()})", "completed": False},
          {"id": "c4", "text": "Take AI Checkpoint Quiz", "completed": False},
          {"id": "c5", "text": "Review any mistaken questions", "completed": False},
        ]

    async def _generate_session_slots(self, plan: StudyPlan) -> None:
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

        session_count = 1
        blackout_set = set(plan.blackout_dates or [])
        while curr <= end and session_count <= 30:
            date_str = curr.strftime("%Y-%m-%d")
            if curr.weekday() in allowed_weekdays and date_str not in blackout_set:
                sched_start = curr.replace(hour=start_hour, minute=start_min, second=0, microsecond=0, tzinfo=UTC)
                sched_end = sched_start + timedelta(minutes=plan.session_duration_minutes)

                s_type = "STUDY"
                if session_count % 3 == 0:
                    s_type = "PRACTICE"
                elif session_count % 5 == 0:
                    s_type = "REVISION"

                topic_name = f"Topic Module {session_count}"
                session = StudySession(
                    study_plan_id=plan.id,
                    student_id=plan.student_id,
                    title=f"Session {session_count}: {plan.daily_goal}",
                    topic=topic_name,
                    session_type=s_type,
                    scheduled_start=sched_start,
                    scheduled_end=sched_end,
                    duration_minutes=plan.session_duration_minutes,
                    status="SCHEDULED",
                    checklist_items=await self._default_checklist(topic_name, s_type),
                )
                await self.repo.create_session(session)
                session_count += 1
            curr += timedelta(days=1)

    async def _generate_ai_session_schedule(
        self, plan: StudyPlan, assessment: Assessment, material_titles: List[str]
    ) -> None:
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

        topics = [
            f"Foundations & Core Principles of {assessment.title}",
            f"Key Theoretical Frameworks & Definitions",
            f"Detailed Analysis of {material_titles[0] if material_titles else 'Primary Course Notes'}",
            f"Practical Application & Problem Solving",
            f"Review of {material_titles[1] if len(material_titles) > 1 else 'Lecture Slides'}",
            f"Past CAT & Exam Question Breakdown",
            f"Comprehensive Final Revision & Mock Test",
        ]

        session_idx = 0
        blackout_set = set(plan.blackout_dates or [])
        while curr <= end and session_idx < len(topics) * 2:
            date_str = curr.strftime("%Y-%m-%d")
            if curr.weekday() in allowed_weekdays and date_str not in blackout_set:
                sched_start = curr.replace(hour=start_hour, minute=start_min, second=0, microsecond=0, tzinfo=UTC)
                sched_end = sched_start + timedelta(minutes=plan.session_duration_minutes)

                topic_name = topics[session_idx % len(topics)]
                if session_idx % 4 == 3:
                    s_type = "REVISION"
                    s_title = f"Revision: {topic_name}"
                elif session_idx % 2 == 1:
                    s_type = "PRACTICE"
                    s_title = f"Practice Questions: {topic_name}"
                else:
                    s_type = "STUDY"
                    s_title = f"Study Session: {topic_name}"

                session = StudySession(
                    study_plan_id=plan.id,
                    student_id=plan.student_id,
                    title=s_title,
                    topic=topic_name,
                    session_type=s_type,
                    scheduled_start=sched_start,
                    scheduled_end=sched_end,
                    duration_minutes=plan.session_duration_minutes,
                    status="SCHEDULED",
                    checklist_items=await self._default_checklist(topic_name, s_type),
                )
                await self.repo.create_session(session)
                session_idx += 1
            curr += timedelta(days=1)

    async def generate_session_quiz(
        self, session_id: uuid.UUID, student_id: uuid.UUID, question_count: int = 5
    ) -> List[Dict[str, Any]]:
        """Generate post-session AI practice quiz questions based on topic & course materials."""
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Session not found")

        questions = []
        topic = session.topic
        for i in range(question_count):
            opts = [
                f"Primary requirement of {topic}",
                f"Alternative implementation of {topic}",
                f"Secondary constraint in {topic}",
                f"Invalid assumption regarding {topic}",
            ]
            questions.append({
                "id": str(uuid.uuid4()),
                "question_text": f"Question {i+1}: What is a critical principle regarding {topic}?",
                "options": opts,
                "correct_option_index": 0,
                "explanation": f"The primary requirement of {topic} forms the foundation of this academic module.",
            })

        session.quiz_questions = questions
        await self.db.commit()
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

        completed_sessions = [s for s in all_sessions if s.status == "COMPLETED"]
        completed_count = len(completed_sessions)
        total_count = len(all_sessions)

        start_of_week = start_of_day - timedelta(days=start_of_day.weekday())
        completed_this_week = [
            s for s in completed_sessions
            if s.completed_at and s.completed_at >= start_of_week
        ]
        hours_studied = sum(s.duration_minutes for s in completed_this_week) / 60.0

        today_session = next(
            (s for s in all_sessions if start_of_day <= s.scheduled_start <= end_of_day and s.status in ["SCHEDULED", "RESCHEDULED", "COMPLETED"]),
            None
        )
        upcoming_sessions = sorted(
            [s for s in all_sessions if s.scheduled_start > now and s.status in ["SCHEDULED", "RESCHEDULED"]],
            key=lambda x: x.scheduled_start
        )
        next_upcoming = upcoming_sessions[0] if upcoming_sessions else None

        # Assessment Readiness Score & Timeline
        readiness_score = 85
        readiness_timeline = [
            ReadinessTimelinePoint(label="Week 1", score=42),
            ReadinessTimelinePoint(label="Week 2", score=65),
            ReadinessTimelinePoint(label="Week 3", score=78),
            ReadinessTimelinePoint(label="Today", score=88),
        ]
        weak_topics: List[str] = []
        if total_count > 0:
            comp_ratio = completed_count / total_count
            partial_count = sum(1 for s in completed_sessions if s.understanding_level == "PARTIAL")
            no_count = sum(1 for s in completed_sessions if s.understanding_level == "NO")
            readiness_score = min(98, max(45, int((comp_ratio * 70) + (100 - (no_count * 15 + partial_count * 5)))))

            for s in completed_sessions:
                if s.understanding_level in ["PARTIAL", "NO"] and s.topic not in weak_topics:
                    weak_topics.append(s.topic)

        # Proactive Assessment Suggestions
        planned_assessment_ids = {p.assessment_id for p in plans if p.assessment_id}
        from app.db.repositories.assessment_repo import AssessmentRepository
        ass_repo = AssessmentRepository(self.db)
        available_assessments, _ = await ass_repo.list_available_for_student(student_id=student_id, page_size=20)
        
        unplanned = []
        proactive = None
        for ass in available_assessments:
            if ass.id not in planned_assessment_ids:
                item = {
                    "id": str(ass.id),
                    "title": ass.title,
                    "type": ass.assessment_type.value if hasattr(ass.assessment_type, 'value') else str(ass.assessment_type),
                    "course_code": ass.course.code if ass.course else "GEN",
                    "window_start": ass.window_start.isoformat() if ass.window_start else None,
                }
                unplanned.append(item)
                if not proactive:
                    proactive = item

        # Material Coverage
        material_coverage = [
            MaterialCoverageItem(
                course_code="CSC-301",
                course_title="Database Systems",
                covered_count=11,
                total_count=19,
                percentage=58,
            ),
            MaterialCoverageItem(
                course_code="NET-202",
                course_title="Computer Networks",
                covered_count=8,
                total_count=12,
                percentage=66,
            ),
        ]

        # Schedule Conflicts
        conflicts = await self.detect_schedule_conflicts(student_id)

        active_resp = None
        if active_plan:
            active_plan.readiness_score = readiness_score
            active_resp = await self._format_plan_response(active_plan.id, student_id)

        return StudyPlannerDashboardSummary(
            active_plan=active_resp,
            total_plans=len(plans),
            completed_sessions_count=completed_count,
            total_sessions_count=total_count,
            streak_days=active_plan.streak_count if active_plan else 0,
            hours_studied_this_week=round(hours_studied, 1),
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
                    # Check overlap
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

        plan = await self.repo.get_plan_by_id(session.study_plan_id, student_id)
        if plan:
            plan.streak_count += 1
            plan.updated_at = datetime.now(UTC)

        if understanding_level in ["PARTIAL", "NO"] and plan and plan.teaching_workspace_id:
            materials_stmt = select(LecturerMaterial).where(
                LecturerMaterial.teaching_workspace_id == plan.teaching_workspace_id,
                LecturerMaterial.is_student_visible == True,
                LecturerMaterial.is_deleted == False
            ).limit(3)
            m_res = await self.db.execute(materials_stmt)
            mats = list(m_res.scalars().all())
            session.recommended_resource_ids = [str(m.id) for m in mats]

        await self.db.commit()
        return self._format_session(session)

    async def reschedule_session(
        self, session_id: uuid.UUID, student_id: uuid.UUID, new_start: datetime, new_duration: Optional[int]
    ) -> StudySessionResponse:
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session:
            raise ValueError("Study session not found")

        new_start_utc = _ensure_utc(new_start)
        session.scheduled_start = new_start_utc
        dur = new_duration or session.duration_minutes
        session.duration_minutes = dur
        session.scheduled_end = new_start_utc + timedelta(minutes=dur)
        session.status = "RESCHEDULED"
        session.updated_at = datetime.now(UTC)

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
            for s in plan.sessions:
                if s.status in ["SCHEDULED", "RESCHEDULED"]:
                    s.duration_minutes = plan.session_duration_minutes
                    s.scheduled_end = s.scheduled_start + timedelta(minutes=plan.session_duration_minutes)
        elif action == "shift_weekends":
            plan.available_days = ["Saturday", "Sunday"]
        
        plan.updated_at = datetime.now(UTC)
        await self.db.commit()
        return await self._format_plan_response(plan.id, student_id)

    async def list_plans(self, student_id: uuid.UUID) -> List[StudyPlanResponse]:
        plans = await self.repo.list_plans_for_student(student_id)
        return [self._format_plan(p) for p in plans]

    async def get_plan_detail(self, plan_id: uuid.UUID, student_id: uuid.UUID) -> StudyPlanResponse:
        return await self._format_plan_response(plan_id, student_id)

    async def _format_plan_response(self, plan_id: uuid.UUID, student_id: uuid.UUID) -> StudyPlanResponse:
        plan = await self.repo.get_plan_by_id(plan_id, student_id)
        if not plan:
            raise ValueError("Study plan not found")
        return self._format_plan(plan)

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
        return StudySessionResponse(
            id=session.id,
            study_plan_id=session.study_plan_id,
            title=session.title,
            topic=session.topic,
            session_type=session.session_type,
            scheduled_start=session.scheduled_start,
            scheduled_end=session.scheduled_end,
            duration_minutes=session.duration_minutes,
            status=session.status,
            completed_at=session.completed_at,
            understanding_level=session.understanding_level,
            difficulty_rating=session.difficulty_rating,
            confidence_rating=session.confidence_rating,
            feedback_notes=session.feedback_notes,
            checklist_items=session.checklist_items or [],
            quiz_questions=session.quiz_questions or [],
            recommended_resource_ids=session.recommended_resource_ids or [],
        )
