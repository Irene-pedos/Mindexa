from __future__ import annotations

import uuid
from typing import List
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import AssessmentStatus, GradingQueueStatus
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.attempt_repo import AttemptRepository
from app.db.repositories.grading_repo import GradingRepository
from app.db.repositories.integrity_repo import IntegrityRepository
from app.schemas.lecturer import (
    LecturerDashboardResponse,
    LecturerDashboardSummary,
    LecturerPendingItem,
    LecturerRecentSubmission,
)

class LecturerService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.assessment_repo = AssessmentRepository(db)
        self.attempt_repo = AttemptRepository(db)
        self.grading_repo = GradingRepository(db)
        self.integrity_repo = IntegrityRepository(db)

    async def get_dashboard_data(self, lecturer_id: uuid.UUID) -> LecturerDashboardResponse:
        # 1. Summary Stats
        # Active Classes (Mocked for now)
        active_classes_count = 4
        
        # Upcoming Assessments (Published/Scheduled but not yet closed)
        # For simplicity, count all non-draft for this lecturer
        assessments, total_ass = await self.assessment_repo.list_by_creator(
            created_by_id=lecturer_id,
            status=AssessmentStatus.PUBLISHED
        )
        
        # Pending Grading (Items in queue for this lecturer's assessments)
        # Need to join with Assessment to filter by creator
        # For now, let's just count global pending items (will refine)
        pending_items, total_pending = await self.grading_repo.list_queue(
            status=GradingQueueStatus.PENDING
        )
        
        # Flagged Integrity Events
        # Mocked for now
        flagged_events_count = 3

        summary = LecturerDashboardSummary(
            active_classes_count=active_classes_count,
            upcoming_assessments_count=total_ass,
            pending_grading_count=total_pending,
            flagged_events_count=flagged_events_count
        )

        # 2. Pending Queue (Grouped by Assessment for the UI)
        # Fetch actual queue items and group them
        queue_items, _ = await self.grading_repo.list_queue(
            status=GradingQueueStatus.PENDING,
            page_size=100
        )
        
        pending_items_data = []
        assessment_counts = {}
        for item in queue_items:
            aid = item.assessment_id
            assessment_counts[aid] = assessment_counts.get(aid, 0) + 1
            
        for aid, count in assessment_counts.items():
            ass = await self.assessment_repo.get_by_id_simple(aid)
            if ass and ass.created_by_id == lecturer_id:
                pending_items_data.append(LecturerPendingItem(
                    id=uuid.uuid4(),
                    assessment_id=aid,
                    assessment_title=ass.title,
                    type="Manual Grading",
                    count=count,
                    urgency="high" if count > 10 else "medium"
                ))

        # 3. Recent Submissions
        recent_attempts = await self.attempt_repo.list_recent_submissions_by_lecturer(lecturer_id)
        
        recent_submissions_data = []
        for a in recent_attempts:
            student_name = "Student"
            if a.student and a.student.profile:
                p = a.student.profile
                student_name = f"{p.first_name} {p.last_name}" if p.first_name else p.display_name or "Student"

            recent_submissions_data.append(LecturerRecentSubmission(
                student_name=student_name,
                assessment_title=a.assessment.title if a.assessment else "Unknown",
                submitted_at=a.submitted_at or a.started_at,
                status=a.status
            ))

        return LecturerDashboardResponse(
            summary=summary,
            pending_queue=pending_items_data,
            recent_submissions=recent_submissions_data
        )
