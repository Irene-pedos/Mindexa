"""
tests/unit/test_phase6c_export.py

Unit tests for Phase 6C export engine:
1. sanitize_cell injection protection (all injection-trigger prefixes)
2. sanitize_cell safe pass-through for normal values
3. Non-string values are not modified
4. ExportRequest schema defaults
5. ExportTemplateCreate validation
"""
from __future__ import annotations

import uuid

import pytest

from app.utils.spreadsheet import sanitize_cell


# ── sanitize_cell: injection protection ──────────────────────────────────────

INJECTION_STRINGS = [
    "=SUM(A1:A10)",
    "+cmd|' /C calc'!A0",
    "-2+3+cmd|' /C calc'!A0",
    "@SUM(1+1)*cmd|' /C calc'!A0",
    "\tmalicious",
    "\rmalicious",
]


@pytest.mark.parametrize("value", INJECTION_STRINGS)
def test_sanitize_cell_prefixes_injection_strings(value: str):
    result = sanitize_cell(value)
    assert isinstance(result, str)
    assert result.startswith("'"), f"Expected prefix quote for: {value!r}, got: {result!r}"
    assert result[1:] == value


def test_sanitize_cell_normal_string_unchanged():
    assert sanitize_cell("Normal value") == "Normal value"


def test_sanitize_cell_empty_string_unchanged():
    assert sanitize_cell("") == ""


def test_sanitize_cell_number_unchanged():
    assert sanitize_cell(42) == 42
    assert sanitize_cell(3.14) == 3.14


def test_sanitize_cell_none_unchanged():
    assert sanitize_cell(None) is None


def test_sanitize_cell_bool_unchanged():
    assert sanitize_cell(True) is True


def test_sanitize_cell_leading_letter_unchanged():
    assert sanitize_cell("Alice Smith") == "Alice Smith"


def test_sanitize_cell_number_string_unchanged():
    # Strings starting with digits are safe
    assert sanitize_cell("123 Main Street") == "123 Main Street"


# ── ExportRequest defaults ────────────────────────────────────────────────────


def test_export_request_defaults():
    from app.schemas.export import ExportRequest

    req = ExportRequest()
    assert req.template_code == "default_marksheet"
    assert req.assessment_id is None
    assert req.course_id is None
    assert req.period_id is None


def test_export_request_with_assessment():
    from app.schemas.export import ExportRequest

    aid = uuid.uuid4()
    req = ExportRequest(assessment_id=aid, template_code="my_template")
    assert req.assessment_id == aid
    assert req.template_code == "my_template"


# ── ExportTemplateCreate validation ──────────────────────────────────────────


def test_export_template_create_valid():
    from app.schemas.export import ExportTemplateCreate

    t = ExportTemplateCreate(
        code="my_sheet",
        name="My Export Sheet",
        config_json={"header_color": "#1F4E79"},
        is_default=False,
    )
    assert t.code == "my_sheet"
    assert t.config_json == {"header_color": "#1F4E79"}


def test_export_template_empty_code_rejected():
    from app.schemas.export import ExportTemplateCreate

    with pytest.raises(Exception):
        ExportTemplateCreate(
            code="",  # too short
            name="Template",
        )


# ── ExportJobStatus flow ──────────────────────────────────────────────────────


def test_export_job_status_progression():
    from app.db.enums import ExportJobStatus

    states = [
        ExportJobStatus.QUEUED,
        ExportJobStatus.RUNNING,
        ExportJobStatus.DONE,
        ExportJobStatus.FAILED,
    ]
    assert len(states) == 4
    assert ExportJobStatus.QUEUED.value == "QUEUED"
    assert ExportJobStatus.DONE.value == "DONE"


# ── ExportType values ─────────────────────────────────────────────────────────


def test_export_types_defined():
    from app.db.enums import ExportType

    expected = {"ASSESSMENT_MARKSHEET", "COURSE_CONSOLIDATED"}
    actual = {e.value for e in ExportType}
    assert expected == actual
