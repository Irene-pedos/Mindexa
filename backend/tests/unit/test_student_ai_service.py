from __future__ import annotations

import pytest

from app.core.exceptions import PermissionDeniedError
from app.services.student_ai_service import StudentAIService
from app.schemas.student_ai import StudentSupportContextRequest


@pytest.mark.asyncio
async def test_student_ai_service_rejects_answer_key_context() -> None:
    service = StudentAIService(db=None)

    with pytest.raises(PermissionDeniedError) as exc_info:
        await service._assert_contexts_are_safe(
            [
                StudentSupportContextRequest(
                    title="Answer key",
                    content="Official marking guide for the CAT.",
                )
            ]
        )

    assert exc_info.value.code == "AI_CONTEXT_NOT_ALLOWED"
