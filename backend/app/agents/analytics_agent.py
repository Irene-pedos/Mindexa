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

class AnalyticsAgentOutput(BaseModel):
    """Validated structure for AI-generated assessment analytics."""
    summary: str = Field(..., min_length=20, max_length=5000)
    weak_topics: list[str] = Field(default_factory=list)
    insights: list[str] = Field(default_factory=list)
    recommended_interventions: list[str] = Field(default_factory=list)


class AnalyticsAgent(BaseAgent):
    """Agent responsible for narrating assessment aggregates and suggesting interventions."""

    prompt_name = "analytics_summary"
    prompt_version = "v1"

    async def analyze_assessment(
        self,
        *,
        lecturer_id: uuid.UUID,
        assessment_id: uuid.UUID,
        assessment_title: str,
        stats: dict[str, Any],
    ) -> AnalyticsAgentOutput:
        """
        Analyze precomputed statistics for an assessment.
        """
        prompt_template = self._get_prompt()
        
        # Build performance breakdown string
        breakdown_lines = []
        for band, count in stats.get("grade_distribution", {}).items():
            breakdown_lines.append(f"- Grade {band}: {count} students")
        
        system_content = (
            prompt_template.replace("{{assessment_title}}", assessment_title)
            .replace("{{cohort_size}}", str(stats.get("cohort_size", 0)))
            .replace("{{average_score}}", f"{stats.get('average_score', 0):.1f}")
            .replace("{{pass_rate}}", f"{stats.get('pass_rate', 0):.1f}")
            .replace("{{max_score}}", f"{stats.get('max_score', 0):.1f}")
            .replace("{{min_score}}", f"{stats.get('min_score', 0):.1f}")
            .replace("{{performance_breakdown}}", "\n".join(breakdown_lines) or "No distribution data.")
            .replace("{{top_topics}}", ", ".join(stats.get("top_topics", [])) or "None identified")
            .replace("{{weak_topics}}", ", ".join(stats.get("weak_topics", [])) or "None identified")
            .replace("{{hard_questions}}", ", ".join(stats.get("hard_questions", [])) or "None identified")
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user", 
                    content="Please provide a narrative summary and insights based on these assessment statistics."
                ),
            ],
            temperature=0.3,
            max_tokens=1000,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.NARRATE_ANALYTICS,
            actor_id=lecturer_id,
            actor_role="lecturer",
            subject_entity_type="assessment",
            subject_entity_id=assessment_id,
            prompt_summary=f"Analytics summary for assessment {assessment_id}",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        return self._parse_json_output(response.content, AnalyticsAgentOutput)

