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
    from app.db.repositories.assessment_repo import AssessmentRepository

    async with AsyncSessionLocal() as session:
        attempt_uuid = uuid.UUID(attempt_id)
        attempt_repo = AttemptRepository(session)
        grading_repo = GradingRepository(session)
        assessment_repo = AssessmentRepository(session)

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
        aq_count = await assessment_repo.count_assessment_questions(attempt.assessment_id)

        result_status = "partial"
        if graded_count == aq_count and aq_count > 0:
            result, _ = await result_service.calculate_result(attempt_id=attempt_uuid)
            result_status = "released" if result.is_released else "calculated"

        await session.commit()
        return {
            "attempt_id": attempt_id,
            "counts": counts,
            "result_status": result_status,
        }


@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.grading.trigger_ai_grading_for_group_submission",
    max_retries=3,
    queue="grading",
)
def trigger_ai_grading_for_group_submission(self: MindexaTask, submission_id: str) -> dict[str, Any]:
    """
    Trigger the background AI evaluation pipeline for open-ended questions in a group submission.
    """
    return _run(_trigger_group_grading_async(submission_id))


async def _trigger_group_grading_async(submission_id: str) -> dict[str, Any]:
    from app.db.session import AsyncSessionLocal
    from app.services.group_work_service import GroupWorkService
    from app.services.grading_service import GradingService

    async with AsyncSessionLocal() as session:
        sub_uuid = uuid.UUID(submission_id)
        group_service = GroupWorkService(session)
        grading_service = GradingService(session)

        result = await group_service.process_ai_grading_for_submission(
            submission_id=sub_uuid,
            grading_service=grading_service,
        )
        await session.commit()
        return result


@celery.task(
    bind=True,
    base=MindexaTask,
    name="app.workers.tasks.grading.trigger_ai_grading_for_group_question",
    max_retries=3,
    queue="grading",
)
def trigger_ai_grading_for_group_question(self: MindexaTask, submission_id: str, question_id: str) -> dict[str, Any]:
    """
    Trigger the background AI evaluation for a single question in a group submission.
    """
    return _run(_trigger_group_question_grading_async(submission_id, question_id))


async def _trigger_group_question_grading_async(submission_id: str, question_id: str) -> dict[str, Any]:
    from app.db.session import AsyncSessionLocal
    from app.services.group_work_service import GroupWorkService
    from app.services.grading_service import GradingService

    async with AsyncSessionLocal() as session:
        sub_uuid = uuid.UUID(submission_id)
        q_uuid = uuid.UUID(question_id)
        group_service = GroupWorkService(session)
        grading_service = GradingService(session)

        result = await group_service.process_ai_grading_for_single_question(
            submission_id=sub_uuid,
            question_id=q_uuid,
            grading_service=grading_service,
        )
        await session.commit()
        return result
