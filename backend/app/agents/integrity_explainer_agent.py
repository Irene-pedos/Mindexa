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


class IntegrityExplainerOutput(BaseModel):
    """Validated structure for AI-generated integrity explanations."""
    explanation: str = Field(..., min_length=20, max_length=5000)
    timeline_summary: str = Field(..., min_length=20, max_length=5000)
    escalation_rationale: str = Field(..., min_length=20, max_length=5000)
    risk_level_context: str | None = None


class IntegrityExplainerAgent(BaseAgent):
    """Agent responsible for narrating integrity events and explaining system flags."""

    prompt_name = "integrity_explainer"
    prompt_version = "v1"

    async def explain_flag(
        self,
        *,
        lecturer_id: uuid.UUID,
        attempt_id: uuid.UUID,
        assessment_title: str,
        total_warnings: int,
        flag_description: str,
        event_counts: dict[str, int],
        events: list[dict[str, Any]],
    ) -> IntegrityExplainerOutput:
        """
        Explain an integrity flag based on the recorded event timeline.
        """
        prompt_template = self._get_prompt()
        
        # Build timeline string (limit to most recent 20 for context window)
        timeline_lines = []
        for e in events[:20]:
            ts = e.get("created_at")
            etype = e.get("event_type")
            meta = e.get("metadata_json", {})
            timeline_lines.append(f"- [{ts}] {etype}: {json.dumps(meta)}")
        
        system_content = (
            prompt_template.replace("{{assessment_title}}", assessment_title)
            .replace("{{total_warnings}}", str(total_warnings))
            .replace("{{flag_description}}", flag_description)
            .replace("{{event_counts}}", json.dumps(event_counts))
            .replace("{{events_timeline}}", "\n".join(timeline_lines) or "No events recorded.")
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user", 
                    content="Please provide an objective explanation and timeline summary for this integrity flag."
                ),
            ],
            temperature=0.2,
            max_tokens=1500,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.ANALYZE_INTEGRITY,
            actor_id=lecturer_id,
            actor_role="lecturer",
            subject_entity_type="assessment_attempt",
            subject_entity_id=attempt_id,
            prompt_summary=f"Integrity explanation for attempt {attempt_id}",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        return self._parse_json_output(response.content, IntegrityExplainerOutput)

