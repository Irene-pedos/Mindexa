"""
app/services/seal_service.py

Phase 3: Exam Office workflow and seal verification service.
Implements:
    - Assessment sealing (binding version SHA-256 hash to a unique verification code)
    - Print job creation and status tracking (requested, printed, stored, distributed)
    - Seal revocation with mandatory audit and status rollback
    - Public rate-limited seal verification endpoint (privacy-preserving)
    - Official DOCX document generation for papers, moderation forms, and marking schemes
"""

from __future__ import annotations

import math
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.constants import Duty, UserRole
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.core.permissions import has_duty
from app.db.base import utcnow
from app.db.enums import (
    AssessmentStatus,
    EnrollmentStatus,
    NotificationType,
    PrintJobStatus,
)
from app.db.models.academic import Course, StudentEnrollment
from app.db.models.assessment import Assessment, AssessmentTargetSection
from app.db.models.audit import AuditLog
from app.db.models.auth import User
from app.db.models.duty import UserDutyAssignment
from app.db.models.question import AssessmentQuestion, Question
from app.db.models.moderation import (
    AssessmentSeal,
    AssessmentVersion,
    ExamPrintJob,
    ModerationReview,
)
from app.db.repositories.moderation_repo import ModerationRepository
from app.db.repositories.notification_repo import NotificationRepository
from app.services.moderation_document_service import ModerationDocumentService
from app.services.moderation_service import (
    compute_canonical_hash,
    serialize_assessment_content,
)


def generate_verification_code() -> str:
    """Generate a cryptographically secure, unguessable 20-character verification code."""
    # Format: SEAL-XXXX-XXXX-XXXX
    raw = secrets.token_hex(10).upper()
    return f"SEAL-{raw[:4]}-{raw[4:8]}-{raw[8:12]}-{raw[12:16]}"


