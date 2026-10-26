"""Tier assignment for the AI and upload routes (middleware/rate_limit.py)."""

import pytest
from app.core.config import settings
from app.middleware.rate_limit import _limit_for_tier, _resolve_tier


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/lecturers/ai/support",
        "/api/v1/lecturers/ai/slides/abc/generate",
        "/api/v1/lecturers/ai/rubrics/draft",
        "/api/v1/lecturers/ai/questions/enhance",
        "/api/v1/student/ai/revision",
        "/api/v1/analytics/assessment/abc/ai-insights",
        "/api/v1/student/reader/lecturer_material/abc/focus",
    ],
)
def test_model_backed_routes_use_the_ai_tier(path):
    assert _resolve_tier(path) == "ai_heavy"


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/lecturers/ai/workspaces/abc/learning-units",
        "/api/v1/lecturers/ai/slides/export",
        "/api/v1/lecturers/ai/rubrics/save",
        "/api/v1/student/ai/conversations",
        "/api/v1/student/ai/conversations/abc",
        "/api/v1/student/ai/history",
    ],
)
def test_non_model_routes_do_not_spend_the_ai_budget(path):
    assert _resolve_tier(path) == "default"


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/student/resources/upload",
        "/api/v1/resources/student-resources",
        "/api/v1/resources/extract-text",
        "/api/v1/resources/lecturer-materials",
    ],
)
def test_uploads_have_their_own_tier_but_only_for_post(path):
    assert _resolve_tier(path, "POST") == "upload"
    assert _resolve_tier(path, "GET") == "default"


def test_upload_tier_limit_is_configurable():
    assert _limit_for_tier("upload") == settings.RATE_LIMIT_UPLOAD_PER_MINUTE
