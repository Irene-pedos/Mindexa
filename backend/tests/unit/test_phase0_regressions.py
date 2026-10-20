"""Regression tests for the Phase 0 audit findings."""

from __future__ import annotations

import ast
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from app.core.ai.gateway import AIGateway
from app.db.enums import AIActionType
from app.db.repositories.assessment_repo import AssessmentRepository
from app.services.ai_language_audit_service import AILanguageAuditService
from app.services.study_planner_service import StudyPlannerService


@pytest.mark.asyncio
async def test_gateway_log_action_keeps_prompt_version_in_supported_json_field() -> None:
    db = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    gateway = object.__new__(AIGateway)
    gateway.db = db

    await gateway.log_action(
        action_type=AIActionType.STUDY_SUPPORT,
        prompt_version="v2",
        raw_output={"summary": "ok"},
    )

    log_entry = db.add.call_args.args[0]
    assert log_entry.raw_output == {"summary": "ok", "prompt_version": "v2"}
    assert not hasattr(log_entry, "prompt_version")
    db.flush.assert_awaited_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_language_audit_queries_compile_without_soft_delete_on_append_only_log() -> None:
    db = AsyncMock()
    empty_result = MagicMock()
    empty_result.all.return_value = []
    db.execute.return_value = empty_result

    await AILanguageAuditService(db).generate_audit_report()

    statements = [call.args[0] for call in db.execute.await_args_list]
    compiled = "\n".join(str(stmt.compile(dialect=postgresql.dialect())) for stmt in statements)
    assert "ai_action_log.is_deleted" not in compiled


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["list_by_creator", "list_all"])
async def test_assessment_search_joins_course_columns(method: str) -> None:
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one.return_value = 0
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result
    repository = AssessmentRepository(db)

    if method == "list_by_creator":
        await repository.list_by_creator(created_by_id=uuid.uuid4(), search="biology")
    else:
        await repository.list_all(search="biology")

    compiled = [
        str(call.args[0].compile(dialect=postgresql.dialect()))
        for call in db.execute.await_args_list
    ]
    assert len(compiled) == 2
    assert all("JOIN course" in statement for statement in compiled)
    assert all("course.name ILIKE" in statement for statement in compiled)
    assert all("course.code ILIKE" in statement for statement in compiled)
    assert all("assessment.course_name" not in statement for statement in compiled)


def test_assessment_repository_has_one_definition_per_count_and_sum_method() -> None:
    source = Path(__file__).parents[2] / "app/db/repositories/assessment_repo.py"
    module = ast.parse(source.read_text(encoding="utf-8"))
    repository = next(
        node for node in module.body
        if isinstance(node, ast.ClassDef) and node.name == "AssessmentRepository"
    )
    method_names = [
        node.name for node in repository.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    for name in ("count_sections", "count_questions", "sum_marks"):
        assert method_names.count(name) == 1


def test_kinyarwanda_lesson_fallback_uses_existing_builder() -> None:
    service = StudyPlannerService(AsyncMock())
    session = SimpleNamespace(
        title="Study session",
        topic="Data structures",
        duration_minutes=30,
    )

    lesson = service._build_fallback_lesson_plan(session, [])

    assert lesson.sections
