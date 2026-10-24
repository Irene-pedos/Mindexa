"""
app/services/compliance_rules.py

Institution-configurable pre-moderation compliance.

Universities and colleges do not share one set of paper rules (total marks, how many sections,
which section is closed or open, whether choice pools are required). Each institution's
ApprovalPolicy carries a `compliance_rules` JSON document that tunes how strictly each automatic
check is applied. When it is empty, the defaults below apply, which equal the platform's original
behaviour, so existing institutions see no change until an admin edits their rules.

Each rule has a mode:
    BLOCKING - a failure stops the author from submitting; a moderator can still approve a paper
               that fails it by waiving the check with a recorded reason.
    WARNING  - a failure is shown to the author and moderator but never blocks.
    OFF      - the check is not evaluated.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any, Optional

RULE_CODES: tuple[str, ...] = (
    "MARKS_TOTAL",
    "MARKS_DISTRIBUTION",
    "STRUCTURE",
    "QUESTIONS_COMPLETE",
)
MODES: tuple[str, ...] = ("BLOCKING", "WARNING", "OFF")

# Equal to the behaviour before rules were configurable.
DEFAULT_RULES: dict[str, dict[str, Any]] = {
    "MARKS_TOTAL": {"mode": "BLOCKING"},
    "MARKS_DISTRIBUTION": {"mode": "BLOCKING"},
    "STRUCTURE": {
        "mode": "WARNING",
        "expected_sections": 3,      # None = any number of sections is fine
        "section_a_closed": True,    # first section must be closed-ended questions
        "section_c_open": True,      # third section must be open-ended questions
        "choice_pools": True,        # sections B and C should offer a choice
    },
    "QUESTIONS_COMPLETE": {"mode": "BLOCKING"},
}

RULE_LABELS: dict[str, str] = {
    "MARKS_TOTAL": "Total marks match the institution's fixed total (summative papers)",
    "MARKS_DISTRIBUTION": "Marks are distributed consistently across sections and choice pools",
    "STRUCTURE": "Paper follows the institution's section structure",
    "QUESTIONS_COMPLETE": "Every question has a stem, marks and an answer key",
}


@dataclass(frozen=True)
class ComplianceConfig:
    """What the checklist needs to know about an institution's rules."""

    # Fixed total marks for summative papers. None = the institution sets no fixed total.
    policy_total: Optional[int] = 100
    rules: dict[str, dict[str, Any]] = field(default_factory=lambda: copy.deepcopy(DEFAULT_RULES))

    def mode(self, code: str) -> str:
        return self.rules.get(code, DEFAULT_RULES.get(code, {})).get("mode", "BLOCKING")

    def param(self, code: str, key: str, default: Any = None) -> Any:
        rule = self.rules.get(code, DEFAULT_RULES.get(code, {}))
        return rule.get(key, default)


def merge_rules(stored: Optional[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Defaults overlaid with whatever the institution has saved. Bad values fall back safely."""
    merged = copy.deepcopy(DEFAULT_RULES)
    if not isinstance(stored, dict):
        return merged
    for code in RULE_CODES:
        saved = stored.get(code)
        if not isinstance(saved, dict):
            continue
        if saved.get("mode") in MODES:
            merged[code]["mode"] = saved["mode"]
        if code == "STRUCTURE":
            for flag in ("section_a_closed", "section_c_open", "choice_pools"):
                if isinstance(saved.get(flag), bool):
                    merged[code][flag] = saved[flag]
            if "expected_sections" in saved:
                value = saved["expected_sections"]
                if value is None or (isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 20):
                    merged[code]["expected_sections"] = value
    return merged


def validate_rules(raw: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Strict validation for admin input. Raises ValueError with a message an admin can act on."""
    if not isinstance(raw, dict):
        raise ValueError("Compliance rules must be an object.")
    unknown = set(raw) - set(RULE_CODES)
    if unknown:
        raise ValueError(f"Unknown compliance rule(s): {', '.join(sorted(unknown))}.")
    for code, saved in raw.items():
        if not isinstance(saved, dict):
            raise ValueError(f"Rule {code} must be an object.")
        if "mode" in saved and saved["mode"] not in MODES:
            raise ValueError(f"Rule {code}: mode must be one of {', '.join(MODES)}.")
        if code == "STRUCTURE":
            for flag in ("section_a_closed", "section_c_open", "choice_pools"):
                if flag in saved and not isinstance(saved[flag], bool):
                    raise ValueError(f"STRUCTURE.{flag} must be true or false.")
            if "expected_sections" in saved:
                value = saved["expected_sections"]
                if value is not None and (
                    not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 20
                ):
                    raise ValueError("STRUCTURE.expected_sections must be a whole number from 1 to 20, or empty.")
        elif set(saved) - {"mode"}:
            raise ValueError(f"Rule {code} only supports a mode.")
    return merge_rules(raw)


def config_from_policy(policy: Any) -> ComplianceConfig:
    """Build the config for a policy row; no policy means the platform defaults (total 100)."""
    if policy is None:
        return ComplianceConfig()
    rules = merge_rules(getattr(policy, "compliance_rules", None))
    # The older master switch still works: turning structure enforcement off disables the rule.
    if getattr(policy, "enforce_structure_template", True) is False:
        rules["STRUCTURE"]["mode"] = "OFF"
    return ComplianceConfig(policy_total=getattr(policy, "summative_total_marks", None), rules=rules)
