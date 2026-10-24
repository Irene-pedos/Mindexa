"""
tests/integration/test_improvement_loop.py

Marked work feeds the study planner: topics a student scored poorly on in
*released* results become the planner's weak topics.
"""

from __future__ import annotations

import pytest
from sqlalchemy import update

from app.db.models.question import Question
from app.db.models.result import AssessmentResult, ResultBreakdown
from app.services.study_planner_service import StudyPlannerService
from tests.integration.test_moderation_and_calculation_guards import (
    TestModerationAndCalculationGuards as _GuardsSetup,
)


async def _result_with_topics(db, released: bool) -> dict:
    data = await _GuardsSetup()._setup_data(db)
    topics = {data["r1"].question_id: ("Sorting", 1.0), data["r2"].question_id: ("Graphs", 9.0)}
    for question_id, (tag, _) in topics.items():
        await db.execute(update(Question).where(Question.id == question_id).values(topic_tag=tag))

    result = AssessmentResult(
        attempt_id=data["attempt"].id,
        student_id=data["student"].id,
        assessment_id=data["assessment"].id,
        total_score=10.0,
        max_score=20.0,
        percentage=50.0,
        is_released=released,
    )
    db.add(result)
    await db.flush()
    for question_id, (_, score) in topics.items():
        db.add(ResultBreakdown(
            result_id=result.id, question_id=question_id, attempt_id=data["attempt"].id,
            score=score, max_score=10.0,
        ))
    await db.commit()
    return data


@pytest.mark.asyncio
async def test_weak_topics_come_from_released_results(db):
    data = await _result_with_topics(db, released=True)

    weak = await StudyPlannerService(db).weak_topics_from_results(data["student"].id)

    assert weak == ["Sorting"]  # 10% is weak, 90% is not


@pytest.mark.asyncio
async def test_unreleased_results_do_not_leak_into_the_planner(db):
    data = await _result_with_topics(db, released=False)

    weak = await StudyPlannerService(db).weak_topics_from_results(data["student"].id)

    assert weak == []
