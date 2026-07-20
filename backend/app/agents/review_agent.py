from __future__ import annotations

import json
import uuid
from typing import Any

from pydantic import BaseModel, Field, ValidationError as PydanticValidationError

from app.core.ai.gateway import AIGateway
from app.core.ai.prompt_registry import get_prompt
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.exceptions import ValidationError
from app.db.enums import AIActionType


from app.agents.base import BaseAgent


class RubricAlignmentNote(BaseModel):
    """Note on how a response aligns with a specific rubric criterion."""
    criterion: str
    notes: str
    marks_awarded: float


class ReviewAgentOutput(BaseModel):
    """Validated structure for AI-suggested grading."""
    suggested_score: float
    rationale: str = Field(..., min_length=10, max_length=5000)
    rubric_alignment: list[RubricAlignmentNote] = Field(default_factory=list)
    confidence: float = Field(..., ge=0.0, le=1.0)


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
    ) -> tuple[ReviewAgentOutput, AICompletionResponse]:
        """
        Analyze a student response and suggest a grade, optionally refining based on lecturer feedback.
        """
        prompt_template = self._get_prompt()
        
        system_content = (
            prompt_template.replace("{{question_text}}", question_text)
            .replace("{{student_answer}}", student_answer)
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
            temperature=0.0,  # Strict, consistent grading
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

