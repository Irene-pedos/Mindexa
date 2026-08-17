"""Data access for group submissions, answers, comments, approvals, and materials."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from app.db.enums import GroupActivityType, GroupApprovalStatus, GroupSubmissionStatus
from app.db.models.attempt import (
    GroupActivityLog,
    GroupAssessmentMaterial,
    GroupSubmission,
    GroupSubmissionAnswer,
    GroupSubmissionApproval,
    GroupSubmissionComment,
    StudentGroup,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class GroupSubmissionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create_submission(
        self,
        *,
        assessment_id: uuid.UUID,
        group_id: uuid.UUID,
    ) -> tuple[GroupSubmission, bool]:
        existing = await self.get_by_assessment_group(
            assessment_id=assessment_id,
            group_id=group_id,
            include_related=True,
        )
        if existing:
            return existing, False

        submission = GroupSubmission(
            assessment_id=assessment_id,
            group_id=group_id,
            status=GroupSubmissionStatus.DRAFT,
        )
        self.db.add(submission)
        await self.db.flush()
        return submission, True

    async def get_by_id(
        self,
        submission_id: uuid.UUID,
        *,
        include_related: bool = False,
    ) -> GroupSubmission | None:
        stmt = select(GroupSubmission).where(
            GroupSubmission.id == submission_id,
            GroupSubmission.is_deleted.is_(False),
        )
        if include_related:
            stmt = stmt.options(
                selectinload(GroupSubmission.answers),
                selectinload(GroupSubmission.comments),
                selectinload(GroupSubmission.approvals),
                selectinload(GroupSubmission.activity_logs),
                selectinload(GroupSubmission.appeals),
            )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_assessment_group(
        self,
        *,
        assessment_id: uuid.UUID,
        group_id: uuid.UUID,
        include_related: bool = False,
    ) -> GroupSubmission | None:
        stmt = select(GroupSubmission).where(
            GroupSubmission.assessment_id == assessment_id,
            GroupSubmission.group_id == group_id,
            GroupSubmission.is_deleted.is_(False),
        )
        if include_related:
            stmt = stmt.options(
                selectinload(GroupSubmission.answers),
                selectinload(GroupSubmission.comments),
                selectinload(GroupSubmission.approvals),
                selectinload(GroupSubmission.activity_logs),
                selectinload(GroupSubmission.appeals),
            )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert_answer(
        self,
        *,
        submission_id: uuid.UUID,
        question_id: uuid.UUID,
        editor_id: uuid.UUID,
        answer_content: dict | None,
        notes_content: dict | None,
    ) -> tuple[GroupSubmissionAnswer, bool]:
        result = await self.db.execute(
            select(GroupSubmissionAnswer).where(
                GroupSubmissionAnswer.submission_id == submission_id,
                GroupSubmissionAnswer.question_id == question_id,
                GroupSubmissionAnswer.is_deleted.is_(False),
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.answer_content = answer_content
            existing.notes_content = notes_content
            existing.last_edited_by_id = editor_id
            existing.last_edited_at = _utcnow()
            await self.db.flush()
            return existing, False

        try:
            async with self.db.begin_nested():
                answer = GroupSubmissionAnswer(
                    submission_id=submission_id,
                    question_id=question_id,
                    answer_content=answer_content,
                    notes_content=notes_content,
                    last_edited_by_id=editor_id,
                    last_edited_at=_utcnow(),
                )
                self.db.add(answer)
                await self.db.flush()
                return answer, True
        except Exception:
            result = await self.db.execute(
                select(GroupSubmissionAnswer).where(
                    GroupSubmissionAnswer.submission_id == submission_id,
                    GroupSubmissionAnswer.question_id == question_id,
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                existing.answer_content = answer_content
                existing.notes_content = notes_content
                existing.last_edited_by_id = editor_id
                existing.last_edited_at = _utcnow()
                existing.is_deleted = False
                await self.db.flush()
                return existing, False
            raise

    async def add_comment(
        self,
        *,
        submission_id: uuid.UUID,
        author_id: uuid.UUID,
        body: str,
        question_id: uuid.UUID | None = None,
    ) -> GroupSubmissionComment:
        comment = GroupSubmissionComment(
            submission_id=submission_id,
            author_id=author_id,
            body=body,
            question_id=question_id,
        )
        self.db.add(comment)
        await self.db.flush()
        return comment

    async def upsert_submission_approval(
        self,
        *,
        submission_id: uuid.UUID,
        student_id: uuid.UUID,
        status: GroupApprovalStatus,
        note: str | None = None,
    ) -> tuple[GroupSubmissionApproval, bool]:
        result = await self.db.execute(
            select(GroupSubmissionApproval).where(
                GroupSubmissionApproval.submission_id == submission_id,
                GroupSubmissionApproval.student_id == student_id,
                GroupSubmissionApproval.is_deleted.is_(False),
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.status = status
            existing.note = note
            existing.responded_at = _utcnow()
            await self.db.flush()
            return existing, False

        approval = GroupSubmissionApproval(
            submission_id=submission_id,
            student_id=student_id,
            status=status,
            note=note,
            responded_at=_utcnow(),
        )
        self.db.add(approval)
        await self.db.flush()
        return approval, True

    async def seed_submission_approvals(
        self,
        *,
        submission_id: uuid.UUID,
        student_ids: list[uuid.UUID],
    ) -> None:
        for student_id in student_ids:
            exists = await self.db.execute(
                select(GroupSubmissionApproval.id).where(
                    GroupSubmissionApproval.submission_id == submission_id,
                    GroupSubmissionApproval.student_id == student_id,
                    GroupSubmissionApproval.is_deleted.is_(False),
                )
            )
            if exists.scalar_one_or_none() is None:
                self.db.add(
                    GroupSubmissionApproval(
                        submission_id=submission_id,
                        student_id=student_id,
                        status=GroupApprovalStatus.PENDING,
                    )
                )
        await self.db.flush()

    async def list_submission_approvals(
        self,
        submission_id: uuid.UUID,
    ) -> list[GroupSubmissionApproval]:
        result = await self.db.execute(
            select(GroupSubmissionApproval)
            .where(
                GroupSubmissionApproval.submission_id == submission_id,
                GroupSubmissionApproval.is_deleted.is_(False),
            )
            .order_by(GroupSubmissionApproval.created_at.asc())
        )
        return list(result.scalars().all())

    async def add_activity_log(
        self,
        *,
        submission_id: uuid.UUID,
        student_id: uuid.UUID,
        activity_type: GroupActivityType,
        question_id: uuid.UUID | None = None,
        metadata_json: dict | None = None,
    ) -> GroupActivityLog:
        log = GroupActivityLog(
            submission_id=submission_id,
            student_id=student_id,
            activity_type=activity_type,
            question_id=question_id,
            metadata_json=metadata_json,
        )
        self.db.add(log)
        await self.db.flush()
        return log

    async def list_activity_logs(self, submission_id: uuid.UUID) -> list[GroupActivityLog]:
        result = await self.db.execute(
            select(GroupActivityLog)
            .where(GroupActivityLog.submission_id == submission_id)
            .order_by(GroupActivityLog.created_at.asc())
        )
        return list(result.scalars().all())

    async def list_active_member_ids(self, submission_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.db.execute(
            select(GroupActivityLog.student_id)
            .where(GroupActivityLog.submission_id == submission_id)
            .distinct()
        )
        return list(result.scalars().all())

    async def set_submission_status(
        self,
        *,
        submission_id: uuid.UUID,
        status: GroupSubmissionStatus,
        requested_by_id: uuid.UUID | None = None,
        submitted_by_id: uuid.UUID | None = None,
        graded_by_id: uuid.UUID | None = None,
    ) -> None:
        values: dict[str, object] = {"status": status}
        now = _utcnow()
        if status == GroupSubmissionStatus.READY_FOR_APPROVAL:
            values["approval_requested_at"] = now
            values["requested_by_id"] = requested_by_id
        if status == GroupSubmissionStatus.SUBMITTED:
            values["submitted_at"] = now
            values["submitted_by_id"] = submitted_by_id
        if status == GroupSubmissionStatus.GRADED:
            values["graded_at"] = now
            values["graded_by_id"] = graded_by_id
        await self.db.execute(
            update(GroupSubmission)
            .where(GroupSubmission.id == submission_id)
            .values(**values)
        )

    async def set_grade(
        self,
        *,
        submission_id: uuid.UUID,
        total_score: float,
        max_score: float,
        feedback: str | None,
        graded_by_id: uuid.UUID,
        member_overrides: dict | None = None,
        status: GroupSubmissionStatus = GroupSubmissionStatus.GRADED,
    ) -> None:
        await self.db.execute(
            update(GroupSubmission)
            .where(GroupSubmission.id == submission_id)
            .values(
                total_score=total_score,
                max_score=max_score,
                feedback=feedback,
                graded_by_id=graded_by_id,
                graded_at=_utcnow(),
                status=status,
                member_overrides=member_overrides,
            )
        )

    async def mark_result_released(self, submission_id: uuid.UUID) -> None:
        await self.db.execute(
            update(GroupSubmission)
            .where(GroupSubmission.id == submission_id)
            .values(result_released_at=_utcnow())
        )

    async def list_by_assessment(
        self,
        assessment_id: uuid.UUID,
    ) -> list[GroupSubmission]:
        result = await self.db.execute(
            select(GroupSubmission)
            .where(
                GroupSubmission.assessment_id == assessment_id,
                GroupSubmission.is_deleted.is_(False),
            )
            .order_by(GroupSubmission.created_at.asc())
        )
        return list(result.scalars().all())

    async def add_material(
        self,
        *,
        assessment_id: uuid.UUID,
        title: str,
        file_url: str,
        group_id: uuid.UUID | None = None,
        uploaded_by_id: uuid.UUID | None = None,
        description: str | None = None,
        is_required: bool = False,
    ) -> GroupAssessmentMaterial:
        material = GroupAssessmentMaterial(
            assessment_id=assessment_id,
            group_id=group_id,
            uploaded_by_id=uploaded_by_id,
            title=title,
            file_url=file_url,
            description=description,
            is_required=is_required,
        )
        self.db.add(material)
        await self.db.flush()
        return material

    async def list_materials(
        self,
        *,
        assessment_id: uuid.UUID,
        group_id: uuid.UUID | None = None,
    ) -> list[GroupAssessmentMaterial]:
        filters = [
            GroupAssessmentMaterial.assessment_id == assessment_id,
            GroupAssessmentMaterial.is_deleted.is_(False),
        ]
        if group_id is None:
            filters.append(GroupAssessmentMaterial.group_id.is_(None))
        else:
            filters.append(
                (GroupAssessmentMaterial.group_id == group_id)
                | (GroupAssessmentMaterial.group_id.is_(None))
            )
        result = await self.db.execute(
            select(GroupAssessmentMaterial)
            .where(*filters)
            .order_by(GroupAssessmentMaterial.created_at.asc())
        )
        return list(result.scalars().all())

    async def count_completed_answers(self, submission_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(GroupSubmissionAnswer.id)).where(
                GroupSubmissionAnswer.submission_id == submission_id,
                GroupSubmissionAnswer.is_deleted.is_(False),
                GroupSubmissionAnswer.answer_content.is_not(None),
            )
        )
        return result.scalar_one()

    async def get_grading_queue(
        self,
        *,
        lecturer_id: uuid.UUID | None = None,
        assessment_id: uuid.UUID | None = None,
        status: GroupSubmissionStatus | None = None,
        page: int = 1,
        page_size: int = 30,
    ) -> tuple[list[GroupSubmission], int]:
        from app.db.models.assessment import Assessment

        if status is None:
            status = GroupSubmissionStatus.SUBMITTED

        stmt = select(GroupSubmission).join(
            Assessment, Assessment.id == GroupSubmission.assessment_id
        ).where(
            GroupSubmission.status == status,
            GroupSubmission.is_deleted.is_(False),
        )

        if lecturer_id:
            stmt = stmt.where(Assessment.created_by_id == lecturer_id)
        if assessment_id:
            stmt = stmt.where(GroupSubmission.assessment_id == assessment_id)

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar_one()

        # Paginate and order
        stmt = stmt.order_by(GroupSubmission.submitted_at.desc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        
        # Include relationships
        stmt = stmt.options(
            selectinload(GroupSubmission.assessment),
            selectinload(GroupSubmission.group).selectinload(StudentGroup.members),
            selectinload(GroupSubmission.appeals),
            selectinload(GroupSubmission.approvals),
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total
