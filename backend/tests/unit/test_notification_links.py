"""
tests/unit/test_notification_links.py

Notification and email links must open real pages. Every builder in
app.core.links is checked against the Next.js route tree, and services are
barred from writing raw frontend paths (which is how 11 kinds of notification
ended up opening a 404).
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest

from app.core import links

REPO_ROOT = Path(__file__).resolve().parents[3]
FRONTEND_APP = REPO_ROOT / "frontend" / "app"
BACKEND_APP = REPO_ROOT / "backend" / "app"


def _route_patterns() -> list[re.Pattern[str]]:
    """One regex per page.tsx, with [param] segments matching any single segment."""
    patterns = []
    for page in FRONTEND_APP.rglob("page.tsx"):
        parts = [
            p
            for p in page.parent.relative_to(FRONTEND_APP).parts
            if not (p.startswith("(") and p.endswith(")"))  # route groups
        ]
        regex = "^/" + "/".join(
            "[^/]+" if re.fullmatch(r"\[[^\]]+\]", p) else re.escape(p) for p in parts
        )
        patterns.append(re.compile(regex + "/?$"))
    return patterns


needs_frontend = pytest.mark.skipif(
    not FRONTEND_APP.is_dir(), reason="frontend sources not available"
)

_ID = uuid.uuid4()

BUILDERS = {
    "student_assessments": links.student_assessments(),
    "student_assessment_take": links.student_assessment_take(_ID),
    "student_result": links.student_result(_ID),
    "student_group_work": links.student_group_work(_ID),
    "student_study": links.student_study(),
    "student_course": links.student_course(_ID),
    "student_retakes": links.student_retakes(),
    "student_requests": links.student_requests(),
    "lecturer_assessment": links.lecturer_assessment(_ID),
    "lecturer_grading": links.lecturer_grading(),
    "lecturer_grading_for_assessment": links.lecturer_grading(_ID),
    "lecturer_supervision": links.lecturer_supervision(),
    "lecturer_supervision_for_assessment": links.lecturer_supervision(_ID),
    "lecturer_course": links.lecturer_course(_ID),
    "lecturer_profile": links.lecturer_profile(),
    "moderation_queue": links.moderation_queue(),
    "exam_office_queue": links.exam_office_queue(),
    "hod_assessment": links.hod_assessment(_ID),
}


@needs_frontend
@pytest.mark.parametrize("name", sorted(BUILDERS))
def test_link_builder_points_to_an_existing_page(name: str):
    path = BUILDERS[name].split("?", 1)[0]
    assert any(p.match(path) for p in _route_patterns()), (
        f"links.{name} -> {BUILDERS[name]} does not match any page under frontend/app"
    )


def test_services_do_not_hardcode_frontend_paths():
    """Raw '/student/...' style literals in action_url / email links are not allowed."""
    offenders = []
    pattern = re.compile(
        r"""(action_url|grading_url|results_url)\s*[=:]\s*f?["']/(student|lecturer|admin|exam-office|moderator|hod)/"""
    )
    for py in BACKEND_APP.rglob("*.py"):
        if py.name == "links.py":
            continue
        for lineno, line in enumerate(py.read_text(encoding="utf-8").splitlines(), 1):
            if pattern.search(line):
                offenders.append(f"{py.relative_to(BACKEND_APP)}:{lineno}: {line.strip()}")
    assert not offenders, "Use app.core.links builders instead:\n" + "\n".join(offenders)
