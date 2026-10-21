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
