from __future__ import annotations

import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.agents.base import BaseAgent
from app.core.ai.prompt_registry import get_prompt
from app.agents.review_agent import _format_student_answer
from app.core.ai.providers import AICompletionRequest, AICompletionResponse, AIMessage
from app.db.enums import AIActionType

IssueType = Literal[
    "SCORE_TOO_HIGH",
    "SCORE_TOO_LOW",
    "MISSED_CREDIT",
    "UNSUPPORTED_CREDIT",
    "FEEDBACK_MISMATCH",
    "FEEDBACK_UNCLEAR",
    "OTHER",
]
_ISSUE_TYPES = set(IssueType.__args__)  # type: ignore[attr-defined]

Verdict = Literal["AGREE", "REVIEW", "DISAGREE"]

# A lecturer this far (as a share of the marks) outside the expected range is a clear miss.
DISAGREE_GAP = 0.25
SCORE_TOLERANCE = 0.01


class GradeCheckIssue(BaseModel):
    type: IssueType = "OTHER"
    message: str = Field(..., min_length=3, max_length=600)
    evidence_quote: Optional[str] = None

    @field_validator("type", mode="before")
    @classmethod
    def _coerce_type(cls, v: object) -> str:
        v = str(v or "").strip().upper()
        return v if v in _ISSUE_TYPES else "OTHER"


class GradeCheckModelOutput(BaseModel):
    """What the model returns. The verdict is computed from this, never taken from it."""
    expected_min: float
    expected_max: float
    issues: list[GradeCheckIssue] = Field(default_factory=list)
    suggested_feedback: Optional[str] = Field(default=None, max_length=2000)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class GradeCheckResult(BaseModel):
    verdict: Verdict
    expected_min: float
    expected_max: float
    issues: list[GradeCheckIssue]
    suggested_feedback: Optional[str] = None
    confidence: float


def validate_grade_check(
    parsed: GradeCheckModelOutput,
    *,
    lecturer_score: float,
    max_score: float,
    student_answer: str,
) -> GradeCheckResult:
    """
    Apply server-side rules to the model's output:
      1. The expected range is clamped to [0, max_score] and ordered.
      2. Evidence quotes must appear in the student's answer, else they are dropped.
      3. The verdict comes from how far the lecturer's score is outside the range.
    """
    lo = max(0.0, min(parsed.expected_min, parsed.expected_max))
    hi = min(float(max_score), max(parsed.expected_min, parsed.expected_max))
    if lo > hi:
        lo = hi

    answer_lower = (student_answer or "").lower()
    issues: list[GradeCheckIssue] = []
    for issue in parsed.issues:
        quote = (issue.evidence_quote or "").strip()
        if quote and quote.lower() not in answer_lower:
            issue = issue.model_copy(update={"evidence_quote": None})
        issues.append(issue)

    if lecturer_score < lo - SCORE_TOLERANCE:
        gap = lo - lecturer_score
    elif lecturer_score > hi + SCORE_TOLERANCE:
        gap = lecturer_score - hi
    else:
        gap = 0.0
    gap_ratio = gap / max_score if max_score > 0 else 0.0

    verdict: Verdict
    if gap_ratio >= DISAGREE_GAP:
        verdict = "DISAGREE"
    elif gap_ratio > 0 or issues:
        verdict = "REVIEW"
    else:
        verdict = "AGREE"

    return GradeCheckResult(
        verdict=verdict,
        expected_min=round(lo, 2),
        expected_max=round(hi, 2),
        issues=issues,
        suggested_feedback=(parsed.suggested_feedback or "").strip() or None,
        confidence=parsed.confidence,
    )


class AttemptCheckQuestionOutput(GradeCheckModelOutput):
    ref: str


class AttemptCheckModelOutput(BaseModel):
    questions: list[AttemptCheckQuestionOutput] = Field(default_factory=list)
    overall_note: Optional[str] = Field(default=None, max_length=600)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class AttemptCheckItem(BaseModel):
    """One already-graded answer to include in an attempt review."""
    ref: str
    question_text: str
    question_type: str
    max_score: float
    rubric_content: str = ""
    student_answer: str
    lecturer_score: float
    lecturer_feedback: str = ""
    lecturer_rubric: str = ""


ANSWER_CHAR_LIMIT = 3000
QUESTIONS_PER_CALL = 6


def _question_block(item: AttemptCheckItem, number: int) -> str:
    answer = _format_student_answer(item.student_answer) or "(no written answer)"
    if len(answer) > ANSWER_CHAR_LIMIT:
        answer = answer[:ANSWER_CHAR_LIMIT] + " …[truncated]"
    return (
        f"#### Question {number} (ref: {item.ref})\n"
        f"{item.question_text}\n"
        f"Type: {item.question_type} | Maximum marks: {item.max_score:g}\n"
        f"Marking criteria: {item.rubric_content or 'None configured; use sound academic standards.'}\n"
        f"Lecturer's score: {item.lecturer_score:g} / {item.max_score:g}\n"
        f"Lecturer's rubric breakdown: {item.lecturer_rubric or 'None'}\n"
        f"Lecturer's feedback for the student: {item.lecturer_feedback.strip() or '(none written)'}\n"
        f"<<<ANSWER\n{answer}\nANSWER>>>\n"
    )


