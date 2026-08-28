from __future__ import annotations

import uuid
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

from app.agents.base import BaseAgent
from app.core.ai.providers import AICompletionRequest, AIMessage
from app.db.enums import AIActionType


class SlideItem(BaseModel):
    """A single slide within a generated academic slide deck."""
    title: str = Field(..., min_length=1, max_length=200)
    bullet_points: List[str] = Field(default_factory=list, min_length=1, max_length=10)
    visual_idea: Optional[str] = Field(default=None, max_length=500)
    speaker_notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("bullet_points", mode="before")
    @classmethod
    def _coerce_bullets(cls, v: Any) -> List[str]:
        if not v:
            return ["Key concept overview"]
        if isinstance(v, str):
            return [line.strip() for line in v.split("\n") if line.strip()]
        if isinstance(v, list):
            return [str(item).strip() for item in v if str(item).strip()]
        return ["Key concept overview"]


class SlideDeckOutput(BaseModel):
    """Validated structured output for a Learning-Unit-grounded slide deck."""
    title: str = Field(..., min_length=1, max_length=255)
    target_audience: str = Field(default="Undergraduate Faculty / Students", max_length=200)
    estimated_minutes: int = Field(default=45, ge=5, le=180)
    slides: List[SlideItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_slide_count(self) -> "SlideDeckOutput":
        # Enforce bounded slide count
        if len(self.slides) < 3:
            raise ValueError(f"Generated slide deck must have at least 3 slides (got {len(self.slides)}).")
        if len(self.slides) > 25:
            self.slides = self.slides[:25]
        return self


class SlideDeckAgent(BaseAgent):
    """Agent responsible for generating structured lecture slide decks from Learning Units."""

    prompt_name = "slide_deck"
    prompt_version = "v1"

    async def generate(
        self,
        *,
        lecturer_id: uuid.UUID,
        learning_unit_id: uuid.UUID,
        unit_title: str,
        chunk_content: str,
        estimated_minutes: int = 45,
        selected_outcomes: Optional[List[str]] = None,
    ) -> SlideDeckOutput:
        """
        Generate a structured slide deck from a Learning Unit's source chunks.
        """
        prompt_template = self._get_prompt()

        outcomes_text = ""
        if selected_outcomes:
            outcomes_text = "\nPrioritized Learning Outcomes to cover:\n- " + "\n- ".join(selected_outcomes) + "\n"

        system_content = (
            prompt_template.replace("{{unit_title}}", unit_title)
            .replace("{{estimated_minutes}}", str(estimated_minutes))
            .replace("{{chunk_content}}", (chunk_content.strip() + outcomes_text) or "No additional source chunk text provided.")
        )

        request = AICompletionRequest(
            messages=[
                AIMessage(role="system", content=system_content),
                AIMessage(
                    role="user",
                    content=f"Please generate a complete 8-15 slide lecture deck outline for '{unit_title}' in valid, well-formed structured JSON format. Ensure all strings and quotes are properly escaped."
                ),
            ],
            temperature=0.3,
            max_tokens=4096,
        )

        response = await self.gateway.complete(
            request,
            action_type=AIActionType.GENERATE_SLIDE_DECK,
            actor_id=lecturer_id,
            actor_role="lecturer",
            subject_entity_type="learning_unit",
            subject_entity_id=learning_unit_id,
            prompt_summary=f"Generate slide deck for learning unit {learning_unit_id}",
            prompt_version=f"{self.prompt_name}_{self.prompt_version}",
        )

        return self._parse_json_output(response.content, SlideDeckOutput)
