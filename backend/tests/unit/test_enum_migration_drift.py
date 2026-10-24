"""
A NotificationType member without a migration only fails in a real database
("invalid input value for enum"), where it rolls back the action that sent the
notification. Tests build the schema from the Python enums, so they cannot see
it; this compares the code with what the migrations add.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.db.enums import NotificationType

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
ADD_VALUE = re.compile(r"ALTER TYPE notificationtype ADD VALUE(?: IF NOT EXISTS)?\s+'([A-Z0-9_]+)'")
INITIAL_ENUM = re.compile(r"sa\.Enum\(([^)]*?)name='notificationtype'", re.DOTALL)


def _values_from_migrations() -> set[str]:
    values: set[str] = set()
    for path in VERSIONS.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        values.update(ADD_VALUE.findall(text))
        if "ALTER TYPE notificationtype ADD VALUE" in text:
            # migrations that add values in a loop name them as plain string literals
            values.update(re.findall(r"[\x27\"]([A-Z][A-Z0-9_]{3,})[\x27\"]", text))
        if "20260408" in path.name:  # initial schema creates the type with its first labels
            for block in INITIAL_ENUM.findall(text):
                values.update(re.findall(r"'([A-Z0-9_]+)'", block))
    return values


def test_every_notification_type_is_created_by_a_migration():
    missing = sorted({m.value for m in NotificationType} - _values_from_migrations())
    assert not missing, (
        "NotificationType members with no migration (add `ALTER TYPE notificationtype "
        f"ADD VALUE IF NOT EXISTS '<value>'`): {missing}"
    )
