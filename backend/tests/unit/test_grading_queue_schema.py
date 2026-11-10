"""The grading queue response must carry the student's answer.

The repository attaches ``student_answer`` to every queue row, but a FastAPI response model drops
any field it does not declare. For a while the schema did not declare it, so Batch Grading showed
an empty "Answer Response" column and the lecturer could not see what they were grading.
"""
import uuid
from datetime import UTC, datetime

from app.db.enums import GradingMode, GradingQueuePriority, GradingQueueStatus
from app.schemas.grading import GradingQueueItemResponse


def _row(**extra):
    base = {
        "id": uuid.uuid4(),
        "response_id": uuid.uuid4(),
        "attempt_id": uuid.uuid4(),
        "assessment_id": uuid.uuid4(),
        "question_id": uuid.uuid4(),
        "student_id": uuid.uuid4(),
        "status": list(GradingQueueStatus)[0],
        "priority": list(GradingQueuePriority)[0],
        "grading_mode": list(GradingMode)[0],
        "ai_pre_graded": False,
        "created_at": datetime.now(UTC),
    }
    base.update(extra)
    return base


def test_queue_item_keeps_the_student_answer():
    item = GradingQueueItemResponse.model_validate(_row(student_answer="A stack is LIFO."))
    assert item.student_answer == "A stack is LIFO."
    assert item.model_dump()["student_answer"] == "A stack is LIFO."


def test_queue_item_student_answer_is_optional():
    assert GradingQueueItemResponse.model_validate(_row()).student_answer is None
