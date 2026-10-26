import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.exceptions import PermissionDeniedError
from app.services.ai_exam_gate import BLOCKED_CODE, assert_student_ai_allowed


def _db_returning(attempt_id):
    result = MagicMock()
    result.scalar_one_or_none.return_value = attempt_id
    db = AsyncMock()
    db.execute.return_value = result
    return db


@pytest.mark.asyncio
async def test_gate_blocks_when_student_has_a_forbidding_open_attempt():
    db = _db_returning(uuid.uuid4())

    with pytest.raises(PermissionDeniedError) as exc_info:
        await assert_student_ai_allowed(db, uuid.uuid4())

    assert exc_info.value.code == BLOCKED_CODE


@pytest.mark.asyncio
async def test_gate_allows_when_no_forbidding_attempt_is_open():
    await assert_student_ai_allowed(_db_returning(None), uuid.uuid4())


@pytest.mark.asyncio
async def test_gate_query_includes_ai_disallowed_assessments():
    db = _db_returning(None)

    await assert_student_ai_allowed(db, uuid.uuid4())

    compiled = str(db.execute.call_args[0][0])
    assert "ai_assistance_allowed" in compiled
