"""
app/services/moderation_service.py

Phase 3: Moderation workflow service for summative assessments.
Implements:
    - Submission for moderation (with pre-moderation checklist validation)
    - Department-scoped moderator claiming and conflict-of-interest enforcement (A-14)
    - Moderation rounds, comments, change requests, and approvals
    - Resubmission with unlimited rounds (R-08)
    - Assessment version snapshots and canonical SHA-256 content hashing
    - Atomic audit logging and event notifications
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import links as frontend_links
from app.core.constants import AssessmentType, Duty, UserRole
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.core.logging import get_logger
from app.core.permissions import has_duty, is_hod_of, is_moderator_for
from app.db.base import utcnow
from app.db.enums import (
    AssessmentStatus,
    ModerationCommentCategory,
    ModerationCommentTarget,
    ModerationReviewStatus,
    NotificationType,
)
from app.db.models.academic import Course, Department
from app.db.models.assessment import Assessment, AssessmentSection, AssessmentSupervisor
from app.db.models.audit import AuditLog
from app.db.models.auth import User
from app.db.models.duty import UserDutyAssignment
from app.db.models.moderation import (
    AssessmentVersion,
    ModerationComment,
    ModerationReview,
)
from app.db.models.policy import ApprovalPolicy
from app.db.models.question import AssessmentQuestion, Question, QuestionOption
from app.db.repositories.approval_policy_repo import ApprovalPolicyRepository
from app.db.repositories.moderation_repo import ModerationRepository
from app.db.repositories.notification_repo import NotificationRepository
from app.services.assessment_marks import _effective_aq_marks
from app.services.compliance_rules import ComplianceConfig, config_from_policy
from app.services.moderation_checklist_service import (
    ChecklistResult,
    ModerationChecklistService,
)

logger = get_logger(__name__)


def serialize_assessment_content(assessment: Any) -> dict:
    """
    Produce a deterministic dictionary representation of the assessment content:
    sections, questions, options, marks, instructions, structure.
    """
    all_secs = getattr(assessment, "sections", []) or []
    sections = []
    for s in sorted(
        [sec for sec in all_secs if not getattr(sec, "is_deleted", False)],
        key=lambda x: getattr(x, "order_index", 0),
    ):
        sections.append({
            "id": str(s.id),
            "title": s.title,
            "section_kind": getattr(s.section_kind, "value", str(s.section_kind)),
            "questions_to_answer": s.questions_to_answer,
            "order_index": s.order_index,
        })

    all_aqs = getattr(assessment, "assessment_questions", []) or []
    questions = []
    for aq in sorted(
        [a for a in all_aqs if not getattr(a, "is_deleted", False)],
        key=lambda x: getattr(x, "order_index", 0),
    ):
        q = getattr(aq, "question", None)
        options = []
        if q and getattr(q, "options", None):
            for opt in sorted(
                [o for o in q.options if not getattr(o, "is_deleted", False)],
                key=lambda x: getattr(x, "order_index", 0),
            ):
                options.append({
                    "id": str(opt.id),
                    "text": opt.content or opt.option_text or "",
                    "is_correct": bool(getattr(opt, "is_correct", False)),
                })
        questions.append({
            "id": str(aq.id),
            "question_id": str(q.id) if q else None,
            "section_id": str(aq.assessment_section_id) if aq.assessment_section_id else None,
            "prompt": (q.content if q else "") or "",
            "question_type": getattr(q.question_type, "value", str(q.question_type)) if q else "",
            "marks": _effective_aq_marks(aq),
            "order_index": aq.order_index,
            "explanation": (q.explanation if q and hasattr(q, "explanation") else "") or "",
            "options": options,
        })

    return {
        "assessment_id": str(assessment.id),
        "title": assessment.title,
        "instructions": assessment.instructions or "",
        "total_marks": assessment.total_marks,
        "passing_marks": assessment.passing_marks,
        "sections": sections,
        "questions": questions,
    }


def compute_canonical_hash(content: dict) -> str:
    """Compute SHA-256 of canonical JSON (sorted keys, UTF-8, no whitespace)."""
    canonical_json = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


class ModerationService:
    """Service handling moderation review lifecycle for assessments."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ModerationRepository(db)
        self.policy_repo = ApprovalPolicyRepository(db)
        self.notification_repo = NotificationRepository(db)

    async def _get_assessment_with_details(self, assessment_id: uuid.UUID) -> Assessment:
        """Fetch assessment with sections, questions, and course preloaded."""
        stmt = (
            select(Assessment)
            .where(
                Assessment.id == assessment_id,
                Assessment.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(Assessment.course),
                selectinload(Assessment.supervisors),
                selectinload(Assessment.sections),
                selectinload(Assessment.assessment_questions)
                .selectinload(AssessmentQuestion.question)
                .selectinload(Question.options),
            )
        )
        result = await self.db.execute(stmt)
        assessment = result.scalar_one_or_none()
        if not assessment:
            raise NotFoundError("Assessment", str(assessment_id))
        return assessment

    async def _resolve_author_side(
        self, assessment: Assessment, user: User
    ) -> Tuple[bool, Optional[uuid.UUID]]:
        """
        Whether user is on the authoring side of the assessment: author, supervisor,
        active collaborator, or active delegate (Spec Section 8.1).
        Returns (is_author_side, delegation_id); delegation_id is set only when the
        user acts under an active delegation.
        """
        if str(assessment.created_by_id) == str(user.id):
            return True, None

        # Check active collaborator
        from app.db.models.authoring import AssessmentCollaborator, AuthorDelegation
        from app.db.enums import DelegationStatus
        stmt_c = select(AssessmentCollaborator.id).where(
            AssessmentCollaborator.assessment_id == assessment.id,
            AssessmentCollaborator.lecturer_id == user.id,
            AssessmentCollaborator.is_active == True,
            AssessmentCollaborator.is_deleted == False,
        )
        if (await self.db.execute(stmt_c)).first():
            return True, None

        # Check active author delegation
        now = utcnow()
        stmt_d = select(AuthorDelegation.id).where(
            AuthorDelegation.assessment_id == assessment.id,
            AuthorDelegation.delegate_id == user.id,
            AuthorDelegation.status == DelegationStatus.ACTIVE,
            AuthorDelegation.is_deleted == False,
            AuthorDelegation.valid_from <= now,
            AuthorDelegation.valid_to >= now,
        )
        row = (await self.db.execute(stmt_d)).first()
        if row:
            return True, row[0]

        # Check supervisors fallback
        supervisors = getattr(assessment, "supervisors", []) or []
        for s in supervisors:
            if getattr(s, "user_id", None) == user.id and not getattr(s, "is_deleted", False):
                return True, None

        return False, None

    async def _assert_can_author_or_delegate(self, assessment: Assessment, user: User) -> Optional[uuid.UUID]:
        """
        Verify user is author, co-author, or active delegate (Spec Section 8.1).
        Admins are not authors (spec §13.1). Returns the delegation_id when acting
        under an active delegation, else None.
        """
        is_author_side, delegation_id = await self._resolve_author_side(assessment, user)
        if not is_author_side:
            raise PermissionDeniedError("Only the author, co-author, or active delegate may perform this action.")
        return delegation_id

    async def _notify(self, **kwargs: Any) -> None:
        """Send a notification without ever failing the action that triggered it.

        A rejected notification (for example an enum value the database lacks) used to
        roll back the moderator's whole decision. It now runs in a savepoint: on failure
        only the notification is dropped, and the failure is logged.
        """
        try:
            async with self.db.begin_nested():
                await self.notification_repo.create(**kwargs)
        except Exception as exc:  # noqa: BLE001 - notification is best-effort by design
            logger.warning(
                "moderation_notification_failed",
                notification_type=str(kwargs.get("notification_type")),
                recipient_id=str(kwargs.get("recipient_id")),
                error=str(exc),
            )

    async def _assert_no_conflict_of_interest(self, assessment: Assessment, user: User) -> None:
        """
        Rule A-14: anyone on the authoring side — author, supervisor, collaborator,
        or active delegate — may not moderate the assessment.
        """
        is_author_side, _ = await self._resolve_author_side(assessment, user)
        if is_author_side:
            raise PermissionDeniedError(
                "Conflict of Interest: A moderator cannot moderate an assessment they "
                "authored, co-authored, or hold an authoring delegation for."
            )

    async def _resolve_policy(self, assessment: Assessment) -> ApprovalPolicy | None:
        """Resolve institutional approval policy for the assessment."""
        inst_id = None
        if assessment.course and getattr(assessment.course, "institution_id", None):
            inst_id = assessment.course.institution_id
        if not inst_id:
            return None
        policy = await self.policy_repo.get_by_institution_and_type(
            institution_id=inst_id,
            assessment_type=assessment.assessment_type,
        )
        if not policy:
            try:
                from app.services.approval_policy_service import ApprovalPolicyService
                policy_svc = ApprovalPolicyService(self.db)
                await policy_svc.seed_defaults_for_institution(inst_id)
                policy = await self.policy_repo.get_by_institution_and_type(
                    institution_id=inst_id,
                    assessment_type=assessment.assessment_type,
                )
            except Exception:
                pass
        return policy

    # ─────────────────────────────────────────────────────────────────────────
    # SUBMIT FOR MODERATION
    # ─────────────────────────────────────────────────────────────────────────

    async def submit_for_moderation(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        run_ai_review: bool = False,
    ) -> tuple[ModerationReview, ChecklistResult]:
        """
        Submit an assessment for moderation review.
        Allowed only if:
            - current_user is author/co-author or active delegate
            - status is DRAFT or CHANGES_REQUESTED
            - policy requires moderation
            - pre-moderation checklist has no BLOCKING failures
        """
        assessment = await self._get_assessment_with_details(assessment_id)
        delegation_id = await self._assert_can_author_or_delegate(assessment, current_user)

        if assessment.status not in (AssessmentStatus.DRAFT, AssessmentStatus.CHANGES_REQUESTED):
            raise BadRequestError(
                f"Assessment cannot be submitted for moderation from status {assessment.status.value}. "
                "Only DRAFT or CHANGES_REQUESTED assessments can be submitted."
            )

        policy = await self._resolve_policy(assessment)
        if policy and not policy.requires_moderation:
            raise BadRequestError(
                f"Moderation is not required for assessment type {assessment.assessment_type.value}."
            )

        # Moderators are matched to papers by the course's department. Without one the
        # review would be created but no moderator could ever see it.
        if not (assessment.course and assessment.course.department_id):
            raise BadRequestError(
                "This course has no department, so no moderator can be assigned to review it. "
                "Ask an administrator to assign the course to a department.",
                code="COURSE_HAS_NO_DEPARTMENT",
            )

        compliance = config_from_policy(policy)

        # Run automated checklist under the institution's rules
        checklist_result = await ModerationChecklistService.run(
            assessment=assessment,
            db=self.db,
            run_ai_review=run_ai_review,
            config=compliance,
        )

        if checklist_result.has_blocking_failures:
            blocking_reasons = [
                it.message for it in checklist_result.items
                if (not it.passed) and it.severity.value == "BLOCKING"
            ]
            raise BadRequestError(
                f"Cannot submit for moderation due to blocking checklist failures: {'; '.join(blocking_reasons)}"
            )

        # Create content snapshot and canonical hash
        snapshot = serialize_assessment_content(assessment)
        content_hash = compute_canonical_hash(snapshot)

        # Version increment
        next_ver_no = await self.repo.get_next_version_no(assessment_id)
        version = await self.repo.create_version(
            assessment_id=assessment_id,
            version_no=next_ver_no,
            content_snapshot=snapshot,
            content_hash=content_hash,
            created_by_id=current_user.id,
            reason="Submitted for moderation review",
        )

        # Create review round
        next_round_no = await self.repo.get_next_round_no(assessment_id)
        review = await self.repo.create_review(
            assessment_id=assessment_id,
            version_id=version.id,
            round_no=next_round_no,
            checklist_result=checklist_result.to_dict(),
            started_at=utcnow(),
        )

        # Transition assessment status
        assessment.status = AssessmentStatus.PENDING_MODERATION
        assessment.updated_by_id = current_user.id
        assessment.updated_at = utcnow()
        await self.db.flush()

        # Notify department moderators
        if assessment.course and assessment.course.department_id:
            dept_id = assessment.course.department_id
            mod_stmt = (
                select(UserDutyAssignment.user_id)
                .where(
                    UserDutyAssignment.duty == Duty.MODERATOR,
                    UserDutyAssignment.department_id == dept_id,
                    UserDutyAssignment.is_active == True,  # noqa: E712
                    UserDutyAssignment.is_deleted == False,  # noqa: E712
                )
            )
            mod_ids = (await self.db.execute(mod_stmt)).scalars().all()
            for mod_id in mod_ids:
                if mod_id != current_user.id:
                    await self._notify(
                        recipient_id=mod_id,
                        notification_type=NotificationType.MODERATION_SUBMITTED,
                        title="New Assessment Awaiting Moderation",
                        body=f"Assessment '{assessment.title}' has been submitted for moderation.",
                        reference_id=assessment.id,
                        reference_type="assessment",
                        action_url=frontend_links.moderation_queue(),
                    )

        # Record audit log
        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="assessment",
            entity_id=assessment.id,
            action="assessment_submitted_for_moderation",
            description=f"Assessment '{assessment.title}' submitted for moderation (Round {next_round_no}).",
            before_state={"status": assessment.status.value},
            after_state={
                "status": AssessmentStatus.PENDING_MODERATION.value,
                "version_no": next_ver_no,
                "round_no": next_round_no,
                "content_hash": content_hash,
            },
            acting_under_delegation_id=delegation_id,
        )
        self.db.add(audit)
        await self.db.commit()

        # Re-fetch review with relationships loaded
        loaded_review = await self.repo.get_review_by_id(review.id)
        return loaded_review or review, checklist_result

    # ─────────────────────────────────────────────────────────────────────────
    # CLAIM REVIEW
    # ─────────────────────────────────────────────────────────────────────────

    async def claim_review(
        self,
        review_id: uuid.UUID,
        current_user: User,
    ) -> ModerationReview:
        """
        Claim an open moderation review round.
        Enforces:
            - User has active MODERATOR duty for assessment's department.
            - Conflict of Interest (A-14): moderator cannot moderate paper they authored/co-authored.
            - Review must be OPEN and not claimed.
        """
        review = await self.repo.get_review_by_id(review_id)
        if not review:
            raise NotFoundError("ModerationReview", str(review_id))

        assessment = await self._get_assessment_with_details(review.assessment_id)

        # Conflict of Interest check (A-14)
        await self._assert_no_conflict_of_interest(assessment, current_user)

        # Department scope check
        dept_id = assessment.course.department_id if assessment.course else None
        if not dept_id:
            raise BadRequestError("Assessment course has no department assigned.")

        has_mod_duty = await is_moderator_for(self.db, current_user.id, department_id=dept_id)
        if not has_mod_duty:
            raise PermissionDeniedError(
                f"User is not an active moderator for department {dept_id}."
            )

        if review.reviewer_id and review.reviewer_id != current_user.id:
            raise ConflictError("This review round has already been claimed by another moderator.")

        claimed = await self.repo.claim_review(review_id, current_user.id)

        # Tell the author a moderator has taken the paper, so "pending" no longer looks idle
        await self._notify(
            recipient_id=assessment.created_by_id,
            notification_type=NotificationType.MODERATION_STARTED,
            title="Moderation Started",
            body=(
                f"A moderator has started reviewing '{assessment.title}' "
                f"(Round {review.round_no}). You will be notified of the outcome."
            ),
            reference_id=assessment.id,
            reference_type="assessment",
            action_url=frontend_links.lecturer_assessment(assessment.id),
        )

        # Record audit log
        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="moderation_review",
            entity_id=review.id,
            action="moderation_review_claimed",
            description=f"Moderator claimed review round {review.round_no} for assessment '{assessment.title}'.",
            before_state={"reviewer_id": None},
            after_state={"reviewer_id": str(current_user.id)},
        )
        self.db.add(audit)
        await self.db.commit()

        return claimed

    # ─────────────────────────────────────────────────────────────────────────
    # ADD COMMENT
    # ─────────────────────────────────────────────────────────────────────────

    async def add_comment(
        self,
        review_id: uuid.UUID,
        current_user: User,
        target_type: ModerationCommentTarget,
        target_id: Optional[uuid.UUID],
        category: ModerationCommentCategory,
        comment: str,
    ) -> ModerationComment:
        """Add a comment/change request to a review round."""
        review = await self.repo.get_review_by_id(review_id)
        if not review:
            raise NotFoundError("ModerationReview", str(review_id))

        if review.status != ModerationReviewStatus.OPEN:
            raise BadRequestError("Cannot add comments to a decided review round.")

        assessment = await self._get_assessment_with_details(review.assessment_id)

        # Conflict of Interest check (A-14)
        await self._assert_no_conflict_of_interest(assessment, current_user)

        dept_id = assessment.course.department_id if assessment.course else None
        has_mod_duty = await is_moderator_for(self.db, current_user.id, department_id=dept_id)
        if not has_mod_duty:
            raise PermissionDeniedError("Only a department moderator may comment on this review.")


        obj = await self.repo.create_comment(
            review_id=review_id,
            target_type=target_type,
            target_id=target_id,
            category=category,
            comment=comment,
            created_by_id=current_user.id,
        )

        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="moderation_comment",
            entity_id=obj.id,
            action="moderation_comment_added",
            description=f"Moderator added {category.value} comment on {target_type.value}.",
            before_state=None,
            after_state={
                "review_id": str(review_id),
                "category": category.value,
                "target_type": target_type.value,
                "comment": comment,
            },
        )
        self.db.add(audit)
        await self.db.commit()
        return obj

    # ─────────────────────────────────────────────────────────────────────────
    # REQUEST CHANGES
    # ─────────────────────────────────────────────────────────────────────────

    async def request_changes(
        self,
        review_id: uuid.UUID,
        current_user: User,
        decision_note: str,
    ) -> ModerationReview:
        """
        Request changes on an assessment review.
        Requires at least one comment/issue logged.
        """
        review = await self.repo.get_review_by_id(review_id)
        if not review:
            raise NotFoundError("ModerationReview", str(review_id))

        if review.status != ModerationReviewStatus.OPEN:
            raise BadRequestError(f"Review round is already decided: {review.status.value}.")

        if not review.reviewer_id:
            raise BadRequestError("Review must be claimed by a moderator before requesting changes.")

        if review.reviewer_id != current_user.id:
            raise PermissionDeniedError("Only the claiming reviewer may decide this review.")

        note = (decision_note or "").strip()
        comments = await self.repo.list_comments_by_review(review_id)
        if not comments and not note:
            raise BadRequestError("Explain what must change: add a comment or a note with your request.")

        assessment = await self._get_assessment_with_details(review.assessment_id)
        # Re-checked at decision time: a collaborator/delegation may have been added after the claim
        await self._assert_no_conflict_of_interest(assessment, current_user)

        if not comments:
            # The note typed into the decision dialog is the moderator's feedback. Keep it as
            # the round's comment so the author sees it (and can resolve it) on the paper,
            # instead of rejecting the request because "Post Feedback" was never pressed.
            await self.repo.create_comment(
                review_id=review_id,
                target_type=ModerationCommentTarget.ASSESSMENT,
                target_id=None,
                category=ModerationCommentCategory.OTHER,
                comment=note[:2000],
                created_by_id=current_user.id,
            )

        # Update review
        decided = await self.repo.decide_review(
            review_id=review_id,
            status=ModerationReviewStatus.CHANGES_REQUESTED,
            decision_note=decision_note,
        )

        # Update assessment status
        assessment.status = AssessmentStatus.CHANGES_REQUESTED
        # Reopen the draft: AI generation and blueprint tools refuse a paper marked complete,
        # which would block the very edits the moderator asked for.
        assessment.draft_is_complete = False
        assessment.updated_by_id = current_user.id
        assessment.updated_at = utcnow()
        await self.db.flush()

        # Notify author
        await self._notify(
            recipient_id=assessment.created_by_id,
            notification_type=NotificationType.MODERATION_CHANGES_REQUESTED,
            title="Moderation Changes Requested",
            body=(
                f"Changes requested for assessment '{assessment.title}' in Round {review.round_no}: "
                f"{note[:240]}{'…' if len(note) > 240 else ''}"
                if note
                else f"Changes requested for assessment '{assessment.title}' in Round {review.round_no}."
            ),
            reference_id=assessment.id,
            reference_type="assessment",
            action_url=frontend_links.lecturer_assessment(assessment.id),
        )

        # Audit
        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="moderation_review",
            entity_id=review.id,
            action="moderation_changes_requested",
            description=f"Changes requested on assessment '{assessment.title}' (Round {review.round_no}).",
            before_state={"status": "OPEN", "assessment_status": "PENDING_MODERATION"},
            after_state={"status": "CHANGES_REQUESTED", "assessment_status": "CHANGES_REQUESTED"},
        )
        self.db.add(audit)
        await self.db.commit()

        return decided

    # ─────────────────────────────────────────────────────────────────────────
    # RESOLVE COMMENT
    # ─────────────────────────────────────────────────────────────────────────

    async def resolve_comment(
        self,
        comment_id: uuid.UUID,
        current_user: User,
    ) -> ModerationComment:
        """Mark a moderation comment as resolved by the author, co-author, or active delegate."""
        comment = await self.repo.get_comment_by_id(comment_id)
        if not comment:
            raise NotFoundError("ModerationComment", str(comment_id))

        review = await self.repo.get_review_by_id(comment.review_id)
        if not review:
            raise NotFoundError("ModerationReview", str(comment.review_id))

        assessment = await self._get_assessment_with_details(review.assessment_id)
        # Same authoring-side rule as submit/resubmit, so whoever may resubmit can
        # also clear the comments that block resubmission.
        delegation_id = await self._assert_can_author_or_delegate(assessment, current_user)

        resolved = await self.repo.resolve_comment(comment_id, current_user.id)

        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="moderation_comment",
            entity_id=comment.id,
            action="moderation_comment_resolved",
            description="Author resolved moderation comment.",
            before_state={"resolved": False},
            after_state={"resolved": True, "resolved_by_id": str(current_user.id)},
            acting_under_delegation_id=delegation_id,
        )
        self.db.add(audit)
        await self.db.commit()
        return resolved

    # ─────────────────────────────────────────────────────────────────────────
    # RESUBMIT FOR MODERATION
    # ─────────────────────────────────────────────────────────────────────────

    async def resubmit_for_moderation(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        reason: Optional[str] = None,
        run_ai_review: bool = False,
    ) -> tuple[ModerationReview, ChecklistResult]:
        """
        Resubmit an assessment after making changes.
        Unlimited rounds supported (R-08).
        """
        assessment = await self._get_assessment_with_details(assessment_id)
        delegation_id = await self._assert_can_author_or_delegate(assessment, current_user)

        if assessment.status != AssessmentStatus.CHANGES_REQUESTED:
            raise BadRequestError(
                f"Assessment must be in CHANGES_REQUESTED status to resubmit (current: {assessment.status.value})."
            )

        policy = await self._resolve_policy(assessment)
        compliance = config_from_policy(policy)

        # Check automated checklist under the institution's rules
        checklist_result = await ModerationChecklistService.run(
            assessment=assessment,
            db=self.db,
            run_ai_review=run_ai_review,
            config=compliance,
        )

        if checklist_result.has_blocking_failures:
            blocking_reasons = [
                it.message for it in checklist_result.items
                if (not it.passed) and it.severity.value == "BLOCKING"
            ]
            raise BadRequestError(
                f"Cannot resubmit due to blocking checklist failures: {'; '.join(blocking_reasons)}"
            )

        # Snapshot and hash
        snapshot = serialize_assessment_content(assessment)
        content_hash = compute_canonical_hash(snapshot)

        next_ver_no = await self.repo.get_next_version_no(assessment_id)
        version = await self.repo.create_version(
            assessment_id=assessment_id,
            version_no=next_ver_no,
            content_snapshot=snapshot,
            content_hash=content_hash,
            created_by_id=current_user.id,
            reason=reason or "Resubmitted following moderator change requests",
        )

        next_round_no = await self.repo.get_next_round_no(assessment_id)
        review = await self.repo.create_review(
            assessment_id=assessment_id,
            version_id=version.id,
            round_no=next_round_no,
            checklist_result=checklist_result.to_dict(),
            started_at=utcnow(),
        )

        assessment.status = AssessmentStatus.PENDING_MODERATION
        assessment.updated_by_id = current_user.id
        assessment.updated_at = utcnow()
        await self.db.flush()

        # Notify department moderators
        if assessment.course and assessment.course.department_id:
            dept_id = assessment.course.department_id
            mod_stmt = (
                select(UserDutyAssignment.user_id)
                .where(
                    UserDutyAssignment.duty == Duty.MODERATOR,
                    UserDutyAssignment.department_id == dept_id,
                    UserDutyAssignment.is_active == True,  # noqa: E712
                    UserDutyAssignment.is_deleted == False,  # noqa: E712
                )
            )
            mod_ids = (await self.db.execute(mod_stmt)).scalars().all()
            for mod_id in mod_ids:
                if mod_id != current_user.id:
                    await self._notify(
                        recipient_id=mod_id,
                        notification_type=NotificationType.MODERATION_SUBMITTED,
                        title=f"Assessment Resubmitted (Round {next_round_no})",
                        body=f"Assessment '{assessment.title}' has been resubmitted for moderation.",
                        reference_id=assessment.id,
                        reference_type="assessment",
                        action_url=frontend_links.moderation_queue(),
                    )

        # Audit
        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="assessment",
            entity_id=assessment.id,
            action="moderation_resubmitted",
            description=f"Assessment '{assessment.title}' resubmitted (Round {next_round_no}).",
            before_state={"status": AssessmentStatus.CHANGES_REQUESTED.value},
            after_state={
                "status": AssessmentStatus.PENDING_MODERATION.value,
                "version_no": next_ver_no,
                "round_no": next_round_no,
            },
            acting_under_delegation_id=delegation_id,
        )
        self.db.add(audit)
        await self.db.commit()

        loaded_review = await self.repo.get_review_by_id(review.id)
        return loaded_review or review, checklist_result

    # ─────────────────────────────────────────────────────────────────────────
    # APPROVE REVIEW
    # ─────────────────────────────────────────────────────────────────────────

    async def approve_review(
        self,
        review_id: uuid.UUID,
        current_user: User,
        decision_note: Optional[str] = None,
        acknowledge_warnings: bool = True,
        override_failed_checks: bool = False,
        override_reason: Optional[str] = None,
    ) -> ModerationReview:
        """
        Approve an assessment review.
        Enforces:
            - current_user is the claiming reviewer, with no conflict of interest
            - review is OPEN
        Required (BLOCKING) automatic checks are evaluated under the institution's current rules.
        If any fail, the moderator can still approve by waiving them with a written reason
        (`override_failed_checks` + `override_reason`); the waiver is stored on the review, audited,
        and passed on to the author and the exam office. Warnings never block.
        Transitions assessment status to APPROVED.
        Notifies exam officers and author.
        """
        review = await self.repo.get_review_by_id(review_id)
        if not review:
            raise NotFoundError("ModerationReview", str(review_id))

        if review.status != ModerationReviewStatus.OPEN:
            raise BadRequestError(f"Review round is already decided: {review.status.value}.")

        if not review.reviewer_id:
            raise BadRequestError("Review must be claimed by a moderator before it can be approved.")

        if review.reviewer_id != current_user.id:
            raise PermissionDeniedError("Only the claiming reviewer may approve this review.")

        assessment = await self._get_assessment_with_details(review.assessment_id)
        # Re-checked at decision time: a collaborator/delegation may have been added after the claim
        await self._assert_no_conflict_of_interest(assessment, current_user)

        # Evaluate the automatic checks under the institution's CURRENT rules: an admin may have
        # changed them since submission, and the paper is locked while under review, so only the
        # rules can differ from the snapshot taken at submission.
        fresh = await ModerationChecklistService.run(
            assessment=assessment,
            db=self.db,
            run_ai_review=False,
            config=config_from_policy(await self._resolve_policy(assessment)),
        )
        review.checklist_result = fresh.to_dict()
        failed_required = [
            it for it in fresh.items if (not it.passed) and it.severity.value == "BLOCKING"
        ]
        override: Optional[dict] = None
        if failed_required:
            if not override_failed_checks:
                raise ConflictError(
                    "Some required checks did not pass: "
                    + "; ".join(f"{it.code} ({it.message})" for it in failed_required)
                    + ". As the moderator you can approve anyway by waiving them with a reason.",
                    code="COMPLIANCE_CHECKS_FAILED",
                )
            reason = (override_reason or "").strip()
            if len(reason) < 10:
                raise BadRequestError(
                    "Explain why you are waiving the failed checks (at least 10 characters).",
                    code="OVERRIDE_REASON_REQUIRED",
                )
            override = {
                "codes": [it.code for it in failed_required],
                "messages": [it.message for it in failed_required],
                "reason": reason[:1000],
                "by_id": str(current_user.id),
                "at": utcnow().isoformat(),
            }

        # Update review
        decided = await self.repo.decide_review(
            review_id=review_id,
            status=ModerationReviewStatus.APPROVED,
            decision_note=decision_note,
        )
        decided.compliance_override = override

        # Update assessment status
        assessment.status = AssessmentStatus.APPROVED
        assessment.updated_by_id = current_user.id
        assessment.updated_at = utcnow()
        await self.db.flush()

        # Notify author
        await self._notify(
            recipient_id=assessment.created_by_id,
            notification_type=NotificationType.MODERATION_APPROVED,
            title="Moderation Approved",
            body=(
                f"Assessment '{assessment.title}' has been approved by the moderator."
                + (f" Checks waived: {', '.join(override['codes'])}." if override else "")
            ),
            reference_id=assessment.id,
            reference_type="assessment",
            action_url=frontend_links.lecturer_assessment(assessment.id),
        )

        # Notify exam officers of institution
        inst_id = assessment.course.institution_id if assessment.course else None
        if inst_id:
            eo_stmt = (
                select(UserDutyAssignment.user_id)
                .where(
                    UserDutyAssignment.duty == Duty.EXAM_OFFICER,
                    UserDutyAssignment.institution_id == inst_id,
                    UserDutyAssignment.is_active == True,  # noqa: E712
                    UserDutyAssignment.is_deleted == False,  # noqa: E712
                )
            )
            eo_ids = (await self.db.execute(eo_stmt)).scalars().all()
            for eo_id in eo_ids:
                await self._notify(
                    recipient_id=eo_id,
                    notification_type=NotificationType.MODERATION_APPROVED,
                    title="Assessment Approved — Ready to Seal",
                    body=(
                        f"Assessment '{assessment.title}' is approved and ready for exam office sealing."
                        + (
                            f" The moderator waived: {', '.join(override['codes'])} "
                            f"(reason: {override['reason'][:160]})."
                            if override
                            else ""
                        )
                    ),
                    reference_id=assessment.id,
                    reference_type="assessment",
                    action_url=frontend_links.exam_office_queue(),
                )

        # Audit
        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="moderation_review",
            entity_id=review.id,
            action="moderation_approved_with_override" if override else "moderation_approved",
            description=(
                f"Assessment '{assessment.title}' approved in Round {review.round_no}"
                + (f" with waived checks {', '.join(override['codes'])}: {override['reason']}" if override else "")
                + "."
            ),
            before_state={"status": "OPEN", "assessment_status": "PENDING_MODERATION"},
            after_state={
                "status": "APPROVED",
                "assessment_status": "APPROVED",
                "compliance_override": override,
            },
        )
        self.db.add(audit)
        await self.db.commit()

        return decided

    # ─────────────────────────────────────────────────────────────────────────
    # GET OVERVIEW & QUEUE
    # ─────────────────────────────────────────────────────────────────────────

    async def get_moderation_overview(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
    ) -> dict:
        """Fetch moderation history, rounds, and comments for an assessment."""
        assessment = await self._get_assessment_with_details(assessment_id)

        # Authorize: author/co-author, moderator for department, HOD, or admin.
        # Admin keeps read-only oversight of history; it cannot act on reviews.
        dept_id = assessment.course.department_id if assessment.course else None
        is_mod = await is_moderator_for(self.db, current_user.id, department_id=dept_id) if dept_id else False
        is_hod = await is_hod_of(self.db, current_user.id, department_id=dept_id) if dept_id else False
        is_admin = current_user.role == UserRole.ADMIN.value
        is_author = assessment.created_by_id == current_user.id

        if not (is_author or is_mod or is_hod or is_admin):
            raise PermissionDeniedError("Access to moderation history is not authorized.")

        reviews = await self.repo.list_reviews_by_assessment(assessment_id)
        latest_version = await self.repo.get_latest_version(assessment_id)

        # While a round is open, evaluate the automatic checks against the institution's
        # CURRENT rules so the moderator decides on today's rules, not the submission snapshot.
        current_checklist: Optional[dict] = None
        if reviews and reviews[-1].status == ModerationReviewStatus.OPEN:
            try:
                current_checklist = (
                    await ModerationChecklistService.run(
                        assessment=assessment,
                        db=self.db,
                        run_ai_review=False,
                        config=config_from_policy(await self._resolve_policy(assessment)),
                    )
                ).to_dict()
            except Exception as exc:  # noqa: BLE001 - the overview must still load without it
                logger.warning("current_checklist_failed", error=str(exc))

        return {
            "assessment_id": str(assessment.id),
            "status": assessment.status.value,
            "latest_version_no": latest_version.version_no if latest_version else 0,
            "current_checklist": current_checklist,
            "rounds": [
                {
                    "compliance_override": r.compliance_override,
                    "id": str(r.id),
                    "round_no": r.round_no,
                    "reviewer_id": str(r.reviewer_id) if r.reviewer_id else None,
                    "status": r.status.value,
                    "decision_note": r.decision_note,
                    "started_at": r.started_at.isoformat() if r.started_at else None,
                    "claimed_at": r.claimed_at.isoformat() if r.claimed_at else None,
                    "decided_at": r.decided_at.isoformat() if r.decided_at else None,
                    "checklist_result": r.checklist_result,
                    "comments": [
                        {
                            "id": str(c.id),
                            "target_type": c.target_type.value,
                            "target_id": str(c.target_id) if c.target_id else None,
                            "category": c.category.value,
                            "comment": c.comment,
                            "resolved": c.resolved,
                            "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
                        }
                        for c in (r.comments or [])
                        if not getattr(c, "is_deleted", False)
                    ],
                }
                for r in reviews
            ],
        }

    async def list_moderator_queue(
        self,
        current_user: User,
        status: Optional[str] = None,
    ) -> List[dict]:
        """List queue of reviews for moderator's assigned departments."""
        # Find active departments for moderator
        dept_stmt = (
            select(UserDutyAssignment.department_id)
            .where(
                UserDutyAssignment.user_id == current_user.id,
                UserDutyAssignment.duty == Duty.MODERATOR,
                UserDutyAssignment.is_active == True,  # noqa: E712
                UserDutyAssignment.is_deleted == False,  # noqa: E712
                UserDutyAssignment.department_id.is_not(None),
            )
        )
        dept_ids = (await self.db.execute(dept_stmt)).scalars().all()

        all_items = []
        for dept_id in dept_ids:
            queue_items = await self.repo.list_moderator_queue(dept_id, status=status)
            for rev, asmt in queue_items:
                all_items.append({
                    "review_id": str(rev.id),
                    "assessment_id": str(asmt.id),
                    "assessment_title": asmt.title,
                    "round_no": rev.round_no,
                    "review_status": rev.status.value,
                    "assessment_status": asmt.status.value,
                    "reviewer_id": str(rev.reviewer_id) if rev.reviewer_id else None,
                    "started_at": rev.started_at.isoformat() if rev.started_at else None,
                    "claimed_at": rev.claimed_at.isoformat() if rev.claimed_at else None,
                })

        return all_items

    async def run_pre_moderation_checklist(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        run_ai_review: bool = False,
    ) -> Any:
        """Run pre-moderation checklist on demand without submitting."""
        assessment = await self._get_assessment_with_details(assessment_id)

        dept_id = assessment.course.department_id if assessment.course else None
        is_mod = await is_moderator_for(self.db, current_user.id, department_id=dept_id) if dept_id else False
        is_author = assessment.created_by_id == current_user.id
        is_coauthor = any(
            getattr(s, "user_id", None) == current_user.id and not getattr(s, "is_deleted", False)
            for s in (assessment.supervisors or [])
        )

        if not (is_author or is_coauthor or is_mod):
            raise PermissionDeniedError("Unauthorized to run pre-moderation checklist on this assessment.")

        inst_id = assessment.course.institution_id if assessment.course else None
        policy = None
        if inst_id:
            policy = await self.policy_repo.get_by_institution_and_type(
                institution_id=inst_id,
                assessment_type=assessment.assessment_type,
            )

        return await ModerationChecklistService.run(
            assessment=assessment,
            db=self.db,
            run_ai_review=run_ai_review,
            config=config_from_policy(policy),
        )

