"""
backend/app/services/authoring_service.py

Phase 4: Collaborative authoring, delegation, and audited post-approval edits.
Governing source of truth: MINDEXA_INSTITUTIONAL_WORKFLOWS_SPEC.md Section 8.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional, Sequence, Tuple
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.constants import PostApprovalEditMode, PostStartEditMode, UserRole
from app.core.exceptions import (
    AuthorizationError,
    BadRequestError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.core.permissions import is_moderator_for
from app.db.base import utcnow
from app.db.enums import (
    AssessmentStatus,
    CollaboratorRole,
    DelegationStatus,
    Duty,
    NotificationType,
    ScheduleState,
)
from app.db.models.academic import Course, Department, TeachingAssignment
from app.db.models.assessment import Assessment, AssessmentSection
from app.db.models.audit import AuditLog
from app.db.models.authoring import AssessmentCollaborator, AuthorDelegation
from app.db.models.auth import User
from app.db.models.moderation import (
    AssessmentSeal,
    AssessmentVersion,
    ModerationReview,
    ModerationReviewStatus,
)
from app.db.repositories.approval_policy_repo import ApprovalPolicyRepository
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.authoring_repo import AuthoringRepository
from app.db.repositories.duty_repo import DutyRepository
from app.db.repositories.moderation_repo import ModerationRepository
from app.db.repositories.notification_repo import NotificationRepository
from app.schemas.authoring import (
    AssessmentCollaboratorCreate,
    AssessmentVersionDiffResponse,
    AuthorDelegationCreate,
    FieldChange,
    PostApprovalEditRequest,
)
from app.services.moderation_service import compute_canonical_hash, serialize_assessment_content


class AuthoringService:
    """Service handling authoring collaborations, delegations, and audited post-approval edits."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = AuthoringRepository(db)
        self.assessment_repo = AssessmentRepository(db)
        self.policy_repo = ApprovalPolicyRepository(db)
        self.duty_repo = DutyRepository(db)
        self.notif_repo = NotificationRepository(db)
        self.mod_repo = ModerationRepository(db)

    # ── Internal Helpers ──────────────────────────────────────────────────────

    async def _get_assessment_with_details(self, assessment_id: uuid.UUID) -> Assessment:
        """Fetch assessment with relations needed for authoring and diff calculations."""
        stmt = (
            select(Assessment)
            .where(Assessment.id == assessment_id, Assessment.is_deleted == False)
            .options(
                selectinload(Assessment.course).selectinload(Course.department),
                selectinload(Assessment.sections),
                selectinload(Assessment.assessment_questions),
                selectinload(Assessment.collaborators),
                selectinload(Assessment.delegations),
            )
        )
        res = await self.db.execute(stmt)
        assessment = res.scalars().first()
        if not assessment:
            raise NotFoundError("Assessment not found.")
        return assessment

    async def is_hod_of_department(self, user: User, department_id: uuid.UUID) -> bool:
        """Check if user has DEPARTMENT_HEAD duty for the department or is Admin."""
        if user.role == UserRole.ADMIN.value:
            return True
        assignments = await self.duty_repo.get_valid_active_duties(user_id=user.id)
        return any(
            d.duty == Duty.DEPARTMENT_HEAD and d.department_id == department_id
            for d in assignments
        )

    # ── Permission & Delegation Assertion ─────────────────────────────────────

    async def assert_can_edit(
        self,
        assessment: Assessment,
        current_user: User,
    ) -> Tuple[bool, Optional[uuid.UUID]]:
        """
        Verify whether current_user is authorized to edit the assessment.
        Authorized editors (Section 8.2):
            - Platform Admin
            - Assessment Owner / Creator (created_by_id)
            - Active Co-author (AssessmentCollaborator where is_active=True)
            - Active Delegate (AuthorDelegation where status=ACTIVE and valid_from <= now <= valid_to)

        Returns:
            (True, delegation_id_if_acting_as_delegate)
        Raises:
            AuthorizationError if not authorized.
        """
        # 1. Admin
        if current_user.role == UserRole.ADMIN.value:
            return True, None

        # 2. Author / Creator
        if str(assessment.created_by_id) == str(current_user.id):
            return True, None

        # 3. Active Co-Author
        collaborator = await self.repo.get_collaborator(assessment.id, current_user.id)
        if collaborator and collaborator.is_active and not collaborator.is_deleted:
            return True, None

        # 4. Active Delegate
        active_delegation = await self.repo.get_active_delegation(assessment.id, current_user.id)
        if active_delegation:
            return True, active_delegation.id

        raise AuthorizationError("You do not have permission to edit this assessment.")

    async def assert_can_read_assessment(
        self,
        assessment: Assessment,
        current_user: User,
    ) -> bool:
        """
        Verify whether current_user is authorized to view the assessment's details,
        collaborators, delegations, version snapshots, or diffs.
        Authorized readers (R-09, Section 8):
            - Platform Admin
            - Assessment Owner / Creator (created_by_id)
            - Active Co-author (AssessmentCollaborator where is_active=True)
            - Active Delegate (AuthorDelegation where status=ACTIVE and valid_from <= now <= valid_to)
            - Department HOD (for the course's department)
            - Department Moderator (for the course's department)

        Raises:
            AuthorizationError if not authorized.
        """
        # 1. Admin
        if current_user.role == UserRole.ADMIN.value:
            return True

        # 2. Author / Creator
        if str(assessment.created_by_id) == str(current_user.id):
            return True

        # 3. Active Co-Author
        collaborator = await self.repo.get_collaborator(assessment.id, current_user.id)
        if collaborator and collaborator.is_active and not collaborator.is_deleted:
            return True

        # 4. Active Delegate
        active_delegation = await self.repo.get_active_delegation(assessment.id, current_user.id)
        if active_delegation:
            return True

        # 5. Department HOD or Moderator
        dept_id = None
        if assessment.course and assessment.course.department_id:
            dept_id = assessment.course.department_id
        elif assessment.course_id:
            c = await self.db.get(Course, assessment.course_id)
            if c:
                dept_id = c.department_id

        if dept_id:
            if await self.is_hod_of_department(current_user, dept_id):
                return True
            if await is_moderator_for(current_user, department_id=dept_id, db=self.db):
                return True

        raise AuthorizationError("You do not have permission to view this assessment's authoring details.")

    # ── Collaborator Management ───────────────────────────────────────────────

    async def add_collaborator(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        data: AssessmentCollaboratorCreate,
    ) -> AssessmentCollaborator:
        """
        Add a course lecturer as a collaborator (R-01).
        Only the assessment owner or admin can add collaborators.
        Target lecturer MUST have an active teaching assignment for the course.
        """
        assessment = await self._get_assessment_with_details(assessment_id)

        # Owner authorization check
        if current_user.role != UserRole.ADMIN.value and str(assessment.created_by_id) != str(current_user.id):
            raise AuthorizationError("Only the assessment owner can add collaborators.")

        if not assessment.course_id:
            raise BadRequestError("Assessment is not linked to a course.")

        # R-01: Target lecturer must have teaching assignment for the assessment's course
        has_assignment = await self.repo.has_course_teaching_assignment(
            course_id=assessment.course_id,
            lecturer_id=data.lecturer_id,
        )
        if not has_assignment and current_user.role != UserRole.ADMIN.value:
            raise BadRequestError("Target lecturer is not assigned to teach this course.")

        collab = await self.repo.add_collaborator(
            assessment_id=assessment.id,
            lecturer_id=data.lecturer_id,
            added_by_id=current_user.id,
            role=data.role,
        )

        # Notification
        await self.notif_repo.create(
            recipient_id=data.lecturer_id,
            title="Added as Assessment Collaborator",
            body=f"You have been added as a co-author for '{assessment.title}'.",
            notification_type=NotificationType.COLLABORATOR_ADDED,
        )

        # Audit
        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="assessment_collaborator",
            entity_id=collab.id,
            action="collaborator_added",
            description=f"Lecturer {data.lecturer_id} added as {data.role.value} to assessment {assessment.id}.",
            after_state={"assessment_id": str(assessment.id), "lecturer_id": str(data.lecturer_id), "role": data.role.value},
        )
        self.db.add(audit)
        await self.db.commit()
        return collab

    async def remove_collaborator(
        self,
        assessment_id: uuid.UUID,
        collaborator_id: uuid.UUID,
        current_user: User,
    ) -> bool:
        """
        Remove/deactivate an assessment collaborator.
        Only the owner or admin can remove collaborators. Cannot remove the owner.
        """
        assessment = await self._get_assessment_with_details(assessment_id)
        if current_user.role != UserRole.ADMIN.value and str(assessment.created_by_id) != str(current_user.id):
            raise AuthorizationError("Only the assessment owner can remove collaborators.")

        collab = await self.repo.get_collaborator_by_id(collaborator_id)
        if not collab or collab.assessment_id != assessment.id or not collab.is_active:
            raise NotFoundError("Collaborator not found on this assessment.")

        if collab.role == CollaboratorRole.OWNER or str(collab.lecturer_id) == str(assessment.created_by_id):
            raise BadRequestError("Cannot remove the assessment owner.")

        await self.repo.remove_collaborator(collaborator_id)

        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="assessment_collaborator",
            entity_id=collab.id,
            action="collaborator_removed",
            description=f"Collaborator {collab.lecturer_id} removed from assessment {assessment.id}.",
            before_state={"lecturer_id": str(collab.lecturer_id), "role": collab.role.value},
        )
        self.db.add(audit)
        await self.db.commit()
        return True

    async def list_collaborators(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
    ) -> Sequence[AssessmentCollaborator]:
        """List active collaborators for an assessment."""
        assessment = await self._get_assessment_with_details(assessment_id)
        await self.assert_can_read_assessment(assessment, current_user)
        return await self.repo.get_collaborators(assessment.id)

    # ── Delegation Management ─────────────────────────────────────────────────

    async def create_delegation(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        data: AuthorDelegationCreate,
    ) -> AuthorDelegation:
        """
        Create a temporary author delegation for this assessment (R-09).
        Allowed: Author (owner) OR HOD of the course's department (or Admin).
        Delegate must be a lecturer in the same department as the course.
        """
        assessment = await self._get_assessment_with_details(assessment_id)
        course = assessment.course
        if not course or not course.department_id:
            raise BadRequestError("Assessment course is missing department assignment.")

        # Author or HOD check
        is_author = str(assessment.created_by_id) == str(current_user.id)
        is_hod = await self.is_hod_of_department(current_user, course.department_id)
        if not is_author and not is_hod:
            raise AuthorizationError("Only the assessment author or department HOD can create delegations.")

        # Delegate must be in the same department
        is_dept_lecturer = await self.repo.is_lecturer_in_department(
            lecturer_id=data.delegate_id,
            department_id=course.department_id,
        )
        if not is_dept_lecturer and current_user.role != UserRole.ADMIN.value:
            raise AuthorizationError("Delegate must be a lecturer in the same department as the assessment course.")

        delegation = await self.repo.create_delegation(
            assessment_id=assessment.id,
            delegator_id=assessment.created_by_id,
            delegate_id=data.delegate_id,
            created_by_id=current_user.id,
            reason=data.reason,
            valid_from=data.valid_from,
            valid_to=data.valid_to,
        )

        # Notification
        await self.notif_repo.create(
            recipient_id=data.delegate_id,
            title="Author Delegation Assigned",
            body=f"You have been delegated authoring authority for '{assessment.title}'. Reason: {data.reason}",
            notification_type=NotificationType.DELEGATION_CREATED,
        )

        # Audit
        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="author_delegation",
            entity_id=delegation.id,
            action="delegation_created",
            description=f"Delegation created for assessment {assessment.id} to delegate {data.delegate_id}.",
            after_state={
                "assessment_id": str(assessment.id),
                "delegate_id": str(data.delegate_id),
                "reason": data.reason,
                "valid_from": data.valid_from.isoformat(),
                "valid_to": data.valid_to.isoformat(),
            },
        )
        self.db.add(audit)
        await self.db.commit()
        return delegation

    async def revoke_delegation(
        self,
        assessment_id: uuid.UUID,
        delegation_id: uuid.UUID,
        current_user: User,
    ) -> AuthorDelegation:
        """
        Revoke an active delegation.
        Allowed: Author, original delegator, HOD of department, or Admin.
        """
        assessment = await self._get_assessment_with_details(assessment_id)
        delegation = await self.repo.get_delegation_by_id(delegation_id)
        if not delegation or delegation.assessment_id != assessment.id:
            raise NotFoundError("Delegation not found on this assessment.")

        is_author = str(assessment.created_by_id) == str(current_user.id)
        is_delegator = str(delegation.delegator_id) == str(current_user.id)
        is_creator = str(delegation.created_by_id) == str(current_user.id)
        is_hod = False
        if assessment.course and assessment.course.department_id:
            is_hod = await self.is_hod_of_department(current_user, assessment.course.department_id)

        if not (is_author or is_delegator or is_creator or is_hod or current_user.role == UserRole.ADMIN.value):
            raise AuthorizationError("You do not have permission to revoke this delegation.")

        revoked = await self.repo.revoke_delegation(delegation_id, current_user.id)

        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="author_delegation",
            entity_id=delegation.id,
            action="delegation_revoked",
            description=f"Delegation {delegation.id} revoked.",
            before_state={"status": delegation.status.value},
            after_state={"status": DelegationStatus.REVOKED.value},
        )
        self.db.add(audit)
        await self.db.commit()
        return revoked or delegation

    async def list_delegations(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
    ) -> Sequence[AuthorDelegation]:
        """List all delegations for an assessment."""
        assessment = await self._get_assessment_with_details(assessment_id)
        await self.assert_can_read_assessment(assessment, current_user)
        return await self.repo.get_delegations(assessment.id)

    # ── Version Snapshots & Diffing ───────────────────────────────────────────

    async def list_versions(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
    ) -> Sequence[AssessmentVersion]:
        """List version snapshots for an assessment."""
        assessment = await self._get_assessment_with_details(assessment_id)
        await self.assert_can_read_assessment(assessment, current_user)
        return await self.repo.get_versions(assessment.id)

    def diff_snapshots(self, snap_from: dict, snap_to: dict) -> Tuple[str, List[FieldChange]]:
        """
        Compare two canonical assessment content snapshots and return structured changes.
        """
        changes: List[FieldChange] = []

        # Assessment general fields
        for field in ["title", "instructions", "total_marks", "passing_marks"]:
            val_from = snap_from.get(field)
            val_to = snap_to.get(field)
            if val_from != val_to:
                changes.append(
                    FieldChange(
                        target_type="ASSESSMENT",
                        target_id=snap_to.get("assessment_id"),
                        field=field,
                        before=val_from,
                        after=val_to,
                        description=f"Assessment {field} changed from '{val_from}' to '{val_to}'.",
                    )
                )

        # Sections diff
        sec_from_map = {s["id"]: s for s in snap_from.get("sections", [])}
        sec_to_map = {s["id"]: s for s in snap_to.get("sections", [])}

        for sec_id, sec_to in sec_to_map.items():
            if sec_id not in sec_from_map:
                changes.append(
                    FieldChange(
                        target_type="SECTION",
                        target_id=sec_id,
                        field="section",
                        before=None,
                        after=sec_to,
                        description=f"Section '{sec_to.get('title')}' was added.",
                    )
                )
            else:
                sec_from = sec_from_map[sec_id]
                for f in ["title", "section_kind", "questions_to_answer", "order_index"]:
                    if sec_from.get(f) != sec_to.get(f):
                        changes.append(
                            FieldChange(
                                target_type="SECTION",
                                target_id=sec_id,
                                field=f,
                                before=sec_from.get(f),
                                after=sec_to.get(f),
                                description=f"Section '{sec_to.get('title')}' {f} changed from {sec_from.get(f)} to {sec_to.get(f)}.",
                            )
                        )

        for sec_id, sec_from in sec_from_map.items():
            if sec_id not in sec_to_map:
                changes.append(
                    FieldChange(
                        target_type="SECTION",
                        target_id=sec_id,
                        field="section",
                        before=sec_from,
                        after=None,
                        description=f"Section '{sec_from.get('title')}' was removed.",
                    )
                )

        # Questions diff
        q_from_map = {q["id"]: q for q in snap_from.get("questions", [])}
        q_to_map = {q["id"]: q for q in snap_to.get("questions", [])}

        for q_id, q_to in q_to_map.items():
            if q_id not in q_from_map:
                changes.append(
                    FieldChange(
                        target_type="QUESTION",
                        target_id=q_id,
                        field="question",
                        before=None,
                        after=q_to,
                        description=f"Question {q_id} was added with {q_to.get('marks')} marks.",
                    )
                )
            else:
                q_from = q_from_map[q_id]
                for f in ["marks", "prompt", "question_type", "section_id"]:
                    if q_from.get(f) != q_to.get(f):
                        changes.append(
                            FieldChange(
                                target_type="QUESTION",
                                target_id=q_id,
                                field=f,
                                before=q_from.get(f),
                                after=q_to.get(f),
                                description=f"Question {q_id} {f} changed from '{q_from.get(f)}' to '{q_to.get(f)}'.",
                            )
                        )

                # Explanation diff
                exp_from = q_from.get("explanation")
                exp_to = q_to.get("explanation")
                if exp_from != exp_to:
                    changes.append(
                        FieldChange(
                            target_type="QUESTION",
                            target_id=q_id,
                            field="explanation",
                            before=exp_from,
                            after=exp_to,
                            description=f"Question {q_id} explanation changed.",
                        )
                    )

                # Options and correct answer diff
                opts_from = q_from.get("options", [])
                opts_to = q_to.get("options", [])
                if opts_from != opts_to:
                    changes.append(
                        FieldChange(
                            target_type="QUESTION",
                            target_id=q_id,
                            field="options",
                            before=opts_from,
                            after=opts_to,
                            description=f"Question {q_id} options changed.",
                        )
                    )
                    corr_from = [o.get("text") for o in opts_from if o.get("is_correct")]
                    corr_to = [o.get("text") for o in opts_to if o.get("is_correct")]
                    if corr_from != corr_to:
                        changes.append(
                            FieldChange(
                                target_type="QUESTION",
                                target_id=q_id,
                                field="correct_answer",
                                before=corr_from,
                                after=corr_to,
                                description=f"Question {q_id} correct answer changed from {corr_from} to {corr_to}.",
                            )
                        )

        for q_id, q_from in q_from_map.items():
            if q_id not in q_to_map:
                changes.append(
                    FieldChange(
                        target_type="QUESTION",
                        target_id=q_id,
                        field="question",
                        before=q_from,
                        after=None,
                        description=f"Question {q_id} was removed.",
                    )
                )

        summary = f"{len(changes)} total change(s) detected between versions."
        return summary, changes

    async def get_version_diff(
        self,
        assessment_id: uuid.UUID,
        version_no_a: int,
        version_no_b: int,
        current_user: User,
    ) -> AssessmentVersionDiffResponse:
        """Fetch structured diff between version A and version B."""
        assessment = await self._get_assessment_with_details(assessment_id)
        await self.assert_can_read_assessment(assessment, current_user)
        ver_a = await self.repo.get_version_by_number(assessment.id, version_no_a)
        if not ver_a:
            raise NotFoundError(f"Version {version_no_a} not found.")

        ver_b = await self.repo.get_version_by_number(assessment.id, version_no_b)
        if not ver_b:
            raise NotFoundError(f"Version {version_no_b} not found.")

        summary, changes = self.diff_snapshots(ver_a.content_snapshot, ver_b.content_snapshot)

        return AssessmentVersionDiffResponse(
            assessment_id=assessment.id,
            version_from=version_no_a,
            version_to=version_no_b,
            summary=summary,
            total_changes=len(changes),
            changes=changes,
        )

    # ── Audited Post-Approval Edits ───────────────────────────────────────────

    async def apply_post_approval_edit(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        data: PostApprovalEditRequest,
    ) -> Assessment:
        """
        Execute audited post-approval edit on an assessment (Section 8.2).
        Enforces:
            - Editor authorization (author, co-author, active delegate).
            - Attempt status check (A-10): once any attempt has started (status != NOT_STARTED),
              content edits are strictly blocked with EDIT_BLOCKED_ATTEMPTS_STARTED.
            - Policy post_approval_edit_mode (NOTIFY vs REQUIRE_REAPPROVAL).
            - Mandatory reason >= 10 chars.
            - Superseding active seals and notifying exam office with reprint requirement.
            - Creating new AssessmentVersion and AuditLog with acting_under_delegation_id.
        """
        assessment = await self._get_assessment_with_details(assessment_id)
        course = assessment.course
        if not course:
            raise BadRequestError("Assessment course missing.")

        # Verify editing permission & delegation
        _, delegation_id = await self.assert_can_edit(assessment, current_user)

        # 1. Attempt Check (Rule A-10)
        attempts_started = await self.repo.has_attempts_started(assessment.id)
        if attempts_started:
            # Check if this edit contains content modifications
            is_content_edit = (
                data.total_marks is not None
                or data.passing_marks is not None
                or data.sections_update is not None
                or data.questions_update is not None
            )
            if is_content_edit:
                raise ConflictError(
                    "Content edits are blocked because student attempts have already started.",
                    code="EDIT_BLOCKED_ATTEMPTS_STARTED",
                )

            # Cosmetic fields: check ApprovalPolicy post_start_edit_mode
            policy = await self.policy_repo.get_by_institution_and_type(
                course.institution_id,
                assessment.assessment_type,
            )
            post_start_mode = policy.post_start_edit_mode if policy else PostStartEditMode.BLOCK
            if post_start_mode == PostStartEditMode.BLOCK:
                raise ConflictError(
                    "Edits are blocked once student attempts have started.",
                    code="EDIT_BLOCKED_ATTEMPTS_STARTED",
                )

        # 2. Check if assessment is in a post-approval state (SEALED, PUBLISHED, APPROVED)
        post_approval_statuses = {
            AssessmentStatus.APPROVED,
            AssessmentStatus.SEALED,
            AssessmentStatus.PUBLISHED,
        }
        is_post_approval = assessment.status in post_approval_statuses

        if is_post_approval:
            if not data.reason or len(data.reason.strip()) < 10:
                raise ValidationError(
                    "Post-approval edits require a mandatory justification reason of at least 10 characters.",
                    code="EDIT_REASON_REQUIRED",
                )

        # Capture before state snapshot
        before_snapshot = serialize_assessment_content(assessment)

        # Apply general field mutations
        if data.title is not None:
            assessment.title = data.title
        if data.instructions is not None:
            assessment.instructions = data.instructions
        if data.total_marks is not None:
            assessment.total_marks = data.total_marks
        if data.passing_marks is not None:
            assessment.passing_marks = data.passing_marks
        if data.duration_minutes is not None:
            assessment.duration_minutes = data.duration_minutes
        if data.window_start is not None:
            assessment.window_start = data.window_start
            if data.window_start > utcnow():
                assessment.schedule_state = ScheduleState.ON_TRACK
        if data.window_end is not None:
            assessment.window_end = data.window_end

        # Capture after state snapshot
        after_snapshot = serialize_assessment_content(assessment)
        new_content_hash = compute_canonical_hash(after_snapshot)

        # Load policy
        policy = await self.policy_repo.get_by_institution_and_type(
            course.institution_id,
            assessment.assessment_type,
        )
        post_approval_mode = policy.post_approval_edit_mode if policy else PostApprovalEditMode.NOTIFY

        new_version = None
        if is_post_approval:
            # Increment version number
            latest_versions = await self.repo.get_versions(assessment.id)
            latest_version_no = latest_versions[0].version_no if latest_versions else 1
            new_version_no = latest_version_no + 1

            new_version = AssessmentVersion(
                assessment_id=assessment.id,
                version_no=new_version_no,
                content_snapshot=after_snapshot,
                content_hash=new_content_hash,
                created_by_id=current_user.id,
                reason=data.reason,
            )
            self.db.add(new_version)
            await self.db.flush()

            # Supersede active seal if one exists
            active_seal = await self.repo.get_active_seal(assessment.id)
            if active_seal:
                active_seal.is_superseded = True
                active_seal.superseded_at = utcnow()
                active_seal.superseded_by_version_id = new_version.id
                active_seal.reprint_required = data.reprint_required
                self.db.add(active_seal)

                # Notify Exam Officers of institution (R-10, SEAL_SUPERSEDED)
                eo_assignments = await self.duty_repo.list_assignments(
                    institution_id=course.institution_id,
                    duty=Duty.EXAM_OFFICER,
                    is_active=True,
                )
                for eo in eo_assignments:
                    reprint_msg = "Reprint requested by lecturer." if data.reprint_required else "No reprint required."
                    await self.notif_repo.create(
                        recipient_id=eo.user_id,
                        title="Assessment Seal Superseded",
                        body=f"Paper '{assessment.title}' was modified after sealing. {reprint_msg} Reason: {data.reason}",
                        notification_type=NotificationType.SEAL_SUPERSEDED,
                    )

            # Notify moderators & HOD (POST_APPROVAL_EDIT)
            if course.department_id:
                dept_mods = await self.duty_repo.list_assignments(
                    department_id=course.department_id,
                    duty=Duty.MODERATOR,
                    is_active=True,
                )
                for mod in dept_mods:
                    await self.notif_repo.create(
                        recipient_id=mod.user_id,
                        title="Post-Approval Paper Modification",
                        body=f"Approved paper '{assessment.title}' was modified (v{new_version.version_no}). Reason: {data.reason}",
                        notification_type=NotificationType.POST_APPROVAL_EDIT,
                    )
                dept_hods = await self.duty_repo.list_assignments(
                    department_id=course.department_id,
                    duty=Duty.DEPARTMENT_HEAD,
                    is_active=True,
                )
                for hod in dept_hods:
                    await self.notif_repo.create(
                        recipient_id=hod.user_id,
                        title="Post-Approval Paper Modification",
                        body=f"Paper '{assessment.title}' in your department was modified post-approval. Reason: {data.reason}",
                        notification_type=NotificationType.POST_APPROVAL_EDIT,
                    )

            # If REQUIRE_REAPPROVAL: Return to PENDING_MODERATION
            if post_approval_mode == PostApprovalEditMode.REQUIRE_REAPPROVAL:
                assessment.status = AssessmentStatus.PENDING_MODERATION
                # Create a new review round
                review_round = ModerationReview(
                    assessment_id=assessment.id,
                    version_id=new_version.id,
                    round_no=(len(latest_versions) + 1),
                    status=ModerationReviewStatus.OPEN,
                )
                self.db.add(review_round)

        # Broadcast notice banner to students mid-attempt if attempts started under ALLOW_WITH_NOTICE
        if attempts_started and post_start_mode == PostStartEditMode.ALLOW_WITH_NOTICE:
            student_ids = await self.repo.get_attempt_student_ids(assessment.id)
            banner_text = data.notice_banner or f"Notice: Assessment '{assessment.title}' has been updated with cosmetic corrections: {data.reason}"
            for s_id in student_ids:
                await self.notif_repo.create(
                    recipient_id=s_id,
                    title="Assessment Update Notice",
                    body=banner_text,
                    notification_type=NotificationType.ASSESSMENT_UPDATE_NOTICE,
                    reference_id=assessment.id,
                    reference_type="assessment",
                )

        self.db.add(assessment)

        # Audit Log (capturing acting_under_delegation_id)
        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="assessment",
            entity_id=assessment.id,
            action="post_approval_edit" if is_post_approval else "assessment_updated",
            description=f"Assessment {assessment.id} updated. {data.reason or ''}".strip(),
            before_state=before_snapshot,
            after_state={
                "snapshot": after_snapshot,
                "reason": data.reason,
                "reprint_required": data.reprint_required,
                "acting_under_delegation_id": str(delegation_id) if delegation_id else None,
            },
            acting_under_delegation_id=delegation_id,
        )
        self.db.add(audit)
        await self.db.commit()
        loaded = await self.assessment_repo.get_by_id(assessment.id)
        if isinstance(loaded, Assessment):
            return loaded
        return assessment

