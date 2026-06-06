from __future__ import annotations

import json
from typing import TypeVar, Type

from pydantic import BaseModel, ValidationError as PydanticValidationError

from app.core.ai.gateway import AIGateway
from app.core.ai.prompt_registry import get_prompt
from app.core.exceptions import ValidationError

T = TypeVar("T", bound=BaseModel)


class BaseAgent:
    """Base contract for all Mindexa AI Agents."""

    prompt_name: str
    prompt_version: str

    def __init__(self, gateway: AIGateway) -> None:
        self.gateway = gateway

    def _get_prompt(self) -> str:
        """Load the configured prompt template for this agent."""
        return get_prompt(self.prompt_name, self.prompt_version)

    def _parse_json_output(
        self,
        content: str,
        response_model: Type[T],
        extract_list: bool = False
    ) -> T | list[T]:
        """
        Parse and validate a JSON response from the AI.

        Args:
            content: Raw string response from the AI.
            response_model: The Pydantic model to validate against.
            extract_list: If True, expects a JSON array and returns a list of models.
        """
        try:
            # Clean JSON from markdown blocks if present
            clean_content = content.strip()
            if clean_content.startswith("```json"):
                clean_content = clean_content[7:]
            elif clean_content.startswith("```"):
                clean_content = clean_content[3:]
            if clean_content.endswith("```"):
                clean_content = clean_content[:-3]
            clean_content = clean_content.strip()

            data = json.loads(clean_content)

            if extract_list:
                if not isinstance(data, list):
                    # Attempt to find list in dict if wrapped
                    if isinstance(data, dict):
                        for key in ("questions", "items", "data", "results"):
                            if key in data and isinstance(data[key], list):
                                data = data[key]
                                break
                        else:
                            raise ValueError("AI response is a dict but no list found.")
                    else:
                        raise ValueError("AI response must be a JSON array.")
                return [response_model.model_validate(item) for item in data]
            else:
                return response_model.model_validate(data)

        except (json.JSONDecodeError, PydanticValidationError, ValueError) as exc:
            raise ValidationError(
                f"The AI returned an invalid response: {str(exc)}",
                code="AI_OUTPUT_VALIDATION_FAILED",
            ) from exc
