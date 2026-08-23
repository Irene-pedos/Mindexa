from __future__ import annotations

import uuid
from datetime import datetime, timezone
import pytest

from app.db.enums import AssessmentType, ResultLetterGrade
from app.schemas.student import StudentRecentResult


def test_student_recent_result_accepts_valid_uuid_and_fields() -> None:
    result_uuid = uuid.uuid4()
    item = StudentRecentResult(
        id=result_uuid,
        assessment_title="Group Project 1",
        assessment_type=AssessmentType.GROUP_WORK,
        course_code="CS101",
        course_name="Intro to Computer Science",
        academic_year="2025/2026",
        score=85.0,
        total_marks=100.0,
        percentage=85.0,
        letter_grade=ResultLetterGrade.A,
        released_at=datetime.now(timezone.utc),
    )

    assert item.id == result_uuid
    assert item.assessment_title == "Group Project 1"
    assert item.score == 85.0
    assert item.percentage == 85.0
