from __future__ import annotations

import json
import uuid

from pydantic import BaseModel, Field, ValidationError as PydanticValidationError

from app.core.ai.gateway import AIGateway
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.core.exceptions import ValidationError
from app.db.enums import AIActionType

from app.agents.base import BaseAgent


class StudentSupportContext(BaseModel):
    title: str
    content: str


class StudentSupportOutput(BaseModel):
    """Validated structure for AI student support output."""
    explanation: str = Field(..., min_length=10, max_length=5000)
    revision_plan: list[str] = Field(default_factory=list, max_length=10)
    follow_up_questions: list[str] = Field(default_factory=list, max_length=5)
    safety_notice: str | None = Field(default=None, max_length=500)


class StudentSupportAgent(BaseAgent):
    """Agent responsible for explaining academic concepts to students."""

    prompt_name = "student_support"
    prompt_version = "v1"

    async def answer(
        self,
        *,
        student_id: uuid.UUID,
        actor_role: str,
        question: str,
        contexts: list[StudentSupportContext],
    ) -> StudentSupportOutput:
        context_block = self._format_context(contexts)
        prompt_template = self._get_prompt()
        
        # Simple placeholder replacement
        system_content = prompt_template.replace("{{context}}", context_block).replace("{{question}}", question)

        request = AICompletionRequest(
            messages=[
                AIMessage(
                    role="system",
                    content=system_content,
                ),
                AIMessage(
                    role="user",
                    content=f"Explain and answer the following student question using the provided context: {question}",
                ),
            ],
            temperature=0.2,
            max_tokens=1000,
        )
        response = await self.gateway.complete(
            request,
            action_type=AIActionType.STUDY_SUPPORT,
            actor_id=student_id,
            actor_role=actor_role,
            prompt_summary=f"Study support question: {question[:100]}",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )
        return self._parse_json_output(response.content, StudentSupportOutput)

    def _format_context(self, contexts: list[StudentSupportContext]) -> str:
        if not contexts:
            return "No specific context provided. Rely on general academic knowledge."

        parts = []
        for i, ctx in enumerate(contexts, 1):
            parts.append(f"--- Context {i}: {ctx.title} ---\n{ctx.content}\n")
        return "\n".join(parts)
