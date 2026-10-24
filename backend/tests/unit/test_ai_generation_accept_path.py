"""
tests/unit/test_ai_generation_accept_path.py

Accepting an AI question must never silently drop its sub-questions/options, and a case
study without sub-questions must be refused instead of being saved empty.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import ValidationError
from app.schemas.ai_generation import AIGenerationBatchResponse, ReviewAIQuestionRequest
from app.services.ai_generation_service import AIGenerationService

PARTS = json.dumps(
    [
        {"text": "Identify the bottleneck.", "is_correct": True, "explanation": "Slow queries", "match_key": "4"},
        {"text": "Propose a fix.", "is_correct": True, "explanation": "Add an index", "match_key": "6"},
    ]
)


def _service() -> AIGenerationService:
    svc = object.__new__(AIGenerationService)
    svc._question_repo = MagicMock()
    svc._question_repo.create = AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4()))
    svc._question_repo.add_option = AsyncMock()
    return svc


def _ai_question(q_type: str = "case_study", options: str | None = PARTS):
    return SimpleNamespace(
        question_type=q_type,
        difficulty="medium",
        parsed_question_text="Scenario text that is long enough.",
        parsed_explanation=None,
        parsed_options_json=options,
        batch_id=None,
    )


def _review(**over) -> ReviewAIQuestionRequest:
    return ReviewAIQuestionRequest(decision="APPROVED", **over)


@pytest.mark.asyncio
@pytest.mark.parametrize("edited", ["", "[]", "  ", "null"])
async def test_empty_edit_keeps_the_generated_sub_questions(edited: str):
    svc = _service()

    await svc._promote_to_question_bank(_ai_question(), _review(modified_options_json=edited), SimpleNamespace(id=uuid.uuid4()))

    assert svc._question_repo.add_option.await_count == 2
    marks = [c.kwargs["match_key"] for c in svc._question_repo.add_option.await_args_list]
    assert marks == ["4", "6"]  # marks, never the question text


@pytest.mark.asyncio
@pytest.mark.parametrize("options", [None, "[]", "not json"])
async def test_case_study_without_readable_sub_questions_is_refused(options):
    svc = _service()

    with pytest.raises(ValidationError):
        await svc._promote_to_question_bank(
            _ai_question(options=options), _review(), SimpleNamespace(id=uuid.uuid4())
        )

    svc._question_repo.create.assert_not_awaited()  # nothing half-saved


@pytest.mark.asyncio
async def test_missing_marks_default_to_a_number_not_the_text():
    svc = _service()
    parts = json.dumps([{"text": "Part one", "is_correct": True}, {"text": "Part two", "is_correct": True}])

    await svc._promote_to_question_bank(_ai_question(options=parts), _review(), SimpleNamespace(id=uuid.uuid4()))

    assert [c.kwargs["match_key"] for c in svc._question_repo.add_option.await_args_list] == ["5", "5"]


def test_sub_question_marks_total_is_used_as_the_default_marks():
    assert AIGenerationService._sub_question_marks(PARTS) == 10
    assert AIGenerationService._sub_question_marks("garbage") is None
    assert AIGenerationService._sub_question_marks(None) is None


def test_batch_response_exposes_per_section_progress():
    progress = [{"section_id": "s1", "status": "RUNNING", "generated": 0, "failed": 0, "error": None}]
    batch = SimpleNamespace(
        id=uuid.uuid4(), created_by_id=uuid.uuid4(), assessment_id=None, subject="x", topic="y",
        question_type="case_study", difficulty="medium", bloom_level=None, total_requested=3,
        total_generated=1, total_failed=0, status="PROCESSING", started_at=None, completed_at=None,
        error_message=None, ai_model_used=None, ai_provider=None, created_at=datetime.now(UTC),
        sections_json=progress,
    )

    resp = AIGenerationBatchResponse.model_validate(batch)

    assert resp.sections_progress == progress
    assert resp.total_generated == 1
