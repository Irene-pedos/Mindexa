"""
app/workers/tasks/grading.py

Celery tasks for triggering and processing assessment grading.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.core.celery_app import celery
from . import MindexaTask, _run


@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.grading.trigger_grading_for_attempt",
    max_retries=3,
    queue="grading",
)
def trigger_grading_for_attempt(self: MindexaTask, attempt_id: str) -> dict[str, Any]:
    """
    Trigger the grading pipeline for a submitted attempt.
    
    1. Grades all responses (auto-grade closed, queue open-ended).
    2. Checks if all responses are now graded.
    3. If complete, calculates result and handles immediate release.
    """
    return _run(_trigger_grading_async(attempt_id))


async def _trigger_grading_async(attempt_id: str) -> dict[str, Any]:
    from app.db.session import AsyncSessionLocal
    from app.services.grading_service import GradingService
    from app.services.result_service import ResultService
    from app.db.repositories.attempt_repo import AttemptRepository
    from app.db.repositories.grading_repo import GradingRepository
    from app.db.repositories.submission_repo import SubmissionRepository
    from app.db.repositories.assessment_repo import AssessmentRepository
    from app.db.repositories.result_repo import ResultRepository
    from app.db.enums import ResultReleaseMode, NotificationType
    from app.db.models.auth import User
    from app.workers.tasks import send_email_notification

    async with AsyncSessionLocal() as session:
        attempt_uuid = uuid.UUID(attempt_id)
        attempt_repo = AttemptRepository(session)
        grading_repo = GradingRepository(session)
        submission_repo = SubmissionRepository(session)
        assessment_repo = AssessmentRepository(session)
        result_repo = ResultRepository(session)
        
        attempt = await attempt_repo.get_by_id_simple(attempt_uuid)
        if not attempt:
            return {"error": "Attempt not found", "attempt_id": attempt_id}

        grading_service = GradingService(session)
        result_service = ResultService(session)

        # 1. Run the initial grading pass
        counts = await grading_service.grade_attempt(
            attempt_id=attempt_uuid,
            assessment_id=attempt.assessment_id,
            student_id=attempt.student_id,
        )

        # 2. Check if all questions are graded to calculate result
        graded_count = await grading_repo.count_final_grades(attempt_uuid)
        response_count = await submission_repo.count_responses(attempt_uuid)
        
        result_status = "partial"
        if graded_count == response_count and response_count > 0:
            result, _ = await result_service.calculate_result(attempt_id=attempt_uuid)
            result_status = "calculated"

            # 3. Handle Immediate Release
            assessment = await assessment_repo.get_by_id_simple(attempt.assessment_id)
            
            release_mode = assessment.result_release_mode
            if hasattr(release_mode, "value"):
                release_mode = release_mode.value

            if release_mode == ResultReleaseMode.IMMEDIATE.value and not result.integrity_hold:
                await result_repo.release(result.id, released_by_id=None)
                
                # Dispatch notification
                student = await session.get(User, attempt.student_id)
                if student and student.email:
                    first_name = student.profile.first_name if student.profile else "Student"
                    from app.core.config import settings
                    results_url = f"{settings.FRONTEND_URL}/student/results/{result.id}"
                    
                    send_email_notification.delay(
                        to_email=student.email,
                        subject=f"Results Released: {assessment.title}",
                        template_name="result_released",
                        context={
                            "first_name": first_name,
                            "assessment_title": assessment.title,
                            "result_id": str(result.id),
                            "results_url": results_url,
                            "percentage": round(result.percentage, 1),
                            "letter_grade": result.letter_grade.value if hasattr(result.letter_grade, "value") else str(result.letter_grade),
                            "is_passing": result.is_passing,
                            "notification_type": NotificationType.RESULT_RELEASED.value,
                            "app_name": settings.APP_NAME
                        }
                    )
                result_status = "released"

        await session.commit()
        return {
            "attempt_id": attempt_id,
            "counts": counts,
            "result_status": result_status,
        }
