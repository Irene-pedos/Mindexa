from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import List, Optional

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)

from app.db.models.study_plan import StudyPlan, StudySession
from app.schemas.study_planner import (
    ScheduleConflictWarning,
    StudyPlanResponse,
    StudySessionResponse,
)
from app.services.study_planner.base import PlannerBase
from app.services.study_planner.common import _ensure_utc, _wall_clock_utc


class SchedulingMixin(PlannerBase):
    async def _find_conflicts_for_slot(
        self,
        student_id: uuid.UUID,
        proposed_start: datetime,
        proposed_end: datetime,
        exclude_session_id: Optional[uuid.UUID] = None,
        exclude_plan_id: Optional[uuid.UUID] = None,
        plans: Optional[List[StudyPlan]] = None,
    ) -> Optional[StudySession]:
        """
        Shared conflict-checking utility across all active student plans.
        Returns conflicting StudySession if proposed_start < s.scheduled_end and proposed_end > s.scheduled_start.

        Callers that test many slots in a row (plan generation) pass ``plans`` loaded once, so the
        student's whole calendar is not re-queried for every candidate slot.
        """
        if plans is None:
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

        existing_plans = await self.repo.list_plans_for_student(plan.student_id)  # once, not per slot
        session_count = 1
        while curr <= end and session_count <= estimated_session_count:
            date_str = curr.strftime("%Y-%m-%d")
            if curr.weekday() in allowed_weekdays and date_str not in blackout_set:
                sched_start = _wall_clock_utc(curr, start_hour, start_min)
                dur = plan.session_duration_minutes
                if end_hour is not None and end_min is not None:
                    window_limit = _wall_clock_utc(curr, end_hour, end_min)
                    if window_limit > sched_start:
                        max_window = int((window_limit - sched_start).total_seconds() / 60)
                        dur = min(dur, max_window)
                sched_end = sched_start + timedelta(minutes=dur)

                # Conflict Avoidance & Auto-Shift Check
                conflict = await self._find_conflicts_for_slot(plan.student_id, sched_start, sched_end, exclude_plan_id=plan.id, plans=existing_plans)
                if conflict:
                    shifted_start = _ensure_utc(conflict.scheduled_end)
                    if shifted_start < sched_end:
                        shifted_start = sched_start + timedelta(minutes=30)
                    shifted_end = shifted_start + timedelta(minutes=dur)

                    day_limit = _wall_clock_utc(curr, end_hour or 23, end_min or 59)
                    if shifted_end <= day_limit and not await self._find_conflicts_for_slot(plan.student_id, shifted_start, shifted_end, exclude_plan_id=plan.id, plans=existing_plans):
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

    async def reschedule_session(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        new_start: datetime,
        new_duration: Optional[int],
        force: bool = False,
        plan_id: Optional[uuid.UUID] = None,
    ) -> StudySessionResponse:
        session = await self.repo.get_session_by_id(session_id, student_id)
        if not session or (plan_id is not None and session.study_plan_id != plan_id):
            raise NotFoundError("Study session not found")

        # Finished sessions keep their history; moving one would silently "revive" it as RESCHEDULED.
        if session.status in ("COMPLETED", "CANCELLED"):
            raise ConflictError(f"A {session.status.lower()} session can't be rescheduled.")

        new_start_utc = _ensure_utc(new_start)
        dur = new_duration or session.duration_minutes
        proposed_end = new_start_utc + timedelta(minutes=dur)

        # `force` lets a student accept clashes and blackout dates, but never a start in the past.
        if new_start_utc < datetime.now(UTC) - timedelta(minutes=5):
            raise ConflictError("A session can't be rescheduled to a time that has already passed.")

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
            raise NotFoundError("Study plan not found")

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

                    new_start = _wall_clock_utc(
                        datetime(curr_date.year, curr_date.month, curr_date.day), start_hour, start_min
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
            raise ValidationError(f"Action '{action}' is not supported")

        await self.repo.update_plan(plan)
        await self.db.commit()
        return await self._format_plan_response(plan.id, student_id)
