"""Server-side exam-integrity gate for every student-facing AI surface.

The gate is derived from the student's own open attempts, never from request flags,
so a client cannot opt out of it by omitting ``is_in_assessment`` / ``attempt_id``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.exceptions import PermissionDeniedError
from app.db.enums import AssessmentStatus, AssessmentType, AttemptStatus
from app.db.models.assessment import Assessment
from app.db.models.attempt import AssessmentAttempt
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

BLOCKED_CODE = "AI_BLOCKED_DURING_ACTIVE_ASSESSMENT"


async def assert_student_ai_allowed(db: AsyncSession, student_id: uuid.UUID) -> None:
    """Block student AI while an open attempt forbids it.

    An open (IN_PROGRESS / PAUSED) attempt blocks AI when its assessment is a CAT,
    summative or supervised sitting, or when the lecturer disabled AI assistance for it.
    """
    now = datetime.now(UTC)
    stmt = (
        select(AssessmentAttempt.id)
        .join(Assessment, AssessmentAttempt.assessment_id == Assessment.id)
        .where(
            AssessmentAttempt.student_id == student_id,
            AssessmentAttempt.is_deleted == False,  # noqa: E712
            AssessmentAttempt.status.in_([AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED]),
            or_(
                Assessment.assessment_type.in_([AssessmentType.CAT, AssessmentType.SUMMATIVE]),
                Assessment.is_supervised == True,  # noqa: E712
                Assessment.ai_assistance_allowed == False,  # noqa: E712
            ),
            Assessment.status.in_([AssessmentStatus.PUBLISHED, AssessmentStatus.ACTIVE]),
            or_(Assessment.window_end.is_(None), Assessment.window_end >= now),
        )
        .limit(1)
    )
    if (await db.execute(stmt)).scalar_one_or_none():
        raise PermissionDeniedError(
            "Student AI support is unavailable during an active assessment attempt that does not allow it.",
            code=BLOCKED_CODE,
        )
