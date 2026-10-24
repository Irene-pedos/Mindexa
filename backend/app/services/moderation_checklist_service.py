"""
app/services/moderation_checklist_service.py

Phase 3: Automated pre-moderation checklist service.
Evaluates an assessment against institutional workflow requirements before submission:
    1. MARKS_TOTAL — required marks == policy total (HARD for summative)
    2. MARKS_DISTRIBUTION — section marks sum equals total; no section with 0 marks; choice pools have equal marks
    3. STRUCTURE — soft rules from Section 6.4 (3 sections, Section A closed, Section C open, B/C choice pools)
    4. QUESTIONS_COMPLETE — every question has stem, correct answer/scheme where required, marks > 0
    5. WORDING_AI — optional, advisory AI review via AIGateway (never blocking, records skipped on failure)

BLOCKING failures prevent submission for moderation. WARNINGs are shown to the moderator.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import AssessmentType
from app.db.enums import AIActionType, QuestionType
from app.services.compliance_rules import ComplianceConfig
from app.services.assessment_marks import (
    _effective_aq_marks,
    required_marks,
    validate_choice_pools,
    validate_summative_structure,
)

logger = logging.getLogger(__name__)


class ChecklistSeverity(str, Enum):
    BLOCKING = "BLOCKING"
    WARNING = "WARNING"
    INFO = "INFO"


@dataclass
class ChecklistItem:
    code: str
    severity: ChecklistSeverity
    passed: bool
    message: str
    details: Optional[dict] = None

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "severity": self.severity.value,
            "passed": self.passed,
            "message": self.message,
            "details": self.details,
        }


@dataclass
class ChecklistResult:
    items: List[ChecklistItem]
    has_blocking_failures: bool
    warnings_count: int

    def to_dict(self) -> dict:
        return {
            "items": [item.to_dict() for item in self.items],
            "has_blocking_failures": self.has_blocking_failures,
            "warnings_count": self.warnings_count,
        }


def _severity_for(mode: str) -> ChecklistSeverity:
    """BLOCKING rules block; every other active mode only warns."""
    return ChecklistSeverity.BLOCKING if mode == "BLOCKING" else ChecklistSeverity.WARNING


def _off_item(code: str, why: str) -> ChecklistItem:
    return ChecklistItem(
        code=code,
        severity=ChecklistSeverity.INFO,
        passed=True,
        message=why,
        details={"status": "off"},
    )


class ModerationChecklistService:
    """Service to evaluate automated moderation checklist items."""

    @classmethod
    async def run(
        cls,
        assessment: Any,
        policy_total: int | None = 100,
        db: Optional[AsyncSession] = None,
        run_ai_review: bool = False,
        config: Optional[ComplianceConfig] = None,
    ) -> ChecklistResult:
        """
        Run all moderation checklist checks on an assessment.
        Returns a ChecklistResult containing all passed and failed items.

        `config` carries the institution's rules (how strict each check is, the fixed total, the
        section structure). Without it the platform defaults apply and `policy_total` is used.
        """
        cfg = config or ComplianceConfig(policy_total=policy_total)
        policy_total = cfg.policy_total
        items: List[ChecklistItem] = []

        ass_type = getattr(assessment, "assessment_type", None)
        if hasattr(ass_type, "value"):
            ass_type = ass_type.value
        is_summative = ass_type == AssessmentType.SUMMATIVE.value

        all_aqs = getattr(assessment, "assessment_questions", None) or []
        aqs = [aq for aq in all_aqs if not getattr(aq, "is_deleted", False)]
        all_secs = getattr(assessment, "sections", None) or []
        secs = [s for s in all_secs if not getattr(s, "is_deleted", False)]

        # ── 1. MARKS_TOTAL ───────────────────────────────────────────────────
        req_marks = required_marks(assessment)
        total_mode = cfg.mode("MARKS_TOTAL")
        if is_summative and total_mode == "OFF":
            items.append(_off_item("MARKS_TOTAL", "A fixed total mark is not required by your institution's policy."))
        elif is_summative and policy_total is None:
            items.append(
                _off_item(
                    "MARKS_TOTAL",
                    f"Required marks: {req_marks}. Your institution sets no fixed total for summative papers.",
                )
            )
        elif is_summative:
            if req_marks == policy_total:
                items.append(
                    ChecklistItem(
                        code="MARKS_TOTAL",
                        severity=_severity_for(total_mode),
                        passed=True,
                        message=f"Required marks ({req_marks}) match configured policy total ({policy_total}).",
                    )
                )
            else:
                items.append(
                    ChecklistItem(
                        code="MARKS_TOTAL",
                        severity=_severity_for(total_mode),
                        passed=False,
                        message=(
                            f"Summative required marks ({req_marks}) do not match "
                            f"configured policy total ({policy_total})."
                        ),
                        details={"required": req_marks, "expected": policy_total},
                    )
                )
        else:
            # Non-summative
            items.append(
                ChecklistItem(
                    code="MARKS_TOTAL",
                    severity=ChecklistSeverity.INFO,
                    passed=True,
                    message=f"Assessment required marks: {req_marks} (non-summative, no fixed total required).",
                )
            )

        # ── 2. MARKS_DISTRIBUTION ───────────────────────────────────────────
        pool_issues = validate_choice_pools(assessment)
        dist_errors: list[str] = []

        # Check: no section with 0 marks
        for s in secs:
            sec_aqs = [
                aq for aq in aqs if getattr(aq, "assessment_section_id", None) == s.id
            ]
            sec_marks = sum(_effective_aq_marks(aq) for aq in sec_aqs)
            if sec_marks == 0 and sec_aqs:
                dist_errors.append(f"Section '{s.title}' has 0 total marks.")

        for p_issue in pool_issues:
            dist_errors.append(p_issue.message)

        dist_mode = cfg.mode("MARKS_DISTRIBUTION")
        if dist_mode == "OFF":
            items.append(_off_item("MARKS_DISTRIBUTION", "Marks distribution is not checked under your institution's policy."))
        elif not dist_errors:
            items.append(
                ChecklistItem(
                    code="MARKS_DISTRIBUTION",
                    severity=_severity_for(dist_mode),
                    passed=True,
                    message="Marks distribution is valid across sections and choice pools.",
                )
            )
        else:
            items.append(
                ChecklistItem(
                    code="MARKS_DISTRIBUTION",
                    severity=_severity_for(dist_mode),
                    passed=False,
                    message="; ".join(dist_errors),
                    details={"errors": dist_errors},
                )
            )

        # ── 3. STRUCTURE (Section 6.4 rules) ─────────────────────────────────
        structure_mode = cfg.mode("STRUCTURE")
        if is_summative and structure_mode == "OFF":
            items.append(_off_item("STRUCTURE", "A fixed section structure is not required by your institution's policy."))
        elif is_summative:
            struct_result = validate_summative_structure(
                assessment,
                policy_total=policy_total,
                rules=cfg.rules.get("STRUCTURE"),
            )
            # Structure findings: warnings by default; blocking if the institution says so
            if struct_result.soft_warnings:
                warning_msgs = [w.message for w in struct_result.soft_warnings]
                items.append(
                    ChecklistItem(
                        code="STRUCTURE",
                        severity=_severity_for(structure_mode),
                        passed=False,
                        message="; ".join(warning_msgs),
                        details={"warnings": warning_msgs},
                    )
                )
            else:
                items.append(
                    ChecklistItem(
                        code="STRUCTURE",
                        severity=ChecklistSeverity.INFO,
                        passed=True,
                        message="Assessment conforms to recommended summative 3-section structure.",
                    )
                )
        else:
            items.append(
                ChecklistItem(
                    code="STRUCTURE",
                    severity=ChecklistSeverity.INFO,
                    passed=True,
                    message="Structure rules do not apply to non-summative assessments.",
                )
            )

        # ── 4. QUESTIONS_COMPLETE ────────────────────────────────────────────
        qc_errors: list[str] = []
        if not aqs:
            qc_errors.append("Assessment has no questions.")
        else:
            for idx, aq in enumerate(aqs, start=1):
                q = getattr(aq, "question", None)
                if not q:
                    qc_errors.append(f"Question #{idx} is missing underlying question record.")
                    continue

                content = (getattr(q, "content", None) or "").strip()
                if not content:
                    qc_errors.append(f"Question #{idx} has an empty question stem.")

                marks = _effective_aq_marks(aq)
                if marks <= 0:
                    qc_errors.append(f"Question #{idx} must have marks > 0 (found {marks}).")

                # Type-specific validation
                q_type = getattr(q, "question_type", None)
                if hasattr(q_type, "value"):
                    q_type = q_type.value

                if q_type in (QuestionType.MCQ.value, QuestionType.TRUE_FALSE.value):
                    options = getattr(q, "options", None) or []
                    active_opts = [o for o in options if not getattr(o, "is_deleted", False)]
                    has_correct = any(getattr(o, "is_correct", False) for o in active_opts)
                    if not has_correct:
                        qc_errors.append(f"Question #{idx} ({q_type}) has no correct option selected.")

        qc_mode = cfg.mode("QUESTIONS_COMPLETE")
        if qc_mode == "OFF":
            items.append(_off_item("QUESTIONS_COMPLETE", "Question completeness is not checked under your institution's policy."))
        elif not qc_errors:
            items.append(
                ChecklistItem(
                    code="QUESTIONS_COMPLETE",
                    severity=_severity_for(qc_mode),
                    passed=True,
                    message="All questions are complete with stem, marks, and answers.",
                )
            )
        else:
            items.append(
                ChecklistItem(
                    code="QUESTIONS_COMPLETE",
                    severity=_severity_for(qc_mode),
                    passed=False,
                    message="; ".join(qc_errors),
                    details={"errors": qc_errors},
                )
            )

        # ── 5. WORDING_AI (Optional advisory) ────────────────────────────────
        ai_item = await cls._run_ai_wording_review(
            assessment=assessment,
            db=db,
            run_ai_review=run_ai_review,
        )
        items.append(ai_item)

        # Calculate result summary
        has_blocking = any(
            (not it.passed) and it.severity == ChecklistSeverity.BLOCKING for it in items
        )
        warning_count = sum(
            1 for it in items if (not it.passed) and it.severity == ChecklistSeverity.WARNING
        )

        return ChecklistResult(
            items=items,
            has_blocking_failures=has_blocking,
            warnings_count=warning_count,
        )

    @classmethod
    async def _run_ai_wording_review(
        cls,
        assessment: Any,
        db: Optional[AsyncSession],
        run_ai_review: bool,
    ) -> ChecklistItem:
        """Advisory wording review; never blocks."""
        if not run_ai_review or db is None:
            return ChecklistItem(
                code="WORDING_AI",
                severity=ChecklistSeverity.INFO,
                passed=True,
                message="AI wording review skipped (not requested or offline).",
                details={"status": "skipped", "reason": "not_requested"},
            )

        # Check language policy
        language = getattr(assessment, "language", "EN")
        if hasattr(language, "value"):
            language = language.value

        try:
            from app.core.ai.language_policy import assert_ai_allowed
            assert_ai_allowed(
                language,
                action="review_assessment_wording",
                context={"assessment_id": str(getattr(assessment, "id", ""))},
            )
        except Exception as exc:
            return ChecklistItem(
                code="WORDING_AI",
                severity=ChecklistSeverity.INFO,
                passed=True,
                message=f"AI wording review skipped: language policy ({exc}).",
                details={"status": "skipped", "reason": str(exc)},
            )

        # Try to run AI review
        try:
            from app.core.ai.provider_factory import get_ai_providers
            from app.core.ai.gateway import AIGateway
            from app.core.ai.providers import AICompletionRequest, AIMessage

            providers = get_ai_providers()
            if not providers:
                return ChecklistItem(
                    code="WORDING_AI",
                    severity=ChecklistSeverity.INFO,
                    passed=True,
                    message="AI wording review skipped: no AI providers available.",
                    details={"status": "skipped", "reason": "no_providers"},
                )

            gateway = AIGateway(db=db, chat_providers=providers)

            # Build concise question list for wording review
            q_summaries = []
            all_aqs = getattr(assessment, "assessment_questions", []) or []
            for aq in all_aqs:
                if getattr(aq, "is_deleted", False):
                    continue
                q = getattr(aq, "question", None)
                if q:
                    content = getattr(q, "content", "") or ""
                    q_summaries.append(f"- [{getattr(q, 'question_type', 'question')}] {content[:200]}")

            questions_text = "\n".join(q_summaries[:20]) if q_summaries else "No questions found."

            system_msg = (
                "You are an expert academic moderator reviewing an assessment paper for clarity, "
                "unambiguous wording, and academic rigor. Identify any confusing phrasing or typos. "
                "Keep your response concise and structured."
            )
            user_msg = (
                f"Review the wording and clarity for the assessment '{getattr(assessment, 'title', 'Exam')}'.\n\n"
                f"Questions:\n{questions_text}\n\n"
                "Provide brief constructive feedback on wording clarity."
            )

            request = AICompletionRequest(
                messages=[
                    AIMessage(role="system", content=system_msg),
                    AIMessage(role="user", content=user_msg),
                ],
                temperature=0.2,
                max_tokens=600,
            )

            creator_id = getattr(assessment, "created_by_id", None)
            asmt_id = getattr(assessment, "id", None)
            response = await gateway.complete(
                request,
                action_type=AIActionType.REVIEW_ASSESSMENT_WORDING,
                actor_id=creator_id or uuid.uuid4(),
                actor_role="system",
                subject_entity_type="assessment",
                subject_entity_id=asmt_id,
                prompt_summary=f"Wording review for assessment '{getattr(assessment, 'title', '')}'",
            )

            feedback = response.content.strip() if response and response.content else "No ambiguities detected."
            return ChecklistItem(
                code="WORDING_AI",
                severity=ChecklistSeverity.INFO,
                passed=True,
                message="AI wording review completed.",
                details={"status": "completed", "feedback": feedback[:500]},
            )
        except Exception as exc:
            logger.warning(f"AI wording review encountered error, skipping: {exc}")
            return ChecklistItem(
                code="WORDING_AI",
                severity=ChecklistSeverity.INFO,
                passed=True,
                message=f"AI wording review skipped due to provider error: {exc}.",
                details={"status": "skipped", "reason": str(exc)},
            )

