from __future__ import annotations

import uuid
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator

from app.agents.base import BaseAgent
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.db.enums import AIActionType


class RubricCriterionLevelDraft(BaseModel):
    """A descriptor for one performance level within a rubric criterion."""
    label: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1, max_length=1000)
    marks: int = Field(..., ge=0)


class RubricCriterionDraft(BaseModel):
    """An individual criterion within a drafted rubric."""
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    max_marks: int = Field(..., ge=1)
    order_index: int = Field(default=1, ge=1)
    levels: List[RubricCriterionLevelDraft] = Field(default_factory=list)


class RubricDraftOutput(BaseModel):
    """Validated structured output for a drafted grading rubric."""
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    criteria: List[RubricCriterionDraft] = Field(default_factory=list)


class RubricAgent(BaseAgent):
    """Agent responsible for drafting or enhancing structured grading rubrics for questions."""

    prompt_name = "rubric_generator"
    prompt_version = "v1"

    async def draft_or_improve(
        self,
        *,
        lecturer_id: uuid.UUID,
        question_id: uuid.UUID,
        question_content: str,
        question_type: str,
        max_marks: int = 10,
        existing_rubric: Optional[str] = None,
    ) -> RubricDraftOutput:
        """
        Draft or improve a criterion-referenced grading rubric for a question.
        """
        prompt_template = self._get_prompt()

        system_content = (
            prompt_template.replace("{{question_type}}", question_type)
            .replace("{{max_marks}}", str(max_marks))
            .replace("{{question_content}}", question_content.strip() or "Standard assessment item.")
            .replace("{{existing_rubric}}", existing_rubric.strip() if existing_rubric else "None provided — create new rubric from scratch.")
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user",
                    content=f"Please draft a structured grading rubric allocating a total of {max_marks} marks for this question."
                ),
            ],
            temperature=0.2,
            max_tokens=1200,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_RUBRIC,
            actor_id=lecturer_id,
            actor_role="lecturer",
            subject_entity_type="question",
            subject_entity_id=question_id,
            prompt_summary=f"Draft grading rubric for question {question_id}",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        return self._parse_json_output(response.content, RubricDraftOutput)
