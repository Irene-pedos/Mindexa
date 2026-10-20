"""
app/db/repositories/moderation_repo.py

Data access repository for Moderation and Exam Office workflows (Phase 3).
Tables handled:
    - AssessmentVersion
    - ModerationReview
    - ModerationComment
    - AssessmentSeal
    - ExamPrintJob

Repositories do not commit transactions; the service layer commits.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC
from typing import List, Optional

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.base import utcnow
from app.db.enums import (
    AssessmentStatus,
    ModerationCommentCategory,
    ModerationCommentTarget,
    ModerationReviewStatus,
    PrintJobStatus,
)
from app.db.models.academic import Course
from app.db.models.assessment import Assessment
from app.db.models.moderation import (
    AssessmentSeal,
    AssessmentVersion,
    ExamPrintJob,
    ModerationComment,
    ModerationReview,
)


class ModerationRepository:
    """Repository for moderation reviews, comments, snapshots, seals, and print jobs."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─────────────────────────────────────────────────────────────────────────
    # ASSESSMENT VERSION
    # ─────────────────────────────────────────────────────────────────────────

    async def create_version(
        self,
        *,
        assessment_id: uuid.UUID,
        version_no: int,
        content_snapshot: dict,
        content_hash: str,
        created_by_id: uuid.UUID,
        reason: Optional[str] = None,
    ) -> AssessmentVersion:
        """Create and persist an assessment version snapshot."""
        version = AssessmentVersion(
            assessment_id=assessment_id,
            version_no=version_no,
            content_snapshot=content_snapshot,
            content_hash=content_hash,
            created_by_id=created_by_id,
            reason=reason,
        )
        self.db.add(version)
        await self.db.flush()
        return version

    async def get_version_by_id(self, version_id: uuid.UUID) -> Optional[AssessmentVersion]:
        """Fetch version snapshot by primary key."""
        stmt = select(AssessmentVersion).where(AssessmentVersion.id == version_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_latest_version(self, assessment_id: uuid.UUID) -> Optional[AssessmentVersion]:
        """Fetch latest version of an assessment by version_no desc."""
        stmt = (
            select(AssessmentVersion)
            .where(AssessmentVersion.assessment_id == assessment_id)
            .order_by(AssessmentVersion.version_no.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_next_version_no(self, assessment_id: uuid.UUID) -> int:
        """Get the next version number for an assessment (starts at 1)."""
        stmt = (
            select(func.coalesce(func.max(AssessmentVersion.version_no), 0))
            .where(AssessmentVersion.assessment_id == assessment_id)
        )
        result = await self.db.execute(stmt)
        current_max = result.scalar_one()
        return int(current_max) + 1

    async def list_versions(self, assessment_id: uuid.UUID) -> List[AssessmentVersion]:
        """List all version snapshots for an assessment."""
        stmt = (
            select(AssessmentVersion)
            .where(AssessmentVersion.assessment_id == assessment_id)
            .order_by(AssessmentVersion.version_no.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ─────────────────────────────────────────────────────────────────────────
    # MODERATION REVIEW
    # ─────────────────────────────────────────────────────────────────────────

    async def create_review(
        self,
        *,
        assessment_id: uuid.UUID,
        version_id: Optional[uuid.UUID],
        round_no: int,
        checklist_result: Optional[dict] = None,
        started_at: Optional[datetime] = None,
    ) -> ModerationReview:
        """Create and persist a moderation review round."""
        review = ModerationReview(
            assessment_id=assessment_id,
            version_id=version_id,
            round_no=round_no,
            status=ModerationReviewStatus.OPEN,
            checklist_result=checklist_result,
            started_at=started_at or utcnow(),
        )
        self.db.add(review)
        await self.db.flush()
        return review

    async def get_review_by_id(
        self, review_id: uuid.UUID, include_comments: bool = True
    ) -> Optional[ModerationReview]:
        """Fetch review round by ID with optional comments preloaded."""
        stmt = (
            select(ModerationReview)
            .where(
                ModerationReview.id == review_id,
                ModerationReview.is_deleted == False,  # noqa: E712
            )
        )
        if include_comments:
            stmt = stmt.options(
                selectinload(ModerationReview.comments),
                selectinload(ModerationReview.version),
            )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_latest_review(
        self, assessment_id: uuid.UUID, include_comments: bool = True
    ) -> Optional[ModerationReview]:
        """Fetch the most recent review round for an assessment."""
        stmt = (
            select(ModerationReview)
            .where(
                ModerationReview.assessment_id == assessment_id,
                ModerationReview.is_deleted == False,  # noqa: E712
            )
            .order_by(ModerationReview.round_no.desc())
            .limit(1)
        )
        if include_comments:
            stmt = stmt.options(
                selectinload(ModerationReview.comments),
                selectinload(ModerationReview.version),
            )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_next_round_no(self, assessment_id: uuid.UUID) -> int:
        """Get next moderation round number for an assessment."""
        stmt = (
            select(func.coalesce(func.max(ModerationReview.round_no), 0))
            .where(
                ModerationReview.assessment_id == assessment_id,
                ModerationReview.is_deleted == False,  # noqa: E712
            )
        )
        result = await self.db.execute(stmt)
        current_max = result.scalar_one()
        return int(current_max) + 1

    async def list_reviews_by_assessment(
        self, assessment_id: uuid.UUID
    ) -> List[ModerationReview]:
        """List all moderation rounds for an assessment with comments."""
        stmt = (
            select(ModerationReview)
            .where(
                ModerationReview.assessment_id == assessment_id,
                ModerationReview.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(ModerationReview.comments),
                selectinload(ModerationReview.version),
            )
            .order_by(ModerationReview.round_no.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def claim_review(
        self, review_id: uuid.UUID, reviewer_id: uuid.UUID
    ) -> ModerationReview:
        """Claim a review round for a specific reviewer."""
        review = await self.get_review_by_id(review_id, include_comments=False)
        if not review:
            raise ValueError("Review round not found.")
        review.reviewer_id = reviewer_id
        review.claimed_at = utcnow()
        await self.db.flush()
        return review

    async def decide_review(
        self,
        review_id: uuid.UUID,
        status: ModerationReviewStatus,
        decision_note: Optional[str] = None,
    ) -> ModerationReview:
        """Set decision on review round."""
        review = await self.get_review_by_id(review_id, include_comments=True)
        if not review:
            raise ValueError("Review round not found.")
        review.status = status
        review.decision_note = decision_note
        review.decided_at = utcnow()
        await self.db.flush()
        return review

    async def list_moderator_queue(
        self,
        department_id: uuid.UUID,
        status: Optional[str] = None,
    ) -> List[tuple[ModerationReview, Assessment]]:
        """
        List review rounds for assessments in the moderator's department.
        Filters by review status or assessment status.
        """
        stmt = (
            select(ModerationReview, Assessment)
            .join(Assessment, Assessment.id == ModerationReview.assessment_id)
            .join(Course, Course.id == Assessment.course_id)
            .where(
                Course.department_id == department_id,
                Assessment.is_deleted == False,  # noqa: E712
                ModerationReview.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(ModerationReview.comments),
                selectinload(ModerationReview.version),
            )
            .order_by(ModerationReview.started_at.desc())
        )
        if status:
            try:
                review_st = ModerationReviewStatus(status)
                stmt = stmt.where(ModerationReview.status == review_st)
            except ValueError:
                # If status is an AssessmentStatus
                try:
                    asmt_st = AssessmentStatus(status)
                    stmt = stmt.where(Assessment.status == asmt_st)
                except ValueError:
                    pass

        result = await self.db.execute(stmt)
        return list(result.all())

    # ─────────────────────────────────────────────────────────────────────────
    # MODERATION COMMENTS
    # ─────────────────────────────────────────────────────────────────────────

    async def create_comment(
        self,
        *,
        review_id: uuid.UUID,
        target_type: ModerationCommentTarget,
        target_id: Optional[uuid.UUID],
        category: ModerationCommentCategory,
        comment: str,
        created_by_id: uuid.UUID,
    ) -> ModerationComment:
        """Add a comment to a review round."""
        obj = ModerationComment(
            review_id=review_id,
            target_type=target_type,
            target_id=target_id,
            category=category,
            comment=comment,
            resolved=False,
            created_by_id=created_by_id,
        )
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def get_comment_by_id(self, comment_id: uuid.UUID) -> Optional[ModerationComment]:
        """Fetch a moderation comment by ID."""
        stmt = select(ModerationComment).where(
            ModerationComment.id == comment_id,
            ModerationComment.is_deleted == False,  # noqa: E712
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_comments_by_review(
        self, review_id: uuid.UUID
    ) -> List[ModerationComment]:
        """List all active comments for a review round."""
        stmt = (
            select(ModerationComment)
            .where(
                ModerationComment.review_id == review_id,
                ModerationComment.is_deleted == False,  # noqa: E712
            )
            .order_by(ModerationComment.created_at.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def resolve_comment(
        self, comment_id: uuid.UUID, resolved_by_id: uuid.UUID
    ) -> ModerationComment:
        """Mark a moderation comment as resolved."""
        comment = await self.get_comment_by_id(comment_id)
        if not comment:
            raise ValueError("Moderation comment not found.")
        comment.resolved = True
        comment.resolved_by_id = resolved_by_id
        comment.resolved_at = utcnow()
        await self.db.flush()
        return comment

    async def count_unresolved_comments(self, review_id: uuid.UUID) -> int:
        """Count unresolved comments in a review round."""
        stmt = select(func.count(ModerationComment.id)).where(
            ModerationComment.review_id == review_id,
            ModerationComment.resolved == False,  # noqa: E712
            ModerationComment.is_deleted == False,  # noqa: E712
        )
        result = await self.db.execute(stmt)
        return int(result.scalar_one())

    # ─────────────────────────────────────────────────────────────────────────
    # ASSESSMENT SEAL
    # ─────────────────────────────────────────────────────────────────────────

    async def create_seal(
        self,
        *,
        assessment_id: uuid.UUID,
        version_id: uuid.UUID,
        content_hash: str,
        sealed_by_id: uuid.UUID,
        verification_code: str,
        sealed_at: Optional[datetime] = None,
    ) -> AssessmentSeal:
        """Create and persist an assessment seal."""
        seal = AssessmentSeal(
            assessment_id=assessment_id,
            version_id=version_id,
            content_hash=content_hash,
            sealed_by_id=sealed_by_id,
            verification_code=verification_code,
            sealed_at=sealed_at or utcnow(),
        )
        self.db.add(seal)
        await self.db.flush()
        return seal

    async def get_active_seal(self, assessment_id: uuid.UUID) -> Optional[AssessmentSeal]:
        """Fetch the active seal for an assessment (revoked_at IS NULL)."""
        stmt = (
            select(AssessmentSeal)
            .where(
                AssessmentSeal.assessment_id == assessment_id,
                AssessmentSeal.revoked_at.is_(None),
            )
            .options(selectinload(AssessmentSeal.version))
            .order_by(AssessmentSeal.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_seal_by_code(self, verification_code: str) -> Optional[AssessmentSeal]:
        """Fetch seal by verification code."""
        stmt = (
            select(AssessmentSeal)
            .where(AssessmentSeal.verification_code == verification_code)
            .options(selectinload(AssessmentSeal.version))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_seal_by_id(self, seal_id: uuid.UUID) -> Optional[AssessmentSeal]:
        """Fetch seal by ID."""
        stmt = select(AssessmentSeal).where(AssessmentSeal.id == seal_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def revoke_seal(
        self,
        seal_id: uuid.UUID,
        revoked_by_id: uuid.UUID,
        reason: str,
    ) -> AssessmentSeal:
        """Revoke an active assessment seal."""
        seal = await self.get_seal_by_id(seal_id)
        if not seal:
            raise ValueError("Assessment seal not found.")
        seal.revoked_at = utcnow()
        seal.revoked_by_id = revoked_by_id
        seal.revoke_reason = reason
        await self.db.flush()
        return seal

    # ─────────────────────────────────────────────────────────────────────────
    # EXAM PRINT JOB
    # ─────────────────────────────────────────────────────────────────────────

    async def create_print_job(
        self,
        *,
        assessment_id: uuid.UUID,
        seal_id: uuid.UUID,
        enrolled_count: int,
        spare_percent: int,
        copies_total: int,
        created_by_id: uuid.UUID,
        notes: Optional[str] = None,
    ) -> ExamPrintJob:
        """Create and persist an exam print job."""
        job = ExamPrintJob(
            assessment_id=assessment_id,
            seal_id=seal_id,
            enrolled_count=enrolled_count,
            spare_percent=spare_percent,
            copies_total=copies_total,
            status=PrintJobStatus.REQUESTED,
            created_by_id=created_by_id,
            notes=notes,
        )
        self.db.add(job)
        await self.db.flush()
        return job

    async def get_print_job_by_id(self, job_id: uuid.UUID) -> Optional[ExamPrintJob]:
        """Fetch print job by primary key."""
        stmt = (
            select(ExamPrintJob)
            .where(
                ExamPrintJob.id == job_id,
                ExamPrintJob.is_deleted == False,  # noqa: E712
            )
            .options(selectinload(ExamPrintJob.seal))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_print_job_by_seal(self, seal_id: uuid.UUID) -> Optional[ExamPrintJob]:
        """Fetch print job for a specific seal."""
        stmt = (
            select(ExamPrintJob)
            .where(
                ExamPrintJob.seal_id == seal_id,
                ExamPrintJob.is_deleted == False,  # noqa: E712
            )
            .order_by(ExamPrintJob.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_print_jobs(
        self,
        *,
        assessment_id: Optional[uuid.UUID] = None,
        status: Optional[PrintJobStatus] = None,
    ) -> List[ExamPrintJob]:
        """List print jobs filtered by assessment or status."""
        stmt = (
            select(ExamPrintJob)
            .where(ExamPrintJob.is_deleted == False)  # noqa: E712
            .options(selectinload(ExamPrintJob.seal))
            .order_by(ExamPrintJob.created_at.desc())
        )
        if assessment_id:
            stmt = stmt.where(ExamPrintJob.assessment_id == assessment_id)
        if status:
            stmt = stmt.where(ExamPrintJob.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_print_job_status(
        self,
        job_id: uuid.UUID,
        status: PrintJobStatus,
        handled_by_id: uuid.UUID,
        notes: Optional[str] = None,
    ) -> ExamPrintJob:
        """Update print job status and record timestamp."""
        job = await self.get_print_job_by_id(job_id)
        if not job:
            raise ValueError("Print job not found.")
        job.status = status
        job.handled_by_id = handled_by_id
        if notes is not None:
            job.notes = notes

        now = utcnow()
        if status == PrintJobStatus.PRINTED:
            job.printed_at = now
        elif status == PrintJobStatus.STORED:
            job.stored_at = now
        elif status == PrintJobStatus.DISTRIBUTED:
            job.distributed_at = now

        await self.db.flush()
        return job

    async def list_exam_office_queue(
        self,
        institution_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
    ) -> List[tuple[Assessment, Optional[AssessmentSeal], Optional[ExamPrintJob]]]:
        """
        List APPROVED or SEALED assessments for exam officers.
        """
        stmt = (
            select(Assessment)
            .join(Course, Course.id == Assessment.course_id)
            .where(
                Assessment.is_deleted == False,  # noqa: E712
                Assessment.status.in_([AssessmentStatus.APPROVED, AssessmentStatus.SEALED]),
            )
            .order_by(Assessment.updated_at.desc())
        )
        if institution_id:
            stmt = stmt.where(Course.institution_id == institution_id)
        if status:
            try:
                asmt_st = AssessmentStatus(status)
                stmt = stmt.where(Assessment.status == asmt_st)
            except ValueError:
                pass

        result = await self.db.execute(stmt)
        assessments = list(result.scalars().all())

        output = []
        for asmt in assessments:
            active_seal = await self.get_active_seal(asmt.id)
            print_job = None
            if active_seal:
                print_job = await self.get_print_job_by_seal(active_seal.id)
            output.append((asmt, active_seal, print_job))
        return output
