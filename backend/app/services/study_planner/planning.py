from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.core import links as frontend_links
from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.logging import get_logger

logger = get_logger(__name__)

from sqlalchemy import and_, func, select

from app.db.enums import AssessmentStatus, NotificationChannel, NotificationType
from app.db.models.academic import Course, TeachingWorkspace
from app.db.models.assessment import Assessment
from app.db.models.learning_unit import LearningUnit, StudentLearningUnitProgress
from app.db.models.notification import Notification
from app.db.models.resource import LecturerMaterial
from app.db.models.study_plan import DEFAULT_INITIAL_READINESS_SCORE, StudyPlan, StudySession
from app.schemas.study_planner import (
    CreateStudyPlanRequest,
    GeneratePlanFromAssessmentRequest,
    LearningUnitResponse,
    StudyPlanResponse,
)
from app.services.study_planner.base import PlannerBase
from app.services.study_planner.common import _clamp_session_duration, _ensure_utc, _wall_clock_utc


class PlanningMixin(PlannerBase):
    async def _assert_workspace_access(self, student_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
        """Reject workspaces the student is not enrolled in (their units, materials and RAG chunks are private)."""
        if not await self.workspace_repo.is_student_enrolled(student_id, workspace_id):
            logger.warning(
                "study_planner_workspace_access_denied",
                student_id=str(student_id),
                workspace_id=str(workspace_id),
            )
            raise AuthorizationError("You are not enrolled in this course workspace")

    async def _assert_course_access(self, student_id: uuid.UUID, course_id: uuid.UUID) -> None:
        """Reject courses in which the student has no active workspace access."""
        if not await self.workspace_repo.is_student_in_course(student_id, course_id):
            logger.warning(
                "study_planner_course_access_denied",
                student_id=str(student_id),
                course_id=str(course_id),
            )
            raise AuthorizationError("You are not enrolled in this course")

    async def get_workspace_learning_units(
        self, workspace_id: uuid.UUID, student_id: uuid.UUID
    ) -> List[LearningUnitResponse]:
        """Fetch ordered learning units for a workspace or synthesize units from course materials."""
        # 1. Resolve workspace_id (support both TeachingWorkspace.id and Course.id)
        tw_id: uuid.UUID = workspace_id
        ws_stmt = select(TeachingWorkspace).where(
            TeachingWorkspace.id == workspace_id,
            TeachingWorkspace.is_deleted == False,
        )
        ws_res = await self.db.execute(ws_stmt)
        ws = ws_res.scalar_one_or_none()

        if not ws:
            # workspace_id was passed as a course_id: use a workspace of that course the student
            # can actually access (not an arbitrary one, which may belong to another section).
            accessible = await self.workspace_repo.list_by_student(student_id)
            c_ws = next((w for w in accessible if w.course_id == workspace_id), None)
            if c_ws:
                tw_id = c_ws.id
                ws = c_ws

        await self._assert_workspace_access(student_id, tw_id)

        # 2. Query persisted LearningUnit records
        lu_stmt = (
            select(LearningUnit)
            .where(
                LearningUnit.teaching_workspace_id == tw_id,
                LearningUnit.is_active == True,
                LearningUnit.is_deleted == False,
            )
            .order_by(LearningUnit.order_index.asc())
        )
        units = list((await self.db.execute(lu_stmt)).scalars().all())

        # 3. If persisted LUs exist, attach student progress and return
        if units:
            lu_ids = [u.id for u in units]
            prog_stmt = select(StudentLearningUnitProgress).where(
                StudentLearningUnitProgress.student_id == student_id,
                StudentLearningUnitProgress.learning_unit_id.in_(lu_ids),
                StudentLearningUnitProgress.is_deleted == False,
            )
            progress_rows = list((await self.db.execute(prog_stmt)).scalars().all())
            prog_map = {p.learning_unit_id: p for p in progress_rows}

            return [
                LearningUnitResponse(
                    id=u.id,
                    teaching_workspace_id=u.teaching_workspace_id,
                    source_material_id=u.source_material_id,
                    order_index=u.order_index,
                    title=u.title,
                    summary=u.summary,
                    learning_outcomes=u.learning_outcomes or [],
                    start_page=u.start_page,
                    end_page=u.end_page,
                    source_chunk_ids=u.source_chunk_ids or [],
                    estimated_study_minutes=u.estimated_study_minutes or 45,
                    is_active=u.is_active,
                    status=prog_map.get(u.id).status if u.id in prog_map else "NOT_STARTED",
                    confidence_score=prog_map.get(u.id).confidence_score if u.id in prog_map else None,
                )
                for u in units
            ]

        # 4. Fallback: Synthesize learning units from LecturerMaterial
        mat_stmt = (
            select(LecturerMaterial)
            .where(
                LecturerMaterial.teaching_workspace_id == tw_id,
                LecturerMaterial.is_student_visible == True,
                LecturerMaterial.is_deleted == False,
            )
            .order_by(LecturerMaterial.created_at.asc())
        )
        materials = list((await self.db.execute(mat_stmt)).scalars().all())

        if materials:
            synthetic_units: List[LearningUnitResponse] = []
            for i, mat in enumerate(materials):
                display_title = (
                    mat.display_name
                    or mat.original_filename
                    or f"Module {i + 1}"
                )
                if "." in display_title:
                    display_title = display_title.rsplit(".", 1)[0]

                synthetic_units.append(
                    LearningUnitResponse(
                        id=mat.id,
                        teaching_workspace_id=tw_id,
                        source_material_id=mat.id,
                        order_index=i + 1,
                        title=f"Unit {i + 1}: {display_title}",
                        summary=f"Key concepts and lecture materials from {display_title}.",
                        learning_outcomes=[
                            f"Master foundational concepts of {display_title}",
                            f"Review practice problems and practical applications for {display_title}",
                        ],
                        start_page=1,
                        end_page=mat.page_count if hasattr(mat, "page_count") else None,
                        source_chunk_ids=[],
                        estimated_study_minutes=45,
                        is_active=True,
                        status="NOT_STARTED",
                        confidence_score=None,
                    )
                )
            return synthetic_units

        # 5. Course-level curriculum fallback
        course_name = ws.title if ws and hasattr(ws, "title") and ws.title else "Course Curriculum"
        return [
            LearningUnitResponse(
                id=uuid.uuid5(tw_id, "unit_1"),
                teaching_workspace_id=tw_id,
                source_material_id=None,
                order_index=1,
                title="Unit 1: Foundations & Core Concepts",
                summary=f"Foundational topics, key terminology, and theoretical background for {course_name}.",
                learning_outcomes=[
                    "Understand key principles and definitions",
                    "Establish core conceptual frameworks",
                ],
                start_page=1,
                end_page=None,
                source_chunk_ids=[],
                estimated_study_minutes=45,
                is_active=True,
                status="NOT_STARTED",
                confidence_score=None,
            ),
            LearningUnitResponse(
                id=uuid.uuid5(tw_id, "unit_2"),
                teaching_workspace_id=tw_id,
                source_material_id=None,
                order_index=2,
                title="Unit 2: Practical Applications & Analysis",
                summary=f"Problem solving, analysis, and intermediate domain techniques for {course_name}.",
                learning_outcomes=[
                    "Apply core methods to practical problem scenarios",
                    "Analyze and evaluate domain-specific workflows",
                ],
                start_page=1,
                end_page=None,
                source_chunk_ids=[],
                estimated_study_minutes=45,
                is_active=True,
                status="NOT_STARTED",
                confidence_score=None,
            ),
            LearningUnitResponse(
                id=uuid.uuid5(tw_id, "unit_3"),
                teaching_workspace_id=tw_id,
                source_material_id=None,
                order_index=3,
                title="Unit 3: Advanced Topics & Exam Mastery",
                summary=f"Comprehensive review, synthesis, and exam-readiness preparation for {course_name}.",
                learning_outcomes=[
                    "Synthesize advanced course topics",
                    "Achieve assessment readiness through active recall",
                ],
                start_page=1,
                end_page=None,
                source_chunk_ids=[],
                estimated_study_minutes=45,
                is_active=True,
                status="NOT_STARTED",
                confidence_score=None,
            ),
        ]

    async def _get_accessible_assessment(
        self, student_id: uuid.UUID, assessment_id: uuid.UUID
    ) -> Optional[Assessment]:
        """Assessment the student may prepare for: released to students and inside an enrolled workspace.

        Returns None when it does not exist or is not released (drafts must not leak topics);
        raises AuthorizationError when it belongs to a workspace the student is not part of.
        """
        stmt = select(Assessment).where(
            Assessment.id == assessment_id,
            Assessment.is_deleted == False,
            Assessment.status.in_(
                [AssessmentStatus.PUBLISHED, AssessmentStatus.ACTIVE, AssessmentStatus.CLOSED]
            ),
        )
        assessment = (await self.db.execute(stmt)).scalar_one_or_none()
        if assessment is None:
            return None
        if assessment.teaching_workspace_id:
            await self._assert_workspace_access(student_id, assessment.teaching_workspace_id)
        elif assessment.course_id:
            await self._assert_course_access(student_id, assessment.course_id)
        else:
            # Not tied to any workspace or course: nothing proves the student may see it.
            return None
        return assessment

    async def _resolve_target(
        self,
        target_mode: str,
        target_learning_unit_id: Optional[uuid.UUID],
        teaching_workspace_id: Optional[uuid.UUID],
    ) -> Tuple[str, Optional[uuid.UUID]]:
        """Persistable (mode, unit) pair; a unit outside the plan's workspace is ignored."""
        if target_mode != "up_to_learning_unit" or not target_learning_unit_id or not teaching_workspace_id:
            return "full_assessment_coverage", None
        unit_stmt = select(LearningUnit.id).where(
            LearningUnit.id == target_learning_unit_id,
            LearningUnit.teaching_workspace_id == teaching_workspace_id,
            LearningUnit.is_deleted == False,
        )
        if (await self.db.execute(unit_stmt)).scalar_one_or_none() is None:
            return "full_assessment_coverage", None
        return "up_to_learning_unit", target_learning_unit_id

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

        if teaching_workspace_id:
            await self._assert_workspace_access(student_id, teaching_workspace_id)
        elif course_id:
            await self._assert_course_access(student_id, course_id)

        assessment_id: Optional[uuid.UUID] = None
        if data.assessment_id:
            accessible = await self._get_accessible_assessment(student_id, data.assessment_id)
            assessment_id = accessible.id if accessible else None

        target_mode, target_learning_unit_id = await self._resolve_target(
            data.target_mode, data.target_learning_unit_id, teaching_workspace_id
        )

        plan = StudyPlan(
            student_id=student_id,
            title=data.title,
            study_type=data.study_type,
            course_id=course_id,
            teaching_workspace_id=teaching_workspace_id,
            assessment_id=assessment_id,
            target_mode=target_mode,
            target_learning_unit_id=target_learning_unit_id,
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
            action_url=frontend_links.student_study(),
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
        assessment = await self._get_accessible_assessment(student_id, data.assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found")

        target_mode, target_learning_unit_id = await self._resolve_target(
            data.target_mode, data.target_learning_unit_id, assessment.teaching_workspace_id
        )

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
        material_titles = [
            (m.display_name or m.original_filename or getattr(m, "title", "Course Material"))
            for m in materials
        ] if materials else ["Course Core Concepts", "Practice Problems", "Past Questions"]

        title = f"AI Study Prep: {assessment.title}"
        plan = StudyPlan(
            student_id=student_id,
            title=title,
            study_type="Assessment Preparation",
            course_id=assessment.course_id,
            teaching_workspace_id=assessment.teaching_workspace_id,
            assessment_id=assessment.id,
            target_mode=target_mode,
            target_learning_unit_id=target_learning_unit_id,
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
            action_url=frontend_links.student_study(),
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
                    AssessmentLearningUnitCoverage,
                    LearningUnit,
                    StudentLearningUnitProgress,
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
                from app.db.models.academic import LecturerMaterial, TeachingWorkspace
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

        material_titles = [
            title
            for material in materials
            if (title := (material.display_name or material.original_filename))
        ]
        material_ids = [str(m.id) for m in materials if getattr(m, "id", None)]

        try:
            from app.agents.study_planner_agent import StudyPlannerAgent

            gateway = self._build_gateway()
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

    async def weak_topics_from_results(
        self,
        student_id: uuid.UUID,
        course_id: Optional[uuid.UUID] = None,
        threshold_pct: float = 60.0,
        limit: int = 8,
    ) -> List[str]:
        """Topics the student scored poorly on in released results, weakest first.

        Closes the improvement loop: what the student got wrong in marked work
        seeds what the planner schedules. Only released results count, so the
        planner never reveals marks the student has not been shown.
        """
        from app.db.models.question import Question
        from app.db.models.result import AssessmentResult, ResultBreakdown

        avg_pct = func.avg(ResultBreakdown.score / func.nullif(ResultBreakdown.max_score, 0) * 100)
        stmt = (
            select(Question.topic_tag, avg_pct.label("avg_pct"))
            .join(ResultBreakdown, ResultBreakdown.question_id == Question.id)
            .join(AssessmentResult, AssessmentResult.id == ResultBreakdown.result_id)
            .where(
                AssessmentResult.student_id == student_id,
                AssessmentResult.is_released == True,  # noqa: E712
                AssessmentResult.is_deleted == False,  # noqa: E712
                ResultBreakdown.score.is_not(None),
                Question.topic_tag.is_not(None),
                Question.topic_tag != "",
            )
            .group_by(Question.topic_tag)
            .having(avg_pct < threshold_pct)
            .order_by(avg_pct.asc())
            .limit(limit)
        )
        if course_id is not None:
            stmt = stmt.join(Assessment, Assessment.id == AssessmentResult.assessment_id).where(
                Assessment.course_id == course_id
            )
        rows = (await self.db.execute(stmt)).all()
        return [str(row.topic_tag) for row in rows]

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
        profile_weak = list(getattr(profile, "weak_topics", None) or [])
        try:
            result_weak = await self.weak_topics_from_results(
                plan.student_id, getattr(assessment, "course_id", None)
            )
        except Exception as exc:
            logger.warning("weak_topics_from_results_failed", error=str(exc))
            result_weak = []
        # Marked-work evidence first, then what the student told us themselves.
        weak_topics = list(dict.fromkeys(result_weak + profile_weak)) or None
        topic_confidence = getattr(profile, "topic_confidence", None)

        course_code = None
        if assessment and hasattr(assessment, "course") and assessment.course:
            course_code = getattr(assessment.course, "code", None)

        # Call StudyPlannerAgent to generate dynamic topics
        try:
            from app.agents.study_planner_agent import StudyPlannerAgent

            gateway = self._build_gateway()
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

        existing_plans = await self.repo.list_plans_for_student(plan.student_id)  # once, not per slot
        session_idx = 0
        matching_day_counter = 0
        max_possible_sessions = max(available_days_count, target_session_count)
        while curr <= end and session_idx < max_possible_sessions:
            date_str = curr.strftime("%Y-%m-%d")
            if curr.weekday() in allowed_weekdays and date_str not in blackout_set:
                matching_day_counter += 1
                if step_interval == 1 or (matching_day_counter % step_interval == 1):
                    sched_start = _wall_clock_utc(curr, start_hour, start_min)
                    actual_dur = duration_minutes
                    if end_hour is not None and end_min is not None:
                        window_limit = _wall_clock_utc(curr, end_hour, end_min)
                        if window_limit > sched_start:
                            max_window = int((window_limit - sched_start).total_seconds() / 60)
                            actual_dur = min(actual_dur, max_window)
                    sched_end = sched_start + timedelta(minutes=actual_dur)

                    # Conflict Avoidance & Auto-Shift Check
                    conflict = await self._find_conflicts_for_slot(plan.student_id, sched_start, sched_end, exclude_plan_id=plan.id, plans=existing_plans)
                    if conflict:
                        shifted_start = _ensure_utc(conflict.scheduled_end)
                        if shifted_start < sched_end:
                            shifted_start = sched_start + timedelta(minutes=30)
                        shifted_end = shifted_start + timedelta(minutes=actual_dur)

                        day_limit = _wall_clock_utc(curr, end_hour or 23, end_min or 59)
                        if shifted_end <= day_limit and not await self._find_conflicts_for_slot(plan.student_id, shifted_start, shifted_end, exclude_plan_id=plan.id, plans=existing_plans):
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
