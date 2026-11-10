from __future__ import annotations

import asyncio
import json
import re
import uuid
from typing import Any, Dict, List, Optional

from pydantic import model_validator

from app.agents.base import BaseAgent
from app.core.ai.prompt_registry import get_prompt
from app.core.ai.prompt_render import render_prompt, untrusted_block
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.logging import get_logger
from app.db.enums import AIActionType
from app.db.models.study_plan import StudySession
from pydantic import BaseModel, Field, field_validator

logger = get_logger(__name__)


class LearningUnitSegment(BaseModel):
    """Schema for AI segmentation of material chunks into coherent Learning Units."""
    title: str = Field(..., description="Coherent title of the learning unit")
    summary: str = Field(default="", description="Short abstract of the unit content")
    learning_outcomes: List[str] = Field(default_factory=list, description="2 to 4 concise, measurable learning outcomes for this unit")
    chunk_indices: List[int] = Field(default_factory=list, description="0-indexed chunk indices included in this unit")
    estimated_minutes: int = Field(default=45, description="Estimated study duration in minutes")


class SessionTopicPlan(BaseModel):
    """Schema for AI-generated session topic breakdown."""
    topic: str = Field(..., description="Topic or module name")
    session_type: str = Field(default="STUDY", description="STUDY, PRACTICE, or REVISION")
    learning_objective: str = Field(default="", description="Specific objective for the session")
    estimated_minutes: int = Field(default=60, description="Estimated duration in minutes")


class LessonSection(BaseModel):
    """Schema for individual sections within a guided lesson."""
    section_title: str = ""   # soft default — truncated sections get empty title rather than hard-fail
    content: str = ""         # soft default — same reason
    key_points: List[str] = Field(default_factory=list)
    diagram_prompt: Optional[str] = None
    estimated_minutes: Optional[int] = None
    examples: List[Dict[str, Any]] = Field(default_factory=list)
    tables: List[Dict[str, Any]] = Field(default_factory=list)
    charts: List[Dict[str, Any]] = Field(default_factory=list)
    activities: List[str] = Field(default_factory=list)
    micro_check: Optional[Dict[str, Any]] = None
    faded_example: Optional[Dict[str, Any]] = None
    self_explanation_prompt: Optional[str] = None
    suggested_video_search: Optional[str] = None
    source_learning_unit_id: Optional[str] = None
    technique_justification: Optional[str] = Field(
        default=None,
        description=(
            "Explainability field: the AI's reasoning for which visual techniques "
            "(code, table, diagram) were selected or omitted for this section. "
            "Supports auditability of AI-generated lesson structure."
        ),
    )

    @field_validator("examples", mode="before")
    @classmethod
    def _coerce_examples(cls, v: Any) -> List[Dict[str, Any]]:
        if not v:
            return []
        if isinstance(v, str):
            return [{"title": "Example", "code": v, "explanation": ""}]
        if isinstance(v, dict):
            return [v]
        if isinstance(v, list):
            result: List[Dict[str, Any]] = []
            for item in v:
                if isinstance(item, str):
                    result.append({"title": "Example", "code": item, "explanation": ""})
                elif isinstance(item, dict):
                    result.append(item)
            return result
        return []

    @field_validator("faded_example", mode="before")
    @classmethod
    def _normalize_faded_example(cls, v: Any) -> Optional[Dict[str, Any]]:
        """Keep a faded example only if the student can actually act on it.

        It needs a problem and a step to complete. Anything else (a string, a half-filled
        object) is dropped rather than shown as an empty "Your Turn" box.
        """
        if not isinstance(v, dict):
            return None
        problem = str(v.get("problem") or "").strip()
        completion = str(v.get("completion_prompt") or v.get("prompt") or "").strip()
        if not problem or not completion:
            return None
        steps = v.get("solution_steps") or []
        if isinstance(steps, str):
            steps = [steps]
        normalized: Dict[str, Any] = {
            "problem": problem,
            "solution_steps": [str(step) for step in steps if str(step).strip()]
            if isinstance(steps, list)
            else [],
            "completion_prompt": completion,
            "answer": str(v.get("answer") or "").strip(),
        }
        hint = str(v.get("hint") or "").strip()
        if hint:
            normalized["hint"] = hint
        return normalized

    @field_validator("tables", "charts", mode="before")
    @classmethod
    def _coerce_dict_lists(cls, v: Any) -> List[Dict[str, Any]]:
        if not v:
            return []
        if isinstance(v, dict):
            return [v]
        if isinstance(v, list):
            result: List[Dict[str, Any]] = []
            for item in v:
                if isinstance(item, dict):
                    result.append(item)
            return result
        return []

    @field_validator("key_points", "activities", mode="before")
    @classmethod
    def _coerce_string_lists(cls, v: Any) -> List[str]:
        if not v:
            return []
        if isinstance(v, str):
            return [v]
        if isinstance(v, list):
            return [str(item) if not isinstance(item, str) else item for item in v]
        return []


class LessonPlanOutput(BaseModel):
    """Structured AI output for a full guided study session lesson."""
    title: str
    topic: str
    estimated_duration_minutes: int = 60
    objectives: List[str] = Field(default_factory=list)
    introduction: str = ""
    sections: List[LessonSection] = Field(default_factory=list)
    lecturer_references: List[str] = Field(default_factory=list)
    summary: str = ""
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    glossary: List[Dict[str, str]] = Field(default_factory=list)
    references: List[str] = Field(default_factory=list)
    generated_by: str = Field(default="ai", description="ai or fallback")
    # True only when course material was retrieved and given to the model. An AI lesson
    # with grounded=False was written from the model's general knowledge.
    grounded: bool = False

    @field_validator("sections", mode="before")
    @classmethod
    def _filter_sections(cls, v: Any) -> List[Any]:
        """Filter out bare string items leaked into the sections array by truncation repair.

        When the AI response is truncated mid-string inside a section's `content`
        field, the truncation-repair logic can close the string at the wrong level,
        causing the remaining prose to appear as bare strings in the sections array.
        This validator silently drops those string fragments so that valid sections
        (dicts or already-constructed LessonSection instances) still parse
        successfully instead of the entire lesson failing validation.

        Note: we reject *strings* specifically rather than allowing only *dicts*,
        because Pydantic also passes pre-constructed LessonSection model instances
        here (e.g. from _build_fallback_lesson_plan or tests), which are not dicts
        but must not be dropped.
        """
        if not isinstance(v, list):
            return v
        filtered = [item for item in v if not isinstance(item, str)]
        dropped = len(v) - len(filtered)
        if dropped:
            import structlog as _log
            _log.get_logger().warning(
                "LessonPlanOutput.sections: dropped string fragment items (likely truncation artifacts)",
                dropped=dropped,
                total_before=len(v),
            )
        return filtered

    @field_validator("objectives", "lecturer_references", "references", mode="before")
    @classmethod
    def _coerce_string_lists(cls, v: Any) -> List[str]:
        if not v:
            return []
        if isinstance(v, str):
            return [v]
        if isinstance(v, list):
            return [str(item) if not isinstance(item, str) else item for item in v]
        return []

    @field_validator("glossary", mode="before")
    @classmethod
    def _coerce_glossary(cls, v: Any) -> List[Dict[str, str]]:
        if not v:
            return []
        if isinstance(v, list):
            res = []
            for item in v:
                if isinstance(item, dict):
                    res.append({str(k): str(val) for k, val in item.items()})
                elif isinstance(item, str):
                    if ":" in item:
                        t, d = item.split(":", 1)
                        res.append({"term": t.strip(), "definition": d.strip()})
                    else:
                        res.append({"term": item.strip(), "definition": item.strip()})
            return res
        return []

    @model_validator(mode="after")
    def _require_teachable_sections(self) -> "LessonPlanOutput":
        if not self.sections:
            raise ValueError("A guided lesson must contain at least one section.")
        if any(
            not section.section_title.strip() or not section.content.strip()
            for section in self.sections
        ):
            raise ValueError("Every guided lesson section requires a title and teaching content.")
        return self


