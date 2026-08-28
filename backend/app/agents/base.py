from __future__ import annotations

import json
import re
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
            content_str = content.strip()

            # 1. Try extracting content inside markdown blocks
            match = re.search(r"```(?:json)?\s*(.*?)\s*```", content_str, re.DOTALL)
            if match:
                clean_content = match.group(1).strip()
            else:
                # 2. Try extracting content between the outermost JSON brackets
                first_curly = content_str.find("{")
                first_square = content_str.find("[")

                start = -1
                if first_curly != -1 and first_square != -1:
                    start = min(first_curly, first_square)
                elif first_curly != -1:
                    start = first_curly
                elif first_square != -1:
                    start = first_square

                last_curly = content_str.rfind("}")
                last_square = content_str.rfind("]")
                end = max(last_curly, last_square)

                if start != -1 and end != -1 and start < end:
                    clean_content = content_str[start:end+1].strip()
                else:
                    clean_content = content_str

            try:
                data = json.loads(clean_content, strict=False)
            except json.JSONDecodeError:
                # Robust recovery for common LLM JSON syntax anomalies
                # 1. Strip trailing commas before closing braces or brackets
                repaired = re.sub(r",\s*([\]\}])", r"\1", clean_content)
                try:
                    data = json.loads(repaired, strict=False)
                except json.JSONDecodeError:
                    # 2. Attempt recovery for truncated JSON (e.g. output token budget reached)
                    open_braces = repaired.count("{") - repaired.count("}")
                    open_brackets = repaired.count("[") - repaired.count("]")
                    if open_braces > 0 or open_brackets > 0:
                        repaired_truncated = repaired.rstrip().rstrip(",")
                        # If an odd number of quotes exists, close the pending string literal
                        if repaired_truncated.count('"') % 2 == 1:
                            repaired_truncated += '"'
                        repaired_truncated += ("]" * max(0, open_brackets)) + ("}" * max(0, open_braces))
                        data = json.loads(repaired_truncated, strict=False)
                    else:
                        raise

            if extract_list:
                if not isinstance(data, list):
                    # Attempt to find list in dict if wrapped
                    if isinstance(data, dict):
                        for key in ("questions", "items", "data", "results", "slides"):
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
