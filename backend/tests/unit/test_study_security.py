"""Security regressions for the study planner / reader surface."""

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core import client_ip
from app.middleware.rate_limit import _resolve_tier
from app.schemas.study_planner import (AdjustPlanRequest, CompleteSessionRequest,
                                       GuidedSessionAskRequest,
                                       SaveSessionNotesRequest)


def _request(xff: str | None, peer: str = "10.0.0.9"):
    headers = {"X-Forwarded-For": xff} if xff else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=peer))


class TestClientIp:
    def test_forwarded_header_ignored_without_trusted_proxy(self, monkeypatch):
        monkeypatch.setattr(client_ip.settings, "TRUSTED_PROXY_COUNT", 0)
        assert client_ip.get_client_ip(_request("6.6.6.6")) == "10.0.0.9"

    def test_spoofed_leftmost_entry_is_not_used_behind_one_proxy(self, monkeypatch):
        monkeypatch.setattr(client_ip.settings, "TRUSTED_PROXY_COUNT", 1)
        # The attacker prepends 6.6.6.6; the trusted proxy appends the real peer last.
        assert client_ip.get_client_ip(_request("6.6.6.6, 203.0.113.7")) == "203.0.113.7"

    def test_short_header_falls_back_to_peer(self, monkeypatch):
        monkeypatch.setattr(client_ip.settings, "TRUSTED_PROXY_COUNT", 2)
        assert client_ip.get_client_ip(_request("203.0.113.7")) == "10.0.0.9"


class TestStudyRateLimitTiers:
    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/students/study-plans/generate-from-assessment",
            "/api/v1/students/study-plans/sessions/abc/guided/start",
            "/api/v1/students/study-plans/sessions/abc/guided/ask",
            "/api/v1/students/study-plans/sessions/abc/guided/exercise",
            "/api/v1/students/study-plans/sessions/abc/guided/knowledge-check/generate",
            "/api/v1/students/study-plans/sessions/abc/guided/complete",
            "/api/v1/student/reader/lecturer_material/abc/skim",
            "/api/v1/student/reader/lecturer_material/abc/page-check",
        ],
    )
    def test_model_backed_routes_are_ai_tier(self, path):
        assert _resolve_tier(path) == "ai_heavy"

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/students/study-plans/sessions/abc/guided",
            "/api/v1/students/study-plans/sessions/abc/notes",
            "/api/v1/students/study-plans/summary",
            "/api/v1/student/reader/lecturer_material/abc/annotations",
        ],
    )
    def test_reads_do_not_spend_the_ai_budget(self, path):
        assert _resolve_tier(path) == "default"


class TestStudyRequestBounds:
    def test_question_and_context_are_capped(self):
        with pytest.raises(ValidationError):
            GuidedSessionAskRequest(question="x" * 2_001)
        with pytest.raises(ValidationError):
            GuidedSessionAskRequest(question="ok", section_context="x" * 4_001)

    def test_notes_are_capped(self):
        with pytest.raises(ValidationError):
            SaveSessionNotesRequest(student_notes="x" * 20_001)

    def test_completion_ratings_are_enumerated(self):
        with pytest.raises(ValidationError):
            CompleteSessionRequest(understanding_level="MAYBE")
        with pytest.raises(ValidationError):
            CompleteSessionRequest(understanding_level="YES", confidence_rating=99)
        assert CompleteSessionRequest(understanding_level="YES").confidence_rating == 4

    def test_adjust_action_is_validated_at_the_edge(self):
        with pytest.raises(ValidationError):
            AdjustPlanRequest(action="delete_everything")
