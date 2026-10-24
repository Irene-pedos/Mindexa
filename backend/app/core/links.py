"""
app/core/links.py

Single source of truth for frontend URLs that the backend puts into
notifications (action_url) and emails.

Every function returns a path that exists under `frontend/app`; a unit test
checks this against the real route tree, so a renamed or removed page fails the
test suite instead of silently producing links that open a 404. Never write a
frontend path as a string literal in a service — add a builder here.
"""

from __future__ import annotations

import uuid

_Id = uuid.UUID | str


# ── Student ───────────────────────────────────────────────────────────────────


def student_assessments() -> str:
    return "/student/assessments"


def student_assessment_take(assessment_id: _Id) -> str:
    return f"/student/assessments/{assessment_id}/take"


def student_result(result_or_attempt_id: _Id) -> str:
    """The results page accepts either an attempt id or a result id."""
    return f"/student/results/{result_or_attempt_id}"


def student_group_work(assessment_id: _Id) -> str:
    return f"/student/group-work/{assessment_id}"


def student_study() -> str:
    return "/student/study"


def student_course(course_id: _Id) -> str:
    return f"/student/courses/{course_id}"


def student_retakes() -> str:
    return "/student/requests?tab=retakes"


def student_requests(tab: str = "appeals") -> str:
    """Eligibility, retakes, appeals and absence excuses live on one page."""
    return f"/student/requests?tab={tab}"


# ── Lecturer / staff ──────────────────────────────────────────────────────────


def lecturer_assessment(assessment_id: _Id) -> str:
    return f"/lecturer/assessments/{assessment_id}"


def lecturer_grading(assessment_id: _Id | None = None) -> str:
    """Opens the grading page, straight on the assessment when one is given."""
    if assessment_id is None:
        return "/lecturer/grading"
    return f"/lecturer/grading?assessment={assessment_id}"


def lecturer_supervision(assessment_id: _Id | None = None) -> str:
    if assessment_id is None:
        return "/lecturer/supervision"
    return f"/lecturer/supervision?assessment={assessment_id}"


def lecturer_course(course_id: _Id) -> str:
    return f"/lecturer/courses/{course_id}"


def lecturer_profile() -> str:
    return "/lecturer/profile"


def moderation_queue() -> str:
    return "/lecturer/moderation"


def exam_office_queue() -> str:
    # Admins holding the exam-officer duty may open /lecturer/* as well.
    return "/lecturer/exam-office"


def hod_assessment(assessment_id: _Id) -> str:
    # There is no head-of-department workspace yet; they review the paper itself.
    return lecturer_assessment(assessment_id)