def merge_attempt_check(
    parsed: AttemptCheckModelOutput, items: list[AttemptCheckItem]
) -> dict[str, GradeCheckResult]:
    """Validate each question with the same rules as a single-answer check; unknown refs are ignored."""
    by_ref = {i.ref: i for i in items}
    results: dict[str, GradeCheckResult] = {}
    for q in parsed.questions:
        item = by_ref.get(q.ref)
        if item is None or q.ref in results:
            continue
        results[q.ref] = validate_grade_check(
            q,
            lecturer_score=item.lecturer_score,
            max_score=item.max_score,
            student_answer=item.student_answer,
        )
    return results


class GradeCheckAgent(BaseAgent):
    """Independent second-marker review of a lecturer's grade (advisory only)."""

    prompt_name = "grade_check"
    prompt_version = "v1"

    async def check_grade(
        self,
        *,
        lecturer_id: uuid.UUID | None,
        response_id: uuid.UUID | None,
        question_text: str,
        question_type: str,
        max_score: float,
        rubric_content: str,
        student_answer: str,
        lecturer_score: float,
        lecturer_feedback: str,
        lecturer_rubric: str,
    ) -> tuple[GradeCheckResult, AICompletionResponse]:
        formatted_answer = _format_student_answer(student_answer)

        # The student's answer is substituted last so that any {{placeholder}}
        # text inside it cannot be expanded by the replacements before it.
        system_content = (
            self._get_prompt()
            .replace("{{question_text}}", question_text)
            .replace("{{question_type}}", question_type)
            .replace("{{max_score}}", f"{max_score:g}")
            .replace("{{rubric_content}}", rubric_content or "No rubric configured; use sound academic standards.")
            .replace("{{lecturer_score}}", f"{lecturer_score:g}")
            .replace("{{lecturer_rubric}}", lecturer_rubric or "None")
            .replace("{{lecturer_feedback}}", lecturer_feedback.strip() or "(none written)")
            .replace("{{student_answer}}", formatted_answer or "(no written answer)")
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(role="user", content="Check this grade and respond with the JSON only."),
            ],
            temperature=0.0,
            max_tokens=1200,
        )

        response = await self.gateway.complete(
            request,
            # Reuses the existing enum value; a new one would need a Postgres enum migration.
            action_type=AIActionType.GRADE_RESPONSE,
            actor_id=lecturer_id,
            actor_role="lecturer",
            subject_entity_type="student_response",
            subject_entity_id=response_id,
            prompt_summary=f"Grade check for response {response_id}",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        parsed = self._parse_json_output(response.content, GradeCheckModelOutput)
        result = validate_grade_check(
            parsed,
            lecturer_score=lecturer_score,
            max_score=max_score,
            student_answer=student_answer or "",
        )
        return result, response

    async def check_attempt(
        self,
        *,
        lecturer_id: uuid.UUID | None,
        attempt_id: uuid.UUID | None,
        items: list[AttemptCheckItem],
    ) -> tuple[dict[str, GradeCheckResult], list[str]]:
        """
        Second-mark many answers of one attempt. Questions go to the model in
        batches, one call per batch. Returns results keyed by item ref, plus the
        model's overall notes (one per batch that had something to say).
        """
        results: dict[str, GradeCheckResult] = {}
        notes: list[str] = []
        template = get_prompt("attempt_check", "v1")

        for start in range(0, len(items), QUESTIONS_PER_CALL):
            batch = items[start : start + QUESTIONS_PER_CALL]
            block = "\n".join(
                _question_block(item, start + i + 1) for i, item in enumerate(batch)
            )
            # Single substitution: the answers inside `block` are never rescanned.
            system_content = template.replace("{{questions_block}}", block)

            request = AICompletionRequest(
                messages=[
                    AIMessage(role="system", content=system_content),
                    AIMessage(role="user", content="Check these grades and respond with the JSON only."),
                ],
                temperature=0.0,
                max_tokens=3000,
            )
            response = await self.gateway.complete(
                request,
                action_type=AIActionType.GRADE_RESPONSE,
                actor_id=lecturer_id,
                actor_role="lecturer",
                subject_entity_type="assessment_attempt",
                subject_entity_id=attempt_id,
                prompt_summary=f"Attempt grade check for attempt {attempt_id}",
                prompt_version="attempt_check_v1",
            )
            parsed = self._parse_json_output(response.content, AttemptCheckModelOutput)
            results.update(merge_attempt_check(parsed, batch))
            if parsed.overall_note and parsed.overall_note.strip():
                notes.append(parsed.overall_note.strip())

        return results, notes
