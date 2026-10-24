"""alembic_version.version_num is VARCHAR(32): a longer revision id makes `alembic upgrade` fail."""

from __future__ import annotations

import re
from pathlib import Path

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
REVISION = re.compile(r"""^revision\s*(?::[^=]+)?=\s*["'](.+?)["']""", re.MULTILINE)


def test_revision_ids_fit_alembic_version_column():
    too_long = []
    for path in VERSIONS.glob("*.py"):
        match = REVISION.search(path.read_text(encoding="utf-8"))
        if match and len(match.group(1)) > 32:
            too_long.append(f"{path.name}: {match.group(1)} ({len(match.group(1))})")
    assert not too_long, too_long
