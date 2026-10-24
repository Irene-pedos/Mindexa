"""
tests/unit/test_long_guidance_storage.py

Accepting an AI case study failed with a 500 ("value too long for type character varying(500)")
because each sub-question's answer guidance is stored in question_option.match_value, which was
capped at 500 characters while the AI may write up to 2000.
"""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import Text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.question import QuestionOption
from app.db.repositories.question_repo import QuestionRepository
from app.schemas.ai_generation import ReviewAIQuestionRequest
from app.services.ai_generation_service import AIGenerationService
from tests.unit.test_phase3_moderation import _setup_institutional_env

LONG_GUIDANCE = "Steps: " + "write the CSS rules, link the stylesheet, and verify the result; " * 25  # ~1,700 chars


def test_guidance_column_is_unbounded_text():
    column = QuestionOption.__table__.c.match_value
    assert isinstance(column.type, Text)
    assert getattr(column.type, "length", None) is None


@pytest.mark.asyncio
async def test_accepting_a_case_study_with_long_guidance_keeps_all_of_it(db: AsyncSession):
    env = await _setup_institutional_env(db)
    svc = object.__new__(AIGenerationService)
    svc._question_repo = QuestionRepository(db)
    parts = json.dumps(
        [
            {"text": "Outline the process.", "is_correct": True, "explanation": LONG_GUIDANCE, "match_key": "6"},
            {"text": "Justify your approach.", "is_correct": True, "explanation": "Because it separates style.", "match_key": "4"},
        ]
    )
    ai_question = SimpleNamespace(
        question_type="case_study",
        difficulty="medium",
        parsed_question_text="A bakery's site has inline styles on every page and is hard to maintain.",
        parsed_explanation=None,
        parsed_options_json=parts,
        batch_id=None,
    )

    question = await svc._promote_to_question_bank(
        ai_question, ReviewAIQuestionRequest(decision="APPROVED"), SimpleNamespace(id=env["author"].id)
    )
    await db.flush()

    stored = (
        await db.execute(select(QuestionOption).where(QuestionOption.question_id == question.id).order_by(QuestionOption.order_index))
    ).scalars().all()
    assert len(stored) == 2
    assert stored[0].match_value == LONG_GUIDANCE  # nothing truncated, nothing rejected
    assert len(stored[0].match_value) > 500
    assert [o.match_key for o in stored] == ["6", "4"]