class KnowledgeCheckQuestion(BaseModel):
    """Schema for an individual self-evaluation question supporting diverse question types."""
    id: str
    question_text: str
    concept_tag: Optional[str] = None
    question_type: str = Field(default="MCQ")  # MCQ, TRUE_FALSE, MATCHING, FILL_BLANKS, SHORT_ANSWER, OPEN_QUESTION
    options: List[str] = Field(default_factory=list)
    premises: List[str] = Field(default_factory=list)
    matches: List[str] = Field(default_factory=list)
    blank_answers: Dict[str, str] = Field(default_factory=dict)
    correct_option_index: Optional[int] = None
    correct_answer: Optional[Any] = None
    explanation: str = ""
    generated_by: str = Field(default="ai", description="ai or fallback")

    @field_validator("question_type", mode="before")
    @classmethod
    def _normalize_question_type(cls, value: Any) -> str:
        normalized = str(value or "MCQ").strip().upper()
        aliases = {"FILL_BLANK": "FILL_BLANKS", "FILL_IN_BLANK": "FILL_BLANKS"}
        normalized = aliases.get(normalized, normalized)
        supported = {
            "MCQ",
            "TRUE_FALSE",
            "MATCHING",
            "FILL_BLANKS",
            "SHORT_ANSWER",
            "OPEN_QUESTION",
        }
        if normalized not in supported:
            raise ValueError(f"Unsupported knowledge check type: {normalized}")
        return normalized

    @field_validator("options", "premises", "matches", mode="before")
    @classmethod
    def _coerce_lists_to_strings(cls, v: Any) -> List[str]:
        if isinstance(v, list):
            return [str(item) if not isinstance(item, str) else item for item in v]
        return v or []

    @field_validator("correct_answer", mode="before")
    @classmethod
    def _coerce_correct_answer_to_string(cls, v: Any) -> Optional[Any]:
        if isinstance(v, bool):
            return str(v)
        return v

    # Pattern that catches generic placeholder text the model sometimes emits instead of
    # real domain content — e.g. "Concept A", "Definition B", "Term 1", "Item C".
    _PLACEHOLDER_RE: re.Pattern[str] = re.compile(
        r"^(Concept|Definition|Term|Item|Match|Option|Premise|Category|Label)\s+[A-Z0-9]$",
        re.IGNORECASE,
    )

    # Matches two or more consecutive underscores — the canonical blank marker for FILL_BLANKS.
    _BLANK_MARKER_RE: re.Pattern[str] = re.compile(r"_{2,}")

    @model_validator(mode="after")
    def _validate_fill_blanks_structure(self) -> "KnowledgeCheckQuestion":
        """Enforce structural integrity of FILL_BLANKS questions.

        Raises ValueError (caught by the caller as a generation failure) when:
        - question_text contains no '___' blank markers
        - options (word bank) is empty
        - there are fewer options than blank slots
        """
        if self.question_type != "FILL_BLANKS":
            return self

        blank_count = len(self._BLANK_MARKER_RE.findall(self.question_text))
        if blank_count == 0:
            raise ValueError(
                "FILL_BLANKS question_text must contain at least one '___' blank marker. "
                "The AI produced plain prose with no blanks — question dropped."
            )
        if not self.options:
            raise ValueError(
                "FILL_BLANKS question must provide a non-empty 'options' word bank."
            )
        if len(self.options) < blank_count:
            raise ValueError(
                f"FILL_BLANKS has {blank_count} blank(s) but only {len(self.options)} option(s). "
                "options must contain at least one entry per blank."
            )
        required_keys = {str(index) for index in range(blank_count)}
        if not required_keys.issubset(self.blank_answers):
            raise ValueError("FILL_BLANKS requires a correct answer for every blank index.")
        return self

    @model_validator(mode="after")
    def _validate_matching_structure(self) -> "KnowledgeCheckQuestion":
        """Enforce structural integrity of MATCHING questions.

        Raises ValueError (caught by the caller as a generation failure) when:
        - premises or matches are empty
        - they have different lengths
        - any entry looks like a generic placeholder ("Concept A", "Definition B", …)
        - question_text is suspiciously long (>200 chars), which typically means the
          model leaked the answer key into the instruction field.
        """
        if self.question_type != "MATCHING":
            return self

        if not self.premises or not self.matches:
            raise ValueError(
                "MATCHING question must have non-empty premises and matches arrays."
            )

        if len(self.premises) != len(self.matches):
            raise ValueError(
                f"MATCHING question premises ({len(self.premises)}) and "
                f"matches ({len(self.matches)}) must be the same length."
            )

        for entry in (*self.premises, *self.matches):
            if self._PLACEHOLDER_RE.match(entry.strip()):
                raise ValueError(
                    f"MATCHING question contains placeholder text: {entry!r}. "
                    "Real domain-specific content is required."
                )

        if self.blank_answers and any(
            str(self.blank_answers.get(premise, "")).strip().casefold()
            != self.matches[index].strip().casefold()
            for index, premise in enumerate(self.premises)
        ):
            raise ValueError("MATCHING blank_answers must agree with the premise/match pairs.")

        if len(self.question_text) > 200:
            raise ValueError(
                "MATCHING question_text is too long (>200 chars). "
                "It must be a short instruction only — the answer key must not appear in question_text."
            )

        return self


    @model_validator(mode="after")
    def _validate_answer_key(self) -> "KnowledgeCheckQuestion":
        """Reject choice questions whose answer key cannot be graded reliably."""
        q_type = self.question_type.upper()
        if q_type == "MCQ":
            if len(self.options) < 2:
                raise ValueError("MCQ questions require at least two options.")
            if self.correct_option_index is not None and not (
                0 <= self.correct_option_index < len(self.options)
            ):
                raise ValueError("MCQ correct_option_index must refer to an existing option.")
            if (
                self.correct_option_index is not None
                and self.correct_answer is not None
                and str(self.correct_answer).strip().casefold()
                != self.options[self.correct_option_index].strip().casefold()
            ):
                raise ValueError("MCQ correct_answer must match correct_option_index.")
            if self.correct_option_index is None and self.correct_answer is None:
                raise ValueError("MCQ questions require a correct option or answer.")
            if (
                self.correct_option_index is None
                and str(self.correct_answer).strip().casefold()
                not in {option.strip().casefold() for option in self.options}
            ):
                raise ValueError("MCQ correct_answer must match one of its options.")
        if q_type == "TRUE_FALSE" and str(self.correct_answer).strip().lower() not in {
            "true",
            "false",
        }:
            raise ValueError("TRUE_FALSE questions require correct_answer to be True or False.")
        if q_type in {"SHORT_ANSWER", "OPEN_QUESTION"} and not str(
            self.correct_answer or ""
        ).strip():
            raise ValueError(f"{q_type} questions require an answer rubric.")
        return self