class SealService:
    """Service handling exam office sealing, print jobs, and verification."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ModerationRepository(db)
        self.notification_repo = NotificationRepository(db)

    async def _assert_exam_officer(self, user: User, institution_id: Optional[uuid.UUID] = None) -> None:
        """Enforce that current user holds active EXAM_OFFICER duty."""
        if user.role == UserRole.ADMIN.value:
            return
        is_eo = await has_duty(
            self.db,
            user,
            Duty.EXAM_OFFICER,
            institution_id=institution_id,
        )
        if not is_eo:
            raise PermissionDeniedError("Action requires active EXAM_OFFICER duty.")

    async def _get_assessment_with_details(self, assessment_id: uuid.UUID) -> Assessment:
        """Fetch assessment with course and sections preloaded."""
        stmt = (
            select(Assessment)
            .where(
                Assessment.id == assessment_id,
                Assessment.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(Assessment.course),
                selectinload(Assessment.sections),
                selectinload(Assessment.target_sections),
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

    # ─────────────────────────────────────────────────────────────────────────
    # SEAL ASSESSMENT
    # ─────────────────────────────────────────────────────────────────────────

    async def seal_assessment(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        spare_percent: int = 5,
        notes: Optional[str] = None,
    ) -> tuple[AssessmentSeal, ExamPrintJob]:
        """
        Seal an approved assessment.
        Enforces:
            - User has active EXAM_OFFICER duty
            - Assessment is in APPROVED status
            - No active seal already exists
            - Creates AssessmentSeal and ExamPrintJob
            - Transitions assessment to SEALED status
        """
        assessment = await self._get_assessment_with_details(assessment_id)
        inst_id = assessment.course.institution_id if assessment.course else None
        await self._assert_exam_officer(current_user, institution_id=inst_id)

        if assessment.status != AssessmentStatus.APPROVED:
            raise BadRequestError(
                f"Only APPROVED assessments can be sealed. Current status is {assessment.status.value}."
            )

        # Check for existing active seal
        existing_seal = await self.repo.get_active_seal(assessment_id)
        if existing_seal:
            raise ConflictError("Assessment already has an active seal.")

        # Get latest version snapshot
        latest_version = await self.repo.get_latest_version(assessment_id)
        if not latest_version:
            # Generate snapshot if none exists yet
            snapshot = serialize_assessment_content(assessment)
            chash = compute_canonical_hash(snapshot)
            latest_version = await self.repo.create_version(
                assessment_id=assessment_id,
                version_no=1,
                content_snapshot=snapshot,
                content_hash=chash,
                created_by_id=current_user.id,
                reason="Sealed snapshot created",
            )

        verification_code = generate_verification_code()

        # Create Seal
        seal = await self.repo.create_seal(
            assessment_id=assessment_id,
            version_id=latest_version.id,
            content_hash=latest_version.content_hash,
            sealed_by_id=current_user.id,
            verification_code=verification_code,
            sealed_at=utcnow(),
        )

        # Calculate enrolled count across target sections
        t_sec_stmt = (
            select(AssessmentTargetSection.class_section_id)
            .where(
                AssessmentTargetSection.assessment_id == assessment_id,
                AssessmentTargetSection.is_deleted == False,  # noqa: E712
            )
        )
        sec_ids = (await self.db.execute(t_sec_stmt)).scalars().all()

        enrolled_count = 0
        if sec_ids:
            enr_stmt = (
                select(func.count(func.distinct(StudentEnrollment.student_id)))
                .where(
                    StudentEnrollment.class_section_id.in_(sec_ids),
                    StudentEnrollment.enrollment_status.in_([
                        EnrollmentStatus.ACTIVE,
                        EnrollmentStatus.ACTIVE.value,
                    ]),
                    StudentEnrollment.is_deleted == False,  # noqa: E712
                )
            )
            enrolled_count = int((await self.db.execute(enr_stmt)).scalar_one() or 0)

        # Spares calculation (A-13)
        spares = math.ceil(enrolled_count * spare_percent / 100.0)
        copies_total = enrolled_count + spares

        # Create ExamPrintJob
        print_job = await self.repo.create_print_job(
            assessment_id=assessment_id,
            seal_id=seal.id,
            enrolled_count=enrolled_count,
            spare_percent=spare_percent,
            copies_total=copies_total,
            created_by_id=current_user.id,
            notes=notes,
        )

        # Transition assessment status to SEALED
        assessment.status = AssessmentStatus.SEALED
        assessment.updated_by_id = current_user.id
        assessment.updated_at = utcnow()
        await self.db.flush()

        # Notify author
        await self.notification_repo.create(
            recipient_id=assessment.created_by_id,
            notification_type=NotificationType.ASSESSMENT_SEALED,
            title="Assessment Officially Sealed",
            body=f"Assessment '{assessment.title}' has been officially sealed by the exam office.",
            reference_id=assessment.id,
            reference_type="assessment",
            action_url=f"/lecturer/assessments/{assessment.id}",
        )

        # Audit
        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="assessment_seal",
            entity_id=seal.id,
            action="assessment_sealed",
            description=f"Assessment '{assessment.title}' sealed. Verification code: {verification_code}.",
            before_state={"status": AssessmentStatus.APPROVED.value},
            after_state={
                "status": AssessmentStatus.SEALED.value,
                "verification_code": verification_code,
                "copies_total": copies_total,
                "print_job_id": str(print_job.id),
            },
        )
        self.db.add(audit)
        await self.db.commit()

        return seal, print_job

    # ─────────────────────────────────────────────────────────────────────────
    # REVOKE SEAL
    # ─────────────────────────────────────────────────────────────────────────

    async def revoke_seal(
        self,
        assessment_id: uuid.UUID,
        current_user: User,
        reason: str,
    ) -> AssessmentSeal:
        """
        Revoke an active assessment seal.
        Enforces:
            - User has active EXAM_OFFICER duty
            - Assessment has an active seal
            - Mandatory reason
            - Rolls assessment status back to APPROVED
        """
        if not reason or len(reason.strip()) < 5:
            raise BadRequestError("A valid revocation reason of at least 5 characters is required.")

        assessment = await self._get_assessment_with_details(assessment_id)
        inst_id = assessment.course.institution_id if assessment.course else None
        await self._assert_exam_officer(current_user, institution_id=inst_id)

        seal = await self.repo.get_active_seal(assessment_id)
        if not seal:
            raise NotFoundError("Active AssessmentSeal", str(assessment_id))

        revoked = await self.repo.revoke_seal(
            seal_id=seal.id,
            revoked_by_id=current_user.id,
            reason=reason.strip(),
        )

        # Roll back assessment status to APPROVED
        assessment.status = AssessmentStatus.APPROVED
        assessment.updated_by_id = current_user.id
        assessment.updated_at = utcnow()
        await self.db.flush()

        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="assessment_seal",
            entity_id=seal.id,
            action="assessment_seal_revoked",
            description=f"Seal revoked for assessment '{assessment.title}'. Reason: {reason}",
            before_state={"status": AssessmentStatus.SEALED.value, "revoked_at": None},
            after_state={
                "status": AssessmentStatus.APPROVED.value,
                "revoked_at": revoked.revoked_at.isoformat() if revoked.revoked_at else None,
                "revoke_reason": reason,
            },
        )
        self.db.add(audit)
        await self.db.commit()

        return revoked

    # ─────────────────────────────────────────────────────────────────────────
    # PRINT JOB STATUS
    # ─────────────────────────────────────────────────────────────────────────

    async def update_print_job(
        self,
        job_id: uuid.UUID,
        current_user: User,
        status: PrintJobStatus,
        notes: Optional[str] = None,
    ) -> ExamPrintJob:
        """Update print job lifecycle status (REQUESTED -> PRINTED -> STORED -> DISTRIBUTED)."""
        job = await self.repo.get_print_job_by_id(job_id)
        if not job:
            raise NotFoundError("ExamPrintJob", str(job_id))

        assessment = await self._get_assessment_with_details(job.assessment_id)
        inst_id = assessment.course.institution_id if assessment.course else None
        await self._assert_exam_officer(current_user, institution_id=inst_id)

        updated_job = await self.repo.update_print_job_status(
            job_id=job_id,
            status=status,
            handled_by_id=current_user.id,
            notes=notes,
        )

        audit = AuditLog(
            actor_id=current_user.id,
            actor_role=current_user.role,
            entity_type="exam_print_job",
            entity_id=job.id,
            action="exam_print_job_updated",
            description=f"Print job {job.id} status updated to {status.value}.",
            before_state={"status": job.status.value},
            after_state={"status": status.value, "notes": notes},
        )
        self.db.add(audit)
        await self.db.commit()

        return updated_job

    # ─────────────────────────────────────────────────────────────────────────
    # PUBLIC SEAL VERIFICATION
    # ─────────────────────────────────────────────────────────────────────────

    async def verify_seal(self, verification_code: str) -> dict:
        """
        Public verification endpoint.
        Returns minimal validation payload; zero student data or exam content.
        Fails if:
            - Code does not exist
            - Seal is revoked
            - Content hash at sealing time no longer matches current assessment content hash
        """
        seal = await self.repo.get_seal_by_code(verification_code.strip())
        if not seal:
            return {
                "valid": False,
                "error": "Verification code not found or invalid.",
            }

        if seal.revoked_at is not None:
            return {
                "valid": False,
                "error": "This seal has been officially revoked by the examination office.",
                "revoked_at": seal.revoked_at.isoformat(),
            }

        if getattr(seal, "is_superseded", False):
            return {
                "valid": False,
                "error": "This seal has been superseded by a post-approval edit.",
                "superseded_at": seal.superseded_at.isoformat() if seal.superseded_at else None,
            }

        # Check version integrity
        version = seal.version
        if not version or version.content_hash != seal.content_hash:
            return {
                "valid": False,
                "error": "Assessment content integrity check failed.",
            }

        # Verify against current assessment content to catch post-seal edits
        current_assessment = await self._get_assessment_with_details(seal.assessment_id)
        if not current_assessment or current_assessment.is_deleted:
            return {
                "valid": False,
                "error": "Assessment record unavailable.",
            }

        current_content = serialize_assessment_content(current_assessment)
        current_hash = compute_canonical_hash(current_content)
        if current_hash != seal.content_hash:
            return {
                "valid": False,
                "error": "Assessment content has been modified since it was sealed.",
            }

        course = current_assessment.course

        return {
            "valid": True,
            "assessment_title": current_assessment.title,
            "course_code": course.code if course else "N/A",
            "course_name": course.name if course else "N/A",
            "sealed_at": seal.sealed_at.isoformat() if seal.sealed_at else None,
            "version_no": version.version_no,
        }


    # ─────────────────────────────────────────────────────────────────────────
    # DOCUMENT DOWNLOAD
    # ─────────────────────────────────────────────────────────────────────────

    async def get_document(
        self,
        assessment_id: uuid.UUID,
        doc_type: str,
        current_user: User,
    ) -> tuple[bytes, str]:
        """
        Retrieve generated DOCX document:
            - moderation-form
            - paper
            - marking-scheme
        Returns (docx_bytes, filename).
        """
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

        # Check authorization: author/co-author, moderator for dept, exam officer for institution, or admin
        dept_id = assessment.course.department_id if assessment.course else None
        inst_id = assessment.course.institution_id if assessment.course else None
        is_mod = await has_duty(self.db, current_user, Duty.MODERATOR, department_id=dept_id) if dept_id else False
        is_eo = await has_duty(self.db, current_user, Duty.EXAM_OFFICER, institution_id=inst_id) if inst_id else False
        is_author = assessment.created_by_id == current_user.id
        is_coauthor = any(
            getattr(s, "user_id", None) == current_user.id and not getattr(s, "is_deleted", False)
            for s in (assessment.supervisors or [])
        )
        is_admin = current_user.role == UserRole.ADMIN.value

        if not (is_author or is_coauthor or is_mod or is_eo or is_admin):
            raise PermissionDeniedError("Unauthorized to download assessment documents.")


        safe_title = "".join(c if c.isalnum() else "_" for c in assessment.title)[:40]

        if doc_type in ("moderation-form", "moderation_form"):
            latest_review = await self.repo.get_latest_review(assessment_id)
            docx_bytes = ModerationDocumentService.generate_moderation_form(
                assessment=assessment,
                review=latest_review,
                moderator_name=current_user.email,
            )
            filename = f"moderation_form_{safe_title}.docx"
            return docx_bytes, filename

        elif doc_type in ("paper", "exam-paper"):
            active_seal = await self.repo.get_active_seal(assessment_id)
            docx_bytes = ModerationDocumentService.generate_exam_paper(
                assessment=assessment,
                seal=active_seal,
            )
            filename = f"exam_paper_{safe_title}.docx"
            return docx_bytes, filename

        elif doc_type in ("marking-scheme", "marking_scheme"):
            docx_bytes = ModerationDocumentService.generate_marking_scheme(
                assessment=assessment
            )
            filename = f"marking_scheme_{safe_title}.docx"
            return docx_bytes, filename

        else:
            raise BadRequestError(
                f"Invalid document type '{doc_type}'. Allowed: moderation-form, paper, marking-scheme."
            )

    async def list_exam_office_queue(
        self,
        current_user: User,
        status: Optional[str] = None,
    ) -> List[dict]:
        """List APPROVED and SEALED assessments in the exam office queue."""
        await self._assert_exam_officer(current_user)

        inst_id = None
        # If user has an institution duty assignment, scope to it
        stmt = (
            select(UserDutyAssignment.institution_id)
            .where(
                UserDutyAssignment.user_id == current_user.id,
                UserDutyAssignment.duty == Duty.EXAM_OFFICER,
                UserDutyAssignment.is_active == True,  # noqa: E712
                UserDutyAssignment.is_deleted == False,  # noqa: E712
            )
        )
        res = await self.db.execute(stmt)
        assigned_inst = res.scalar_one_or_none()
        if assigned_inst:
            inst_id = assigned_inst

        items = await self.repo.list_exam_office_queue(institution_id=inst_id, status=status)
        output = []
        for asmt, seal, job in items:
            output.append({
                "assessment_id": str(asmt.id),
                "title": asmt.title,
                "status": asmt.status.value,
                "course_id": str(asmt.course_id),
                "seal": {
                    "id": str(seal.id),
                    "verification_code": seal.verification_code,
                    "sealed_at": seal.sealed_at.isoformat() if seal.sealed_at else None,
                } if seal else None,
                "print_job": {
                    "id": str(job.id),
                    "status": job.status.value,
                    "copies_total": job.copies_total,
                    "enrolled_count": job.enrolled_count,
                    "spare_percent": job.spare_percent,
                } if job else None,
            })
        return output
