from __future__ import annotations

import json
import uuid
from typing import Any, List, Optional

from pydantic import BaseModel, Field, ValidationError as PydanticValidationError

from app.core.ai.gateway import AIGateway
from app.core.ai.prompt_registry import get_prompt
from app.core.ai.providers import AICompletionRequest, AICompletionResponse, AIMessage
from app.core.exceptions import ValidationError
from app.db.enums import AIActionType
from app.agents.base import BaseAgent


class RubricAlignmentNote(BaseModel):
    """Note on how a response aligns with a specific rubric criterion."""
    criterion: str
    notes: str
    marks_awarded: float


class ReviewAgentOutput(BaseModel):
    """Validated structure for AI-suggested grading (v1)."""
    suggested_score: float
    rationale: str = Field(..., min_length=10, max_length=5000)
    rubric_alignment: list[RubricAlignmentNote] = Field(default_factory=list)
    confidence: float = Field(..., ge=0.0, le=1.0)


class KeyPointCoverageItem(BaseModel):
    """Assessment of whether a highlighted key point was addressed in student answer."""
    key_point_id: Optional[str] = None
    covered: bool = False
    evidence_quote: Optional[str] = None
    note: Optional[str] = None


class ReviewAgentV2Output(BaseModel):
    """Validated structure for AI-suggested grading (v2) with key points and step marks."""
    suggested_score: float
    rationale: str = Field(..., min_length=10, max_length=5000)
    rubric_alignment: list[RubricAlignmentNote] = Field(default_factory=list)
    confidence: float = Field(..., ge=0.0, le=1.0)
    key_points_coverage: list[KeyPointCoverageItem] = Field(default_factory=list)
    interpretation_note: Optional[str] = None
    inconsistent_ai_output: bool = False
    evidence_validation: list[dict] = Field(default_factory=list)


def _format_student_answer(student_answer: str) -> str:
    """If the student answer is formatted as a structured JSON table, convert to Markdown table."""
    if not student_answer or not student_answer.strip():
        return student_answer

    trimmed = student_answer.strip()
    if (trimmed.startswith("{") and trimmed.endswith("}")) or (trimmed.startswith("[") and trimmed.endswith("]")):
        try:
            data = json.loads(trimmed)
            if isinstance(data, dict) and (data.get("type") == "table" or "headers" in data or "rows" in data):
                headers = data.get("headers", [])
                rows = data.get("rows", [])
                if headers or rows:
                    md_lines = []
                    if data.get("title"):
                        md_lines.append(f"**Table: {data['title']}**\n")
                    if headers:
                        md_lines.append("| " + " | ".join(str(h) for h in headers) + " |")
                        md_lines.append("| " + " | ".join("---" for _ in headers) + " |")
                    for row in rows:
                        md_lines.append("| " + " | ".join(str(cell) for cell in row) + " |")
                    return "\n".join(md_lines)
        except Exception:
            pass
    return student_answer


def validate_v2_output(
    parsed: ReviewAgentV2Output,
    *,
    student_answer: str,
    max_score: float,
) -> ReviewAgentV2Output:
    """
    Post-parsing validation rules (Section 9.4):
    1. 0 <= suggested_score <= max_score
    2. sum(marks_awarded) == suggested_score (within 0.01 tolerance), else inconsistent_ai_output=True
    3. Every evidence_quote must appear in student_answer (case-insensitive substring check),
       else quote is dropped and confidence is reduced. Audit details stored in evidence_validation.
    """
    # 1. Clamping suggested_score
    if parsed.suggested_score < 0:
        parsed.suggested_score = 0.0
    elif parsed.suggested_score > max_score:
        parsed.suggested_score = float(max_score)

    # 2. Rubric alignment sum check (tolerance 0.01)
    if parsed.rubric_alignment:
        criteria_sum = sum(c.marks_awarded for c in parsed.rubric_alignment)
        if abs(criteria_sum - parsed.suggested_score) > 0.01:
            parsed.inconsistent_ai_output = True
            parsed.confidence = min(parsed.confidence, 0.4)

    # 3. Substring check for evidence quotes
    clean_student_ans = student_answer.lower() if student_answer else ""
    evidence_validation: list[dict] = []
    for item in parsed.key_points_coverage:
        if item.evidence_quote:
            orig_quote = item.evidence_quote
            quote = orig_quote.strip().lower()
            if quote and quote not in clean_student_ans:
                # Fabricated or hallucinated quote - drop and penalize confidence
                item.evidence_quote = None
                parsed.confidence = max(0.0, parsed.confidence - 0.1)
                evidence_validation.append({
                    "key_point_id": item.key_point_id,
                    "quote": orig_quote,
                    "valid": False,
                    "status": "dropped_hallucination",
                    "reason": "Quote not found as substring in student answer",
                })
            else:
                evidence_validation.append({
                    "key_point_id": item.key_point_id,
                    "quote": orig_quote,
                    "valid": True,
                    "status": "verified_in_text",
                })
    parsed.evidence_validation = evidence_validation

    return parsed