class KnowledgeCheckQuestionGrade(BaseModel):
    """Grade detail for a single knowledge check question."""
    question_id: str
    is_correct: bool
    score: float = 0.0
    student_answer: str
    correct_answer: str
    explanation: str
    # Personal feedback on a written answer: what was right and what was missing.
    feedback: Optional[str] = None
    # How a written answer was marked: "ai" (marked for meaning) or "keyword" (fallback).
    # None for fixed-choice questions.
    graded_by: Optional[str] = None

    @field_validator("student_answer", "correct_answer", mode="before")
    @classmethod
    def _coerce_answer_to_string(cls, v: Any) -> str:
        if v is not None and not isinstance(v, str):
            return str(v)
        return v if isinstance(v, str) else ""


class KnowledgeCheckReport(BaseModel):
    """Aggregated report from deterministic answer-key evaluation."""
    total_questions: int
    score_percentage: float
    question_grades: List[KnowledgeCheckQuestionGrade] = Field(default_factory=list)
    mastered_concepts: List[str] = Field(default_factory=list)
    weak_concepts: List[str] = Field(default_factory=list)
    estimated_confidence_level: int = 70
    recommendations: List[str] = Field(default_factory=list)
    generated_by: str = Field(default="deterministic", description="deterministic or fallback")


# Knowledge check generation: spare questions requested beyond what is shown, and the output
# budget for them. 1,800 tokens cut the last questions off for a reasoning model (its reasoning
# counts against the same limit), so 5 asked became 2-3 kept.
KNOWLEDGE_CHECK_EXTRA_QUESTIONS = 2
KNOWLEDGE_CHECK_MAX_TOKENS = 3200


