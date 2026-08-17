"""
app/core/ai/language_policy.py

Institutional AI Language Policy Enforcement.

GOVERNANCE RULE:
    AI capabilities (generation, grading, tutoring, integrity explanations, study planning)
    are strictly disabled for Kinyarwanda (RW) academic content due to model reliability
    limitations in high-stakes academic settings.

AUDIT SAFETY RULE:
    When an AI action is blocked by language policy, DO NOT create an AIActionLog row
    (which would falsely indicate that AI executed). Log a structured warning via
    structlog instead.
"""

from __future__ import annotations

import structlog
from typing import Any

from app.core.exceptions import AILanguageBlockedError
from app.db.enums import LanguageEnum

logger = structlog.get_logger(__name__)

BLOCKED_LANGUAGES = {LanguageEnum.RW.value, "RW", "KINYARWANDA"}


def is_ai_allowed(language: str | LanguageEnum | None) -> bool:
    """Returns False if the language is restricted from AI operations, True otherwise."""
    if not language:
        return True
    lang_str = str(language.value if isinstance(language, LanguageEnum) else language).upper()
    return lang_str not in BLOCKED_LANGUAGES


def assert_ai_allowed(
    language: str | LanguageEnum | None,
    action: str | None = None,
    context: dict[str, Any] | None = None,
) -> None:
    """
    Assert that AI operations are allowed for the target academic language.
    Raises AILanguageBlockedError (HTTP 403) if restricted.
    """
    if not is_ai_allowed(language):
        lang_str = str(language.value if isinstance(language, LanguageEnum) else language).upper()
        logger.warning(
            "ai_action_blocked_by_language_policy",
            action=action or "unknown",
            language=lang_str,
            context=context or {},
        )
        raise AILanguageBlockedError()
