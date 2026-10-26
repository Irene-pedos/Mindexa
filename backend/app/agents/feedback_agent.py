from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.core.ai.providers import AICompletionRequest, AIMessage
from app.db.enums import AIActionType


from app.agents.base import BaseAgent


class FeedbackAgentOutput(BaseModel):
    """Validated structure for AI-drafted feedback."""
    draft_feedback: str = Field(..., min_length=20, max_length=5000)
    strengths: list[str] = Field(default_factory=list)
    areas_for_improvement: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class FeedbackAgent(BaseAgent):
    """Agent responsible for drafting professional feedback for students."""

    prompt_name = "feedback"
    prompt_version = "v1"

    async def draft_feedback(
        self,
        *,
        lecturer_id: uuid.UUID | None = None,
        assessment_title: str,
        score: float,
        max_score: float,
        rubric_content: str,
        lecturer_notes: str | None = None,
        student_response_summary: str | None = None,
        attempt_id: uuid.UUID | None = None,
        grade_id: uuid.UUID | None = None,
    ) -> FeedbackAgentOutput:
        """
        Draft feedback for a student attempt.
        """
        from app.core.ai.language_policy import assert_ai_allowed
        assert_ai_allowed(
            "en",
            action="draft_feedback",
            context={"grade_id": str(grade_id) if grade_id else None, "attempt_id": str(attempt_id) if attempt_id else None},
        )

        prompt_template = self._get_prompt()
        
        system_content = (
            prompt_template.replace("{{assessment_title}}", assessment_title)
            .replace("{{score}}", str(score))
            .replace("{{max_score}}", str(max_score))
            .replace("{{rubric_content}}", rubric_content)
            .replace("{{lecturer_notes}}", lecturer_notes or "No additional notes.")
            .replace("{{student_response_summary}}", student_response_summary or "Detailed assessment performance.")
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user", 
                    content="Please draft a professional feedback summary for this student."
                ),
            ],
            temperature=0.7,
            max_tokens=1000,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.FEEDBACK_DRAFT,
            actor_id=lecturer_id,
            actor_role="lecturer" if lecturer_id else "system",
            subject_entity_type="submission_grade",
            subject_entity_id=grade_id,
            prompt_summary=f"Feedback draft for grade {grade_id}",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        return self._parse_json_output(response.content, FeedbackAgentOutput)

