"""Unit-test fixtures."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

_GATE_CONSUMERS = (
    "app.services.student_ai_service",
    "app.services.study_planner_service",
    "app.services.study_reader_service",
)


@pytest.fixture(autouse=True)
def _open_exam_gate(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mocked sessions would read as "student has an open exam attempt"; open the gate.

    The gate itself is covered directly in ``test_ai_exam_gate.py`` against
    ``app.services.ai_exam_gate``, which is deliberately not patched here.
    """
    for module in _GATE_CONSUMERS:
        monkeypatch.setattr(f"{module}.assert_student_ai_allowed", AsyncMock(), raising=True)
