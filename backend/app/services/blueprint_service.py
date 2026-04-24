"""
app/services/blueprint_service.py

Blueprint Rule Engine service for Mindexa Platform.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.db.enums import BlueprintRuleType
from app.db.models.assessment import AssessmentBlueprintRule
from app.db.repositories.assessment_repo import AssessmentRepository
from app.db.repositories.blueprint_repo import BlueprintRepository
from app.schemas.blueprint import (
    BlueprintRuleResponse,
    BlueprintSummaryResponse,
    BlueprintValidationResult,
    BlueprintViolation,
    SetBlueprintRequest,
)


class BlueprintService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._repo = BlueprintRepository(db)
        self._assessment_repo = AssessmentRepository(db)

    @staticmethod
    def _json_load(raw: str | None) -> dict[str, Any]:
        if not raw:
            return {}
        try:
            loaded = json.loads(raw)
            return loaded if isinstance(loaded, dict) else {}
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _enum_value(value: Any) -> str:
        return value.value if hasattr(value, "value") else str(value)

    @staticmethod
    def _question_marks(assessment_question: Any) -> int:
        if assessment_question.marks_override is not None:
            return int(assessment_question.marks_override)
        if assessment_question.question:
            return int(assessment_question.question.marks)
        return 0

    @staticmethod
    def _to_rule_response(rule: AssessmentBlueprintRule) -> BlueprintRuleResponse:
        return BlueprintRuleResponse(
            id=rule.id,
            assessment_id=rule.assessment_id,
            rule_type=BlueprintService._enum_value(rule.rule_type),
            value_json=BlueprintService._json_load(rule.value_json),
            priority=rule.priority,
            is_blocking=rule.is_blocking,
            description=rule.description,
            created_at=rule.created_at,
        )

    async def set_blueprint(
        self,
        assessment_id: uuid.UUID,
        data: SetBlueprintRequest,
    ) -> BlueprintSummaryResponse:
        assessment = await self._assessment_repo.get_by_id_simple(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")
        if assessment.draft_is_complete:
            raise ValidationError(
                "Cannot modify blueprint of a finalized assessment.",
                code="ASSESSMENT_FINALIZED",
            )

        await self._repo.delete_all_for_assessment(assessment_id)

        created_rules: list[AssessmentBlueprintRule] = []
        for rule_data in data.rules:
            created_rules.append(
                await self._repo.create_rule(
                    assessment_id=assessment_id,
                    rule_type=rule_data.rule_type,
                    value_json=json.dumps(rule_data.value_json),
                    priority=rule_data.priority,
                    is_blocking=rule_data.is_blocking,
                    description=rule_data.description,
                )
            )

        if (assessment.draft_step or 0) < 3:
            updater_id = assessment.created_by_id or assessment.updated_by_id
            if updater_id is None:
                raise ValidationError(
                    "Assessment is missing audit owner fields.",
                    code="ASSESSMENT_AUDIT_MISSING",
                )
            await self._assessment_repo.update_fields(
                assessment_id,
                updater_id,
                draft_step=3,
            )

        return BlueprintSummaryResponse(
            assessment_id=assessment_id,
            rules=[self._to_rule_response(r) for r in created_rules],
        )

    async def get_blueprint(self, assessment_id: uuid.UUID) -> BlueprintSummaryResponse:
        assessment = await self._assessment_repo.get_by_id_simple(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")

        rules = await self._repo.list_by_assessment(assessment_id)
        return BlueprintSummaryResponse(
            assessment_id=assessment_id,
            rules=[self._to_rule_response(r) for r in rules],
        )

    async def validate_blueprint(self, assessment_id: uuid.UUID) -> BlueprintValidationResult:
        assessment = await self._assessment_repo.get_by_id(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")

        rules = await self._repo.list_by_assessment(assessment_id)
        questions = assessment.assessment_questions or []

        total_marks = 0
        total_questions = len(questions)
        difficulty_dist: dict[str, int] = {}
        type_dist: dict[str, int] = {}

        for aq in questions:
            total_marks += self._question_marks(aq)
            if aq.question:
                d = self._enum_value(aq.question.difficulty)
                t = self._enum_value(aq.question.question_type)
                difficulty_dist[d] = difficulty_dist.get(d, 0) + 1
                type_dist[t] = type_dist.get(t, 0) + 1

        violations: list[BlueprintViolation] = []
        warnings: list[BlueprintViolation] = []

        for rule in rules:
            value = self._json_load(rule.value_json)
            rule_violations = self._evaluate_rule(
                rule=rule,
                value=value,
                total_questions=total_questions,
                total_marks=total_marks,
                difficulty_dist=difficulty_dist,
                type_dist=type_dist,
                assessment_marks=assessment.total_marks,
            )
            if rule.is_blocking:
                violations.extend(rule_violations)
            else:
                warnings.extend(rule_violations)

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

    def _evaluate_rule(
        self,
        rule: AssessmentBlueprintRule,
        value: dict[str, Any],
        total_questions: int,
        total_marks: int,
        difficulty_dist: dict[str, int],
        type_dist: dict[str, int],
        assessment_marks: int,
    ) -> list[BlueprintViolation]:
        rule_key = rule.rule_type.value if hasattr(rule.rule_type, "value") else str(rule.rule_type)
        evaluators: dict[str, Callable[..., list[BlueprintViolation]]] = {
            BlueprintRuleType.TOTAL_QUESTIONS.value: self._eval_total_questions,
            BlueprintRuleType.MARKS_DISTRIBUTION.value: self._eval_marks_distribution,
            BlueprintRuleType.DIFFICULTY_DISTRIBUTION.value: self._eval_difficulty_distribution,
            BlueprintRuleType.QUESTION_TYPE_DISTRIBUTION.value: self._eval_type_distribution,
            BlueprintRuleType.TOPIC_COVERAGE.value: self._eval_topic_coverage,
            BlueprintRuleType.SECTION_MARKS.value: self._eval_section_marks,
            BlueprintRuleType.BLOOM_DISTRIBUTION.value: self._eval_bloom_distribution,
            BlueprintRuleType.TIME_ESTIMATE.value: self._eval_time_estimate,
        }

        evaluator = evaluators.get(rule_key)
        if evaluator is None:
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

    def _eval_total_questions(
        self,
        *,
        rule: AssessmentBlueprintRule,
        value: dict[str, Any],
        total_questions: int,
        **_: Any,
    ) -> list[BlueprintViolation]:
        required = value.get("count")
        if required is None:
            return []
        if total_questions != int(required):
            return [
                BlueprintViolation(
                    rule_type=rule.rule_type.value,
                    rule_id=rule.id,
                    is_blocking=rule.is_blocking,
                    message=f"Assessment must have exactly {required} questions.",
                    expected=int(required),
                    actual=total_questions,
                )
            ]
        return []

    def _eval_marks_distribution(
        self,
        *,
        rule: AssessmentBlueprintRule,
        value: dict[str, Any],
        total_marks: int,
        assessment_marks: int,
        **_: Any,
    ) -> list[BlueprintViolation]:
        violations: list[BlueprintViolation] = []
        required_total = value.get("total")
        if required_total is not None and total_marks != int(required_total):
            violations.append(
                BlueprintViolation(
                    rule_type=rule.rule_type.value,
                    rule_id=rule.id,
                    is_blocking=rule.is_blocking,
                    message=(
                        f"Total marks assigned ({total_marks}) does not "
                        f"match required total ({required_total})."
                    ),
                    expected=int(required_total),
                    actual=total_marks,
                )
            )
        if total_marks != assessment_marks:
            violations.append(
                BlueprintViolation(
                    rule_type=rule.rule_type.value,
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
        self,
        *,
        rule: AssessmentBlueprintRule,
        value: dict[str, Any],
        total_questions: int,
        difficulty_dist: dict[str, int],
        **_: Any,
    ) -> list[BlueprintViolation]:
        if total_questions == 0:
            return []

        violations: list[BlueprintViolation] = []
        tolerance = int(value.get("tolerance_pct", 5))

        for level in ("easy", "medium", "hard"):
            required_pct = value.get(f"{level}_pct")
            if required_pct is None:
                continue
            actual_count = difficulty_dist.get(level, 0)
            actual_pct = round((actual_count / total_questions) * 100)
            if abs(actual_pct - int(required_pct)) > tolerance:
                violations.append(
                    BlueprintViolation(
                        rule_type=rule.rule_type.value,
                        rule_id=rule.id,
                        is_blocking=rule.is_blocking,
                        message=(
                            f"Difficulty '{level}' is {actual_pct}% of questions, "
                            f"but blueprint requires {required_pct}% (+/-{tolerance}%)."
                        ),
                        expected=int(required_pct),
                        actual=actual_pct,
                    )
                )
        return violations

    def _eval_type_distribution(
        self,
        *,
        rule: AssessmentBlueprintRule,
        value: dict[str, Any],
        type_dist: dict[str, int],
        **_: Any,
    ) -> list[BlueprintViolation]:
        violations: list[BlueprintViolation] = []
        for q_type, required_count in value.items():
            required_int = int(required_count)
            actual = type_dist.get(q_type, 0)
            if actual != required_int:
                violations.append(
                    BlueprintViolation(
                        rule_type=rule.rule_type.value,
                        rule_id=rule.id,
                        is_blocking=rule.is_blocking,
                        message=(
                            f"Question type '{q_type}' has {actual} questions, "
                            f"but blueprint requires {required_int}."
                        ),
                        expected=required_int,
                        actual=actual,
                    )
                )
        return violations

    def _eval_topic_coverage(self, **_: Any) -> list[BlueprintViolation]:
        return []

    def _eval_section_marks(self, **_: Any) -> list[BlueprintViolation]:
        return []

    def _eval_bloom_distribution(self, **_: Any) -> list[BlueprintViolation]:
        return []

    def _eval_time_estimate(
        self,
        *,
        rule: AssessmentBlueprintRule,
        value: dict[str, Any],
        total_questions: int,
        **_: Any,
    ) -> list[BlueprintViolation]:
        max_minutes = value.get("max_total_minutes")
        if max_minutes is None:
            return []
        max_minutes_int = int(max_minutes)
        estimated = total_questions * 2
        if estimated > max_minutes_int and bool(value.get("warn_if_exceeded", True)):
            return [
                BlueprintViolation(
                    rule_type=rule.rule_type.value,
                    rule_id=rule.id,
                    is_blocking=rule.is_blocking,
                    message=(
                        f"Estimated completion time ({estimated} min) exceeds "
                        f"the target ({max_minutes_int} min)."
                    ),
                    expected=max_minutes_int,
                    actual=estimated,
                )
            ]
        return []

    async def calculate_question_distribution(self, assessment_id: uuid.UUID) -> dict[str, Any]:
        assessment = await self._assessment_repo.get_by_id(assessment_id)
        if not assessment:
            raise NotFoundError("Assessment not found.")

        questions = assessment.assessment_questions or []
        total_marks = 0
        difficulty_dist: dict[str, int] = {}
        type_dist: dict[str, int] = {}

        for aq in questions:
            total_marks += self._question_marks(aq)
            if aq.question:
                d = self._enum_value(aq.question.difficulty)
                t = self._enum_value(aq.question.question_type)
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
