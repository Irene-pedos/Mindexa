"""
app/services/blueprint_service.py

Blueprint Rule Engine service for Mindexa Platform.

Responsibilities:
    - set_blueprint()          — Replace all rules for an assessment
    - validate_blueprint()     — Check all rules against current assessment state
    - enforce_rules()          — Run all rules; return violations + warnings
    - calculate_distribution() — Compute actual q-type/difficulty distributions

VALIDATION LOGIC:
    Each rule type has its own validator function.
    Validators receive the current assessment state (question list) and
    the rule's value_json payload, then return a list of violations.

    Blocking rules:    violations prevent finalization
    Non-blocking rules: violations produce warnings only
"""

import json
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.core.exceptions import NotFoundError, ValidationError
from app.db.enums import BlueprintRuleType
from app.db.models.assessment import AssessmentBlueprintRule
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.blueprint_repo import BlueprintRepository
from app.schemas.blueprint import (BlueprintRuleCreate, BlueprintRuleResponse,
                                   BlueprintSummaryResponse,
                                   BlueprintValidationResult,
                                   BlueprintViolation, SetBlueprintRequest)
from sqlalchemy.ext.asyncio import AsyncSession


class BlueprintService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._repo = BlueprintRepository(db)
        self._assessment_repo = AssessmentRepository(db)

    # ─── Set Blueprint ────────────────────────────────────────────────────────

    async def set_blueprint(
        self,
        assessment_id: uuid.UUID,
        data: SetBlueprintRequest,
    ) -> BlueprintSummaryResponse:
        """
        Replace all blueprint rules for an assessment.

        Validates that the assessment exists and is not finalized.
        Deletes all existing rules and creates the new set.
        """
        assessment = await self._assessment_repo.get_by_id_simple(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")
        if assessment.draft_is_complete:
            raise ValidationError(
                "Cannot modify blueprint of a finalized assessment.",
                code="ASSESSMENT_FINALIZED",
            )

        # Delete existing rules
        await self._repo.delete_all_for_assessment(assessment_id)

        # Create new rules
        created_rules = []
        for rule_data in data.rules:
            rule = await self._repo.create_rule(
                assessment_id=assessment_id,
                rule_type=rule_data.rule_type,
                value_json=json.dumps(rule_data.value_json),
                priority=rule_data.priority,
                is_blocking=rule_data.is_blocking,
                description=rule_data.description,
            )
            created_rules.append(rule)

        # Update wizard step
        if (assessment.draft_step or 0) < 3:
            await self._assessment_repo.update_fields(
                assessment_id, draft_step=3
            )

        return BlueprintSummaryResponse(
            assessment_id=assessment_id,
            rules=[BlueprintRuleResponse.model_validate(r) for r in created_rules],
        )

    # ─── Get Blueprint ────────────────────────────────────────────────────────

    async def get_blueprint(
        self, assessment_id: uuid.UUID
    ) -> BlueprintSummaryResponse:
        assessment = await self._assessment_repo.get_by_id_simple(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")

        rules = await self._repo.list_by_assessment(assessment_id)
        return BlueprintSummaryResponse(
            assessment_id=assessment_id,
            rules=[BlueprintRuleResponse.model_validate(r) for r in rules],
        )

    # ─── Validate Blueprint ───────────────────────────────────────────────────

    async def validate_blueprint(
        self, assessment_id: uuid.UUID
    ) -> BlueprintValidationResult:
        """
        Validate all blueprint rules against the current assessment state.

        Loads the assessment with its questions and sections,
        then runs each rule validator.

        Returns BlueprintValidationResult with:
            - is_valid: True if no blocking violations
            - can_finalize: True if is_valid
            - violations: blocking rule failures
            - warnings: non-blocking rule failures
            - distribution summaries
        """
        assessment = await self._assessment_repo.get_by_id(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")

        rules = await self._repo.list_by_assessment(assessment_id)

        # Build state snapshot
        questions = assessment.assessment_questions or []
        total_marks = sum(q.marks for q in questions)
        total_questions = len(questions)

        difficulty_dist: Dict[str, int] = {}
        type_dist: Dict[str, int] = {}

        for aq in questions:
            if aq.question:
                d = aq.question.difficulty
                t = aq.question.question_type
                difficulty_dist[d] = difficulty_dist.get(d, 0) + 1
                type_dist[t] = type_dist.get(t, 0) + 1

        # Run each rule
        violations: List[BlueprintViolation] = []
        warnings: List[BlueprintViolation] = []

        for rule in rules:
            try:
                value = json.loads(rule.value_json)
            except (json.JSONDecodeError, TypeError):
                violations.append(
                    BlueprintViolation(
                        rule_type=rule.rule_type,
                        rule_id=rule.id,
                        is_blocking=rule.is_blocking,
                        message=f"Rule {rule.rule_type} has invalid JSON configuration.",
                    )
                )
                continue

            rule_violations = self._evaluate_rule(
                rule=rule,
                value=value,
                total_questions=total_questions,
                total_marks=total_marks,
                difficulty_dist=difficulty_dist,
                type_dist=type_dist,
                assessment_marks=assessment.total_marks,
            )

            for v in rule_violations:
                if rule.is_blocking:
                    violations.append(v)
                else:
                    warnings.append(v)

        is_valid = len(violations) == 0

        return BlueprintValidationResult(
            assessment_id=assessment_id,
            is_valid=is_valid,
            can_finalize=is_valid,
            violations=violations,
            warnings=warnings,
            total_marks_assigned=total_marks,
            total_questions=total_questions,
            difficulty_distribution=difficulty_dist,
            type_distribution=type_dist,
        )

    # ─── Rule Evaluators ──────────────────────────────────────────────────────

    def _evaluate_rule(
        self,
        rule: AssessmentBlueprintRule,
        value: Dict[str, Any],
        total_questions: int,
        total_marks: int,
        difficulty_dist: Dict[str, int],
        type_dist: Dict[str, int],
        assessment_marks: int,
    ) -> List[BlueprintViolation]:
        """Dispatch to the appropriate rule evaluator."""
        evaluators = {
            BlueprintRuleType.TOTAL_QUESTIONS: self._eval_total_questions,
            BlueprintRuleType.MARKS_DISTRIBUTION: self._eval_marks_distribution,
            BlueprintRuleType.DIFFICULTY_DISTRIBUTION: self._eval_difficulty_distribution,
            BlueprintRuleType.QUESTION_TYPE_DISTRIBUTION: self._eval_type_distribution,
            BlueprintRuleType.TOPIC_COVERAGE: self._eval_topic_coverage,
            BlueprintRuleType.SECTION_MARKS: self._eval_section_marks,
            BlueprintRuleType.BLOOM_DISTRIBUTION: self._eval_bloom_distribution,
            BlueprintRuleType.TIME_ESTIMATE: self._eval_time_estimate,
        }

        evaluator = evaluators.get(rule.rule_type)
        if not evaluator:
            return []

        return evaluator(
            rule=rule,
            value=value,
            total_questions=total_questions,
            total_marks=total_marks,
            difficulty_dist=difficulty_dist,
            type_dist=type_dist,
            assessment_marks=assessment_marks,
        )

    def _eval_total_questions(self, rule, value, total_questions, **kwargs) -> List[BlueprintViolation]:
        required = value.get("count")
        if required is None:
            return []
        if total_questions != required:
            return [
                BlueprintViolation(
                    rule_type=rule.rule_type,
                    rule_id=rule.id,
                    is_blocking=rule.is_blocking,
                    message=f"Assessment must have exactly {required} questions.",
                    expected=required,
                    actual=total_questions,
                )
            ]
        return []

    def _eval_marks_distribution(
        self, rule, value, total_marks, assessment_marks, **kwargs
    ) -> List[BlueprintViolation]:
        violations = []
        required_total = value.get("total")
        if required_total and total_marks != required_total:
            violations.append(
                BlueprintViolation(
                    rule_type=rule.rule_type,
                    rule_id=rule.id,
                    is_blocking=rule.is_blocking,
                    message=(
                        f"Total marks assigned ({total_marks}) does not match "
                        f"required total ({required_total})."
                    ),
                    expected=required_total,
                    actual=total_marks,
                )
            )
        if total_marks != assessment_marks:
            violations.append(
                BlueprintViolation(
                    rule_type=rule.rule_type,
                    rule_id=rule.id,
                    is_blocking=rule.is_blocking,
                    message=(
                        f"Question marks sum ({total_marks}) does not match "
                        f"assessment total_marks ({assessment_marks})."
                    ),
                    expected=assessment_marks,
                    actual=total_marks,
                )
            )
        return violations

    def _eval_difficulty_distribution(
        self, rule, value, total_questions, difficulty_dist, **kwargs
    ) -> List[BlueprintViolation]:
        if total_questions == 0:
            return []

        violations = []
        tolerance = value.get("tolerance_pct", 5)

        for level in ("easy", "medium", "hard"):
            pct_key = f"{level}_pct"
            required_pct = value.get(pct_key)
            if required_pct is None:
                continue
            actual_count = difficulty_dist.get(level, 0)
            actual_pct = round((actual_count / total_questions) * 100)
            if abs(actual_pct - required_pct) > tolerance:
                violations.append(
                    BlueprintViolation(
                        rule_type=rule.rule_type,
                        rule_id=rule.id,
                        is_blocking=rule.is_blocking,
                        message=(
                            f"Difficulty '{level}' is {actual_pct}% of questions, "
                            f"but blueprint requires {required_pct}% (±{tolerance}%)."
                        ),
                        expected=required_pct,
                        actual=actual_pct,
                    )
                )
        return violations

    def _eval_type_distribution(
        self, rule, value, type_dist, **kwargs
    ) -> List[BlueprintViolation]:
        violations = []
        for q_type, required_count in value.items():
            actual = type_dist.get(q_type, 0)
            if actual != required_count:
                violations.append(
                    BlueprintViolation(
                        rule_type=rule.rule_type,
                        rule_id=rule.id,
                        is_blocking=rule.is_blocking,
                        message=(
                            f"Question type '{q_type}' has {actual} questions, "
                            f"but blueprint requires {required_count}."
                        ),
                        expected=required_count,
                        actual=actual,
                    )
                )
        return violations

    def _eval_topic_coverage(self, rule, value, **kwargs) -> List[BlueprintViolation]:
        # Topic coverage requires fetching question topics — simplified check
        # Full implementation would join questions and check topics
        required_topics = value.get("required_topics", [])
        if not required_topics:
            return []
        # Placeholder — full implementation queries actual question topics
        return []

    def _eval_section_marks(self, rule, value, **kwargs) -> List[BlueprintViolation]:
        # Section marks validation requires section-level aggregation
        # Simplified: checks are done at the service layer when sections are finalized
        return []

    def _eval_bloom_distribution(
        self, rule, value, total_questions, **kwargs
    ) -> List[BlueprintViolation]:
        # Bloom distribution requires querying question bloom_level fields
        # Simplified implementation — full version queries bloom_level aggregates
        return []

    def _eval_time_estimate(self, rule, value, total_questions, **kwargs) -> List[BlueprintViolation]:
        max_minutes = value.get("max_total_minutes")
        if not max_minutes:
            return []
        # Estimated time = avg 2 min per question (simplification)
        estimated = total_questions * 2
        if estimated > max_minutes and value.get("warn_if_exceeded", True):
            return [
                BlueprintViolation(
                    rule_type=rule.rule_type,
                    rule_id=rule.id,
                    is_blocking=rule.is_blocking,
                    message=(
                        f"Estimated completion time ({estimated} min) exceeds "
                        f"the target ({max_minutes} min)."
                    ),
                    expected=max_minutes,
                    actual=estimated,
                )
            ]
        return []

    # ─── Distribution Calculator ──────────────────────────────────────────────

    async def calculate_question_distribution(
        self, assessment_id: uuid.UUID
    ) -> Dict[str, Any]:
        """
        Compute the actual distribution of questions for reporting.
        Returns difficulty counts, type counts, total marks, and total questions.
        """
        assessment = await self._assessment_repo.get_by_id(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")

        questions = assessment.assessment_questions or []
        total_marks = sum(q.marks for q in questions)
        difficulty_dist: Dict[str, int] = {}
        type_dist: Dict[str, int] = {}

        for aq in questions:
            if aq.question:
                d = aq.question.difficulty
                t = aq.question.question_type
                difficulty_dist[d] = difficulty_dist.get(d, 0) + 1
                type_dist[t] = type_dist.get(t, 0) + 1

        return {
            "total_questions": len(questions),
            "total_marks_assigned": total_marks,
            "total_marks_on_assessment": assessment.total_marks,
            "marks_match": total_marks == assessment.total_marks,
            "difficulty_distribution": difficulty_dist,
            "type_distribution": type_dist,
        }
