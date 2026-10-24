"""
backend/app/services/eligibility_service.py

Phase 6A: Eligibility, Reassessment, and Retake Engine.
Deterministic rules and orchestration for institutional progression.
ZERO hardcoded thresholds: all values read from EligibilityPolicy.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import links as frontend_links
from app.core.exceptions import (
    EligibilityBlockedError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.db.base import utcnow
from app.db.enums import (
    AssessmentStatus,
    AssessmentType,
    AttemptStatus,
    EnrollmentStatus,
    EligibilityDecisionType,
    EligibilityResult,
    NotificationType,
    OverrideSource,
    PaymentPurpose,
    PaymentStatus,
    ReassessmentBlockScope,
    ReassessmentRequirementStatus,
    RetakeStatus,
    RetakeTrigger,
    UserRole,
)
from app.db.models.academic import (
    AcademicPeriod,
    ClassGroup,
    ClassSection,
    Course,
    StudentEnrollment,
    TeachingAssignment,
)
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from app.db.models.auth import User
from app.db.models.eligibility import (
    AttemptEligibilityOverride,
    EligibilityDecision,
    EligibilityPolicy,
    PaymentReference,
    ReassessmentRequirement,
    RetakeRecord,
)
from app.db.models.result import AssessmentResult
from app.db.repositories.eligibility_repo import EligibilityRepository
from app.db.repositories.notification_repo import NotificationRepository
from app.schemas.eligibility import (
    AssessmentBlockedStudentsResponse,
    BlockedStudentItem,
    LecturerCourseEligibilityResponse,
    StudentCohortEligibilityItem,
    StudentCourseEligibilityResponse,
)
from app.services.eligibility_rules import (
    EntryDecision,
    coursework_average,
    formative_requires_reassessment,
    percentage,
    summative_entry,
    summative_outcome,
)

# Coursework only counts once students could see it; DRAFT / moderation states never do.
_COURSEWORK_COUNTABLE_STATUSES = (
    AssessmentStatus.PUBLISHED,
    AssessmentStatus.ACTIVE,
    AssessmentStatus.CLOSED,
    AssessmentStatus.ARCHIVED,
)

# Attempts whose marks are not final: open, or finished and waiting for grading.
_PENDING_ATTEMPT_STATUSES = frozenset(
    s.value
    for s in (
        AttemptStatus.PENDING,
        AttemptStatus.IN_PROGRESS,
        AttemptStatus.PAUSED,
        AttemptStatus.SUBMITTED,
        AttemptStatus.AUTO_SUBMITTED,
        AttemptStatus.TIMED_OUT,
        AttemptStatus.FLAGGED,
    )
)


def _attempt_status_value(attempt: Any) -> str:
    status = getattr(attempt, "status", None)
    return str(getattr(status, "value", status))


def _assessment_is_closed(assessment: Any, now: datetime) -> bool:
    """True once nobody can take the assessment any more, so a missing attempt is a real absence."""
    status = getattr(assessment, "status", None)
    if getattr(status, "value", status) in (AssessmentStatus.CLOSED.value, AssessmentStatus.ARCHIVED.value):
        return True
    window_end = getattr(assessment, "window_end", None)
    if window_end is None:
        return False
    if window_end.tzinfo is None:
        window_end = window_end.replace(tzinfo=now.tzinfo)
    return window_end < now


class EligibilityService:
    """Service layer orchestrating Phase 6A institutional eligibility, reassessments, and retakes."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = EligibilityRepository(db)
        self.notif_repo = NotificationRepository(db)

    # ── Policy Management ────────────────────────────────────────────────────

    async def get_policy(
        self,
        institution_id: uuid.UUID,
        department_id: Optional[uuid.UUID] = None,
    ) -> EligibilityPolicy:
        """Fetch active policy for institution/department with fallback to defaults."""
        return await self.repo.get_policy(institution_id, department_id)

    async def update_policy(
        self,
        institution_id: uuid.UUID,
        department_id: Optional[uuid.UUID] = None,
        **fields: Any,
    ) -> EligibilityPolicy:
        """Create or update policy thresholds without hardcoded values."""
        return await self.repo.upsert_policy(
            institution_id=institution_id,
            department_id=department_id,
            **fields,
        )

    # ── Helpers for Course & Context ─────────────────────────────────────────

    async def _resolve_assessment_and_course(
        self, assessment_id: uuid.UUID
    ) -> Tuple[Assessment, Course]:
        stmt = (
            select(Assessment)
            .where(Assessment.id == assessment_id, Assessment.is_deleted == False)
            .options(selectinload(Assessment.course))
        )
        res = await self.db.execute(stmt)
        assessment = res.scalars().first()
        if not assessment:
            raise NotFoundError(f"Assessment {assessment_id} not found.")

        if not assessment.course_id or not assessment.course:
            stmt_c = select(Course).where(Course.id == assessment.course_id)
            res_c = await self.db.execute(stmt_c)
            course = res_c.scalars().first()
            if not course:
                raise NotFoundError(f"Course for assessment {assessment_id} not found.")
        else:
            course = assessment.course

        return assessment, course

    async def _resolve_policy_for_course(
        self, course: Course
    ) -> EligibilityPolicy:
        return await self.repo.get_policy(
            institution_id=course.institution_id,
            department_id=course.department_id,
        )

    # ── Trigger 1: Formative Finalization / Release ──────────────────────────

    async def process_formative_finalization(
        self,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        score: float,
        max_marks: float,
    ) -> Optional[ReassessmentRequirement]:
        """
        Triggered when a formative assessment result is finalized/released.
        If percentage < policy.formative_exempt_pct:
          - Creates ReassessmentRequirement(REQUIRED) idempotently.
          - Fires notifications to student and lecturer.
          - Original formative score is never modified (R-18).
        """
        assessment, course = await self._resolve_assessment_and_course(assessment_id)
        policy = await self._resolve_policy_for_course(course)

        pct = percentage(score, max_marks)
        if not formative_requires_reassessment(pct, policy):
            return None

        # Period resolution
        period_id = getattr(assessment, "academic_period_id", None) or getattr(course, "academic_period_id", None)
        if not period_id:
            period_id = course.id  # fallback safe UUID if none assigned

        requirement = await self.repo.upsert_requirement(
            student_id=student_id,
            course_id=course.id,
            academic_period_id=period_id,
            source_assessment_id=assessment.id,
            original_percentage=pct,
            status=ReassessmentRequirementStatus.REQUIRED,
        )

        # Notify student
        await self.notif_repo.create(
            recipient_id=student_id,
            notification_type=NotificationType.REASSESSMENT_REQUIRED,
            title="Reassessment Required",
            body=(
                f"Your score on {assessment.title} was {pct:.1f}%, which is below the exemption "
                f"threshold ({policy.formative_exempt_pct:.1f}%). A reassessment is required."
            ),
            action_url=frontend_links.student_requests("retakes"),
            reference_id=str(requirement.id),
            reference_type="reassessment_requirement",
        )

        # Notify lecturer/author
        if assessment.created_by_id and assessment.created_by_id != student_id:
            await self.notif_repo.create(
                recipient_id=assessment.created_by_id,
                notification_type=NotificationType.REASSESSMENT_REQUIRED,
                title="Student Reassessment Flagged",
                body=(
                    f"A student scored {pct:.1f}% on formative assessment '{assessment.title}' "
                    f"and requires a reassessment."
                ),
                action_url=frontend_links.lecturer_course(course.id),
                reference_id=str(requirement.id),
                reference_type="reassessment_requirement",
            )

        return requirement

    # ── Trigger 2: Reassessment Created / Linked ─────────────────────────────

    async def link_reassessment_assessment(
        self,
        reassessment_assessment_id: uuid.UUID,
        source_assessment_id: uuid.UUID,
        target_student_ids: List[uuid.UUID],
    ) -> int:
        """
        When lecturer creates or links a reassessment assessment for targeted students,
        move their requirements from REQUIRED to ASSIGNED.
        """
        count = await self.repo.link_reassessment_assessment(
            source_assessment_id=source_assessment_id,
            reassessment_assessment_id=reassessment_assessment_id,
            student_ids=target_student_ids,
        )

        # Notify assigned students
        reassessment, course = await self._resolve_assessment_and_course(reassessment_assessment_id)
        for s_id in target_student_ids:
            await self.notif_repo.create(
                recipient_id=s_id,
                notification_type=NotificationType.REASSESSMENT_ASSIGNED,
                title="Reassessment Assigned",
                body=f"You have been assigned the reassessment '{reassessment.title}' for course {course.code}.",
                action_url=frontend_links.student_assessment_take(reassessment.id),
                reference_id=str(reassessment.id),
                reference_type="assessment",
            )

        return count

    # ── Trigger 3: Reassessment Attempt Submitted ────────────────────────────

    async def process_reassessment_attempt_submitted(
        self,
        reassessment_attempt_id: uuid.UUID,
        reassessment_assessment_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> Optional[ReassessmentRequirement]:
        """
        When reassessment attempt is submitted, mark requirement as SUBMITTED.
        Per A-06, this satisfies the CAT gate.
        """
        return await self.repo.mark_requirement_submitted(
            reassessment_attempt_id=reassessment_attempt_id,
            reassessment_assessment_id=reassessment_assessment_id,
            student_id=student_id,
        )

    # ── Trigger 4: Reassessment Attempt Graded ───────────────────────────────

    async def process_reassessment_attempt_graded(
        self,
        reassessment_attempt_id: uuid.UUID,
    ) -> Optional[ReassessmentRequirement]:
        """
        When reassessment attempt grade is released, mark requirement as GRADED.
        Failing it changes nothing further (A-16).
        """
        return await self.repo.mark_requirement_graded(reassessment_attempt_id)

    # ── Trigger 5: Summative Finalization ────────────────────────────────────

    async def process_summative_finalization(
        self,
        assessment_id: uuid.UUID,
        student_id: uuid.UUID,
        score: float,
        max_marks: float,
    ) -> Optional[RetakeRecord]:
        """
        Triggered when a summative exam result is finalized.
        If pct < summative_pass_pct, creates RetakeRecord(SUMMATIVE_FAILED) and logs audit decision.
        """
        assessment, course = await self._resolve_assessment_and_course(assessment_id)
        policy = await self._resolve_policy_for_course(course)

        pct = percentage(score, max_marks)
        outcome_res, outcome_code = summative_outcome(pct, policy)

        policy_snapshot = {
            "summative_pass_pct": policy.summative_pass_pct,
            "summative_entry_pct": policy.summative_entry_pct,
            "formative_exempt_pct": policy.formative_exempt_pct,
        }
        inputs_snapshot = {
            "assessment_id": str(assessment.id),
            "score": score,
            "max_marks": max_marks,
            "percentage": pct,
        }

        if outcome_res == EligibilityResult.RETAKE_REQUIRED:
            period_id = getattr(assessment, "academic_period_id", None) or getattr(course, "academic_period_id", None) or course.id

            decision = await self.repo.create_decision(
                student_id=student_id,
                course_id=course.id,
                assessment_id=assessment.id,
                decision_type=EligibilityDecisionType.COURSE_OUTCOME,
                result=EligibilityResult.RETAKE_REQUIRED,
                reason_code=RetakeTrigger.SUMMATIVE_FAILED.value,
                inputs_json=inputs_snapshot,
                policy_snapshot_json=policy_snapshot,
                computed_by="system",
            )

            retake = await self.repo.create_retake_record(
                student_id=student_id,
                course_id=course.id,
                from_period_id=period_id,
                trigger=RetakeTrigger.SUMMATIVE_FAILED,
                decided_decision_id=decision.id,
            )

            await self.notif_repo.create(
                recipient_id=student_id,
                notification_type=NotificationType.RETAKE_FLAGGED,
                title="Retake Required",
                body=(
                    f"Your summative exam score on {assessment.title} was {pct:.1f}%, which is below "
                    f"the pass threshold ({policy.summative_pass_pct:.1f}%). You have been flagged for retake."
                ),
                action_url=frontend_links.student_retakes(),
                reference_id=str(retake.id),
                reference_type="retake_record",
            )
            return retake
        else:
            await self.repo.create_decision(
                student_id=student_id,
                course_id=course.id,
                assessment_id=assessment.id,
                decision_type=EligibilityDecisionType.COURSE_OUTCOME,
                result=EligibilityResult.PASS,
                reason_code="SUMMATIVE_PASSED",
                inputs_json=inputs_snapshot,
                policy_snapshot_json=policy_snapshot,
                computed_by="system",
            )
            return None

    # ── Coursework Assessment Collection & Average ───────────────────────────

    async def _collect_coursework_items(
        self,
        student_id: uuid.UUID,
        course_id: uuid.UUID,
        academic_period_id: Optional[uuid.UUID] = None,
    ) -> List[Dict[str, Any]]:
        """
        Collects all finalized CAT and Formative items for the student in this course/period.
        Unweighted average (R-20): unexcused absence -> 0%; excused -> excluded;
        reassessments -> excluded; ungraded -> counted as pending.
        """
        # Only coursework that was actually released to students can count for or against them;
        # drafts and unpublished items must never turn into a 0% "absence".
        stmt = select(Assessment).where(
            Assessment.course_id == course_id,
            Assessment.assessment_type.in_([AssessmentType.CAT, AssessmentType.FORMATIVE]),
            Assessment.status.in_(_COURSEWORK_COUNTABLE_STATUSES),
            Assessment.is_deleted == False,
        )
        # NOTE: Assessment has no academic_period_id column, so `academic_period_id` cannot narrow this
        # query yet; coursework is collected per course across periods.

        res = await self.db.execute(stmt)
        assessments = list(res.scalars().all())
        now = utcnow()

        items: List[Dict[str, Any]] = []

        for asm in assessments:
            # Reassessments are excluded from coursework average (A-02)
            if asm.reassessment_of_id is not None or asm.assessment_type == AssessmentType.REASSESSMENT:
                items.append({
                    "assessment_id": str(asm.id),
                    "title": asm.title,
                    "is_reassessment": True,
                })
                continue

            # Query student result
            r_stmt = select(AssessmentResult).where(
                AssessmentResult.assessment_id == asm.id,
                AssessmentResult.student_id == student_id,
                AssessmentResult.is_deleted == False,
            )
            r_res = await self.db.execute(r_stmt)
            result = r_res.scalars().first()

            if result and result.is_released:
                items.append({
                    "assessment_id": str(asm.id),
                    "title": asm.title,
                    "score": result.total_score,
                    "max_marks": result.max_score,
                    "percentage": result.percentage,
                    "status": "GRADED",
                })
                continue

            # Check if there is an in-progress or submitted attempt
            att_stmt = select(AssessmentAttempt).where(
                AssessmentAttempt.assessment_id == asm.id,
                AssessmentAttempt.student_id == student_id,
                AssessmentAttempt.is_deleted == False,
            )
            att_res = await self.db.execute(att_stmt)
            attempts = list(att_res.scalars().all())

            # Any attempt that is finished-but-ungraded or still open means marks are pending.
            # (Auto-submitted / timed-out / flagged attempts were previously mistaken for absences.)
            if any(_attempt_status_value(a) in _PENDING_ATTEMPT_STATUSES for a in attempts):
                items.append({
                    "assessment_id": str(asm.id),
                    "title": asm.title,
                    "is_pending": True,
                    "status": "UNGRADED_PENDING",
                })
                continue

            # Check if student was excused for this assessment
            override = await self.repo.get_active_override(student_id=student_id, assessment_id=asm.id)
            if override and override.source == OverrideSource.EXCUSE:
                items.append({
                    "assessment_id": str(asm.id),
                    "title": asm.title,
                    "is_excused": True,
                    "status": "EXCUSED",
                })
                continue

            # Not attempted and still open (or not yet started): the student cannot have been absent yet.
            if not _assessment_is_closed(asm, now):
                continue

            # Otherwise, unexcused absence -> counts as 0% (A-03)
            items.append({
                "assessment_id": str(asm.id),
                "title": asm.title,
                "is_unexcused_absence": True,
                "percentage": 0.0,
                "status": "UNEXCUSED_ABSENCE",
            })

        return items

    # ── Attempt Start Gate (Section 10.4) ────────────────────────────────────

    async def evaluate_attempt_start_gate(
        self,
        student_id: uuid.UUID,
        assessment_id: uuid.UUID,
        assessment: Optional[Assessment] = None,
    ) -> Tuple[bool, str, Optional[EligibilityDecision]]:
        """
        Enforce eligibility gate before a student starts an attempt on an assessment.
        Returns (is_eligible, reason_code, decision_or_none).
        If not eligible, raises EligibilityBlockedError.
        """
        if assessment is None:
            assessment, course = await self._resolve_assessment_and_course(assessment_id)
        else:
            course = getattr(assessment, "course", None)
            if course is None and getattr(assessment, "course_id", None):
                stmt_c = select(Course).where(Course.id == assessment.course_id)
                res_c = await self.db.execute(stmt_c)
                course = res_c.scalars().first()
            if course is None:
                return True, "NO_COURSE_GATE_SKIPPED", None

        policy = await self._resolve_policy_for_course(course)
        now = utcnow()

        # Check for active override (HOD or EXCUSE)
        override = await self.repo.get_active_override(student_id=student_id, assessment_id=assessment_id, at_time=now)
        if override:
            return True, "OVERRIDE_ACTIVE", None

        asm_type = assessment.assessment_type
        type_str = asm_type.value if hasattr(asm_type, "value") else str(asm_type)

        # ── Gate A: CAT Gate ─────────────────────────────────────────────────
        if type_str in ["CAT", "cat"]:
            # Check for pending requirements in REQUIRED or ASSIGNED
            reqs: Sequence[ReassessmentRequirement]
            if policy.reassessment_block_scope == ReassessmentBlockScope.ALL_COURSES:
                reqs = await self.repo.list_pending_reassessments(student_id=student_id, course_id=None)
            else:
                reqs = await self.repo.list_pending_reassessments(student_id=student_id, course_id=course.id)

            policy_snapshot = {
                "reassessment_block_scope": policy.reassessment_block_scope.value,
                "formative_exempt_pct": policy.formative_exempt_pct,
            }
            inputs_snapshot = {
                "assessment_id": str(assessment.id),
                "pending_requirements_count": len(reqs),
                "pending_requirements": [
                    {"requirement_id": str(r.id), "source_assessment_id": str(r.source_assessment_id), "status": r.status.value}
                    for r in reqs
                ],
            }

            if reqs:
                decision = await self.repo.create_decision(
                    student_id=student_id,
                    course_id=course.id,
                    assessment_id=assessment.id,
                    decision_type=EligibilityDecisionType.CAT_GATE,
                    result=EligibilityResult.BLOCKED,
                    reason_code="REASSESSMENT_PENDING",
                    inputs_json=inputs_snapshot,
                    policy_snapshot_json=policy_snapshot,
                    computed_by="system",
                )

                # Send notification
                await self.notif_repo.create(
                    recipient_id=student_id,
                    notification_type=NotificationType.CAT_BLOCKED_REASSESSMENT,
                    title="CAT Attempt Blocked",
                    body=(
                        f"You cannot start CAT '{assessment.title}' until your pending formative reassessments "
                        f"are submitted."
                    ),
                    action_url=frontend_links.student_requests("retakes"),
                    reference_id=str(decision.id),
                    reference_type="eligibility_decision",
                )

                raise EligibilityBlockedError(
                    detail="Eligibility blocked: You have pending formative reassessments.",
                    reason_code="REASSESSMENT_PENDING",
                )

            # Not blocked
            decision = await self.repo.create_decision(
                student_id=student_id,
                course_id=course.id,
                assessment_id=assessment.id,
                decision_type=EligibilityDecisionType.CAT_GATE,
                result=EligibilityResult.ELIGIBLE,
                reason_code="CAT_ELIGIBLE",
                inputs_json=inputs_snapshot,
                policy_snapshot_json=policy_snapshot,
                computed_by="system",
            )
            return True, "CAT_ELIGIBLE", decision

        # ── Gate B: Summative Gate ───────────────────────────────────────────
        if type_str in ["EXAM", "exam", "SUMMATIVE", "summative"]:
            period_id = getattr(assessment, "academic_period_id", None) or getattr(course, "academic_period_id", None)
            items = await self._collect_coursework_items(
                student_id=student_id,
                course_id=course.id,
                academic_period_id=period_id,
            )

            avg = coursework_average(items)
            pending_count = sum(1 for it in items if it.get("is_pending", False))
            has_coursework = any(
                not it.get("is_reassessment", False)
                and not it.get("is_excused", False)
                and (it.get("percentage") is not None or it.get("is_pending", False))
                for it in items
            )

            entry_dec = summative_entry(
                avg=avg,
                pending_count=pending_count,
                has_coursework=has_coursework,
                policy=policy,
                pending_titles=[it.get("title", "") for it in items if it.get("is_pending")],
            )

            policy_snapshot = {
                "summative_entry_pct": policy.summative_entry_pct,
                "pending_marks_behavior": policy.pending_marks_behavior.value,
                "no_coursework_behavior": policy.no_coursework_behavior.value,
            }
            inputs_snapshot = {
                "assessment_id": str(assessment.id),
                "coursework_average": avg,
                "pending_count": pending_count,
                "has_coursework": has_coursework,
                "items": items,
            }

            if entry_dec.result != EligibilityResult.ELIGIBLE:
                decision = await self.repo.create_decision(
                    student_id=student_id,
                    course_id=course.id,
                    assessment_id=assessment.id,
                    decision_type=EligibilityDecisionType.SUMMATIVE_ENTRY,
                    result=entry_dec.result,
                    reason_code=entry_dec.reason_code,
                    inputs_json=inputs_snapshot,
                    policy_snapshot_json=policy_snapshot,
                    computed_by="system",
                )

                # Auto-create retake if entry threshold not met
                if entry_dec.reason_code == RetakeTrigger.ENTRY_THRESHOLD_NOT_MET.value:
                    p_id = period_id or course.id
                    await self.repo.create_retake_record(
                        student_id=student_id,
                        course_id=course.id,
                        from_period_id=p_id,
                        trigger=RetakeTrigger.ENTRY_THRESHOLD_NOT_MET,
                        decided_decision_id=decision.id,
                    )

                raise EligibilityBlockedError(
                    detail=f"Eligibility blocked: {entry_dec.message}",
                    reason_code=entry_dec.reason_code,
                )

            # Eligible for summative
            decision = await self.repo.create_decision(
                student_id=student_id,
                course_id=course.id,
                assessment_id=assessment.id,
                decision_type=EligibilityDecisionType.SUMMATIVE_ENTRY,
                result=EligibilityResult.ELIGIBLE,
                reason_code="COURSEWORK_THRESHOLD_MET",
                inputs_json=inputs_snapshot,
                policy_snapshot_json=policy_snapshot,
                computed_by="system",
            )
            return True, "COURSEWORK_THRESHOLD_MET", decision

        # Other assessment types (QUIZ, FORMATIVE, REASSESSMENT, ASSIGNMENT): no gate
        return True, "NOT_GATED", None

    # ── Explainable Overviews ────────────────────────────────────────────────

    async def get_student_course_eligibility(
        self,
        student_id: uuid.UUID,
        course_id: uuid.UUID,
    ) -> StudentCourseEligibilityResponse:
        """
        Explainable status for student dashboard showing coursework average,
        pending marks, summative eligibility, and decisions.
        """
        stmt_c = select(Course).where(Course.id == course_id, Course.is_deleted == False)
        res_c = await self.db.execute(stmt_c)
        course = res_c.scalars().first()
        if not course:
            raise NotFoundError(f"Course {course_id} not found.")

        policy = await self._resolve_policy_for_course(course)
        period_id = course.academic_period_id or course.id

        items = await self._collect_coursework_items(
            student_id=student_id,
            course_id=course.id,
            academic_period_id=period_id,
        )

        avg = coursework_average(items)
        pending_count = sum(1 for it in items if it.get("is_pending", False))
        has_coursework = any(
            not it.get("is_reassessment", False)
            and not it.get("is_excused", False)
            and (it.get("percentage") is not None or it.get("is_pending", False))
            for it in items
        )

        entry_dec = summative_entry(
            avg=avg,
            pending_count=pending_count,
            has_coursework=has_coursework,
            policy=policy,
            pending_titles=[it.get("title", "") for it in items if it.get("is_pending")],
        )

        pending_reqs = await self.repo.list_pending_reassessments(
            student_id=student_id,
            course_id=course.id,
        )

        decisions = await self.repo.list_decisions_for_student(
            student_id=student_id,
            course_id=course.id,
        )

        retakes = await self.repo.list_retakes_for_student(student_id=student_id)
        matching_retake = next((r for r in retakes if r.course_id == course.id), None)

        from app.schemas.eligibility import (
            EligibilityDecisionResponse,
            ReassessmentRequirementResponse,
        )

        return StudentCourseEligibilityResponse(
            student_id=student_id,
            course_id=course.id,
            course_code=course.code,
            course_title=course.title if hasattr(course, "title") else course.name,
            academic_period_id=period_id,
            coursework_average=round(avg, 2) if avg is not None else None,
            pending_marks_count=pending_count,
            has_coursework=has_coursework,
            summative_entry_eligible=(entry_dec.result == EligibilityResult.ELIGIBLE),
            summative_entry_reason=entry_dec.reason_code,
            pending_reassessments=[
                ReassessmentRequirementResponse.model_validate(r) for r in pending_reqs
            ],
            active_override=False,
            retake_status=matching_retake.status if matching_retake else None,
            decisions=[EligibilityDecisionResponse.model_validate(d) for d in decisions],
        )

    async def get_lecturer_course_cohort_eligibility(
        self,
        course_id: uuid.UUID,
    ) -> LecturerCourseEligibilityResponse:
        """Overview for lecturer showing all students in course and their summative eligibility."""
        stmt_c = select(Course).where(Course.id == course_id, Course.is_deleted == False)
        res_c = await self.db.execute(stmt_c)
        course = res_c.scalars().first()
        if not course:
            raise NotFoundError(f"Course {course_id} not found.")

        policy = await self._resolve_policy_for_course(course)
        period_id = course.academic_period_id or course.id

        # Query enrolled students
        enr_stmt = (
            select(StudentEnrollment)
            .join(ClassSection, ClassSection.id == StudentEnrollment.class_section_id)
            .where(
                or_(
                    ClassSection.id.in_(
                        select(TeachingAssignment.class_section_id).where(
                            TeachingAssignment.course_id == course_id,
                            TeachingAssignment.class_section_id.is_not(None),
                        )
                    ),
                    ClassSection.department_id == course.department_id,
                ),
                StudentEnrollment.enrollment_status.in_([EnrollmentStatus.ACTIVE, EnrollmentStatus.ACTIVE.value]),
                StudentEnrollment.is_deleted == False,
            )
            .options(selectinload(StudentEnrollment.student).selectinload(User.profile))
        )
        enr_res = await self.db.execute(enr_stmt)
        enrollments = list(enr_res.scalars().all())

        students_map: Dict[uuid.UUID, User] = {}
        for enr in enrollments:
            if enr.student and enr.student.id not in students_map:
                students_map[enr.student.id] = enr.student

        student_items: List[StudentCohortEligibilityItem] = []
        eligible_count = 0
        blocked_count = 0

        for s_id, student in students_map.items():
            items = await self._collect_coursework_items(
                student_id=s_id,
                course_id=course.id,
                academic_period_id=period_id,
            )
            avg = coursework_average(items)
            pending_count = sum(1 for it in items if it.get("is_pending", False))
            has_coursework = any(
                not it.get("is_reassessment", False)
                and not it.get("is_excused", False)
                and (it.get("percentage") is not None or it.get("is_pending", False))
                for it in items
            )

            entry_dec = summative_entry(
                avg=avg,
                pending_count=pending_count,
                has_coursework=has_coursework,
                policy=policy,
                pending_titles=[it.get("title", "") for it in items if it.get("is_pending")],
            )

            p_reqs = await self.repo.list_pending_reassessments(
                student_id=s_id,
                course_id=course.id,
            )

            is_elig = (entry_dec.result == EligibilityResult.ELIGIBLE)
            if is_elig:
                eligible_count += 1
            else:
                blocked_count += 1

            prof = getattr(student, "profile", None)
            first = getattr(prof, "first_name", "") or getattr(student, "first_name", "") or ""
            last = getattr(prof, "last_name", "") or getattr(student, "last_name", "") or ""
            full_name = f"{first} {last}".strip() or getattr(student, "email", "Student")
            reg_num = getattr(prof, "student_id", None) or getattr(student, "registration_number", None)

            student_items.append(
                StudentCohortEligibilityItem(
                    student_id=s_id,
                    student_name=full_name,
                    registration_number=reg_num,
                    coursework_average=round(avg, 2) if avg is not None else None,
                    pending_marks_count=pending_count,
                    summative_eligible=is_elig,
                    blocked_reason=entry_dec.reason_code if not is_elig else None,
                    active_override=False,
                    pending_reassessments_count=len(p_reqs),
                )
            )

        return LecturerCourseEligibilityResponse(
            course_id=course.id,
            course_code=course.code,
            course_title=course.title if hasattr(course, "title") else course.name,
            total_enrolled=len(students_map),
            eligible_count=eligible_count,
            blocked_count=blocked_count,
            students=student_items,
        )

    async def get_assessment_blocked_students(
        self,
        assessment_id: uuid.UUID,
    ) -> AssessmentBlockedStudentsResponse:
        """
        Lecturer view: list blocked students for an assessment and warnings when
        publishing a CAT while students still have pending reassessments.
        """
        assessment, course = await self._resolve_assessment_and_course(assessment_id)
        cohort = await self.get_lecturer_course_cohort_eligibility(course.id)

        asm_type = assessment.assessment_type
        type_str = asm_type.value if hasattr(asm_type, "value") else str(asm_type)

        blocked_items: List[BlockedStudentItem] = []
        warning: Optional[str] = None

        if type_str in ["CAT", "cat"]:
            # Check who has pending reassessments
            for s in cohort.students:
                if s.pending_reassessments_count > 0:
                    ov = await self.repo.get_active_override(student_id=s.student_id, assessment_id=assessment.id)
                    if ov is not None:
                        continue
                    blocked_items.append(
                        BlockedStudentItem(
                            student_id=s.student_id,
                            student_name=s.student_name,
                            registration_number=s.registration_number,
                            reason_code="REASSESSMENT_PENDING",
                            detail=f"Student has {s.pending_reassessments_count} pending formative reassessment(s).",
                            has_override=False,
                        )
                    )
            if blocked_items:
                warning = f"Warning: {len(blocked_items)} student(s) still have pending formative reassessments."

        elif type_str in ["EXAM", "exam", "SUMMATIVE", "summative"]:
            for s in cohort.students:
                if not s.summative_eligible:
                    ov = await self.repo.get_active_override(student_id=s.student_id, assessment_id=assessment.id)
                    if ov is not None:
                        continue
                    blocked_items.append(
                        BlockedStudentItem(
                            student_id=s.student_id,
                            student_name=s.student_name,
                            registration_number=s.registration_number,
                            reason_code=s.blocked_reason or "BLOCKED",
                            detail=f"Coursework entry requirement not met: {s.blocked_reason}",
                            has_override=False,
                        )
                    )

        return AssessmentBlockedStudentsResponse(
            assessment_id=assessment.id,
            assessment_title=assessment.title,
            assessment_type=type_str,
            warning=warning,
            blocked_students=blocked_items,
        )

    # ── HOD Override (A-11) ──────────────────────────────────────────────────

    async def create_hod_override(
        self,
        student_id: uuid.UUID,
        assessment_id: uuid.UUID,
        reason: str,
        granted_by: User,
        allowed_window_start: Optional[datetime] = None,
        allowed_window_end: Optional[datetime] = None,
    ) -> AttemptEligibilityOverride:
        """
        HOD overrides an eligibility block for a single student and assessment.
        Reason is mandatory.
        """
        if not reason or not reason.strip():
            raise ValidationError("Mandatory reason required for HOD eligibility override.")

        assessment, course = await self._resolve_assessment_and_course(assessment_id)
        policy = await self._resolve_policy_for_course(course)

        if not policy.allow_hod_override:
            raise PermissionDeniedError("HOD eligibility overrides are disabled by institutional policy.")

        override = await self.repo.create_override(
            student_id=student_id,
            assessment_id=assessment.id,
            source=OverrideSource.HOD_OVERRIDE,
            reason=reason.strip(),
            granted_by_id=granted_by.id,
            allowed_window_start=allowed_window_start or utcnow(),
            allowed_window_end=allowed_window_end,
        )

        return override

    # ── Retake Payment & Enrollment Flow (R-22, A-17) ────────────────────────

    async def attach_payment_reference(
        self,
        retake_id: uuid.UUID,
        student_id: uuid.UUID,
        external_reference: Optional[str] = None,
        amount_text: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> RetakeRecord:
        """Student or admin attaches payment info to FLAGGED retake record."""
        retake = await self.repo.get_retake_record(retake_id)
        if not retake:
            raise NotFoundError(f"Retake record {retake_id} not found.")

        if retake.student_id != student_id:
            raise PermissionDeniedError("Cannot attach payment reference to another student's retake.")

        payment = await self.repo.create_payment_reference(
            purpose=PaymentPurpose.RETAKE,
            student_id=student_id,
            external_reference=external_reference,
            amount_text=amount_text,
            notes=notes,
        )

        updated_retake = await self.repo.attach_payment_to_retake(
            retake_id=retake.id,
            payment_reference_id=payment.id,
        )
        return updated_retake or retake

    async def confirm_payment_reference(
        self,
        payment_id: uuid.UUID,
        status: PaymentStatus,
        confirmed_by: User,
        notes: Optional[str] = None,
    ) -> PaymentReference:
        """Admin or finance user confirms or rejects a payment reference."""
        payment = await self.repo.get_payment_reference(payment_id)
        if not payment:
            raise NotFoundError(f"Payment reference {payment_id} not found.")

        confirmed = await self.repo.confirm_payment(
            payment_id=payment.id,
            status=status,
            confirmed_by_id=confirmed_by.id,
            notes=notes,
        )
        if not confirmed:
            raise NotFoundError(f"Payment reference {payment_id} not found.")

        # If confirmed and linked to retake, update retake to PAID
        if status == PaymentStatus.CONFIRMED:
            stmt = select(RetakeRecord).where(
                RetakeRecord.payment_reference_id == payment.id,
                RetakeRecord.is_deleted == False,
            )
            res = await self.db.execute(stmt)
            retake = res.scalars().first()
            if retake:
                await self.repo.update_retake_status(retake.id, RetakeStatus.PAID)
                await self.notif_repo.create(
                    recipient_id=retake.student_id,
                    notification_type=NotificationType.RETAKE_PAYMENT_CONFIRMED,
                    title="Retake Payment Confirmed",
                    body="Your payment reference for course retake has been confirmed.",
                    action_url=frontend_links.student_retakes(),
                    reference_id=str(retake.id),
                    reference_type="retake_record",
                )

        return confirmed

    async def enroll_retake(
        self,
        retake_id: uuid.UUID,
        target_period_id: Optional[uuid.UUID] = None,
        target_course_id: Optional[uuid.UUID] = None,
    ) -> RetakeRecord:
        """
        Admin or HOD finalizes enrolment:
        Retake must be in PAID status.
        Creates/links StudentEnrollment to next period offering, is_retake=True.
        If next period does not exist yet, stays PAID with target_period_id NULL.
        """
        retake = await self.repo.get_retake_record(retake_id)
        if not retake:
            raise NotFoundError(f"Retake record {retake_id} not found.")

        if retake.status != RetakeStatus.PAID:
            raise ValidationError(
                f"Cannot enroll retake in status '{retake.status.value}'. Must be 'PAID'.",
                code="RETAKE_NOT_PAID",
            )

        course = retake.course
        from_period = retake.from_period

        # Determine target period
        resolved_period_id = target_period_id
        if not resolved_period_id:
            # Query next period: start_date > from_period.start_date
            if from_period and hasattr(from_period, "start_date") and from_period.start_date:
                p_stmt = (
                    select(AcademicPeriod)
                    .where(
                        AcademicPeriod.institution_id == course.institution_id,
                        AcademicPeriod.start_date > from_period.start_date,
                        AcademicPeriod.is_deleted == False,
                    )
                    .order_by(AcademicPeriod.start_date.asc())
                )
                p_res = await self.db.execute(p_stmt)
                next_period = p_res.scalars().first()
                if next_period:
                    resolved_period_id = next_period.id

        if not resolved_period_id:
            # Next period does not exist yet, stay PAID with target_period_id NULL
            retake.target_period_id = None
            await self.db.flush()
            return retake

        # Resolve target course offering
        resolved_course_id = target_course_id or course.id

        # Find or create a section in target course to enroll the student
        sec_stmt = (
            select(ClassSection)
            .where(
                or_(
                    ClassSection.id.in_(
                        select(TeachingAssignment.class_section_id).where(
                            TeachingAssignment.course_id == resolved_course_id,
                            TeachingAssignment.class_section_id.is_not(None),
                        )
                    ),
                    ClassSection.department_id == course.department_id,
                ),
                ClassSection.is_deleted == False,
            )
        )
        sec_res = await self.db.execute(sec_stmt)
        section = sec_res.scalars().first()

        if section:
            # Create or reactivate enrollment
            enr_stmt = select(StudentEnrollment).where(
                StudentEnrollment.student_id == retake.student_id,
                StudentEnrollment.class_section_id == section.id,
                StudentEnrollment.is_deleted == False,
            )
            enr_res = await self.db.execute(enr_stmt)
            enr = enr_res.scalars().first()
            if not enr:
                enr = StudentEnrollment(
                    student_id=retake.student_id,
                    class_section_id=section.id,
                    enrollment_status=EnrollmentStatus.ACTIVE,
                    is_retake=True,
                    retake_record_id=retake.id,
                )
                self.db.add(enr)
            else:
                enr.is_retake = True
                enr.retake_record_id = retake.id
                enr.enrollment_status = EnrollmentStatus.ACTIVE
            await self.db.flush()

        # Update retake status to ENROLLED
        updated = await self.repo.finalize_retake_enrollment(
            retake_id=retake.id,
            target_period_id=resolved_period_id,
            target_course_id=resolved_course_id,
        )

        await self.notif_repo.create(
            recipient_id=retake.student_id,
            notification_type=NotificationType.RETAKE_ENROLLED,
            title="Retake Enrolled",
            body=f"You have been officially enrolled into the retake offering for {course.code}.",
            action_url=frontend_links.student_retakes(),
            reference_id=str(retake.id),
            reference_type="retake_record",
        )

        return updated or retake