def repair_knowledge_check_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Fix the two ways a generated question is incomplete but unambiguous, before validation.

    - fill-in-the-blanks with no ``blank_answers`` but a word bank with exactly one entry per blank:
      the prompt defines that bank as the answers in blank order.
    - short answer / open question with no reference answer but an explanation: the prompt asks the
      explanation to carry the expected concepts, so it serves as the marking reference.

    Anything else is left alone so the validator can reject it.
    """
    fixed = dict(item)
    q_type = str(fixed.get("question_type") or "MCQ").strip().upper()
    if q_type in ("FILL_BLANK", "FILL_IN_BLANK"):
        q_type = "FILL_BLANKS"

    if q_type == "FILL_BLANKS":
        blanks = len(re.findall(r"_{2,}", str(fixed.get("question_text") or "")))
        options = fixed.get("options") or []
        existing = fixed.get("blank_answers") or {}
        needed = {str(i) for i in range(blanks)}
        if blanks and isinstance(options, list) and len(options) == blanks and not needed.issubset(existing):
            fixed["blank_answers"] = {str(i): str(option) for i, option in enumerate(options)}
    elif q_type in OPEN_ANSWER_TYPES:
        if not str(fixed.get("correct_answer") or "").strip():
            explanation = str(fixed.get("explanation") or "").strip()
            if explanation:
                fixed["correct_answer"] = explanation
    return fixed


# Longest a student's request will wait inside one call for a provider rate limit to reset. Longer
# waits are handed back to the page (see ``ai_retry_after_seconds``) instead of freezing the request.
MAX_RATE_LIMIT_WAIT_SECONDS = 12.0
_RETRY_AFTER_RE = re.compile(
    r"try again in\s*(?:(\d+(?:\.\d+)?)\s*m(?!s))?\s*(?:(\d+(?:\.\d+)?)\s*(ms|s))?", re.IGNORECASE
)


def provider_retry_after_seconds(message: str) -> Optional[float]:
    """Seconds the provider asks us to wait ("try again in 19.37s", "2m3.5s", "850ms"), if it says.

    Only rate-limit messages count, so an unrelated outage is never retried after a pointless wait.
    """
    lowered = message.lower()
    if "rate limit" not in lowered and "rate_limit" not in lowered and "429" not in lowered:
        return None
    match = _RETRY_AFTER_RE.search(message)
    if not match or (match.group(1) is None and match.group(2) is None):
        return None
    minutes = float(match.group(1)) if match.group(1) else 0.0
    amount = float(match.group(2)) if match.group(2) else 0.0
    seconds = amount / 1000.0 if (match.group(3) or "").lower() == "ms" else amount
    return minutes * 60.0 + seconds


OPEN_ANSWER_TYPES = {"SHORT_ANSWER", "OPEN_QUESTION"}
# Below this an open answer is treated as not yet understood (keyword grading uses its own bar).
OPEN_ANSWER_PASS_SCORE = 60.0
MAX_OPEN_ANSWERS_PER_GRADING_CALL = 6
MAX_OPEN_ANSWER_CHARS = 1500


class OpenAnswerGrade(BaseModel):
    """AI marking of one written answer, with feedback the student can learn from."""
    question_id: str
    score: float = 0.0
    feedback: str = ""
    missing_points: List[str] = Field(default_factory=list)

    @field_validator("question_id", mode="before")
    @classmethod
    def _coerce_question_id(cls, v: Any) -> str:
        return str(v)

    @field_validator("score", mode="before")
    @classmethod
    def _clamp_score(cls, v: Any) -> float:
        try:
            value = float(v)
        except (TypeError, ValueError):
            raise ValueError("score must be a number")
        return max(0.0, min(100.0, value))

    @field_validator("missing_points", mode="before")
    @classmethod
    def _coerce_missing_points(cls, v: Any) -> List[str]:
        if not v:
            return []
        if isinstance(v, str):
            return [v]
        if isinstance(v, list):
            return [str(item) for item in v]
        return []


class OpenAnswerGradingOutput(BaseModel):
    grades: List[OpenAnswerGrade] = Field(default_factory=list)


class GuidedExerciseOutput(BaseModel):
    """Schema for an AI-generated inline guided lesson practice exercise."""
    question_text: str
    options: List[str] = Field(default_factory=list)
    correct_option_index: int = 0
    explanation: str = ""
    generated_by: str = Field(default="ai", description="ai or fallback")

    @field_validator("options", mode="before")
    @classmethod
    def _coerce_options_to_strings(cls, v: Any) -> List[str]:
        if isinstance(v, list):
            return [str(item) if not isinstance(item, str) else item for item in v]
        return v


    @model_validator(mode="after")
    def _validate_exercise_answer_key(self) -> "GuidedExerciseOutput":
        if len(self.options) != 4:
            raise ValueError("Guided exercises require exactly four options.")
        if not 0 <= self.correct_option_index < len(self.options):
            raise ValueError("correct_option_index must refer to an existing option.")
        if not self.question_text.strip() or not self.explanation.strip():
            raise ValueError("Guided exercises require a question and explanation.")
        return self


class GuidedWrittenExerciseOutput(BaseModel):
    """Schema for an AI-generated written practice question with a reference answer."""
    question_text: str
    model_answer: str
    explanation: str = ""
    generated_by: str = Field(default="ai", description="ai or fallback")

    @model_validator(mode="after")
    def _validate_written_exercise(self) -> "GuidedWrittenExerciseOutput":
        if not self.question_text.strip():
            raise ValueError("Written exercises require a question.")
        if len(self.model_answer.strip()) < 15:
            raise ValueError("Written exercises require a reference answer to mark against.")
        return self


class SessionSummaryOutput(BaseModel):
    """Concise AI-generated session summary."""
    topic: str
    concepts_covered: List[str] = Field(default_factory=list)
    key_takeaways: List[str] = Field(default_factory=list)
    common_mistakes_to_avoid: List[str] = Field(default_factory=list)
    recommendations_for_future_revision: List[str] = Field(default_factory=list)
    generated_by: str = Field(default="ai", description="ai or fallback")


def evaluate_question_response(
    q_dict: dict[str, Any],
    raw_ans: Any,
) -> tuple[bool, float, str, str]:
    """Evaluate student response against question type and answer key.

    Returns (is_correct, score_percentage, student_answer_str, correct_answer_str).
    """
    q_type = str(q_dict.get("question_type", "MCQ")).upper()
    correct_idx = q_dict.get("correct_option_index")
    options = q_dict.get("options") or []
    correct_ans = q_dict.get("correct_answer")

    st_ans_str = json.dumps(raw_ans) if isinstance(raw_ans, (dict, list)) else str(raw_ans if raw_ans is not None else "")
    corr_ans_str = json.dumps(correct_ans) if isinstance(correct_ans, (dict, list)) else str(correct_ans if correct_ans is not None else "")

    # A blank TRUE_FALSE response must not match a False answer key.
    if raw_ans is None or raw_ans == "" or raw_ans == {} or raw_ans == []:
        return False, 0.0, "", corr_ans_str or "N/A"

    if not corr_ans_str and correct_idx is not None and 0 <= correct_idx < len(options):
        corr_ans_str = str(options[correct_idx])

    if q_type == "MATCHING":
        premises = q_dict.get("premises") or []
        matches = q_dict.get("matches") or []
        target_map = q_dict.get("blank_answers") or {}
        if not target_map and len(premises) == len(matches):
            target_map = {premises[i]: matches[i] for i in range(len(premises))}

        student_map = raw_ans if isinstance(raw_ans, dict) else {}
        if not target_map:
            return False, 0.0, json.dumps(student_map), json.dumps(target_map)

        matches_count = 0
        total_pairs = len(target_map)
        for k, v in target_map.items():
            if str(student_map.get(k, "")).strip().lower() == str(v).strip().lower():
                matches_count += 1

        score_pct = (matches_count / total_pairs) * 100.0 if total_pairs > 0 else 0.0
        return score_pct >= 80.0, score_pct, json.dumps(student_map), json.dumps(target_map)

    elif q_type == "FILL_BLANKS":
        target_blanks = q_dict.get("blank_answers") or {}
        if isinstance(target_blanks, list):
            target_blanks = {str(idx): val for idx, val in enumerate(target_blanks)}

        student_blanks = raw_ans if isinstance(raw_ans, dict) else {}
        if isinstance(raw_ans, list):
            student_blanks = {str(idx): val for idx, val in enumerate(raw_ans)}

        if not target_blanks:
            return False, 0.0, json.dumps(student_blanks), json.dumps(target_blanks)

        correct_blanks = 0
        total_blanks = len(target_blanks)
        for b_key, b_val in target_blanks.items():
            st_val = str(student_blanks.get(b_key, student_blanks.get(int(b_key) if str(b_key).isdigit() else b_key, ""))).strip().lower()
            if st_val == str(b_val).strip().lower():
                correct_blanks += 1

        score_pct = (correct_blanks / total_blanks) * 100.0 if total_blanks > 0 else 0.0
        return score_pct >= 80.0, score_pct, json.dumps(student_blanks), json.dumps(target_blanks)

    elif q_type == "TRUE_FALSE":
        st_norm = str(raw_ans).strip().lower() in ["true", "1", "t", "yes"]
        if isinstance(correct_ans, bool):
            cr_norm = correct_ans
        else:
            cr_norm = str(correct_ans).strip().lower() in ["true", "1", "t", "yes"]

        is_corr = st_norm == cr_norm
        return is_corr, (100.0 if is_corr else 0.0), str(st_norm), str(cr_norm)

    elif q_type in ["SHORT_ANSWER", "OPEN_QUESTION"]:
        st_text = str(raw_ans).strip()
        cr_text = str(correct_ans or "").strip()
        if not cr_text:
            return False, 0.0, st_text, "No grading rubric available"

        st_lower = st_text.lower()
        cr_keywords = list(dict.fromkeys(re.findall(r"\b[\w'-]{4,}\b", cr_text.lower())))
        matches = 0
        for keyword in cr_keywords:
            if re.search(rf"\b{re.escape(keyword)}\b", st_lower):
                matches += 1
        pct = (matches / len(cr_keywords)) * 100.0 if cr_keywords else 100.0
        if st_lower == cr_text.lower():
            pct = 100.0
        is_pass = pct >= 40.0
        return is_pass, pct, st_text, cr_text

    else:
        is_correct = False
        if correct_idx is not None and 0 <= correct_idx < len(options):
            expected = options[correct_idx]
            if isinstance(raw_ans, int) and raw_ans == correct_idx:
                is_correct = True
            elif str(raw_ans).strip() == str(correct_idx):
                is_correct = True
            elif str(raw_ans).strip().lower() == str(expected).strip().lower():
                is_correct = True
        elif correct_ans is not None:
            if str(raw_ans).strip().lower() == str(correct_ans).strip().lower():
                is_correct = True

        return is_correct, (100.0 if is_correct else 0.0), st_ans_str, corr_ans_str


class StudyPlannerAgent(BaseAgent):
    """
    AI Agent responsible for study plan topic breakdown, guided lesson generation,
    knowledge check generation & evaluation, and post-session summaries.
    """

    prompt_name = "study_topics"
    prompt_version = "v1"

    async def generate_session_topics(
        self,
        *,
        student_id: uuid.UUID,
        assessment_title: str,
        course_context: str = "",
        material_titles: Optional[List[str]] = None,
        session_count: int = 7,
        difficulty_pace: str = "Balanced",
        weak_topics: Optional[List[str]] = None,
        topic_confidence: Optional[Dict[str, Any]] = None,
    ) -> List[SessionTopicPlan]:
        """Generate ordered list of study topics tailored to target assessment, materials, and student weak areas."""
        template = get_prompt("study_topics", "v1")
        mats_str = ", ".join(material_titles) if material_titles else "None specified"
        system_content = render_prompt(
            template,
            {
                "assessment_title": assessment_title,
                "course_context": course_context or "General Academic Course",
                "material_titles": mats_str,
                "session_count": str(session_count),
                "difficulty_pace": difficulty_pace,
            },
        )

        if weak_topics:
            weak_str = ", ".join(weak_topics)
            system_content += (
                f"\n\nKNOWN STUDENT WEAK TOPICS: {weak_str}.\n"
                f"CRITICAL INSTRUCTION: Prioritize and front-load these weak topics into the earlier sessions "
                f"(Sessions 1-{min(3, session_count)}) so the student receives immediate reinforcement."
            )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(role="user", content=f"Generate {session_count} structured session topics for '{assessment_title}'."),
            ],
            temperature=0.4,
            max_tokens=1500,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_STUDY_PLAN,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_plan",
            prompt_summary=f"Generate session topic plan for assessment '{assessment_title}'",
            prompt_version="study_topics_v1",
        )

        res = self._parse_json_output(response.content, SessionTopicPlan, extract_list=True)
        return res if isinstance(res, list) else [res]

    async def _complete_waiting_out_rate_limit(self, request: AICompletionRequest, **kwargs: Any) -> Any:
        """``gateway.complete``, but wait once if the provider says when its rate limit resets.

        Free-tier providers allow a fixed number of tokens per minute, and a retry sent straight
        after a big call is refused with "try again in 19s". A short wait turns that failure into
        a success; a long or unknown wait is not worth blocking the student on, so it re-raises.
        """
        from app.core.exceptions import ServiceUnavailableError

        try:
            return await self.gateway.complete(request, **kwargs)
        except ServiceUnavailableError as exc:
            wait = provider_retry_after_seconds(str(exc))
            if wait is None or wait > MAX_RATE_LIMIT_WAIT_SECONDS:
                raise
            logger.info("ai_rate_limited_waiting_to_retry", wait_seconds=round(wait, 1))
            await asyncio.sleep(wait + 1.0)
            return await self.gateway.complete(request, **kwargs)

    async def generate_lesson(
        self,
        *,
        session: StudySession,
        rag_context: str = "",
        learning_profile: Optional[dict[str, Any]] = None,
    ) -> LessonPlanOutput:
        """Generate structured lesson plan for a specific study session."""
        duration = session.duration_minutes or 60
        if duration <= 30:
            target_sections = "3 to 4"
            wanted_sections = 3
        elif duration <= 60:
            target_sections = "5 to 7"
            wanted_sections = 4
        else:
            target_sections = "8 to 10"
            wanted_sections = 6
        # A lesson this short is still usable if the second attempt cannot do better.
        acceptable_sections = max(2, wanted_sections - 1)

        template = get_prompt("study_lesson", "v1")
        profile_str = json.dumps(learning_profile or {})
        system_content = render_prompt(
            template,
            {
                "topic": untrusted_block("session_topic", session.topic),
                "session_title": untrusted_block("session_title", session.title),
                "duration_minutes": str(duration),
                "target_sections": target_sections,
                "learning_profile": untrusted_block("student_learning_profile", profile_str),
                "rag_context": untrusted_block("lecturer_materials", rag_context)
                if rag_context
                else "No additional lecturer materials retrieved.",
            },
        )

        from app.core.exceptions import ServiceUnavailableError
        from app.core.exceptions import ValidationError as AppValidationError

        base_request =f"Generate the requested {duration}-minute lesson using the system instructions and structured output contract."
        compact_request = (
            f"{base_request} IMPORTANT: your previous answer was cut off or incomplete. Keep every "
            "section short (about 120-180 words of prose, 3 key points) and leave out the optional "
            "fields (examples, tables, diagram_prompt, faded_example, charts, glossary, "
            "technique_justification) unless a section truly cannot be taught without them. "
            "Finish the whole JSON object."
        )

        best: Optional[LessonPlanOutput] = None
        last_error: Optional[Exception] = None

        # Attempt 1 asks for the full lesson. If the output was cut off at the token limit or came
        # back with too few sections, attempt 2 asks for a compact version of the same lesson
        # instead of silently accepting a degraded one.
        for attempt in (1, 2):
            request = AICompletionRequest(
                messages=[
                    AIMessage(role="system", content=system_content),
                    AIMessage(role="user", content=base_request if attempt == 1 else compact_request),
                ],
                temperature=0.4 if attempt == 1 else 0.3,
                # max_tokens budget for lesson completion.
                # Groq free-tier: 8 000 TPM. With Fix #1 capping RAG context to
                # ~1 600 tokens and the template overhead at ~1 600 tokens, reserving
                # 3 200 here gives: 3 200 + 1 600 + 1 600 = 6 400 total — 1 600 under
                # the 8 000 limit. The compact retry stays inside that budget by asking
                # for less, rather than for more tokens.
                max_tokens=3200,
            )

            try:
                response = await self._complete_waiting_out_rate_limit(
                    request,
                    action_type=AIActionType.GENERATE_STUDY_LESSON,
                    actor_id=session.student_id,
                    actor_role="student",
                    subject_entity_type="study_session",
                    subject_entity_id=session.id,
                    prompt_summary=(
                        f"Generate structured lesson for session {session.id} ({session.topic})"
                        + (" [compact retry]" if attempt == 2 else "")
                    ),
                    prompt_version="study_lesson_v1",
                )
            except ServiceUnavailableError as exc:
                # The provider itself failed (not a bad answer). If the first attempt already
                # produced a usable lesson, keep it; otherwise let the caller fall back.
                last_error = exc
                logger.warning(
                    "lesson_generation_provider_failed",
                    attempt=attempt,
                    session_id=str(session.id),
                    error=str(exc)[:200],
                )
                break

            finish_reason = (getattr(response, "finish_reason", None) or "").lower()
            truncated = finish_reason in {"length", "max_tokens"}

            try:
                lesson: LessonPlanOutput = self._parse_json_output(  # type: ignore[assignment]
                    response.content, LessonPlanOutput
                )
            except AppValidationError as exc:
                last_error = exc
                logger.warning(
                    "lesson_generation_unusable_output",
                    attempt=attempt,
                    truncated=truncated,
                    session_id=str(session.id),
                )
                continue

            if best is None or len(lesson.sections) > len(best.sections):
                best = lesson
            if len(lesson.sections) >= wanted_sections and not truncated:
                return lesson

            logger.warning(
                "lesson_generation_incomplete",
                attempt=attempt,
                sections=len(lesson.sections),
                wanted_sections=wanted_sections,
                truncated=truncated,
                session_id=str(session.id),
            )

        if best is not None and len(best.sections) >= acceptable_sections:
            return best
        # Too short to teach from: let the caller use its labelled template lesson instead.
        raise last_error or AppValidationError(
            "The AI lesson came back incomplete. Please try again.",
            code="AI_OUTPUT_INCOMPLETE",
        )

    async def generate_knowledge_check(
        self,
        *,
        session: StudySession,
        lesson_content: str = "",
        weak_topics: Optional[List[str]] = None,
        question_count: int = 5,
    ) -> List[KnowledgeCheckQuestion]:
        """Generate non-academic self-evaluation knowledge check questions."""
        template = get_prompt("study_knowledge_check", "v1")
        weak_str = ", ".join(weak_topics or []) or "None"
        # Ask for a couple more than needed: a complex type (matching, fill-in-the-blanks) is
        # sometimes malformed and dropped, and the spares keep the check at the size asked for.
        requested = question_count + KNOWLEDGE_CHECK_EXTRA_QUESTIONS
        system_content = render_prompt(
            template,
            {
                "topic": untrusted_block("session_topic", session.topic),
                "lesson_content": untrusted_block("lesson_content", lesson_content[:6000])
                if lesson_content
                else untrusted_block("session_topic", session.topic),
                "weak_topics": untrusted_block("student_weak_topics", weak_str),
                "question_count": str(requested),
            },
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user",
                    content=(
                        f"Generate the requested {requested} knowledge check questions using the system "
                        "instructions and structured output contract. Return compact JSON and keep each "
                        "explanation to one or two sentences."
                    ),
                ),
            ],
            temperature=0.3,
            max_tokens=KNOWLEDGE_CHECK_MAX_TOKENS,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_KNOWLEDGE_CHECK,
            actor_id=session.student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session.id,
            prompt_summary=f"Generate knowledge check for session {session.id} ({session.topic})",
            prompt_version="study_knowledge_check_v1",
        )

        import random
        import json as _json
        from pydantic import ValidationError as _PydanticValidationError

        from app.core.exceptions import ValidationError as AppValidationError

        # Load the JSON leniently, then validate item by item, so a question that is malformed
        # (or the last one, cut off at the token limit) is dropped without losing the others.
        try:
            payload = self._load_json_payload(response.content)
        except _json.JSONDecodeError as exc:
            logger.warning(
                "knowledge_check_unparseable",
                session_id=str(session.id),
                finish_reason=getattr(response, "finish_reason", None),
            )
            raise AppValidationError(
                "The AI returned a response we could not use. Please try again.",
                code="AI_OUTPUT_VALIDATION_FAILED",
            ) from exc
        if isinstance(payload, dict):
            wrapped = next(
                (payload[key] for key in ("questions", "items", "data", "results") if isinstance(payload.get(key), list)),
                None,
            )
            raw_items: list[Any] = wrapped if wrapped is not None else [payload]
        else:
            raw_items = list(payload) if isinstance(payload, list) else []

        questions_list: List[KnowledgeCheckQuestion] = []
        import structlog as _structlog
        _log = _structlog.get_logger(__name__)
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            try:
                q = KnowledgeCheckQuestion.model_validate(repair_knowledge_check_item(item))
            except _PydanticValidationError as exc:
                _log.warning(
                    "knowledge_check_question_invalid",
                    question_id=item.get("id"),
                    question_type=item.get("question_type"),
                    error=str(exc),
                    session_id=str(session.id),
                )
                continue
            # The prompt already asks each question to mention the topic. Prefixing it by force
            # only helps with a short topic; a long compound one ("Spaced Revision: a, b") reads badly.
            if session.topic and len(session.topic) <= 40 and session.topic not in q.question_text:
                q.question_text = f"Regarding {session.topic}: {q.question_text}"
            if q.options and len(q.options) >= 2 and q.question_type == "MCQ":
                options_with_idx = list(enumerate(q.options))
                random.shuffle(options_with_idx)
                new_options = [opt for _, opt in options_with_idx]
                if q.correct_option_index is not None:
                    new_correct_idx = next(
                        (new_i for new_i, (old_i, _) in enumerate(options_with_idx) if old_i == q.correct_option_index),
                        0
                    )
                    q.correct_option_index = new_correct_idx
                    q.correct_answer = new_options[new_correct_idx]
                q.options = new_options
            questions_list.append(q)

        if getattr(response, "finish_reason", None) in ("length", "max_tokens"):
            logger.warning(
                "knowledge_check_cut_off",
                session_id=str(session.id),
                kept=len(questions_list),
                requested=requested,
            )
        # The spares are only there to cover dropped questions.
        return questions_list[:question_count]

    async def grade_knowledge_check(
        self,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        questions: List[dict[str, Any]],
        student_answers: dict[str, Any],
        session_topic: str = "",
        use_ai_grading: bool = True,
    ) -> KnowledgeCheckReport:
        """Evaluate responses against stored answer keys and summarize learning signals.

        Fixed-choice questions are graded deterministically. Written answers (short answer and
        open questions) are marked by the AI for meaning, with feedback on what was missing;
        if the AI is unavailable they fall back to keyword matching and are labelled as such.
        """
        question_grades: List[KnowledgeCheckQuestionGrade] = []
        score_total = 0.0
        mastered: List[str] = []
        weak: List[str] = []

        # Pass 1: deterministic grading for every question.
        graded: List[dict[str, Any]] = []
        for i, q in enumerate(questions):
            q_dict = q if isinstance(q, dict) else (q.model_dump() if hasattr(q, "model_dump") else {})
            q_id = str(q_dict.get("id", i))
            raw_ans = student_answers.get(q_id, student_answers.get(str(i), ""))
            is_correct, score_pct, st_ans_str, corr_ans_str = evaluate_question_response(q_dict, raw_ans)
            graded.append(
                {
                    "q": q_dict,
                    "id": q_id,
                    "is_correct": is_correct,
                    "score_pct": score_pct,
                    "student": st_ans_str,
                    "correct": corr_ans_str,
                    "feedback": None,
                    "graded_by": None,
                }
            )

        # Pass 2: written answers are marked for meaning by the AI.
        open_rows = [
            row
            for row in graded
            if str(row["q"].get("question_type", "")).upper() in OPEN_ANSWER_TYPES
            and row["student"].strip()
            and str(row["q"].get("correct_answer") or "").strip()
        ]
        ai_graded_count = 0
        if open_rows:
            ai_marks: Dict[str, OpenAnswerGrade] = {}
            if use_ai_grading:
                try:
                    ai_marks = await self._grade_open_answers(
                        student_id=student_id,
                        session_id=session_id,
                        topic=session_topic,
                        rows=open_rows[:MAX_OPEN_ANSWERS_PER_GRADING_CALL],
                    )
                except Exception as exc:
                    logger.warning(
                        "open_answer_ai_grading_failed_using_keyword_fallback",
                        error=str(exc)[:300],
                        session_id=str(session_id),
                    )
            for row in open_rows:
                mark = ai_marks.get(row["id"])
                if mark is None:
                    row["graded_by"] = "keyword"
                    row["feedback"] = (
                        "This answer was marked by keyword match because the AI marker was "
                        "unavailable, so the result may be less accurate. Compare it with the "
                        "model answer yourself."
                    )
                    continue
                row["graded_by"] = "ai"
                ai_graded_count += 1
                row["score_pct"] = mark.score
                row["is_correct"] = mark.score >= OPEN_ANSWER_PASS_SCORE
                feedback = mark.feedback.strip()
                if mark.missing_points:
                    missing = "; ".join(p.strip() for p in mark.missing_points if p.strip())
                    if missing:
                        feedback = f"{feedback} Missing: {missing}.".strip()
                row["feedback"] = feedback or None

        # Pass 3: build the report.
        for row in graded:
            q_dict = row["q"]
            q_id = row["id"]
            if row["is_correct"]:
                mastered.append(
                    q_dict.get("concept_tag")
                    or q_dict.get("question_text", f"Question {q_id}")
                )
            else:
                weak.append(
                    q_dict.get("concept_tag")
                    or q_dict.get("topic_tag")
                    or q_dict.get("topic")
                    or session_topic
                    or q_dict.get("question_text", f"Question {q_id}")
                )

            question_grades.append(
                KnowledgeCheckQuestionGrade(
                    question_id=q_id,
                    is_correct=row["is_correct"],
                    score=row["score_pct"] / 100.0,
                    student_answer=row["student"] or "No answer provided",
                    correct_answer=row["correct"] or "N/A",
                    explanation=q_dict.get("explanation", "Review core concept for details."),
                    feedback=row["feedback"],
                    graded_by=row["graded_by"],
                )
            )
            score_total += row["score_pct"]

        total = len(questions) or 1
        pct = round(score_total / total, 1)

        # Audit trail. Only written answers cost an LLM call (logged by the gateway itself);
        # this entry records the overall grading result.
        await self.gateway.log_action(
            action_type=AIActionType.GRADE_KNOWLEDGE_CHECK,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session_id,
            prompt_summary=(
                f"Self-grading for session {session_id} ({total} questions, "
                f"{ai_graded_count} written answers AI-marked)"
            ),
            prompt_version="study_knowledge_check_v1",
            raw_output={
                "score_percentage": pct,
                "total_questions": total,
                "ai_graded_answers": ai_graded_count,
            },
        )

        return KnowledgeCheckReport(
            total_questions=total,
            score_percentage=pct,
            question_grades=question_grades,
            mastered_concepts=mastered,
            weak_concepts=weak,
            # Not an independent estimate: it mirrors the score, with no artificial floor.
            estimated_confidence_level=int(min(100, max(0, pct))),
            generated_by="ai_assisted" if ai_graded_count else "deterministic",
            recommendations=[
                "Review weak concepts in your personal profile." if weak else "Great job! Keep maintaining this streak.",
            ],
        )

    async def _grade_open_answers(
        self,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        topic: str,
        rows: List[dict[str, Any]],
    ) -> Dict[str, OpenAnswerGrade]:
        """Mark written answers for meaning in one call; returns grades keyed by question id.

        Anything the model omits, repeats or returns for an unknown question is ignored, so the
        caller falls back to keyword grading for exactly those answers.
        """
        items = [
            {
                "question_id": row["id"],
                "question": str(row["q"].get("question_text", ""))[:600],
                "reference_answer": str(row["q"].get("correct_answer") or "")[:800],
                "student_answer": row["student"][:MAX_OPEN_ANSWER_CHARS],
            }
            for row in rows
        ]
        template = get_prompt("study_open_answer_grade", "v1")
        system_content = render_prompt(
            template,
            {
                "topic": untrusted_block("session_topic", topic or "the study topic"),
                "items": untrusted_block("open_answers", json.dumps(items, ensure_ascii=False)),
            },
        )
        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user",
                    content="Mark every answer using the system instructions and structured output contract.",
                ),
            ],
            temperature=0.1,
            max_tokens=300 + 220 * len(items),
        )
        response = await self.gateway.complete(
            request,
            # Reuses the existing grading audit type: a new enum value would need a DB migration.
            action_type=AIActionType.GRADE_KNOWLEDGE_CHECK,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session_id,
            prompt_summary=f"Mark {len(items)} written knowledge-check answers for session {session_id}",
            prompt_version="study_open_answer_grade_v1",
        )
        output: OpenAnswerGradingOutput = self._parse_json_output(  # type: ignore[assignment]
            response.content, OpenAnswerGradingOutput
        )
        expected_ids = {item["question_id"] for item in items}
        marks: Dict[str, OpenAnswerGrade] = {}
        for grade in output.grades:
            if grade.question_id in expected_ids and grade.question_id not in marks:
                marks[grade.question_id] = grade
        return marks

    async def generate_session_summary(
        self,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        topic: str,
        lesson_content: str,
        knowledge_check_report: Optional[dict[str, Any]] = None,
    ) -> SessionSummaryOutput:
        """Generate post-lesson concise learning summary."""
        template = get_prompt("study_session_summary", "v1")
        kc_str = json.dumps(knowledge_check_report or {})
        system_content = render_prompt(
            template,
            {
                "topic": untrusted_block("session_topic", topic),
                "lesson_content": untrusted_block("lesson_content", lesson_content[:2500]) if lesson_content else untrusted_block("lesson_topic", topic),
                "knowledge_check_report": untrusted_block("knowledge_check_report", kc_str),
            },
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(role="user", content="Generate the requested concise post-session summary using the system instructions and structured output contract."),
            ],
            temperature=0.3,
            max_tokens=1200,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_SESSION_SUMMARY,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session_id,
            prompt_summary=f"Generate session summary for session {session_id}",
            prompt_version="study_session_summary_v1",
        )

        return self._parse_json_output(response.content, SessionSummaryOutput)  # type: ignore

    async def generate_guided_exercise(
        self,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        topic: str,
        section_title: str,
        section_content: str,
        rag_context: str = "",
    ) -> GuidedExerciseOutput:
        """Generate AI/RAG-grounded inline practice activity for a specific guided lesson section."""
        template = get_prompt("study_guided_exercise", "v1")
        system_content = render_prompt(
            template,
            {
                "topic": untrusted_block("session_topic", topic),
                "section_title": untrusted_block("lesson_section_title", section_title),
                "section_content": untrusted_block("lesson_section_content", section_content[:1500])
                if section_content
                else untrusted_block("lesson_section_title", section_title),
                "rag_context": untrusted_block("lecturer_materials", rag_context[:1500])
                if rag_context
                else "None available.",
            },
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(role="user", content="Generate one practice exercise using the system instructions and structured output contract."),
            ],
            temperature=0.3,
            max_tokens=1000,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_GUIDED_EXERCISE,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session_id,
            prompt_summary=f"Generate guided exercise for section '{section_title}'",
            prompt_version="study_guided_exercise_v1",
        )

        output: GuidedExerciseOutput = self._parse_json_output(response.content, GuidedExerciseOutput)  # type: ignore
        if output.options and len(output.options) >= 2:
            # Models tend to put the right answer first; shuffle and re-point the correct index.
            import random
            options_with_idx = list(enumerate(output.options))
            random.shuffle(options_with_idx)
            output.options = [opt for _, opt in options_with_idx]
            output.correct_option_index = next(
                (new_i for new_i, (old_i, _) in enumerate(options_with_idx) if old_i == output.correct_option_index),
                0,
            )

        return output

    async def generate_guided_written_exercise(
        self,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        topic: str,
        section_title: str,
        section_content: str,
        rag_context: str = "",
    ) -> GuidedWrittenExerciseOutput:
        """Generate a written-answer practice question (with reference answer) for one section."""
        template = get_prompt("study_guided_written_exercise", "v1")
        system_content = render_prompt(
            template,
            {
                "topic": untrusted_block("session_topic", topic),
                "section_title": untrusted_block("lesson_section_title", section_title),
                "section_content": untrusted_block("lesson_section_content", section_content[:1500])
                if section_content
                else untrusted_block("lesson_section_title", section_title),
                "rag_context": untrusted_block("lecturer_materials", rag_context[:1500])
                if rag_context
                else "None available.",
            },
        )
        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user",
                    content="Generate one written practice question using the system instructions and structured output contract.",
                ),
            ],
            temperature=0.3,
            max_tokens=700,
        )
        response = await self.gateway.complete(
            request,
            # Same audit type as multiple-choice practice: a new enum value would need a migration.
            action_type=AIActionType.GENERATE_GUIDED_EXERCISE,
            actor_id=student_id,
            actor_role="student",
            subject_entity_type="study_session",
            subject_entity_id=session_id,
            prompt_summary=f"Generate written practice for section '{section_title}'",
            prompt_version="study_guided_written_exercise_v1",
        )
        return self._parse_json_output(response.content, GuidedWrittenExerciseOutput)  # type: ignore[return-value]

    async def mark_written_answers(
        self,
        *,
        student_id: uuid.UUID,
        session_id: uuid.UUID,
        topic: str,
        rows: List[dict[str, Any]],
    ) -> Dict[str, OpenAnswerGrade]:
        """Mark written answers for meaning. Each row: {"id", "q": {question_text, correct_answer}, "student"}."""
        return await self._grade_open_answers(
            student_id=student_id,
            session_id=session_id,
            topic=topic,
            rows=rows[:MAX_OPEN_ANSWERS_PER_GRADING_CALL],
        )

    async def segment_into_learning_units(
        self, material_title: str, chunks: List[Dict[str, Any]], actor_id: Optional[uuid.UUID] = None
    ) -> List[LearningUnitSegment]:
        """
        Groups sequential document chunks into logically coherent, teachable Learning Units (5b).
        """
        chunk_summaries = []
        for idx, ch in enumerate(chunks[:30]):
            text = ch.get("content") or ch.get("text") or ch.get("snippet") or ""
            chunk_summaries.append(f"Chunk {idx}: {text[:180]}")

        prompt = (
            f"You are Mindexa's Curriculum Architect.\n"
            f"Document Title: '{material_title}'\n\n"
            f"Given these sequential document chunks, group them into 3 to 10 logically coherent Learning Units in the order they appear.\n"
            f"Each unit should be teachable in one 30-60 minute study session and must include 2 to 4 clear, concise learning outcomes.\n\n"
            f"Sequential Chunks:\n" + "\n".join(chunk_summaries) + "\n\n"
            "Return ONLY a JSON list of objects matching this schema:\n"
            "[{\"title\": \"LU 1: ...\", \"summary\": \"...\", \"learning_outcomes\": [\"Outcome 1\", \"Outcome 2\"], \"chunk_indices\": [0, 1], \"estimated_minutes\": 45}]"
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content="You extract structured Learning Units from academic materials. Return valid JSON only."),
                AIMessage(role="user", content=prompt),
            ],
            temperature=0.2,
            max_tokens=2000,
        )

        try:
            response = await self.gateway.complete(
                request,
                action_type=AIActionType.SEGMENT_LEARNING_UNITS,
                actor_id=actor_id or uuid.UUID("00000000-0000-0000-0000-000000000000"),
                actor_role="system",
                subject_entity_type="lecturer_material",
                prompt_summary=f"Extract Learning Units for material '{material_title}'",
            )
            res = self._parse_json_output(response.content, LearningUnitSegment, extract_list=True)
            return res if isinstance(res, list) else [res]
        except Exception as exc:
            logger.warning("AI Learning Unit segmentation failed; using fallback segmentation", error=str(exc))
            units = []
            chunk_count = len(chunks)
            step = max(1, chunk_count // 5)
            for i in range(0, chunk_count, step):
                indices = list(range(i, min(i + step, chunk_count)))
                u_num = (i // step) + 1
                units.append(
                    LearningUnitSegment(
                        title=f"Learning Unit {u_num}: Core Concepts of {material_title}",
                        summary=f"Covers key principles in material sections {i+1} to {min(i+step, chunk_count)}.",
                        learning_outcomes=[
                            f"Understand core concepts in section {u_num}",
                            f"Apply foundational methods from {material_title}",
                        ],
                        chunk_indices=indices,
                        estimated_minutes=45,
                    )
                )
            return units if units else [
                LearningUnitSegment(
                    title=f"Learning Unit 1: Foundations of {material_title}",
                    summary=f"Comprehensive overview of {material_title}.",
                    learning_outcomes=[f"Understand primary themes of {material_title}"],
                    chunk_indices=[0],
                    estimated_minutes=45,
                )
            ]
