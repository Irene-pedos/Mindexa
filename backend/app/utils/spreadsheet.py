"""
app/utils/spreadsheet.py

Shared Excel/spreadsheet utilities for Phase 6C exports.
"""
from __future__ import annotations

_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_cell(value: object) -> object:
    """
    Prevent CSV/spreadsheet formula injection.
    If a string value starts with a formula-trigger character, prefix with a single quote
    so the cell is treated as literal text.
    Spec: mandatory on all user-supplied string values before writing to spreadsheet.
    """
    if not isinstance(value, str):
        return value
    if value and value[0] in _INJECTION_PREFIXES:
        return f"'{value}"
    return value


def format_letter_grade(grade: object) -> str:
    """Enum names ("A_PLUS", "C_MINUS") as people write them ("A+", "C-")."""
    if grade is None or grade == "":
        return ""
    text = str(getattr(grade, "value", grade))
    if text.endswith("_PLUS"):
        return text[: -len("_PLUS")] + "+"
    if text.endswith("_MINUS"):
        return text[: -len("_MINUS")] + "-"
    return text