class ReviewAgent(BaseAgent):
    """Agent responsible for analyzing student answers and suggesting marks."""

    prompt_name = "review_agent"
    prompt_version = "v1"

    async def review_response(
        self,
        *,
        lecturer_id: uuid.UUID | None = None,
        question_text: str,
        student_answer: str,
        rubric_content: str,
        max_score: float,
        question_type: str,
        attempt_id: uuid.UUID | None = None,
        response_id: uuid.UUID | None = None,
        lecturer_feedback: str | None = None,
        course_context: str | None = None,
        rubric_context: str | None = None,
        course_material_context: str | None = None,
        basis_policy: str | None = None,
        basis_used: str | None = None,
        source_citations: list[str] | None = None,
        language: str | None = None,
    ) -> tuple[ReviewAgentOutput, AICompletionResponse]:
        """
        Analyze a student response and suggest a grade (v1).
        """
        if language:
            from app.core.ai.language_policy import assert_ai_allowed
            assert_ai_allowed(language, action="grade_response", context={"response_id": str(response_id) if response_id else None})
        prompt_template = self._get_prompt()
        formatted_answer = _format_student_answer(student_answer)

        system_content = (
            prompt_template.replace("{{question_text}}", question_text)
            .replace("{{student_answer}}", formatted_answer)
            .replace("{{rubric_content}}", rubric_content)
            .replace("{{max_score}}", str(max_score))
            .replace("{{question_type}}", question_type)
        )
        if course_context:
            system_content += f"\n\n### Lecturer Course Materials Context (RAG):\n{course_context}"
        if rubric_context:
            system_content += f"\n\n### Rubric Context:\n{rubric_context}"
        if course_material_context:
            system_content += f"\n\n### Course Material Context:\n{course_material_context}"
        if basis_policy:
            system_content += f"\n\n### Grading Basis Policy:\n{basis_policy}"
        if basis_used:
            system_content += f"\n\n### Grading Basis Used:\n{basis_used}"
        if source_citations:
            system_content += f"\n\n### Source Citations:\n" + "\n".join(f"- {c}" for c in source_citations)

        messages = [
            AIMessage(role="system", content=system_content),
            AIMessage(
                role="user",
                content="Please analyze this student response and provide a grading suggestion."
            ),
        ]
        if lecturer_feedback:
            messages.append(
                AIMessage(
                    role="user",
                    content=f"Lecturer feedback / correction request: \"{lecturer_feedback}\"\n"
                            f"Please re-evaluate the student's answer, incorporate the lecturer's guidance, and adjust the score, rationale, and alignment notes accordingly."
                )
            )

        request = AICompletionRequest(
            messages=messages,
            temperature=0.0,
            max_tokens=1500,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GRADE_RESPONSE,
            actor_id=lecturer_id,
            actor_role="lecturer" if lecturer_id else "system",
            subject_entity_type="student_response",
            subject_entity_id=response_id,
            prompt_summary=f"Grading suggestion for response {response_id}" if not lecturer_feedback else f"Re-evaluation for response {response_id}",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        parsed = self._parse_json_output(response.content, ReviewAgentOutput)
        return parsed, response

    async def review_response_v2(
        self,
        *,
        lecturer_id: uuid.UUID | None = None,
        question_text: str,
        student_answer: str,
        rubric_content: str = "",
        max_score: float,
        question_type: str,
        key_points: list[dict] | None = None,
        marking_scheme: str | None = None,
        step_marks: list[dict] | None = None,
        attempt_id: uuid.UUID | None = None,
        response_id: uuid.UUID | None = None,
        lecturer_feedback: str | None = None,
        course_context: str | None = None,
        rubric_context: str | None = None,
        course_material_context: str | None = None,
        basis_policy: str | None = None,
        basis_used: str | None = None,
        source_citations: list[str] | None = None,
        language: str | None = None,
    ) -> tuple[ReviewAgentV2Output, AICompletionResponse]:
        """
        Analyze a student response with v2 capabilities: key points, model answers, step marks (Section 9.4).
        """
        if language:
            from app.core.ai.language_policy import assert_ai_allowed
            assert_ai_allowed(language, action="grade_response", context={"response_id": str(response_id) if response_id else None})

        prompt_template = get_prompt("review_agent", version="v2")
        formatted_answer = _format_student_answer(student_answer)

        # Format key points
        if key_points:
            formatted_kp = json.dumps(key_points, indent=2)
        else:
            formatted_kp = "None specified"

        # Format step marks
        if step_marks:
            formatted_steps = json.dumps(step_marks, indent=2)
        else:
            formatted_steps = "None specified"

        formatted_scheme = marking_scheme if marking_scheme else "None specified"

        system_content = (
            prompt_template.replace("{{question_text}}", question_text)
            .replace("{{student_answer}}", formatted_answer)
            .replace("{{rubric_content}}", rubric_content or "Standard evaluation")
            .replace("{{max_score}}", str(max_score))
            .replace("{{question_type}}", question_type)
            .replace("{{marking_scheme}}", formatted_scheme)
            .replace("{{step_marks}}", formatted_steps)
            .replace("{{key_points_list}}", formatted_kp)
        )

        if course_context:
            system_content += f"\n\n### Lecturer Course Materials Context (RAG):\n{course_context}"
        if rubric_context:
            system_content += f"\n\n### Rubric Context:\n{rubric_context}"
        if course_material_context:
            system_content += f"\n\n### Course Material Context:\n{course_material_context}"
        if basis_policy:
            system_content += f"\n\n### Grading Basis Policy:\n{basis_policy}"
        if basis_used:
            system_content += f"\n\n### Grading Basis Used:\n{basis_used}"
        if source_citations:
            system_content += f"\n\n### Source Citations:\n" + "\n".join(f"- {c}" for c in source_citations)

        messages = [
            AIMessage(role="system", content=system_content),
            AIMessage(
                role="user",
                content="Please analyze this student response and provide a grading suggestion."
            ),
        ]
        if lecturer_feedback:
            messages.append(
                AIMessage(
                    role="user",
                    content=f"Lecturer feedback / correction request: \"{lecturer_feedback}\"\n"
                            f"Please re-evaluate the student's answer, incorporate the lecturer's guidance, and adjust the score, rationale, and alignment notes accordingly."
                )
            )

        request = AICompletionRequest(
            messages=messages,
            temperature=0.0,
            max_tokens=2000,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GRADE_RESPONSE,
            actor_id=lecturer_id,
            actor_role="lecturer" if lecturer_id else "system",
            subject_entity_type="student_response",
            subject_entity_id=response_id,
            prompt_summary=f"Grading suggestion (v2) for response {response_id}" if not lecturer_feedback else f"Re-evaluation (v2) for response {response_id}",
            prompt_version=f"{self.prompt_name}_v2",
        )

        parsed = self._parse_json_output(response.content, ReviewAgentV2Output)
        validated = validate_v2_output(
            parsed,
            student_answer=student_answer,
            max_score=max_score,
        )
        return validated, response
